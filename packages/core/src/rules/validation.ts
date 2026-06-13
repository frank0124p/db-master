// Pure validation for skill rule definitions — no side effects, no I/O.
// Called by the API before writing and by tests.

export interface SkillRuleInput {
  id?: string;
  group?: string;
  severity?: string;
  description?: string;
  tablePattern?: string;
  requiredFields?: string[] | undefined;
  forbiddenFields?: string[] | undefined;
  fieldPattern?: string;
  forbiddenFieldPattern?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const VALID_GROUPS = new Set(["naming", "semantic", "structure", "governance"]);
const VALID_SEVERITIES = new Set(["error", "warning", "info"]);
const ID_PATTERN = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)+$/;

function tryRegex(pattern: string): string | null {
  try {
    new RegExp(pattern);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

export function validateSkillRule(rule: SkillRuleInput): ValidationResult {
  const errors: string[] = [];

  // id
  if (!rule.id || !rule.id.trim()) {
    errors.push("id: required");
  } else if (!ID_PATTERN.test(rule.id.trim())) {
    errors.push(`id: must be dot-separated identifiers like "custom.my-rule" (got "${rule.id}")`);
  }

  // group
  if (!rule.group) {
    errors.push("group: required");
  } else if (!VALID_GROUPS.has(rule.group)) {
    errors.push(`group: must be one of naming|semantic|structure (got "${rule.group}")`);
  }

  // severity
  if (!rule.severity) {
    errors.push("severity: required");
  } else if (!VALID_SEVERITIES.has(rule.severity)) {
    errors.push(`severity: must be one of error|warning|info (got "${rule.severity}")`);
  }

  // description
  if (!rule.description || !rule.description.trim()) {
    errors.push("description: required");
  }

  // regex patterns
  if (rule.tablePattern) {
    const err = tryRegex(rule.tablePattern);
    if (err) errors.push(`tablePattern: invalid regex — ${err}`);
  }
  if (rule.fieldPattern) {
    const err = tryRegex(rule.fieldPattern);
    if (err) errors.push(`fieldPattern: invalid regex — ${err}`);
  }
  if (rule.forbiddenFieldPattern) {
    const err = tryRegex(rule.forbiddenFieldPattern);
    if (err) errors.push(`forbiddenFieldPattern: invalid regex — ${err}`);
  }

  // At least one check condition must be present (otherwise the rule is a no-op)
  const hasCheck =
    (rule.requiredFields?.length ?? 0) > 0 ||
    (rule.forbiddenFields?.length ?? 0) > 0 ||
    !!rule.fieldPattern ||
    !!rule.forbiddenFieldPattern;

  if (!hasCheck && errors.length === 0) {
    errors.push(
      "rule has no check conditions — add at least one of: requiredFields, forbiddenFields, fieldPattern, forbiddenFieldPattern"
    );
  }

  return { valid: errors.length === 0, errors };
}
