/**
 * buildUnifiedGraph — Pure function that assembles the Unified Semantic Graph
 * from all available data sources.
 *
 * Build order (each step can reference nodes created by earlier steps):
 * 1. Structure nodes/edges (schema → table → field)
 * 2. FK inference → fk edges
 * 3. Governed materialization (gwt + gwc nodes, composed_from, joins_on, related_to)
 * 4. Lineage edges (LineageEdge → flows_to)
 * 5. Concept mapping (maps_to_concept)
 * 6. Edge deduplication (same id → merge provenance, keep first meta)
 */

import type {
  GraphNode,
  GraphEdge,
  UnifiedGraph,
  GraphBuildInput,
  GraphEdgeKind,
} from "./types.js";
import { inferFkEdges } from "./fk-inference.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEdgeId(kind: GraphEdgeKind, from: string, to: string): string {
  return `${kind}:${from}->${to}`;
}

function sanitizeSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "schema";
}

/**
 * Extract deduplicated, truncated sample values for a given field name
 * from a table's sampleData rows.
 */
function extractSampleValues(
  fieldName: string,
  sampleData: Record<string, unknown>[] | undefined,
): string[] {
  if (!sampleData || sampleData.length === 0) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const row of sampleData) {
    if (result.length >= 10) break;
    const raw = row[fieldName];
    if (raw === null || raw === undefined) continue;
    const str = String(raw).slice(0, 50);
    if (!seen.has(str)) {
      seen.add(str);
      result.push(str);
    }
  }
  return result;
}

// ── Main builder ──────────────────────────────────────────────────────────────

