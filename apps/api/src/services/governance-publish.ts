import type { WideTableDraft, GovernedWideTable, CatalogGraph } from "@schema-studio/core";
import * as govRepo from "../repositories/governance.js";
import { recordEdge } from "../repositories/lineage.js";
import { getSchemaById } from "../repositories/schemas.js";

function buildMarkdown(gwt: GovernedWideTable): string {
  const concepts = [...new Set(gwt.columns.map(c => c.conceptId).filter(Boolean))];
  const sources = [...new Set(gwt.columns.map(c => `${c.source.tableName}.${c.source.fieldName}`))];

  const colRows = gwt.columns
    .map(c => `| ${c.name} | ${c.dataType} | ${c.definition} | ${c.source.tableName}.${c.source.fieldName} |`)
    .join("\n");

  const relLines = gwt.relationships
    .map(r => `- ${r.relation} \`${r.targetRef}\` on \`${r.onFields.join(", ")}\` — ${r.note}`)
    .join("\n");

  return `---
kind: governed-wide-table
slug: ${gwt.slug}
block: ${gwt.blockKind}
version: ${gwt.version}
published_at: ${gwt.publishedAt}
concepts: [${concepts.join(", ")}]
sources: [${sources.join(", ")}]
---

## Why(用途)
${gwt.description}

## Columns(欄位定義)
| column | type | definition | source(lineage) |
|---|---|---|---|
${colRows}

## Relationships(關聯)
${relLines || "(無關聯)"}

## Verify(治理狀態)
- report #${gwt.reportId}: published by ${gwt.publishedBy}
`;
}

async function rebuildCatalogGraph(allGoverned: GovernedWideTable[]): Promise<CatalogGraph> {
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

    // columns → source tables
    const sourceTables = new Set<string>();
    for (const col of gwt.columns) {
      const tblId = `tbl:${col.source.tableName}`;
      addNode({
        id: tblId,
        kind: "table",
        label: col.source.tableName,
        meta: { schemaId: col.source.schemaId },
      });
      sourceTables.add(tblId);

      const fldId = `fld:${col.source.tableName}.${col.source.fieldName}`;
      addNode({
        id: fldId,
        kind: "field",
        label: `${col.source.tableName}.${col.source.fieldName}`,
        meta: { definition: col.definition, dataType: col.dataType },
      });
      edges.push({ from: tblId, to: fldId, kind: "has_field" });

      if (col.conceptId) {
        const cptId = `cpt:${col.conceptId}`;
        edges.push({ from: fldId, to: cptId, kind: "maps_to_concept" });
      }
    }

    // composed_from edges (one per unique source table)
    for (const tblId of sourceTables) {
      edges.push({ from: gwtId, to: tblId, kind: "composed_from" });
    }

    // joins_on edges
    for (const join of gwt.joinGraph) {
      edges.push({
        from: `tbl:${join.leftRef.split(".").pop() ?? join.leftRef}`,
        to: `tbl:${join.rightRef.split(".").pop() ?? join.rightRef}`,
        kind: "joins_on",
        meta: { on: join.on, type: join.type },
      });
    }

    // related_to edges (between governed wide tables)
    for (const rel of gwt.relationships) {
      if (rel.targetKind === "governed-wide-table") {
        edges.push({
          from: gwtId,
          to: `gwt:${rel.targetRef}`,
          kind: "related_to",
          meta: { relation: rel.relation },
        });
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    nodes,
    edges,
  };
}

export async function publishDraft(
  draft: WideTableDraft,
  publishedBy: string,
): Promise<GovernedWideTable> {
  const slug = draft.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  // Check if this slug already exists (for version bumping)
  const existing = await govRepo.getGoverned(slug);
  const version = existing ? existing.version + 1 : 1;

  const { nextId } = await import("../db/fileStore.js");
  const newId = existing?.id ?? await nextId("governedWt");

  const gwt: GovernedWideTable = {
    id: newId,
    slug,
    draftId: draft.id,
    reportId: draft.lastReportId ?? 0,
    blockKind: draft.blockKind,
    name: draft.name,
    description: draft.description,
    columns: draft.columns,
    joinGraph: draft.joinGraph,
    relationships: draft.relationships,
    publishedBy,
    publishedAt: new Date().toISOString(),
    version,
  };

  await govRepo.saveGoverned(gwt);

  // Rebuild catalog graph
  const allGoverned = await govRepo.listGoverned();
  const graph = await rebuildCatalogGraph(allGoverned);
  await govRepo.saveCatalogGraph(graph);

  // Save markdown export
  const md = buildMarkdown(gwt);
  await govRepo.saveMarkdownExport(slug, md);

  // Auto-record lineage: each unique source schema/table → this governed wide table
  void (async () => {
    try {
      const sourcesBySchema = new Map<number, Set<string>>();
      for (const col of gwt.columns) {
        const schemaId = col.source.schemaId;
        if (!sourcesBySchema.has(schemaId)) sourcesBySchema.set(schemaId, new Set());
        sourcesBySchema.get(schemaId)!.add(col.source.tableName);
      }
      for (const [srcSchemaId, tableNames] of sourcesBySchema) {
        const srcSchema = await getSchemaById(srcSchemaId).catch(() => null);
        if (!srcSchema) continue;
        for (const tableName of tableNames) {
          const tbl = srcSchema.tables.find(t => t.name === tableName);
          await recordEdge({
            fromSchemaId: srcSchemaId,
            fromSchemaName: srcSchema.name,
            fromDomain: srcSchema.domain || "未分類",
            fromTableId: tbl?.id ?? 0,
            fromTableName: tableName,
            fromKind: "table",
            toSchemaId: 0,
            toSchemaName: "Governed Catalog",
            toDomain: "Governed",
            toTableId: gwt.id,
            toTableName: gwt.name,
            toKind: "governed",
            transformType: "derived",
            description: `Governance 發布 ${gwt.name} v${gwt.version}`,
            source: "governance",
          });
        }
      }
    } catch { /* non-critical */ }
  })();

  return gwt;
}
