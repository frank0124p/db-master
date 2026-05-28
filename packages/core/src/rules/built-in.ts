import type { RuleDefinition, TableContext, FieldContext, RuleConfig } from "./engine.js";

// ── naming.snake_case ────────────────────────────────────────────────────────

const snakeCaseRule: RuleDefinition = {
  id: "naming.snake_case",
  group: "naming",
  defaultSeverity: "error",
  description: "Table and field names must be snake_case",
  defaultConfig: {},
  check(table: TableContext, field: FieldContext | null) {
    const snakeRe = /^[a-z][a-z0-9_]*$/;
    if (field === null) {
      if (!snakeRe.test(table.name)) {
        return [{ ruleId: "naming.snake_case", severity: "error" as const, message: `Table name "${table.name}" is not snake_case`, tableName: table.name }];
      }
      return [];
    }
    if (!snakeRe.test(field.name)) {
      return [{ ruleId: "naming.snake_case", severity: "error" as const, message: `Field "${field.name}" in "${table.name}" is not snake_case`, tableName: table.name, fieldName: field.name }];
    }
    return [];
  },
};

// ── naming.reserved_words ────────────────────────────────────────────────────

const RESERVED = new Set([
  "select", "insert", "update", "delete", "from", "where", "join", "table",
  "index", "key", "column", "order", "group", "by", "having", "limit",
  "offset", "union", "all", "distinct", "case", "when", "then", "else", "end",
  "null", "true", "false", "and", "or", "not", "in", "is", "as", "on",
]);

const reservedWordRule: RuleDefinition = {
  id: "naming.reserved_words",
  group: "naming",
  defaultSeverity: "error",
  description: "Names must not be SQL reserved words",
  defaultConfig: {},
  check(table: TableContext, field: FieldContext | null) {
    if (field === null) {
      if (RESERVED.has(table.name.toLowerCase())) {
        return [{ ruleId: "naming.reserved_words", severity: "error" as const, message: `Table name "${table.name}" is a SQL reserved word`, tableName: table.name }];
      }
      return [];
    }
    if (RESERVED.has(field.name.toLowerCase())) {
      return [{ ruleId: "naming.reserved_words", severity: "error" as const, message: `Field "${field.name}" in "${table.name}" is a SQL reserved word`, tableName: table.name, fieldName: field.name }];
    }
    return [];
  },
};

// ── naming.max_length ────────────────────────────────────────────────────────

const maxLengthRule: RuleDefinition = {
  id: "naming.max_length",
  group: "naming",
  defaultSeverity: "warning",
  description: "Names should not exceed the configured max length",
  defaultConfig: { maxTableLen: 64, maxFieldLen: 64 },
  check(table: TableContext, field: FieldContext | null, config: RuleConfig) {
    const maxTable = (config["maxTableLen"] as number | undefined) ?? 64;
    const maxField = (config["maxFieldLen"] as number | undefined) ?? 64;
    if (field === null) {
      if (table.name.length > maxTable) {
        return [{ ruleId: "naming.max_length", severity: "warning" as const, message: `Table name "${table.name}" exceeds ${maxTable} characters`, tableName: table.name }];
      }
      return [];
    }
    if (field.name.length > maxField) {
      return [{ ruleId: "naming.max_length", severity: "warning" as const, message: `Field "${field.name}" exceeds ${maxField} characters`, tableName: table.name, fieldName: field.name }];
    }
    return [];
  },
};

// ── semantic.field_comment ────────────────────────────────────────────────────

const fieldCommentRule: RuleDefinition = {
  id: "semantic.field_comment",
  group: "semantic",
  defaultSeverity: "warning",
  description: "Fields should have comments for semantic layer readability",
  defaultConfig: { minLength: 2 },
  layers: ["r2u", "unified"],
  check(table: TableContext, field: FieldContext | null, config: RuleConfig) {
    if (field === null) return [];
    const minLen = (config["minLength"] as number | undefined) ?? 2;
    if (!field.comment || field.comment.trim().length < minLen) {
      return [{ ruleId: "semantic.field_comment", severity: "warning" as const, message: `Field "${field.name}" in "${table.name}" lacks a meaningful comment (min ${minLen} chars)`, tableName: table.name, fieldName: field.name }];
    }
    return [];
  },
};

// ── semantic.table_comment ────────────────────────────────────────────────────

const tableCommentRule: RuleDefinition = {
  id: "semantic.table_comment",
  group: "semantic",
  defaultSeverity: "info",
  description: "Tables should have comments describing their purpose",
  defaultConfig: {},
  layers: ["r2u", "unified"],
  check(table: TableContext, field: FieldContext | null) {
    if (field !== null) return [];
    if (!table.comment || table.comment.trim().length < 4) {
      return [{ ruleId: "semantic.table_comment", severity: "info" as const, message: `Table "${table.name}" has no comment — semantic layer may not understand its purpose`, tableName: table.name }];
    }
    return [];
  },
};

// ── semantic.blob_needs_comment ───────────────────────────────────────────────

