import { describe, it, expect } from "vitest";
import {
  runSsotRule,
  runLineageRule,
  runBlockHierarchyRule,
  runJoinKeyRule,
  runNamingCoverageRule,
  runDefinitionRule,
  runDuplicateSemanticsRule,
  runGovernanceRules,
} from "../governance-rules.js";
import type {
  WideTableDraft,
  GovernanceContext,
  BusinessRule,
  ConceptCard,
  GovernedWideTable,
} from "../types.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeDraft(overrides: Partial<WideTableDraft> = {}): WideTableDraft {
  return {
    id: 1,
    blockKind: "medium",
    name: "test_draft",
    description: "A test draft",
    columns: [],
    joinGraph: [],
    relationships: [],
    editLog: [],
    versions: [],
    status: "draft",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeCtx(overrides: Partial<GovernanceContext> = {}): GovernanceContext {
  return {
    allTables: [],
    concepts: [],
    businessRules: [],
    namingDict: [],
    governedWideTables: [],
    ruleOverrides: {},
    ...overrides,
  };
}

function makeSsotRule(conceptId: number, tableName: string): BusinessRule {
  return {
    id: 1,
    slug: "ssot-test",
    title: "Test SSOT",
    ruleType: "ssot",
    statement: `SSOT for conceptId ${conceptId} is ${tableName}`,
    machine: {
      kind: "ssot_declaration",
      conceptId,
      ssotTable: { schemaId: 1, tableName },
    },
    sourceRefs: [],
    status: "approved",
    reviewers: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ── gov.single_source_of_truth ────────────────────────────────────────────────

describe("gov.single_source_of_truth", () => {
  it("passes when column uses SSOT-declared table", () => {
    const draft = makeDraft({
      columns: [{
        name: "lot_id", dataType: "VARCHAR(32)",
        definition: "在製品批次識別",
        source: { schemaId: 1, tableName: "wip_lots", fieldName: "lot_id" },
        conceptId: 1,
      }],
    });
    const ctx = makeCtx({ businessRules: [makeSsotRule(1, "wip_lots")] });
    const result = runSsotRule(draft, ctx);
    expect(result.passed).toBe(true);
  });

  it("fails when column uses wrong source table", () => {
    const draft = makeDraft({
      columns: [{
        name: "lot_id", dataType: "VARCHAR(32)",
        definition: "在製品批次識別",
        source: { schemaId: 2, tableName: "replica_lots", fieldName: "lot_id" },
        conceptId: 1,
      }],
    });
    const ctx = makeCtx({ businessRules: [makeSsotRule(1, "wip_lots")] });
    const result = runSsotRule(draft, ctx);
    expect(result.passed).toBe(false);
    expect(result.violations[0]?.target).toBe("lot_id");
  });
});

// ── gov.lineage_complete ──────────────────────────────────────────────────────

describe("gov.lineage_complete", () => {
  it("passes when all columns have valid lineage", () => {
    const draft = makeDraft({
      columns: [{
        name: "lot_id", dataType: "VARCHAR(32)",
        definition: "In WIP lot",
        source: { schemaId: 1, tableName: "wip_lots", fieldName: "lot_id" },
      }],
    });
    const ctx = makeCtx({
      allTables: [{
        schemaId: 1, schemaSlug: "wip-tracking",
        table: { name: "wip_lots", fields: [{ name: "lot_id", dataType: "VARCHAR(32)", isPrimaryKey: true, isUnique: true }] },
      }],
    });
    const result = runLineageRule(draft, ctx);
    expect(result.passed).toBe(true);
  });

  it("fails when column has no source table in system", () => {
    const draft = makeDraft({
      columns: [{
        name: "phantom_col", dataType: "INT",
        definition: "A phantom field",
        source: { schemaId: 99, tableName: "nonexistent_table", fieldName: "col" },
      }],
    });
    const ctx = makeCtx({ allTables: [] });
    const result = runLineageRule(draft, ctx);
    expect(result.passed).toBe(false);
  });

  it("fails when column is missing source entirely", () => {
    const draft = makeDraft({
      columns: [{
        name: "empty_src", dataType: "INT",
        definition: "Missing source",
        source: { schemaId: 0, tableName: "", fieldName: "" },
      }],
    });
    const ctx = makeCtx();
    const result = runLineageRule(draft, ctx);
    expect(result.passed).toBe(false);
  });
});

// ── gov.block_hierarchy ───────────────────────────────────────────────────────

describe("gov.block_hierarchy", () => {
  it("passes for small block regardless of joins", () => {
    const draft = makeDraft({ blockKind: "small" });
    const ctx = makeCtx();
    const result = runBlockHierarchyRule(draft, ctx);
    expect(result.passed).toBe(true);
  });

  it("passes for medium block joining base tables", () => {
    const draft = makeDraft({
      blockKind: "medium",
      joinGraph: [{ leftRef: "wip_lots", rightRef: "process_records", type: "left", on: [] }],
    });
    const ctx = makeCtx({ governedWideTables: [] });
    const result = runBlockHierarchyRule(draft, ctx);
    expect(result.passed).toBe(true);
  });

  it("fails for medium block joining another medium governed table", () => {
    const mediumGoverned: GovernedWideTable = {
      id: 1, slug: "another-medium", draftId: 0, reportId: 0,
      blockKind: "medium", name: "another-medium",
      description: "", columns: [], joinGraph: [], relationships: [],
      publishedBy: "test", publishedAt: new Date().toISOString(), version: 1,
    };
    const draft = makeDraft({
      blockKind: "medium",
      joinGraph: [{ leftRef: "another-medium", rightRef: "base_table", type: "inner", on: [] }],
    });
    const ctx = makeCtx({ governedWideTables: [mediumGoverned] });
    const result = runBlockHierarchyRule(draft, ctx);
    expect(result.passed).toBe(false);
  });
});

// ── gov.definition_required ───────────────────────────────────────────────────

describe("gov.definition_required", () => {
  it("passes when all columns have definitions", () => {
    const draft = makeDraft({
      columns: [{
        name: "lot_id", dataType: "VARCHAR(32)",
        definition: "在製品批次的唯一識別碼，SSOT=wip_lots",
        source: { schemaId: 1, tableName: "wip_lots", fieldName: "lot_id" },
      }],
    });
    const result = runDefinitionRule(draft);
    expect(result.passed).toBe(true);
  });

  it("fails when column has empty definition", () => {
    const draft = makeDraft({
      columns: [{
        name: "lot_id", dataType: "VARCHAR(32)",
        definition: "",
        source: { schemaId: 1, tableName: "wip_lots", fieldName: "lot_id" },
      }],
    });
    const result = runDefinitionRule(draft);
    expect(result.passed).toBe(false);
  });

  it("fails when definition is too short", () => {
    const draft = makeDraft({
      columns: [{
        name: "lot_id", dataType: "VARCHAR(32)",
        definition: "short",
        source: { schemaId: 1, tableName: "wip_lots", fieldName: "lot_id" },
      }],
    });
    const result = runDefinitionRule(draft);
    expect(result.passed).toBe(false);
  });
});

// ── gov.naming_dict_coverage ──────────────────────────────────────────────────

describe("gov.naming_dict_coverage", () => {
  it("passes when coverage meets threshold", () => {
    const draft = makeDraft({
      columns: [
        { name: "lot_id", dataType: "VARCHAR(32)", definition: "Lot identifier for tracking", source: { schemaId: 1, tableName: "t", fieldName: "lot_id" } },
        { name: "product_id", dataType: "INT", definition: "Product identifier code", source: { schemaId: 1, tableName: "t", fieldName: "product_id" }, namingDictId: 2 },
      ],
    });
    const ctx = makeCtx({ namingDict: [{ id: 1, stdName: "lot_id", aliases: [] }] });
    const result = runNamingCoverageRule(draft, ctx, 0.5);
    expect(result.passed).toBe(true);
  });

  it("fails when coverage is below threshold", () => {
    const draft = makeDraft({
      columns: [
        { name: "xyz_col", dataType: "INT", definition: "Unknown column XYZ", source: { schemaId: 1, tableName: "t", fieldName: "xyz_col" } },
        { name: "abc_col", dataType: "INT", definition: "Unknown column ABC", source: { schemaId: 1, tableName: "t", fieldName: "abc_col" } },
      ],
    });
    const ctx = makeCtx({ namingDict: [] });
    const result = runNamingCoverageRule(draft, ctx, 0.8);
    expect(result.passed).toBe(false);
  });
});

// ── gov.no_duplicate_semantics ────────────────────────────────────────────────

describe("gov.no_duplicate_semantics", () => {
  it("passes when no duplicate concept+source", () => {
    const draft = makeDraft({
      columns: [
        { name: "lot_id", dataType: "VARCHAR(32)", definition: "Lot identifier", source: { schemaId: 1, tableName: "wip_lots", fieldName: "lot_id" }, conceptId: 1 },
        { name: "product_id", dataType: "INT", definition: "Product identifier", source: { schemaId: 1, tableName: "products", fieldName: "product_id" }, conceptId: 2 },
      ],
    });
    const result = runDuplicateSemanticsRule(draft);
    expect(result.passed).toBe(true);
  });

  it("fails when two columns share same concept and source", () => {
    const draft = makeDraft({
      columns: [
        { name: "lot_id", dataType: "VARCHAR(32)", definition: "Lot identifier A", source: { schemaId: 1, tableName: "wip_lots", fieldName: "lot_id" }, conceptId: 1 },
        { name: "lot_id_copy", dataType: "VARCHAR(32)", definition: "Lot identifier B copy", source: { schemaId: 1, tableName: "wip_lots", fieldName: "lot_id" }, conceptId: 1 },
      ],
    });
    const result = runDuplicateSemanticsRule(draft);
    expect(result.passed).toBe(false);
  });
});

// ── runGovernanceRules — integration ──────────────────────────────────────────

describe("runGovernanceRules", () => {
  it("returns 7 rule results", () => {
    const draft = makeDraft();
    const ctx = makeCtx();
    const results = runGovernanceRules(draft, ctx);
    expect(results.length).toBe(7);
  });

  it("returns all ruleIds for gov.* namespace", () => {
    const draft = makeDraft();
    const ctx = makeCtx();
    const results = runGovernanceRules(draft, ctx);
    const ruleIds = results.map(r => r.ruleId);
    expect(ruleIds).toContain("gov.single_source_of_truth");
    expect(ruleIds).toContain("gov.lineage_complete");
    expect(ruleIds).toContain("gov.block_hierarchy");
    expect(ruleIds).toContain("gov.join_key_validity");
    expect(ruleIds).toContain("gov.naming_dict_coverage");
    expect(ruleIds).toContain("gov.definition_required");
    expect(ruleIds).toContain("gov.no_duplicate_semantics");
  });
});
