import { describe, it, expect } from "vitest";
import { runRules } from "../engine.js";
import { BUILT_IN_RULES } from "../built-in.js";
import type { TableContext, FieldContext, RuleDefinition } from "../engine.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeField(overrides: Partial<FieldContext> = {}): FieldContext {
  return {
    name: "some_field",
    dataType: "varchar(255)",
    nullable: true,
    isPrimaryKey: false,
    isUnique: false,
    isAutoIncrement: false,
    defaultValue: null,
    comment: "A test field",
    position: 1,
    ...overrides,
  };
}

function makeTable(overrides: Partial<TableContext> = {}): TableContext {
  return {
    name: "some_table",
    comment: "A test table",
    fields: [
      makeField({ name: "id", isPrimaryKey: true }),
    ],
    ...overrides,
  };
}

function findRule(id: string): RuleDefinition {
  const rule = BUILT_IN_RULES.find((r) => r.id === id);
  if (!rule) throw new Error(`Rule not found: ${id}`);
  return rule;
}

function runSingleRule(rule: RuleDefinition, tables: TableContext[]) {
  return runRules(tables, [rule], new Map());
}

// ── naming.snake_case ─────────────────────────────────────────────────────────

describe("naming.snake_case", () => {
  const rule = findRule("naming.snake_case");

  it("passes for a valid snake_case table name", () => {
    const result = runSingleRule(rule, [makeTable({ name: "user_accounts" })]);
    const violations = result.violations.filter((v) => v.ruleId === "naming.snake_case");
    expect(violations).toHaveLength(0);
  });

  it("fails for a camelCase table name", () => {
    const result = runSingleRule(rule, [makeTable({ name: "UserAccounts" })]);
    const violations = result.violations.filter((v) => v.ruleId === "naming.snake_case");
    expect(violations.length).toBeGreaterThan(0);
  });

  it("passes for a valid snake_case field name", () => {
    const table = makeTable({
      name: "valid_table",
      fields: [makeField({ name: "user_name", isPrimaryKey: false })],
    });
    const result = runSingleRule(rule, [table]);
    const violations = result.violations.filter((v) => v.ruleId === "naming.snake_case");
    expect(violations).toHaveLength(0);
  });

  it("fails for a camelCase field name", () => {
    const table = makeTable({
      name: "valid_table",
      fields: [makeField({ name: "userId" })],
    });
    const result = runSingleRule(rule, [table]);
    const violations = result.violations.filter((v) => v.ruleId === "naming.snake_case");
    expect(violations.length).toBeGreaterThan(0);
  });

  it("fails for a field name starting with a number", () => {
    const table = makeTable({
      name: "valid_table",
      fields: [makeField({ name: "1st_field" })],
    });
    const result = runSingleRule(rule, [table]);
    const violations = result.violations.filter((v) => v.ruleId === "naming.snake_case");
    expect(violations.length).toBeGreaterThan(0);
  });
});

// ── naming.reserved_words ─────────────────────────────────────────────────────

describe("naming.reserved_words", () => {
  const rule = findRule("naming.reserved_words");

  it("passes for a non-reserved table name", () => {
    const result = runSingleRule(rule, [makeTable({ name: "user_accounts" })]);
    const violations = result.violations.filter((v) => v.ruleId === "naming.reserved_words");
    expect(violations).toHaveLength(0);
  });

  it("fails when table name is a SQL reserved word", () => {
    const result = runSingleRule(rule, [makeTable({ name: "table" })]);
    const violations = result.violations.filter((v) => v.ruleId === "naming.reserved_words");
    expect(violations.length).toBeGreaterThan(0);
  });

  it("passes for a non-reserved field name", () => {
    const table = makeTable({
      name: "valid_table",
      fields: [makeField({ name: "created_at" })],
    });
    const result = runSingleRule(rule, [table]);
    const violations = result.violations.filter((v) => v.ruleId === "naming.reserved_words");
    expect(violations).toHaveLength(0);
  });

  it("fails when field name is a SQL reserved word", () => {
    const table = makeTable({
      name: "valid_table",
      fields: [makeField({ name: "select" })],
    });
    const result = runSingleRule(rule, [table]);
    const violations = result.violations.filter((v) => v.ruleId === "naming.reserved_words");
    expect(violations.length).toBeGreaterThan(0);
  });

  it("is case-insensitive for reserved word detection", () => {
    const result = runSingleRule(rule, [makeTable({ name: "SELECT" })]);
    const violations = result.violations.filter((v) => v.ruleId === "naming.reserved_words");
    expect(violations.length).toBeGreaterThan(0);
  });
});

