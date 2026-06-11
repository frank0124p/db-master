import * as store from "../db/fileStore.js";
import { BUILT_IN_RULES } from "@schema-studio/core";
import type { Severity, RuleSettings, RuleConfig, RuleDefinition } from "@schema-studio/core";
import { getSkillRules } from "../services/skills.js";

type RuleOverrides = Record<string, {
  severity?: Severity;
  enabled?: boolean;
  config?: RuleConfig;
}>;

const overridesFile = () => store.dataPath("rules", "overrides.json");

// All active rules: built-ins + skill-defined rules.
export function getAllRules(): RuleDefinition[] {
  return [...BUILT_IN_RULES, ...getSkillRules()];
}

export async function listRules(): Promise<(RuleSettings & { description: string; group: string; source: "built-in" | "skill" })[]> {
  const overrides = (await store.readJson<RuleOverrides>(overridesFile())) ?? {};
  const skillRuleIds = new Set(getSkillRules().map(r => r.id));

  return getAllRules()
    .map(rule => {
      const o = overrides[rule.id] ?? {};
      return {
        ruleId: rule.id,
        severity: o.severity ?? rule.defaultSeverity,
        enabled: o.enabled ?? true,
        config: o.config ?? rule.defaultConfig,
        description: rule.description,
        group: rule.group,
        source: skillRuleIds.has(rule.id) ? "skill" as const : "built-in" as const,
      };
    })
    .sort((a, b) => a.ruleId.localeCompare(b.ruleId));
}

export async function updateRule(
  ruleId: string,
  patch: { severity?: Severity; enabled?: boolean; config?: RuleConfig },
): Promise<RuleSettings | null> {
  const overrides = (await store.readJson<RuleOverrides>(overridesFile())) ?? {};
  const o = overrides[ruleId] ?? {};
  if (patch.severity !== undefined) o.severity = patch.severity;
  if (patch.enabled !== undefined) o.enabled = patch.enabled;
  if (patch.config !== undefined) o.config = patch.config;
  overrides[ruleId] = o;
  await store.writeJson(overridesFile(), overrides);
  const rules = await listRules();
  return rules.find(r => r.ruleId === ruleId) ?? null;
}

export async function getRuleSettingsMap(): Promise<Map<string, RuleSettings>> {
  const rules = await listRules();
  return new Map(rules.map(r => [r.ruleId, r]));
}

export async function getRuleOverrides(): Promise<RuleOverrides> {
  return (await store.readJson<RuleOverrides>(overridesFile())) ?? {};
}