const blobCommentRule: RuleDefinition = {
  id: "semantic.blob_needs_comment",
  group: "semantic",
  defaultSeverity: "warning",
  description: "BLOB/TEXT/JSON fields must have comments so semantic layer can interpret them",
  defaultConfig: {},
  layers: ["r2u", "unified"],
  check(table: TableContext, field: FieldContext | null) {
    if (field === null) return [];
    const blobTypes = ["blob", "tinyblob", "mediumblob", "longblob", "text",
      "tinytext", "mediumtext", "longtext", "json"];
    if (blobTypes.includes(field.dataType.toLowerCase().split("(")[0]!)) {
      if (!field.comment || field.comment.trim().length < 4) {
        return [{ ruleId: "semantic.blob_needs_comment", severity: "warning" as const, message: `Field "${field.name}" (${field.dataType}) in "${table.name}" is a large/opaque type without a comment`, tableName: table.name, fieldName: field.name }];
      }
    }
    return [];
  },
};

// ── structure.has_primary_key ─────────────────────────────────────────────────

const hasPKRule: RuleDefinition = {
  id: "structure.has_primary_key",
  group: "structure",
  defaultSeverity: "error",
  description: "Every table must have a primary key",
  defaultConfig: {},
  check(table: TableContext, field: FieldContext | null) {
    if (field !== null) return [];
    const hasPK = table.fields.some(f => f.isPrimaryKey);
    if (!hasPK) {
      return [{ ruleId: "structure.has_primary_key", severity: "error" as const, message: `Table "${table.name}" has no primary key`, tableName: table.name }];
    }
    return [];
  },
};

// ── structure.timestamp_columns ───────────────────────────────────────────────

const timestampRule: RuleDefinition = {
  id: "structure.timestamp_columns",
  group: "structure",
  defaultSeverity: "warning",
  description: "Tables should have created_at and updated_at columns",
  defaultConfig: {},
  layers: ["transaction"],
  check(table: TableContext, field: FieldContext | null) {
    if (field !== null) return [];
    const names = new Set(table.fields.map(f => f.name.toLowerCase()));
    const violations = [];
    if (!names.has("created_at")) {
      violations.push({ ruleId: "structure.timestamp_columns", severity: "warning" as const, message: `Table "${table.name}" is missing created_at column`, tableName: table.name });
    }
    if (!names.has("updated_at")) {
      violations.push({ ruleId: "structure.timestamp_columns", severity: "warning" as const, message: `Table "${table.name}" is missing updated_at column`, tableName: table.name });
    }
    return violations;
  },
};

// ── naming.table_singular ─────────────────────────────────────────────────────

const singularSuffixes = ["_info", "_data", "_detail", "_record", "_entry", "_item"];
const tableSingularRule: RuleDefinition = {
  id: "naming.table_singular",
  group: "naming",
  defaultSeverity: "warning",
  description: "Table names should be plural (snake_case)",
  defaultConfig: {},
  check(table: TableContext, field: FieldContext | null) {
    if (field !== null) return [];
    const n = table.name.toLowerCase();
    const likelySingular =
      singularSuffixes.some(s => n.endsWith(s)) ||
      (!n.endsWith("s") && !n.endsWith("_log") && !n.endsWith("_config") &&
       !n.endsWith("_status") && !n.endsWith("_history") && !n.endsWith("_schema") &&
       !n.endsWith("_data") && !n.endsWith("_index") && !n.includes("_"));
    if (likelySingular) {
      return [{ ruleId: "naming.table_singular", severity: "warning" as const, message: `Table "${table.name}" may be singular — prefer plural table names`, tableName: table.name }];
    }
    return [];
  },
};

// ── naming.fk_convention ──────────────────────────────────────────────────────

const fkConventionRule: RuleDefinition = {
  id: "naming.fk_convention",
  group: "naming",
  defaultSeverity: "warning",
  description: "FK fields should follow the {table}_id naming convention",
  defaultConfig: {},
  check(table: TableContext, field: FieldContext | null) {
    if (field === null) return [];
    if (!field.name.endsWith("_id") || field.isPrimaryKey || field.name === "id") return [];
    const stem = field.name.slice(0, -3); // strip "_id"
    // Warn if stem is ambiguous (generic names like "ref", "parent", "child", "target", "source")
    const ambiguous = ["ref", "parent", "child", "target", "source", "related", "linked"];
    if (ambiguous.includes(stem)) {
      return [{ ruleId: "naming.fk_convention", severity: "warning" as const, message: `FK field "${field.name}" in "${table.name}" uses a generic name — prefer "{referenced_table}_id"`, tableName: table.name, fieldName: field.name }];
    }
    return [];
  },
};

// ── structure.no_double_underscore ────────────────────────────────────────────

const doubleUnderscoreRule: RuleDefinition = {
  id: "structure.no_double_underscore",
  group: "structure",
  defaultSeverity: "warning",
  description: "Names must not contain consecutive underscores",
  defaultConfig: {},
  check(table: TableContext, field: FieldContext | null) {
    if (field === null) {
      if (table.name.includes("__")) {
        return [{ ruleId: "structure.no_double_underscore", severity: "warning" as const, message: `Table name "${table.name}" contains consecutive underscores`, tableName: table.name }];
      }
      return [];
    }
    if (field.name.includes("__")) {
      return [{ ruleId: "structure.no_double_underscore", severity: "warning" as const, message: `Field "${field.name}" in "${table.name}" contains consecutive underscores`, tableName: table.name, fieldName: field.name }];
    }
    return [];
  },
};

// ── Export ────────────────────────────────────────────────────────────────────

export const BUILT_IN_RULES: RuleDefinition[] = [
  snakeCaseRule,
  reservedWordRule,
  maxLengthRule,
  tableSingularRule,
  fkConventionRule,
  fieldCommentRule,
  tableCommentRule,
  blobCommentRule,
  hasPKRule,
  timestampRule,
  doubleUnderscoreRule,
];
