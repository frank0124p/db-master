/**
 * Unified Semantic Graph — Type Definitions
 *
 * Node ref formats (globally unique):
 *   concept:   "cpt:{stdName}"                   e.g. cpt:wip_lot
 *   domain:    "dom:{domainId}"                  e.g. dom:semiconductor
 *   suite:     "ste:{suiteId}"                   e.g. ste:1
 *   table:     "tbl:{schemaSlug}.{tableName}"    e.g. tbl:mes-equipment.equipments
 *   field:     "fld:{schemaSlug}.{tableName}.{fieldName}"
 *   governed:  "gwt:{slug}"                      e.g. gwt:yield-equipment-analysis
 *   gwt col:   "gwc:{slug}.{columnName}"
 */

export type GraphNodeKind =
  | "concept"
  | "domain"
  | "suite"
  | "table"
  | "field"
  | "governed"
  | "governed-column";

export interface GraphNode {
  ref: string;
  kind: GraphNodeKind;
  label: string;
  meta: {
    // field / governed-column shared
    dataType?: string;
    definition?: string;
    nullable?: boolean;
    isPrimaryKey?: boolean;
    sampleValues?: string[];
    // table / governed shared
    description?: string;
    layerType?: string;
    domain?: string;
    suiteId?: number;
    blockKind?: "small" | "medium";
    version?: number;
    // Phase 10 placeholders (empty in Phase 8)
    ownerUserId?: number;
    sensitivity?: "public" | "internal" | "confidential" | "pii";
    refreshCycle?: string;
    deprecated?: boolean;
  };
}

export type GraphEdgeKind =
  | "has_field"        // tbl → fld; gwt → gwc
  | "fk"               // fld → fld (FK inference; direction: FK field → referenced PK field)
  | "joins_on"         // tbl → tbl (from governed joinGraph; meta.on records field pairs)
  | "composed_from"    // gwc → fld (field-level lineage from column.source; meta.transform)
  | "flows_to"         // tbl → tbl (from existing LineageEdge; meta preserves transformType/description/source)
  | "maps_to_concept"  // fld | gwc | tbl → cpt
  | "related_to"       // gwt → gwt | tbl (from relationships; meta.relation records type)
  | "belongs_to";      // tbl → dom / ste; gwt → dom

export interface GraphEdge {
  id: string;          // `${kind}:${from}->${to}` — same from/to/kind is the same edge (deduped)
  from: string;        // node ref
  to: string;
  kind: GraphEdgeKind;
  meta?: Record<string, unknown>;
  /** How this edge was derived (for explainability + incremental update) */
  provenance:
    | { source: "governed-column"; gwtSlug: string }
    | { source: "governed-join"; gwtSlug: string }
    | { source: "governed-relationship"; gwtSlug: string }
    | { source: "fk-inference"; schemaSlug: string }
    | { source: "lineage-edge"; lineageEdgeId: string }
    | { source: "concept-hint"; conceptId: number }
    | { source: "structure" };
}

export interface UnifiedGraph {
  version: 2;
  generatedAt: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    nodeCount: number;
    edgeCount: number;
    byKind: Record<string, number>;
  };
}

// ── Build Input ───────────────────────────────────────────────────────────────

import type { GovernedWideTable, ConceptCard } from "../governance/types.js";
import type { LineageEdge } from "../lineage.js";
import type { NamingEntry } from "../types.js";

export interface SchemaInput {
  id: number;
  name: string;
  slug: string;      // derived from name for ref building
  domain: string;
  suiteId: number | null;
  layerType: string | null;
  tables: TableInput[];
}

export interface TableInput {
  id: number;
  name: string;
  comment: string | null;
  layerType?: string | null;
  fields: FieldInput[];
  sampleData?: Record<string, unknown>[];
  // Phase 10
  ownerUserId?: number;
  refreshCycle?: string;
  deprecated?: boolean;
}

export interface FieldInput {
  id: number;
  name: string;
  dataType: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  comment: string | null;
  sensitivity?: import("../types.js").Sensitivity;
}

export interface DomainDef {
  id: string;
  name: string;
}

export interface ProductSuiteInput {
  id: number;
  name: string;
}

export interface GraphBuildInput {
  schemas: SchemaInput[];
  governed: GovernedWideTable[];
  lineageEdges: LineageEdge[];
  concepts: ConceptCard[];       // approved only
  namingDict: NamingEntry[];     // approved only
  domains: DomainDef[];
  suites: ProductSuiteInput[];
}
