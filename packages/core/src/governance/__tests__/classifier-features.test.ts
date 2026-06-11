import { describe, it, expect } from "vitest";
import {
  computeClassifierFeatures,
  computeConfidence,
} from "../classifier-features.js";
import type { ConceptCard } from "../types.js";

function makeConcept(overrides: Partial<ConceptCard> = {}): ConceptCard {
  return {
    id: 1,
    slug: "wip-lot",
    name: "在製品批次",
    stdName: "wip_lot",
    definition: "在製品的一個批次",
    aliases: ["批次", "WIP Lot", "lot"],
    relatedConcepts: [],
    tableHints: [{ tableName: "wip_lots", role: "ssot" }],
    namingDictIds: [],
    sourceRefs: [],
    status: "approved",
    reviewers: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("computeClassifierFeatures", () => {
  it("table with high field overlap to existing table gets score > 0.7", () => {
    const table = {
      tableName: "wip_lots_copy",
      fields: ["lot_id", "lot_no", "product_id", "start_at", "status"],
    };
    const existingTables = [
      {
        schemaId: 1,
        tableName: "wip_lots",
        fields: ["lot_id", "lot_no", "product_id", "start_at", "status", "end_at"],
      },
    ];
    const features = computeClassifierFeatures(table, {
      concepts: [],
      dictEntries: [],
      existingTables,
    });
    expect(features.similarTables[0]?.score).toBeGreaterThan(0.7);
    expect(features.similarTables[0]?.tableName).toBe("wip_lots");
  });

  it("concept tableHint match boosts concept hit score", () => {
    const concept = makeConcept({
      tableHints: [{ tableName: "wip_lots", role: "ssot" }],
    });
    const features = computeClassifierFeatures(
      { tableName: "wip_lots", fields: ["lot_id"] },
      { concepts: [concept], dictEntries: [], existingTables: [] },
    );
    expect(features.conceptHitScore).toBeGreaterThan(0);
    expect(features.matchedConceptIds).toContain(1);
  });

  it("dict coverage reflects matching fields", () => {
    const features = computeClassifierFeatures(
      { tableName: "orders", fields: ["lot_id", "unknown_field", "lot_no"] },
      {
        concepts: [],
        dictEntries: [
          { id: 1, stdName: "lot_id", aliases: [] },
          { id: 2, stdName: "lot_no", aliases: ["lot_number"] },
        ],
        existingTables: [],
      },
    );
    // 2 out of 3 fields match
    expect(features.dictCoverage).toBeCloseTo(2 / 3);
    expect(features.matchedDictIds).toHaveLength(2);
  });

  it("computeConfidence weights are applied correctly", () => {
    const features = {
      conceptHitScore: 1,
      dictCoverage: 1,
      similarTableScore: 1,
      similarTables: [],
      matchedConceptIds: [],
      matchedDictIds: [],
    };
    expect(computeConfidence(features)).toBe(1);
  });

  it("zero similarity for completely unrelated tables", () => {
    const features = computeClassifierFeatures(
      { tableName: "xyz_foobar", fields: ["col1", "col2"] },
      {
        concepts: [],
        dictEntries: [],
        existingTables: [
          { schemaId: 1, tableName: "wip_lots", fields: ["lot_id", "product_id"] },
        ],
      },
    );
    expect(features.similarTableScore).toBeLessThan(0.3);
  });
});
