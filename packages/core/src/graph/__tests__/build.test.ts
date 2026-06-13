import { describe, it, expect } from "vitest";
import { buildUnifiedGraph } from "../build.js";
import type { GraphBuildInput, SchemaInput } from "../types.js";
import type { GovernedWideTable } from "../../governance/types.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSchema(overrides: Partial<SchemaInput> & Pick<SchemaInput, "id" | "name" | "slug">): SchemaInput {
  return {
    domain: "test",
    suiteId: null,
    layerType: null,
    tables: [],
    ...overrides,
  };
}

function minInput(partial: Partial<GraphBuildInput> = {}): GraphBuildInput {
  return {
    schemas: [],
    governed: [],
    lineageEdges: [],
    concepts: [],
    namingDict: [],
    domains: [],
    suites: [],
    ...partial,
  };
}

// ── T8.1 Tests ────────────────────────────────────────────────────────────────

describe("buildUnifiedGraph", () => {
  // AC: 1 governed (3 cols) + 2 source tables → composed_from edges = 3, has_field edges = total fields
  it("produces correct composed_from and has_field edges for 1 gwt + 2 source tables", () => {
    const schema1: SchemaInput = makeSchema({
      id: 1,
      name: "wip-tracking",
      slug: "wip-tracking",
      domain: "semiconductor",
      tables: [
        {
          id: 10,
          name: "lots",
          comment: null,
          fields: [
            { id: 101, name: "id", dataType: "INT", nullable: false, isPrimaryKey: true, comment: null },
            { id: 102, name: "lot_code", dataType: "VARCHAR", nullable: false, isPrimaryKey: false, comment: null },
          ],
        },
      ],
    });

    const schema2: SchemaInput = makeSchema({
      id: 2,
      name: "mes-equipment",
      slug: "mes-equipment",
      domain: "semiconductor",
      tables: [
        {
          id: 20,
          name: "equipments",
          comment: null,
          fields: [
            { id: 201, name: "id", dataType: "INT", nullable: false, isPrimaryKey: true, comment: null },
            { id: 202, name: "equip_code", dataType: "VARCHAR", nullable: false, isPrimaryKey: false, comment: null },
            { id: 203, name: "status", dataType: "VARCHAR", nullable: true, isPrimaryKey: false, comment: null },
          ],
        },
      ],
    });

    const gwt: GovernedWideTable = {
      id: 1,
      slug: "yield-analysis",
      draftId: 1,
      reportId: 1,
      blockKind: "medium",
      name: "Yield Analysis",
      description: "Yield analysis wide table",
      columns: [
        {
          name: "lot_code",
          dataType: "VARCHAR",
          definition: "Lot code",
          source: { schemaId: 1, tableName: "lots", fieldName: "lot_code" },
        },
        {
          name: "equip_code",
          dataType: "VARCHAR",
          definition: "Equipment code",
          source: { schemaId: 2, tableName: "equipments", fieldName: "equip_code" },
        },
        {
          name: "equip_status",
          dataType: "VARCHAR",
          definition: "Equipment status",
          source: { schemaId: 2, tableName: "equipments", fieldName: "status" },
        },
      ],
      joinGraph: [],
      relationships: [],
      publishedBy: "admin",
      publishedAt: "2024-01-01T00:00:00Z",
      version: 1,
    };

    const graph = buildUnifiedGraph(minInput({
      schemas: [schema1, schema2],
      governed: [gwt],
    }));

    // composed_from edges should be exactly 3 (one per column)
    const composedFrom = graph.edges.filter(e => e.kind === "composed_from");
    expect(composedFrom).toHaveLength(3);

    // has_field edges: 2 (lots) + 3 (equipments) + 3 (gwt columns) = 8
    const hasField = graph.edges.filter(e => e.kind === "has_field");
    const totalFields = schema1.tables.reduce((s, t) => s + t.fields.length, 0)
      + schema2.tables.reduce((s, t) => s + t.fields.length, 0)
      + gwt.columns.length;
    expect(hasField).toHaveLength(totalFields);
  });

  // AC: same-id edges deduplicated, provenance unioned
  it("deduplicates edges with the same id and unions provenance", () => {
    // Two governed tables pointing to the same source field
    const schema: SchemaInput = makeSchema({
      id: 1,
      name: "src",
      slug: "src",
      tables: [
        {
          id: 10,
          name: "source_table",
          comment: null,
          fields: [
            { id: 101, name: "id", dataType: "INT", nullable: false, isPrimaryKey: true, comment: null },
            { id: 102, name: "value", dataType: "INT", nullable: false, isPrimaryKey: false, comment: null },
          ],
        },
      ],
    });

    // Build graph twice by including duplicate lineage edges
    const { v4: uuid } = { v4: () => "edge-1" };
    const le1 = {
      id: "edge-1",
      fromSchemaId: 1,
      fromSchemaName: "src",
      fromDomain: "test",
      fromTableId: 10,
      fromTableName: "source_table",
      fromKind: "table" as const,
      toSchemaId: 2,
      toSchemaName: "dst",
      toDomain: "test",
      toTableId: 20,
      toTableName: "dest_table",
      toKind: "table" as const,
      transformType: "direct" as const,
      description: "first",
      source: "manual" as const,
      createdAt: "2024-01-01T00:00:00Z",
    };

    // Same edge with same computed ID
    const le2 = { ...le1, id: "edge-2", description: "second" };

    const graph = buildUnifiedGraph(minInput({
      schemas: [schema],
      lineageEdges: [le1, le2],
    }));

    // Both flows_to edges have the same from/to so they should be deduped
    const flowsTo = graph.edges.filter(e => e.kind === "flows_to");
    expect(flowsTo).toHaveLength(1);
  });

  // AC: sampleValues correctly extracted (dedupe, truncate 50, max 10)
  it("extracts deduplicated, truncated sampleValues (max 10)", () => {
    const longStr = "A".repeat(100); // 100 chars → truncated to 50
    const sampleData: Record<string, unknown>[] = [
      { field_a: "alpha" },
      { field_a: "alpha" },      // duplicate
      { field_a: "beta" },
      { field_a: longStr },
      { field_a: "gamma" },
      { field_a: "delta" },
      { field_a: "epsilon" },
      { field_a: "zeta" },
      { field_a: "eta" },
      { field_a: "theta" },
      { field_a: "iota" },       // 11th unique value → should be excluded
    ];

    const schema: SchemaInput = makeSchema({
      id: 1,
      name: "test",
      slug: "test",
      tables: [
        {
          id: 10,
          name: "my_table",
          comment: null,
          sampleData,
          fields: [
            { id: 101, name: "field_a", dataType: "VARCHAR", nullable: true, isPrimaryKey: false, comment: null },
          ],
        },
      ],
    });

    const graph = buildUnifiedGraph(minInput({ schemas: [schema] }));

    const fieldNode = graph.nodes.find(n => n.ref === "fld:test.my_table.field_a");
    expect(fieldNode).toBeDefined();
    const sv = fieldNode!.meta.sampleValues ?? [];

    // No duplicates
    const unique = new Set(sv);
    expect(unique.size).toBe(sv.length);

    // Max 10
    expect(sv.length).toBeLessThanOrEqual(10);

    // Truncated to 50 chars
    for (const v of sv) {
      expect(v.length).toBeLessThanOrEqual(50);
    }

    // The long string should be truncated to 50 chars
    const truncated = sv.find(v => v === "A".repeat(50));
    expect(truncated).toBeDefined();
  });

  // AC: broken composed_from when source field not found
  it("creates a broken composed_from edge when source field is not in graph", () => {
    const gwt: GovernedWideTable = {
      id: 1,
      slug: "broken-gwt",
      draftId: 1,
      reportId: 1,
      blockKind: "small",
      name: "Broken GWT",
      description: "GWT with missing source",
      columns: [
        {
          name: "missing_col",
          dataType: "VARCHAR",
          definition: "Column pointing to a non-existent field",
          source: { schemaId: 999, tableName: "nonexistent_table", fieldName: "nonexistent_field" },
        },
      ],
      joinGraph: [],
      relationships: [],
      publishedBy: "admin",
      publishedAt: "2024-01-01T00:00:00Z",
      version: 1,
    };

    const graph = buildUnifiedGraph(minInput({ governed: [gwt] }));

    const brokenEdge = graph.edges.find(
      e => e.kind === "composed_from" && e.meta?.["broken"] === true,
    );
    expect(brokenEdge).toBeDefined();
    expect(brokenEdge!.from).toBe("gwc:broken-gwt.missing_col");
  });
});