// ── naming.max_length ─────────────────────────────────────────────────────────

describe("naming.max_length", () => {
  const rule = findRule("naming.max_length");

  it("passes for table name within default 64 char limit", () => {
    const result = runSingleRule(rule, [makeTable({ name: "short_table" })]);
    const violations = result.violations.filter((v) => v.ruleId === "naming.max_length");
    expect(violations).toHaveLength(0);
  });

  it("fails for table name exceeding 64 characters", () => {
    const longName = "a".repeat(65);
    const result = runSingleRule(rule, [makeTable({ name: longName })]);
    const violations = result.violations.filter((v) => v.ruleId === "naming.max_length");
    expect(violations.length).toBeGreaterThan(0);
  });

  it("passes for field name within default 64 char limit", () => {
    const table = makeTable({
      name: "valid_table",
      fields: [makeField({ name: "short_field" })],
    });
    const result = runSingleRule(rule, [table]);
    const violations = result.violations.filter((v) => v.ruleId === "naming.max_length");
    expect(violations).toHaveLength(0);
  });

  it("fails for field name exceeding 64 characters", () => {
    const longField = "a".repeat(65);
    const table = makeTable({
      name: "valid_table",
      fields: [makeField({ name: longField })],
    });
    const result = runSingleRule(rule, [table]);
    const violations = result.violations.filter((v) => v.ruleId === "naming.max_length");
    expect(violations.length).toBeGreaterThan(0);
  });
});

// ── semantic.field_comment ────────────────────────────────────────────────────

describe("semantic.field_comment", () => {
  const rule = findRule("semantic.field_comment");

  it("passes when field has a meaningful comment", () => {
    const table = makeTable({
      fields: [makeField({ comment: "User identifier" })],
    });
    const result = runSingleRule(rule, [table]);
    const violations = result.violations.filter((v) => v.ruleId === "semantic.field_comment");
    expect(violations).toHaveLength(0);
  });

  it("fails when field has no comment", () => {
    const table = makeTable({
      fields: [makeField({ comment: null })],
    });
    const result = runSingleRule(rule, [table]);
    const violations = result.violations.filter((v) => v.ruleId === "semantic.field_comment");
    expect(violations.length).toBeGreaterThan(0);
  });

  it("fails when field comment is too short", () => {
    const table = makeTable({
      fields: [makeField({ comment: "x" })],
    });
    const result = runSingleRule(rule, [table]);
    const violations = result.violations.filter((v) => v.ruleId === "semantic.field_comment");
    expect(violations.length).toBeGreaterThan(0);
  });

  it("does not flag table-level check (only field-level)", () => {
    const table = makeTable({ comment: null });
    const result = rule.check(table, null, rule.defaultConfig);
    expect(result).toHaveLength(0);
  });
});

// ── semantic.table_comment ────────────────────────────────────────────────────

describe("semantic.table_comment", () => {
  const rule = findRule("semantic.table_comment");

  it("passes when table has a meaningful comment", () => {
    const result = runSingleRule(rule, [makeTable({ comment: "Stores user account data" })]);
    const violations = result.violations.filter((v) => v.ruleId === "semantic.table_comment");
    expect(violations).toHaveLength(0);
  });

  it("fails when table has no comment", () => {
    const result = runSingleRule(rule, [makeTable({ comment: null })]);
    const violations = result.violations.filter((v) => v.ruleId === "semantic.table_comment");
    expect(violations.length).toBeGreaterThan(0);
  });

  it("fails when table comment is too short (< 4 chars)", () => {
    const result = runSingleRule(rule, [makeTable({ comment: "ok" })]);
    const violations = result.violations.filter((v) => v.ruleId === "semantic.table_comment");
    expect(violations.length).toBeGreaterThan(0);
  });

  it("does not flag field-level check", () => {
    const field = makeField();
    const result = rule.check(makeTable(), field, rule.defaultConfig);
    expect(result).toHaveLength(0);
  });
});

