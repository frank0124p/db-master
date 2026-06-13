/**
 * graph-builder — Builds and persists the Unified Semantic Graph.
 *
 * - rebuildFor(scope?): loads all data, calls buildUnifiedGraph(), atomic write
 * - scheduleRebuild(): debounces 500ms to coalesce rapid successive triggers
 * - Also continues writing the old catalog graph.json for backward compatibility
 */

import path from "path";
import fs from "fs/promises";
import * as store from "../db/fileStore.js";
import { buildUnifiedGraph } from "@schema-studio/core";
import type { GraphBuildInput, SchemaInput } from "@schema-studio/core";
import * as schemasRepo from "../repositories/schemas.js";
import * as govRepo from "../repositories/governance.js";
import * as lineageRepo from "../repositories/lineage.js";
import * as knowledgeRepo from "../repositories/knowledge.js";
import * as namingRepo from "../repositories/naming.js";
import * as suitesRepo from "../repositories/suites.js";
import * as domainRepo from "../repositories/domainSettings.js";
import type { UnifiedGraph } from "@schema-studio/core";

// ── File paths ────────────────────────────────────────────────────────────────

function unifiedGraphPath(): string {
  return store.dataPath("governance", "catalog", "unified-graph.json");
}

function unifiedGraphTmpPath(): string {
  return store.dataPath("governance", "catalog", "unified-graph.tmp.json");
}

// ── Slug helper (mirrors schemas repo logic) ──────────────────────────────────

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "schema";
}

// ── Main rebuild ──────────────────────────────────────────────────────────────

/**
 * Rebuild the unified graph from all available data.
 * scope is reserved for future incremental updates; currently always does full rebuild.
 */
export async function rebuildFor(_scope?: unknown): Promise<UnifiedGraph> {
  // Load all data in parallel
  const [
    schemaMetas,
    governed,
    lineageEdges,
    approvedConcepts,
    approvedNaming,
    suites,
    domains,
  ] = await Promise.all([
    schemasRepo.listSchemas(),
    govRepo.listGoverned(),
    lineageRepo.listEdges(),
    knowledgeRepo.listConcepts({ status: "approved" }),
    namingRepo.listNamingEntries(undefined, "approved"),
    suitesRepo.listSuites(),
    domainRepo.listDomains(),
  ]);

  // Load full schemas with tables + fields
  const schemas: SchemaInput[] = [];
  for (const meta of schemaMetas) {
    try {
      const full = await schemasRepo.getSchemaById(meta.id);
      const slug = toSlug(full.name);
      schemas.push({
        id: full.id,
        name: full.name,
        slug,
        domain: full.domain,
        suiteId: full.suiteId,
        layerType: full.layerType,
        tables: full.tables.map(t => ({
          id: t.id,
          name: t.name,
          comment: t.comment,
          layerType: t.layerType ?? null,
          fields: t.fields.map(f => ({
            id: f.id,
            name: f.name,
            dataType: f.dataType,
            nullable: f.nullable,
            isPrimaryKey: f.isPrimaryKey,
            comment: f.comment,
          })),
          sampleData: t.sampleData,
        })),
      });
    } catch {
      // Skip schemas that fail to load (they may have been deleted)
    }
  }

  const input: GraphBuildInput = {
    schemas,
    governed,
    lineageEdges,
    concepts: approvedConcepts,
    namingDict: approvedNaming,
    suites: suites.map(s => ({ id: s.id, name: s.name })),
    domains: domains.map(d => ({ id: d.id, name: d.name })),
  };

  const graph = buildUnifiedGraph(input);

  // Atomic write: tmp → rename
  const tmpPath = unifiedGraphTmpPath();
  const finalPath = unifiedGraphPath();
  const content = JSON.stringify(graph, null, 2);

  await fs.mkdir(path.dirname(tmpPath), { recursive: true });
  await fs.writeFile(tmpPath, content, "utf-8");
  await fs.rename(tmpPath, finalPath);

  // Also rebuild old catalog graph.json for backward compatibility
  try {
    const allGoverned = governed;
    const oldGraph = await buildOldCatalogGraph(allGoverned);
    await govRepo.saveCatalogGraph(oldGraph);
  } catch {
    // Non-critical — don't fail the main rebuild
  }

  return graph;
}

// ── Read the persisted graph ──────────────────────────────────────────────────

export async function readUnifiedGraph(): Promise<UnifiedGraph | null> {
  return store.readJson<UnifiedGraph>(unifiedGraphPath());
}

// ── Debounced rebuild ─────────────────────────────────────────────────────────

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleRebuild(_scope?: unknown): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    rebuildFor().catch(err => {
      console.error("[graph-builder] Background rebuild failed:", err);
    });
  }, 500);
}

// ── Backward-compat: old catalog graph builder ────────────────────────────────
// (Mirrors governance-publish.ts::rebuildCatalogGraph, imported here to avoid circular)

import type { GovernedWideTable, CatalogGraph } from "@schema-studio/core";

async function buildOldCatalogGraph(allGoverned: GovernedWideTable[]): Promise<CatalogGraph> {
  const nodes: CatalogGraph["nodes"] = [];
  const edges: CatalogGraph["edges"] = [];
  const nodeIds = new Set<string>();

  function addNode(node: CatalogGraph["nodes"][0]): void {
    if (!nodeIds.has(node.id)) {
      nodeIds.add(node.id);
      nodes.push(node);
    }
  }

  for (const gwt of allGoverned) {
    const gwtId = `gwt:${gwt.slug}`;
    addNode({
      id: gwtId,
      kind: "governed-wide-table",
      label: gwt.name,
      meta: { description: gwt.description, blockKind: gwt.blockKind, version: gwt.version },
    });

    const sourceTables = new Set<string>();
    for (const col of gwt.columns) {
      const tblId = `tbl:${col.source.tableName}`;
      addNode({ id: tblId, kind: "table", label: col.source.tableName, meta: { schemaId: col.source.schemaId } });
      sourceTables.add(tblId);

      const fldId = `fld:${col.source.tableName}.${col.source.fieldName}`;
      addNode({ id: fldId, kind: "field", label: `${col.source.tableName}.${col.source.fieldName}`, meta: { definition: col.definition, dataType: col.dataType } });
      edges.push({ from: tblId, to: fldId, kind: "has_field" });

      if (col.conceptId) {
        edges.push({ from: fldId, to: `cpt:${col.conceptId}`, kind: "maps_to_concept" });
      }
    }

    for (const tblId of sourceTables) {
      edges.push({ from: gwtId, to: tblId, kind: "composed_from" });
    }

    for (const join of gwt.joinGraph) {
      edges.push({
        from: `tbl:${join.leftRef.split(".").pop() ?? join.leftRef}`,
        to: `tbl:${join.rightRef.split(".").pop() ?? join.rightRef}`,
        kind: "joins_on",
        meta: { on: join.on, type: join.type },
      });
    }

    for (const rel of gwt.relationships) {
      if (rel.targetKind === "governed-wide-table") {
        edges.push({ from: gwtId, to: `gwt:${rel.targetRef}`, kind: "related_to", meta: { relation: rel.relation } });
      }
    }
  }

  return { generatedAt: new Date().toISOString(), nodes, edges };
}
