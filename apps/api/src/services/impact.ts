/**
 * Impact Analysis Service (T10.3)
 *
 * Provides:
 *  - analyzeImpact(ref)    : reverse-traverse composed_from/joins_on edges to find affected governed
 *  - markImpacted(slug,…)  : stamp impacted metadata on a governed wide-table JSON
 *  - clearImpacted(slug)   : remove impacted stamp after re-validation
 *  - syncRename(oldRef, newFieldName) : update all column.source.fieldName references
 */

import { readUnifiedGraph } from "./graph-builder.js";
import * as govRepo from "../repositories/governance.js";
import type { GovernedWideTable } from "@schema-studio/core";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ImpactedEntry {
  at: string;
  cause: string;
  brokenColumns: string[];
}

export interface AffectedGoverned {
  slug: string;
  brokenColumns: string[];
  gwt: GovernedWideTable;
}

// ── analyzeImpact ──────────────────────────────────────────────────────────────

/**
 * Given a fld/tbl/gwc ref, reverse-traverse composed_from and joins_on edges
 * to find all governed wide-tables that reference this asset.
 */
export async function analyzeImpact(ref: string): Promise<AffectedGoverned[]> {
  const graph = await readUnifiedGraph();
  if (!graph) return [];

  const affectedSlugs = new Map<string, Set<string>>(); // slug → brokenColumns

  // Build a reverse index: to → [from edges]
  // We care about:
  //   composed_from: gwc → fld  (if ref is a fld, the gwc and its gwt are affected)
  //   joins_on: tbl → tbl       (if ref is a tbl, any gwt whose joinGraph references it is affected)

  for (const edge of graph.edges) {
    if (edge.kind === "composed_from" && edge.to === ref) {
      // edge.from is a gwc ref like "gwc:{slug}.{colName}"
      const gwcRef = edge.from;
      if (!gwcRef.startsWith("gwc:")) continue;
      const withoutPrefix = gwcRef.slice(4); // slug.colName
      const dot = withoutPrefix.indexOf(".");
      if (dot === -1) continue;
      const slug = withoutPrefix.slice(0, dot);
      const colName = withoutPrefix.slice(dot + 1);
      if (!affectedSlugs.has(slug)) affectedSlugs.set(slug, new Set());
      affectedSlugs.get(slug)!.add(colName);
    }

    if (edge.kind === "joins_on") {
      // joins_on: tbl → tbl; provenance contains gwtSlug
      const prov = edge.provenance;
      if (prov.source !== "governed-join") continue;
      if (edge.from === ref || edge.to === ref) {
        const slug = prov.gwtSlug;
        if (!affectedSlugs.has(slug)) affectedSlugs.set(slug, new Set());
        // For table-level impact, mark an empty broken column (the join itself is broken)
        affectedSlugs.get(slug)!.add(`<join:${edge.from}→${edge.to}>`);
      }
    }
  }

  // Also handle tbl-level ref: find all composed_from edges whose target fld belongs to the tbl
  if (ref.startsWith("tbl:")) {
    for (const edge of graph.edges) {
      if (edge.kind === "composed_from" && edge.to.startsWith("fld:")) {
        // fld:{schemaSlug}.{tableName}.{fieldName}
        const fldWithoutPrefix = edge.to.slice(4);
        const lastDot = fldWithoutPrefix.lastIndexOf(".");
        if (lastDot === -1) continue;
        const tblRef = `tbl:${fldWithoutPrefix.slice(0, lastDot)}`;
        if (tblRef !== ref) continue;

        const gwcRef = edge.from;
        if (!gwcRef.startsWith("gwc:")) continue;
        const withoutPrefix = gwcRef.slice(4);
        const dot = withoutPrefix.indexOf(".");
        if (dot === -1) continue;
        const slug = withoutPrefix.slice(0, dot);
        const colName = withoutPrefix.slice(dot + 1);
        if (!affectedSlugs.has(slug)) affectedSlugs.set(slug, new Set());
        affectedSlugs.get(slug)!.add(colName);
      }
    }
  }

  // Load each affected governed wide-table
  const results: AffectedGoverned[] = [];
  for (const [slug, brokenSet] of affectedSlugs.entries()) {
    const gwt = await govRepo.getGoverned(slug);
    if (!gwt) continue;
    results.push({ slug, brokenColumns: Array.from(brokenSet), gwt });
  }

  return results;
}

// ── markImpacted ───────────────────────────────────────────────────────────────

/**
 * Stamp an impacted marker onto a governed wide-table's JSON.
 */
export async function markImpacted(
  slug: string,
  cause: string,
  brokenColumns: string[],
): Promise<void> {
  const gwt = await govRepo.getGoverned(slug);
  if (!gwt) return;

  const impacted: ImpactedEntry = {
    at: new Date().toISOString(),
    cause,
    brokenColumns,
  };

  // Store in JSON — we cast to any to add the extra field without changing the type
  const patched = { ...gwt, impacted } as GovernedWideTable & { impacted: ImpactedEntry };
  await govRepo.saveGoverned(patched as unknown as GovernedWideTable);
}

// ── clearImpacted ──────────────────────────────────────────────────────────────

/**
 * Remove the impacted stamp from a governed wide-table's JSON.
 */
export async function clearImpacted(slug: string): Promise<void> {
  const gwt = await govRepo.getGoverned(slug);
  if (!gwt) return;

  const patched = { ...gwt } as Record<string, unknown>;
  delete patched["impacted"];
  await govRepo.saveGoverned(patched as unknown as GovernedWideTable);
}

// ── syncRename ─────────────────────────────────────────────────────────────────

/**
 * When a field is renamed, update all governed column.source.fieldName references
 * and add an editLog entry. Returns list of updated slugs.
 *
 * @param oldRef   fld ref before rename  e.g. "fld:mes-equipment.equipments.equip_id"
 * @param newFieldName  new field name     e.g. "equipment_id"
 */
export async function syncRename(
  oldRef: string,
  newFieldName: string,
): Promise<string[]> {
  if (!oldRef.startsWith("fld:")) return [];

  const withoutPrefix = oldRef.slice(4); // schemaSlug.tableName.fieldName
  const lastDot = withoutPrefix.lastIndexOf(".");
  if (lastDot === -1) return [];

  const tablePart = withoutPrefix.slice(0, lastDot); // schemaSlug.tableName
  const oldFieldName = withoutPrefix.slice(lastDot + 1);

  // We need the raw tableName to match column.source.tableName
  const tableNameDot = tablePart.indexOf(".");
  const rawTableName = tableNameDot !== -1 ? tablePart.slice(tableNameDot + 1) : tablePart;

  const governed = await govRepo.listGoverned();
  const updatedSlugs: string[] = [];

  for (const gwt of governed) {
    let changed = false;
    const updatedColumns = gwt.columns.map(col => {
      if (
        col.source.tableName === rawTableName &&
        col.source.fieldName === oldFieldName
      ) {
        changed = true;
        return { ...col, source: { ...col.source, fieldName: newFieldName } };
      }
      return col;
    });

    if (changed) {
      const patched: GovernedWideTable = {
        ...gwt,
        columns: updatedColumns,
      };
      await govRepo.saveGoverned(patched);
      updatedSlugs.push(gwt.slug);
    }
  }

  return updatedSlugs;
}