// ── semantic.blob_needs_comment ───────────────────────────────────────────────

describe("semantic.blob_needs_comment", () => {
  const rule = findRule("semantic.blob_needs_comment");

  it("passes for a TEXT field with a meaningful comment", () => {
    const table = makeTable({
      fields: [makeField({ dataType: "text", comment: "Contains the event payload" })],
    });
    const result = runSingleRule(rule, [table]);
    const violations = result.violations.filter((v) => v.ruleId === "semantic.blob_needs_comment");
    expect(violations).toHaveLength(0);
  });

  it("fails for a TEXT field without a comment", () => {
    const table = makeTable({
      fields: [makeField({ dataType: "text", comment: null })],
    });
    const result = runSingleRule(rule, [table]);
    const violations = result.violations.filter((v) => v.ruleId === "semantic.blob_needs_comment");
    expect(violations.length).toBeGreaterThan(0);
  });

  it("fails for a JSON field without a comment", () => {
    const table = makeTable({
      fields: [makeField({ dataType: "json", comment: null })],
    });
    const result = runSingleRule(rule, [table]);
    const violations = result.violations.filter((v) => v.ruleId === "semantic.blob_needs_comment");
    expect(violations.length).toBeGreaterThan(0);
  });

  it("does not fail for a varchar field without comment", () => {
    const table = makeTable({
      fields: [makeField({ dataType: "varchar(255)", comment: null })],
    });
    const result = runSingleRule(rule, [table]);
    const violations = result.violations.filter((v) => v.ruleId === "semantic.blob_needs_comment");
    expect(violations).toHaveLength(0);
  });
});

// ── structure.has_primary_key ─────────────────────────────────────────────────

describe("structure.has_primary_key", () => {
  const rule = findRule("structure.has_primary_key");

  it("passes when table has a primary key", () => {
    const table = makeTable({
      fields: [makeField({ name: "id", isPrimaryKey: true })],
    });
    const result = runSingleRule(rule, [table]);
    const violations = result.violations.filter((v) => v.ruleId === "structure.has_primary_key");
    expect(violations).toHaveLength(0);
  });

  it("fails when table has no primary key", () => {
    const table = makeTable({
      fields: [makeField({ name: "user_name", isPrimaryKey: false })],
    });
    const result = runSingleRule(rule, [table]);
    const violations = result.violations.filter((v) => v.ruleId === "structure.has_primary_key");
    expect(violations.length).toBeGreaterThan(0);
  });

  it("passes when one of multiple fields is the primary key", () => {
    const table = makeTable({
      fields: [
        makeField({ name: "id", isPrimaryKey: true }),
        makeField({ name: "user_name", isPrimaryKey: false, position: 2 }),
      ],
    });
    const result = runSingleRule(rule, [table]);
    const violations = result.violations.filter((v) => v.ruleId === "structure.has_primary_key");
    expect(violations).toHaveLength(0);
  });
});

// ── structure.timestamp_columns ───────────────────────────────────────────────