export function buildUnifiedGraph(input: GraphBuildInput): UnifiedGraph {
  const nodeMap = new Map<string, GraphNode>();
  const edgeMap = new Map<string, GraphEdge>();

  function addNode(node: GraphNode): void {
    if (!nodeMap.has(node.ref)) {
      nodeMap.set(node.ref, node);
    }
  }

  function addEdge(edge: GraphEdge): void {
    const existing = edgeMap.get(edge.id);
    if (!existing) {
      edgeMap.set(edge.id, edge);
      return;
    }
    // Dedup: merge provenance into an array if different sources
    // We keep meta from first encounter (per spec: "meta 合併以先到者優先")
    // For provenance: store as array or keep single — we store first but track all
    // Per spec: provenance union. We attach a provenanceList to meta for dedup tracking.
    const existingMeta = existing.meta ?? {};
    const provenanceList: unknown[] = Array.isArray(existingMeta["_provenanceList"])
      ? (existingMeta["_provenanceList"] as unknown[])
      : [existing.provenance];
    provenanceList.push(edge.provenance);
    edgeMap.set(edge.id, {
      ...existing,
      meta: { ...existingMeta, _provenanceList: provenanceList },
    });
  }

  // ── Step 1: Structure (domain, suite, schema/table/field) ─────────────────

  for (const domain of input.domains) {
    addNode({
      ref: `dom:${domain.id}`,
      kind: "domain",
      label: domain.name,
      meta: {},
    });
  }

  for (const suite of input.suites) {
    addNode({
      ref: `ste:${suite.id}`,
      kind: "suite",
      label: suite.name,
      meta: {},
    });
  }

  for (const schema of input.schemas) {
    const schemaSlug = schema.slug || sanitizeSlug(schema.name);

    for (const table of schema.tables) {
      const tblRef = `tbl:${schemaSlug}.${table.name}`;

      const tblMeta: GraphNode["meta"] = {};
      if (table.comment) tblMeta.description = table.comment;
      const resolvedLayerType = table.layerType ?? schema.layerType;
      if (resolvedLayerType) tblMeta.layerType = resolvedLayerType;
      if (schema.domain) tblMeta.domain = schema.domain;
      if (schema.suiteId != null) tblMeta.suiteId = schema.suiteId;
      // Phase 10
      if (table.ownerUserId != null) tblMeta.ownerUserId = table.ownerUserId;
      if (table.refreshCycle) tblMeta.refreshCycle = table.refreshCycle;
      if (table.dataPeriod) tblMeta.dataPeriod = table.dataPeriod;
      if (table.deprecated) tblMeta.deprecated = table.deprecated;
      if (table.deprecationNote) tblMeta.deprecationNote = table.deprecationNote;
      if (table.replacedByRef) tblMeta.replacedByRef = table.replacedByRef;
      addNode({
        ref: tblRef,
        kind: "table",
        label: table.name,
        meta: tblMeta,
      });

      // belongs_to domain
      if (schema.domain) {
        addEdge({
          id: makeEdgeId("belongs_to", tblRef, `dom:${schema.domain}`),
          from: tblRef,
          to: `dom:${schema.domain}`,
          kind: "belongs_to",
          provenance: { source: "structure" },
        });
      }

      // belongs_to suite
      if (schema.suiteId != null) {
        addEdge({
          id: makeEdgeId("belongs_to", tblRef, `ste:${schema.suiteId}`),
          from: tblRef,
          to: `ste:${schema.suiteId}`,
          kind: "belongs_to",
          provenance: { source: "structure" },
        });
      }

      // Field nodes + has_field edges
      for (const field of table.fields) {
        const fldRef = `fld:${schemaSlug}.${table.name}.${field.name}`;
        const sampleValues = extractSampleValues(field.name, table.sampleData);

        const fldMeta: GraphNode["meta"] = {
          dataType: field.dataType,
          nullable: field.nullable,
          isPrimaryKey: field.isPrimaryKey,
        };
        if (field.comment) fldMeta.definition = field.comment;
        if (sampleValues.length > 0) fldMeta.sampleValues = sampleValues;
        if (field.sensitivity) fldMeta.sensitivity = field.sensitivity;
        addNode({
          ref: fldRef,
          kind: "field",
          label: field.name,
          meta: fldMeta,
        });

        addEdge({
          id: makeEdgeId("has_field", tblRef, fldRef),
          from: tblRef,
          to: fldRef,
          kind: "has_field",
          provenance: { source: "structure" },
        });
      }
    }
  }

  // ── Step 2: FK Inference ──────────────────────────────────────────────────

  for (const schema of input.schemas) {
    const schemaSlug = schema.slug || sanitizeSlug(schema.name);
    const fkInput = schema.tables.map(t => ({
      name: t.name,
      fields: t.fields.map(f => ({ name: f.name, isPrimaryKey: f.isPrimaryKey })),
    }));

    const fkEdges = inferFkEdges(fkInput);
    for (const fk of fkEdges) {
      const fromFldRef = `fld:${schemaSlug}.${fk.fromTable}.${fk.fromField}`;
      const toFldRef = `fld:${schemaSlug}.${fk.toTable}.${fk.toField}`;
      // Only add if both nodes exist (field must be in graph)
      if (nodeMap.has(fromFldRef) && nodeMap.has(toFldRef)) {
        addEdge({
          id: makeEdgeId("fk", fromFldRef, toFldRef),
          from: fromFldRef,
          to: toFldRef,
          kind: "fk",
          provenance: { source: "fk-inference", schemaSlug },
        });
      }
    }
  }

  // ── Step 3: Governed Materialization ─────────────────────────────────────

  for (const gwt of input.governed) {
    const gwtRef = `gwt:${gwt.slug}`;

    const gwtMeta: GraphNode["meta"] = {
      description: gwt.description,
      blockKind: gwt.blockKind,
      version: gwt.version,
    };
    // Phase 10 — stewardship + operational + lifecycle
    if (gwt.ownerUserId != null) gwtMeta.ownerUserId = gwt.ownerUserId;
    if (gwt.refreshCycle) gwtMeta.refreshCycle = gwt.refreshCycle;
    if (gwt.deprecated) gwtMeta.deprecated = gwt.deprecated;

    addNode({
      ref: gwtRef,
      kind: "governed",
      label: gwt.name,
      meta: gwtMeta,
    });

    // belongs_to (governed tables don't have direct domain but we infer from columns)
    // We leave domain empty for now unless explicitly set

    // Column nodes + has_field edges + composed_from edges
    for (const col of gwt.columns) {
      const gwcRef = `gwc:${gwt.slug}.${col.name}`;

      const gwcMeta: GraphNode["meta"] = {
        dataType: col.dataType,
        definition: col.definition,
      };
      if (col.sensitivity) gwcMeta.sensitivity = col.sensitivity;
      addNode({
        ref: gwcRef,
        kind: "governed-column",
        label: col.name,
        meta: gwcMeta,
      });

      addEdge({
        id: makeEdgeId("has_field", gwtRef, gwcRef),
        from: gwtRef,
        to: gwcRef,
        kind: "has_field",
        provenance: { source: "structure" },
      });

      // composed_from: gwc → fld
      // Need to find the schema slug for the source table
      const sourceSchemaId = col.source.schemaId;
      const sourceSchema = input.schemas.find(s => s.id === sourceSchemaId);
      let fldRef: string;

      if (sourceSchema) {
        const schemaSlug = sourceSchema.slug || sanitizeSlug(sourceSchema.name);
        fldRef = `fld:${schemaSlug}.${col.source.tableName}.${col.source.fieldName}`;
      } else {
        // Virtual/broken ref — source schema not in input
        fldRef = `fld:_unknown_.${col.source.tableName}.${col.source.fieldName}`;
      }

      const isBroken = !nodeMap.has(fldRef);
      // Always create the edge even if broken (per spec)
      addEdge({
        id: makeEdgeId("composed_from", gwcRef, fldRef),
        from: gwcRef,
        to: fldRef,
        kind: "composed_from",
        meta: {
          transform: col.transform ?? undefined,
          broken: isBroken,
        },
        provenance: { source: "governed-column", gwtSlug: gwt.slug },
      });

      // If the target fld node doesn't exist, create a virtual broken node
      if (isBroken && !nodeMap.has(fldRef)) {
        addNode({
          ref: fldRef,
          kind: "field",
          label: `${col.source.tableName}.${col.source.fieldName}`,
          meta: {
            dataType: col.dataType,
            definition: col.definition,
            deprecated: true, // mark as potentially broken/missing
          },
        });
      }
    }

    // joins_on edges from joinGraph
    for (const join of gwt.joinGraph) {
      // joinGraph refs are table names or slugs — resolve to tbl: refs
      // Format: "schema.table" or just "table"
      const resolveTableRef = (ref: string): string => {
        const parts = ref.split(".");
        if (parts.length >= 2) {
          // Already qualified
          return `tbl:${parts.slice(0, 2).join(".")}`;
        }
        // Just a table name — search schemas
        for (const s of input.schemas) {
          const slug = s.slug || sanitizeSlug(s.name);
          const tbl = s.tables.find(t => t.name === ref);
          if (tbl) return `tbl:${slug}.${tbl.name}`;
        }
        return `tbl:_unknown_.${ref}`;
      };

      const leftRef = resolveTableRef(join.leftRef);
      const rightRef = resolveTableRef(join.rightRef);

      addEdge({
        id: makeEdgeId("joins_on", leftRef, rightRef),
        from: leftRef,
        to: rightRef,
        kind: "joins_on",
        meta: { on: join.on, type: join.type },
        provenance: { source: "governed-join", gwtSlug: gwt.slug },
      });
    }

    // related_to edges from relationships
    for (const rel of gwt.relationships) {
      let toRef: string = `tbl:_unknown_.${rel.targetRef}`;
      if (rel.targetKind === "governed-wide-table") {
        toRef = `gwt:${rel.targetRef}`;
      } else if (rel.targetKind === "wide-table") {
        toRef = `gwt:${rel.targetRef}`;
      } else {
        // regular table — targetRef may be "schema.table" or just "table"
        const parts = rel.targetRef.split(".");
        if (parts.length >= 2) {
          toRef = `tbl:${parts.slice(0, 2).join(".")}`;
        } else {
          // search
          for (const s of input.schemas) {
            const slug = s.slug || sanitizeSlug(s.name);
            const tbl = s.tables.find(t => t.name === rel.targetRef);
            if (tbl) { toRef = `tbl:${slug}.${tbl.name}`; break; }
          }
        }
      }

      addEdge({
        id: makeEdgeId("related_to", gwtRef, toRef),
        from: gwtRef,
        to: toRef,
        kind: "related_to",
        meta: { relation: rel.relation },
        provenance: { source: "governed-relationship", gwtSlug: gwt.slug },
      });
    }
  }

  // ── Step 4: Lineage Edges (flows_to) ─────────────────────────────────────

  for (const le of input.lineageEdges) {
    // Build tbl refs from lineage edge data
    // LineageEdge uses schemaName not slug, so we need to find the slug
    const findSchemaSlug = (schemaId: number, schemaName: string): string => {
      const found = input.schemas.find(s => s.id === schemaId);
      if (found) return found.slug || sanitizeSlug(found.name);
      return sanitizeSlug(schemaName);
    };

    const fromSlug = findSchemaSlug(le.fromSchemaId, le.fromSchemaName);
    const toSlug = findSchemaSlug(le.toSchemaId, le.toSchemaName);

    const fromRef = le.fromKind === "governed"
      ? `gwt:${sanitizeSlug(le.fromTableName)}`
      : `tbl:${fromSlug}.${le.fromTableName}`;

    const toRef = le.toKind === "governed"
      ? `gwt:${sanitizeSlug(le.toTableName)}`
      : `tbl:${toSlug}.${le.toTableName}`;

    addEdge({
      id: makeEdgeId("flows_to", fromRef, toRef),
      from: fromRef,
      to: toRef,
      kind: "flows_to",
      meta: {
        transformType: le.transformType,
        description: le.description,
        source: le.source,
      },
      provenance: { source: "lineage-edge", lineageEdgeId: le.id },
    });
  }

  // ── Step 5: Concept Mapping (maps_to_concept) ─────────────────────────────

  // Build lookup: stdName → concept ref, aliases → concept ref
  const conceptByStdName = new Map<string, string>(); // stdName → cpt ref
  const conceptByAlias = new Map<string, string>(); // alias → cpt ref

  for (const concept of input.concepts) {
    const cptRef = `cpt:${concept.stdName}`;
    const cptMeta: GraphNode["meta"] = { definition: concept.definition };
    if (concept.domain) cptMeta.domain = concept.domain;
    addNode({
      ref: cptRef,
      kind: "concept",
      label: concept.name,
      meta: cptMeta,
    });

    conceptByStdName.set(concept.stdName.toLowerCase(), cptRef);
    for (const alias of concept.aliases) {
      conceptByAlias.set(alias.toLowerCase(), cptRef);
    }

    // Table hints → tbl maps_to_concept
    for (const hint of concept.tableHints) {
      // Find the table in schemas
      const hintSchema = hint.schemaId != null
        ? input.schemas.find(s => s.id === hint.schemaId)
        : null;
      if (hintSchema) {
        const slug = hintSchema.slug || sanitizeSlug(hintSchema.name);
        const tbl = hintSchema.tables.find(t => t.name === hint.tableName);
        if (tbl) {
          const tblRef = `tbl:${slug}.${tbl.name}`;
          addEdge({
            id: makeEdgeId("maps_to_concept", tblRef, cptRef),
            from: tblRef,
            to: cptRef,
            kind: "maps_to_concept",
            meta: { role: hint.role },
            provenance: { source: "concept-hint", conceptId: concept.id },
          });
        }
      } else {
        // No schemaId — search by tableName across all schemas
        for (const s of input.schemas) {
          const slug = s.slug || sanitizeSlug(s.name);
          const tbl = s.tables.find(t => t.name === hint.tableName);
          if (tbl) {
            const tblRef = `tbl:${slug}.${tbl.name}`;
            addEdge({
              id: makeEdgeId("maps_to_concept", tblRef, cptRef),
              from: tblRef,
              to: cptRef,
              kind: "maps_to_concept",
              meta: { role: hint.role },
              provenance: { source: "concept-hint", conceptId: concept.id },
            });
          }
        }
      }
    }
  }

  // Naming dict: build additional alias → cpt lookup
  for (const entry of input.namingDict) {
    if (entry.status !== "approved") continue;
    const cptRef = conceptByStdName.get(entry.stdName.toLowerCase());
    if (!cptRef) continue;
    for (const alias of entry.aliases) {
      if (!conceptByAlias.has(alias.toLowerCase())) {
        conceptByAlias.set(alias.toLowerCase(), cptRef);
      }
    }
  }

  // Field → concept mapping (exact name match or alias match)
  for (const schema of input.schemas) {
    const schemaSlug = schema.slug || sanitizeSlug(schema.name);
    for (const table of schema.tables) {
      for (const field of table.fields) {
        const fldRef = `fld:${schemaSlug}.${table.name}.${field.name}`;
        const fieldNameLower = field.name.toLowerCase();

        let cptRef = conceptByStdName.get(fieldNameLower)
          ?? conceptByAlias.get(fieldNameLower);

        if (cptRef) {
          addEdge({
            id: makeEdgeId("maps_to_concept", fldRef, cptRef),
            from: fldRef,
            to: cptRef,
            kind: "maps_to_concept",
            provenance: { source: "structure" },
          });
        }
      }
    }
  }

  // Governed column → concept (via conceptId)
  for (const gwt of input.governed) {
    for (const col of gwt.columns) {
      if (!col.conceptId) continue;
      const concept = input.concepts.find(c => c.id === col.conceptId);
      if (!concept) continue;
      const cptRef = `cpt:${concept.stdName}`;
      const gwcRef = `gwc:${gwt.slug}.${col.name}`;
      addEdge({
        id: makeEdgeId("maps_to_concept", gwcRef, cptRef),
        from: gwcRef,
        to: cptRef,
        kind: "maps_to_concept",
        provenance: { source: "concept-hint", conceptId: concept.id },
      });
    }
  }

  // ── Step 6: Compute stats ─────────────────────────────────────────────────

  const nodes = [...nodeMap.values()];
  const edges = [...edgeMap.values()];

  const byKind: Record<string, number> = {};
  for (const edge of edges) {
    byKind[edge.kind] = (byKind[edge.kind] ?? 0) + 1;
  }

  return {
    version: 2,
    generatedAt: new Date().toISOString(),
    nodes,
    edges,
    stats: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      byKind,
    },
  };
}
