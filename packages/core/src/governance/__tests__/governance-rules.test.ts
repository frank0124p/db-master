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
  runOwnerRequiredRule,
  runSensitivityDeclaredRule,
  runNoDeprecatedSourceRule,
  runFreshnessDeclaredRule,
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

// ── gov.owner_required ────────────────────────────────────────────────────────

describe("gov.owner_required", () => {
  it("passes when draft has ownerUserId set", () => {
    const draft = makeDraft({ ownerUserId: 42 });
    const result = runOwnerRequiredRule(draft);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("fails when draft has no ownerUserId", () => {
    const draft = makeDraft(); // no ownerUserId
    const result = runOwnerRequiredRule(draft);
    expect(result.passed).toBe(false);
    expect(result.severity).toBe("warning");
    expect(result.violations[0]?.target).toBe(draft.name);
  });

  it("fails when draft is created without ownerUserId", () => {
    // makeDraft() doesn't set ownerUserId so it's absent (same as undefined)
    const draft = makeDraft();
    expect(draft.ownerUserId).toBeUndefined();
    const result = runOwnerRequiredRule(draft);
    expect(result.passed).toBe(false);
  });
});

// ── gov.sensitivity_declared ──────────────────────────────────────────────────

describe("gov.sensitivity_declared", () => {
  it("passes when pii-named fields have sensitivity set", () => {
    const draft = makeDraft({
      columns: [
        {
          name: "customer_name", dataType: "VARCHAR(64)",
          definition: "Customer full name",
          source: { schemaId: 1, tableName: "customers", fieldName: "customer_name" },
          sensitivity: "pii",
        },
        {
          name: "order_id", dataType: "INT",
          definition: "Order identifier",
          source: { schemaId: 1, tableName: "orders", fieldName: "id" },
          sensitivity: "internal",
        },
      ],
    });
    const result = runSensitivityDeclaredRule(draft);
    expect(result.passed).toBe(true);
  });

  it("fails when pii-named field has no sensitivity", () => {
    const draft = makeDraft({
      columns: [
        {
          name: "user_phone", dataType: "VARCHAR(20)",
          definition: "User phone number",
          source: { schemaId: 1, tableName: "users", fieldName: "phone" },
          // no sensitivity
        },
      ],
    });
    const result = runSensitivityDeclaredRule(draft);
    expect(result.passed).toBe(false);
    expect(result.severity).toBe("info");
    expect(result.violations[0]?.target).toBe("user_phone");
  });

  it("passes for non-pii-named fields without sensitivity", () => {
    const draft = makeDraft({
      columns: [
        {
          name: "quantity", dataType: "INT",
          definition: "Quantity of items",
          source: { schemaId: 1, tableName: "orders", fieldName: "qty" },
        },
      ],
    });
    const result = runSensitivityDeclaredRule(draft);
    expect(result.passed).toBe(true);
  });

  it("detects all default pii patterns: _name, _phone, _email, _id_no", () => {
    const draft = makeDraft({
      columns: [
        { name: "emp_name", dataType: "VARCHAR(64)", definition: "Name", source: { schemaId: 1, tableName: "t", fieldName: "emp_name" } },
        { name: "emp_phone", dataType: "VARCHAR(20)", definition: "Phone", source: { schemaId: 1, tableName: "t", fieldName: "emp_phone" } },
        { name: "emp_email", dataType: "VARCHAR(120)", definition: "Email", source: { schemaId: 1, tableName: "t", fieldName: "emp_email" } },
        { name: "emp_id_no", dataType: "VARCHAR(20)", definition: "ID number", source: { schemaId: 1, tableName: "t", fieldName: "emp_id_no" } },
      ],
    });
    const result = runSensitivityDeclaredRule(draft);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(4);
  });
});

// ── gov.no_deprecated_source ──────────────────────────────────────────────────

describe("gov.no_deprecated_source", () => {
  it("passes when source tables are not deprecated", () => {
    const draft = makeDraft({
      columns: [
        {
          name: "lot_id", dataType: "VARCHAR(32)",
          definition: "Lot identifier",
          source: { schemaId: 1, tableName: "wip_lots", fieldName: "lot_id" },
        },
      ],
    });
    const ctx = makeCtx({
      allTables: [
        {
          schemaId: 1, schemaSlug: "mes",
          table: { name: "wip_lots", deprecated: false },
        },
      ],
    });
    const result = runNoDeprecatedSourceRule(draft, ctx);
    expect(result.passed).toBe(true);
  });

  it("fails when source table is deprecated", () => {
    const draft = makeDraft({
      columns: [
        {
          name: "lot_id", dataType: "VARCHAR(32)",
          definition: "Lot identifier",
          source: { schemaId: 1, tableName: "old_wip_lots", fieldName: "lot_id" },
        },
      ],
    });
    const ctx = makeCtx({
      allTables: [
        {
          schemaId: 1, schemaSlug: "mes",
          table: { name: "old_wip_lots", deprecated: true },
        },
      ],
    });
    const result = runNoDeprecatedSourceRule(draft, ctx);
    expect(result.passed).toBe(false);
    expect(result.severity).toBe("error");
    expect(result.violations[0]?.target).toBe("lot_id");
  });

  it("passes when no tables are deprecated (empty allTables)", () => {
    const draft = makeDraft({
      columns: [
        {
          name: "lot_id", dataType: "VARCHAR(32)",
          definition: "Lot identifier",
          source: { schemaId: 1, tableName: "wip_lots", fieldName: "lot_id" },
        },
      ],
    });
    const ctx = makeCtx();
    const result = runNoDeprecatedSourceRule(draft, ctx);
    expect(result.passed).toBe(true);
  });
});

// ── gov.freshness_declared ────────────────────────────────────────────────────

describe("gov.freshness_declared", () => {
  it("passes when all source tables have refreshCycle declared", () => {
    const draft = makeDraft({
      columns: [
        {
          name: "lot_id", dataType: "VARCHAR(32)",
          definition: "Lot identifier",
          source: { schemaId: 1, tableName: "wip_lots", fieldName: "lot_id" },
        },
        {
          name: "step_id", dataType: "INT",
          definition: "Process step",
          source: { schemaId: 1, tableName: "process_steps", fieldName: "id" },
        },
      ],
    });
    const ctx = makeCtx({
      allTables: [
        { schemaId: 1, schemaSlug: "mes", table: { name: "wip_lots", refreshCycle: "daily" } },
        { schemaId: 1, schemaSlug: "mes", table: { name: "process_steps", refreshCycle: "hourly" } },
      ],
    });
    const result = runFreshnessDeclaredRule(draft, ctx);
    expect(result.passed).toBe(true);
  });

  it("fails when coverage is below threshold (0.5)", () => {
    const draft = makeDraft({
      columns: [
        {
          name: "lot_id", dataType: "VARCHAR(32)",
          definition: "Lot identifier",
          source: { schemaId: 1, tableName: "wip_lots", fieldName: "lot_id" },
        },
        {
          name: "step_id", dataType: "INT",
          definition: "Process step",
          source: { schemaId: 1, tableName: "process_steps", fieldName: "id" },
        },
        {
          name: "equip_id", dataType: "INT",
          definition: "Equipment",
          source: { schemaId: 1, tableName: "equipments", fieldName: "id" },
        },
      ],
    });
    const ctx = makeCtx({
      allTables: [
        // Only 1 out of 3 source tables has refreshCycle (33% < 50%)
        { schemaId: 1, schemaSlug: "mes", table: { name: "wip_lots", refreshCycle: "daily" } },
        { schemaId: 1, schemaSlug: "mes", table: { name: "process_steps" } },
        { schemaId: 1, schemaSlug: "mes", table: { name: "equipments" } },
      ],
    });
    const result = runFreshnessDeclaredRule(draft, ctx);
    expect(result.passed).toBe(false);
    expect(result.severity).toBe("info");
  });

  it("passes when draft has no columns (empty coverage trivially passes)", () => {
    const draft = makeDraft({ columns: [] });
    const ctx = makeCtx();
    const result = runFreshnessDeclaredRule(draft, ctx);
    expect(result.passed).toBe(true);
  });
});

// ── runGovernanceRules — integration ──────────────────────────────────────────

describe("runGovernanceRules", () => {
  it("returns 11 rule results", () => {
    const draft = makeDraft();
    const ctx = makeCtx();
    const results = runGovernanceRules(draft, ctx);
    expect(results.length).toBe(11);
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
    // Phase 10 new rules
    expect(ruleIds).toContain("gov.owner_required");
    expect(ruleIds).toContain("gov.sensitivity_declared");
    expect(ruleIds).toContain("gov.no_deprecated_source");
    expect(ruleIds).toContain("gov.freshness_declared");
  });
});