describe("structure.timestamp_columns", () => {
  const rule = findRule("structure.timestamp_columns");

  it("passes when table has both created_at and updated_at", () => {
    const table = makeTable({
      fields: [
        makeField({ name: "id", isPrimaryKey: true }),
        makeField({ name: "created_at", dataType: "datetime", position: 2 }),
        makeField({ name: "updated_at", dataType: "datetime", position: 3 }),
      ],
    });
    const result = runSingleRule(rule, [table]);
    const violations = result.violations.filter((v) => v.ruleId === "structure.timestamp_columns");
    expect(violations).toHaveLength(0);
  });

  it("fails when table is missing created_at", () => {
    const table = makeTable({
      fields: [
        makeField({ name: "id", isPrimaryKey: true }),
        makeField({ name: "updated_at", dataType: "datetime", position: 2 }),
      ],
    });
    const result = runSingleRule(rule, [table]);
    const violations = result.violations.filter(
      (v) => v.ruleId === "structure.timestamp_columns" && v.message.includes("created_at")
    );
    expect(violations.length).toBeGreaterThan(0);
  });

  it("fails when table is missing updated_at", () => {
    const table = makeTable({
      fields: [
        makeField({ name: "id", isPrimaryKey: true }),
        makeField({ name: "created_at", dataType: "datetime", position: 2 }),
      ],
    });
    const result = runSingleRule(rule, [table]);
    const violations = result.violations.filter(
      (v) => v.ruleId === "structure.timestamp_columns" && v.message.includes("updated_at")
    );
    expect(violations.length).toBeGreaterThan(0);
  });

  it("fails when table has neither created_at nor updated_at", () => {
    const table = makeTable({
      fields: [makeField({ name: "id", isPrimaryKey: true })],
    });
    const result = runSingleRule(rule, [table]);
    const violations = result.violations.filter((v) => v.ruleId === "structure.timestamp_columns");
    expect(violations).toHaveLength(2);
  });
});

// ── naming.table_singular ─────────────────────────────────────────────────────

describe("naming.table_singular", () => {
  const rule = findRule("naming.table_singular");

  it("passes for a plural table name", () => {
    const result = runSingleRule(rule, [makeTable({ name: "user_accounts" })]);
    const violations = result.violations.filter((v) => v.ruleId === "naming.table_singular");
    expect(violations).toHaveLength(0);
  });

  it("fails for a table name that looks singular (ends with _info)", () => {
    const result = runSingleRule(rule, [makeTable({ name: "user_info" })]);
    const violations = result.violations.filter((v) => v.ruleId === "naming.table_singular");
    expect(violations.length).toBeGreaterThan(0);
  });

  it("passes for table name ending with _log", () => {
    const result = runSingleRule(rule, [makeTable({ name: "audit_log" })]);
    const violations = result.violations.filter((v) => v.ruleId === "naming.table_singular");
    expect(violations).toHaveLength(0);
  });

  it("does not flag field-level check", () => {
    const field = makeField();
    const result = rule.check(makeTable(), field, rule.defaultConfig);
    expect(result).toHaveLength(0);
  });
});

// ── naming.fk_convention ──────────────────────────────────────────────────────

describe("naming.fk_convention", () => {
  const rule = findRule("naming.fk_convention");

  it("passes for a well-named FK field (user_id)", () => {
    const table = makeTable({
      fields: [makeField({ name: "user_id" })],
    });
    const result = runSingleRule(rule, [table]);
    const violations = result.violations.filter((v) => v.ruleId === "naming.fk_convention");
    expect(violations).toHaveLength(0);
  });

  it("fails for a generic FK field name (parent_id)", () => {
    const table = makeTable({
      fields: [makeField({ name: "parent_id" })],
    });
    const result = runSingleRule(rule, [table]);
    const violations = result.violations.filter((v) => v.ruleId === "naming.fk_convention");
    expect(violations.length).toBeGreaterThan(0);
  });

  it("passes for a primary key field named id", () => {
    const table = makeTable({
      fields: [makeField({ name: "id", isPrimaryKey: true })],
    });
    const result = runSingleRule(rule, [table]);
    const violations = result.violations.filter((v) => v.ruleId === "naming.fk_convention");
    expect(violations).toHaveLength(0);
  });

  it("does not flag table-level check", () => {
    const result = rule.check(makeTable(), null, rule.defaultConfig);
    expect(result).toHaveLength(0);
  });
});

// ── structure.no_double_underscore ────────────────────────────────────────────

