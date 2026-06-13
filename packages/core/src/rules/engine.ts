// ── Minimal context types (mirrors ParsedTable/ParsedField from ddl-parser) ──

export interface FieldContext {
  name: string;
  dataType: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isUnique: boolean;
  isAutoIncrement: boolean;
  defaultValue: string | null;
  comment: string | null;
  position: number;
}

export interface TableContext {
  name: string;
  comment: string | null;
  fields: FieldContext[];
}

// ── Rule types ───────────────────────────────────────────────────────────────

export type Severity = "error" | "warning" | "info";
export type RuleLayer = "transaction" | "r2u" | "unified" | "general";

export interface RuleConfig {
  [key: string]: unknown;
}

export interface RuleDefinition {
  id: string;
  group: "naming" | "semantic" | "structure" | "governance";
  defaultSeverity: Severity;
  description: string;
  defaultConfig: RuleConfig;
  layers?: RuleLayer[];
  check(
    table: TableContext,
    field: FieldContext | null,
    config: RuleConfig,
  ): RuleViolation[];
}

export interface RuleViolation {
  ruleId: string;
  severity: Severity;
  message: string;
  tableName: string;
  fieldName?: string;
}

export interface RuleSettings {
  ruleId: string;
  severity: Severity;
  enabled: boolean;
  config: RuleConfig;
}

export interface CheckResult {
  violations: RuleViolation[];
  byGroup: {
    naming: RuleViolation[];
    semantic: RuleViolation[];
    structure: RuleViolation[];
  };
  summary: {
    errors: number;
    warnings: number;
    infos: number;
    passed: boolean;
  };
}

// ── Engine runner ────────────────────────────────────────────────────────────

export function runRules(
  tables: TableContext[],
  rules: RuleDefinition[],
  settings: Map<string, RuleSettings>,
): CheckResult {
  const violations: RuleViolation[] = [];

  for (const table of tables) {
    for (const rule of rules) {
      const s = settings.get(rule.id);
      if (s && !s.enabled) continue;

      const cfg = s?.config ?? rule.defaultConfig;
      const severity = s?.severity ?? rule.defaultSeverity;

      const tableViolations = rule.check(table, null, cfg);
      for (const v of tableViolations) {
        violations.push({ ...v, severity });
      }

      for (const field of table.fields) {
        const fieldViolations = rule.check(table, field, cfg);
        for (const v of fieldViolations) {
          violations.push({ ...v, severity });
        }
      }
    }
  }

  const ruleMap = new Map(rules.map(r => [r.id, r]));

  const byGroup = {
    naming: violations.filter(v => ruleMap.get(v.ruleId)?.group === "naming"),
    semantic: violations.filter(v => ruleMap.get(v.ruleId)?.group === "semantic"),
    structure: violations.filter(v => ruleMap.get(v.ruleId)?.group === "structure"),
  };

  const summary = {
    errors: violations.filter(v => v.severity === "error").length,
    warnings: violations.filter(v => v.severity === "warning").length,
    infos: violations.filter(v => v.severity === "info").length,
    passed: violations.filter(v => v.severity === "error").length === 0,
  };

  return { violations, byGroup, summary };
}