describe("structure.no_double_underscore", () => {
  const rule = findRule("structure.no_double_underscore");

  it("passes for a table name without double underscores", () => {
    const result = runSingleRule(rule, [makeTable({ name: "user_accounts" })]);
    const violations = result.violations.filter((v) => v.ruleId === "structure.no_double_underscore");
    expect(violations).toHaveLength(0);
  });

  it("fails for a table name with double underscores", () => {
    const result = runSingleRule(rule, [makeTable({ name: "user__accounts" })]);
    const violations = result.violations.filter((v) => v.ruleId === "structure.no_double_underscore");
    expect(violations.length).toBeGreaterThan(0);
  });

  it("passes for a field name without double underscores", () => {
    const table = makeTable({
      fields: [makeField({ name: "user_id" })],
    });
    const result = runSingleRule(rule, [table]);
    const violations = result.violations.filter((v) => v.ruleId === "structure.no_double_underscore");
    expect(violations).toHaveLength(0);
  });

  it("fails for a field name with double underscores", () => {
    const table = makeTable({
      fields: [makeField({ name: "user__id" })],
    });
    const result = runSingleRule(rule, [table]);
    const violations = result.violations.filter((v) => v.ruleId === "structure.no_double_underscore");
    expect(violations.length).toBeGreaterThan(0);
  });
});

// ── runRules — engine-level ───────────────────────────────────────────────────

describe("runRules engine", () => {
  it("respects disabled rule setting", () => {
    const settings = new Map([
      ["naming.snake_case", { ruleId: "naming.snake_case", severity: "error" as const, enabled: false, config: {} }],
    ]);
    const table = makeTable({ name: "BadNameHere" });
    const result = runRules([table], BUILT_IN_RULES, settings);
    const snakeViolations = result.violations.filter((v) => v.ruleId === "naming.snake_case");
    expect(snakeViolations).toHaveLength(0);
  });

  it("groups violations correctly by group", () => {
    const table = makeTable({
      name: "BadName",  // naming violation
      comment: null,    // semantic violation
      fields: [],       // structure violation (no PK)
    });
    const result = runRules([table], BUILT_IN_RULES, new Map());
    expect(result.byGroup.naming.length).toBeGreaterThan(0);
    expect(result.byGroup.semantic.length).toBeGreaterThan(0);
    expect(result.byGroup.structure.length).toBeGreaterThan(0);
  });

  it("summary.passed is false when there are errors", () => {
    // camelCase table name → naming.snake_case error
    const table = makeTable({ name: "BadTableName", fields: [] });
    const result = runRules([table], BUILT_IN_RULES, new Map());
    expect(result.summary.passed).toBe(false);
    expect(result.summary.errors).toBeGreaterThan(0);
  });

  it("summary.passed is true when only warnings/infos", () => {
    // A valid snake_case table that has all required things except timestamps (warning)
    // and has a comment < 4 chars (info)
    const table = makeTable({
      name: "user_accounts",
      comment: "ok hi there this is a comment",
      fields: [
        makeField({ name: "id", isPrimaryKey: true, comment: "Primary key" }),
        makeField({ name: "created_at", dataType: "datetime", position: 2, comment: "Creation timestamp" }),
        makeField({ name: "updated_at", dataType: "datetime", position: 3, comment: "Update timestamp" }),
      ],
    });
    const result = runRules([table], BUILT_IN_RULES, new Map());
    expect(result.summary.errors).toBe(0);
    expect(result.summary.passed).toBe(true);
  });

  it("returns empty violations for empty tables array", () => {
    const result = runRules([], BUILT_IN_RULES, new Map());
    expect(result.violations).toHaveLength(0);
  });

  it("BUILT_IN_RULES contains all expected rule IDs", () => {
    const ids = BUILT_IN_RULES.map((r) => r.id);
    expect(ids).toContain("naming.snake_case");
    expect(ids).toContain("naming.reserved_words");
    expect(ids).toContain("naming.max_length");
    expect(ids).toContain("naming.table_singular");
    expect(ids).toContain("naming.fk_convention");
    expect(ids).toContain("semantic.field_comment");
    expect(ids).toContain("semantic.table_comment");
    expect(ids).toContain("semantic.blob_needs_comment");
    expect(ids).toContain("structure.has_primary_key");
    expect(ids).toContain("structure.timestamp_columns");
    expect(ids).toContain("structure.no_double_underscore");
  });
});
