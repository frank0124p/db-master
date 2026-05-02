import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import type { RuleDefinition, TableContext, FieldContext } from "@schema-studio/core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILTIN_SKILLS_DIR = path.resolve(__dirname, "../../../../skills");
// User-defined skills: drop .md files in data/skills/ to extend the rule engine
const USER_SKILLS_DIR = path.resolve(__dirname, "../../../../data/skills");

interface SkillMeta {
  name: string;
  domain: "general" | "semiconductor" | string;
  tags: string[];
}

// ── Skill rule definition (parsed from SKILL.md ## Rules block) ────────────────

interface SkillRuleDef {
  id: string;
  group: "naming" | "semantic" | "structure";
  severity: "error" | "warning" | "info";
  description: string;
  tablePattern?: string;        // regex: only check tables matching this
  requiredFields?: string[];    // table-level: these fields must exist
  forbiddenFields?: string[];   // table-level: these field names must NOT exist
  fieldPattern?: string;        // field-level: flag any field matching this regex
  forbiddenFieldPattern?: string; // field-level: flag matching field names
}

interface Skill {
  meta: SkillMeta;
  content: string;             // body without the ## Rules section
  rules: SkillRuleDef[];
}

let cache = new Map<string, Skill>();

function parseFrontmatter(text: string): { meta: SkillMeta; body: string } {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: { name: "unknown", domain: "general", tags: [] }, body: text };

  const meta: Partial<SkillMeta> = { tags: [] };
  for (const line of match[1]!.split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const val = line.slice(colon + 1).trim();
    if (key === "name") meta.name = val;
    else if (key === "domain") meta.domain = val as SkillMeta["domain"];
    else if (key === "tags") meta.tags = val.replace(/[\[\]]/g, "").split(",").map(s => s.trim()).filter(Boolean);
  }

  return {
    meta: { name: meta.name ?? "unknown", domain: meta.domain ?? "general", tags: meta.tags ?? [] },
    body: match[2]!.trim(),
  };
}

// Parse a ```rules YAML-ish block from the skill body.
// Each rule entry is separated by a blank line; fields are "key: value" pairs.
function parseRulesBlock(body: string): { rules: SkillRuleDef[]; content: string } {
  const rulesMatch = body.match(/```rules\n([\s\S]*?)```/);
  if (!rulesMatch) return { rules: [], content: body };

  const block = rulesMatch[1]!;
  const content = body.replace(rulesMatch[0], "").trim();
  const rules: SkillRuleDef[] = [];

  // Split on lines starting with "- id:" to get individual rule entries
  const entries = block.split(/(?=^- id:)/m).filter(s => s.trim());

  for (const entry of entries) {
    const get = (key: string) => {
      const m = entry.match(new RegExp(`\\b${key}:\\s*(.+)`));
      return m?.[1]?.trim().replace(/^["']|["']$/g, "") ?? null;
    };
    const getList = (key: string): string[] => {
      const m = entry.match(new RegExp(`\\b${key}:\\s*\\[([^\\]]+)\\]`));
      if (!m) return [];
      return m[1]!.split(",").map(s => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    };

    const id = get("id");
    if (!id) continue;

    const group = (get("group") ?? "semantic") as SkillRuleDef["group"];
    const severity = (get("severity") ?? "warning") as SkillRuleDef["severity"];
    const description = get("description") ?? id;
    const tablePattern = get("tablePattern") ?? undefined;
    const fieldPattern = get("fieldPattern") ?? undefined;
    const forbiddenFieldPattern = get("forbiddenFieldPattern") ?? undefined;
    const requiredFields = getList("requiredFields");
    const forbiddenFields = getList("forbiddenFields");

    rules.push({
      id, group, severity, description,
      ...(tablePattern && { tablePattern }),
      ...(fieldPattern && { fieldPattern }),
      ...(forbiddenFieldPattern && { forbiddenFieldPattern }),
      ...(requiredFields.length && { requiredFields }),
      ...(forbiddenFields.length && { forbiddenFields }),
    });
  }

  return { rules, content };
}

// Convert a SkillRuleDef into a full RuleDefinition the engine can run.
function buildRuleDefinition(def: SkillRuleDef): RuleDefinition {
  return {
    id: def.id,
    group: def.group,
    defaultSeverity: def.severity,
    description: def.description,
    defaultConfig: {},
    check(table: TableContext, field: FieldContext | null): ReturnType<RuleDefinition["check"]> {
      const tableRe = def.tablePattern ? new RegExp(def.tablePattern, "i") : null;
      if (tableRe && !tableRe.test(table.name)) return [];

      if (field === null) {
        // Table-level checks
        const violations: ReturnType<RuleDefinition["check"]> = [];

        if (def.requiredFields) {
          const fieldNames = new Set(table.fields.map(f => f.name));
          for (const req of def.requiredFields) {
            if (!fieldNames.has(req)) {
              violations.push({ ruleId: def.id, severity: def.severity, message: `表 "${table.name}" 缺少必要欄位 "${req}"（${def.description}）`, tableName: table.name });
            }
          }
        }

        if (def.forbiddenFields) {
          const fieldNames = new Set(table.fields.map(f => f.name));
          for (const forbidden of def.forbiddenFields) {
            if (fieldNames.has(forbidden)) {
              violations.push({ ruleId: def.id, severity: def.severity, message: `表 "${table.name}" 包含禁用欄位 "${forbidden}"（${def.description}）`, tableName: table.name });
            }
          }
        }

        return violations;
      }

      // Field-level checks
      if (def.fieldPattern) {
        const re = new RegExp(def.fieldPattern, "i");
        if (re.test(field.name)) {
          return [{ ruleId: def.id, severity: def.severity, message: `欄位 "${field.name}" 符合禁用模式 "${def.fieldPattern}"（${def.description}）`, tableName: table.name, fieldName: field.name }];
        }
      }

      if (def.forbiddenFieldPattern) {
        const re = new RegExp(def.forbiddenFieldPattern, "i");
        if (re.test(field.name)) {
          return [{ ruleId: def.id, severity: def.severity, message: `欄位 "${field.name}" 違反命名規則（${def.description}）`, tableName: table.name, fieldName: field.name }];
        }
      }

      return [];
    },
  };
}

async function loadFromDir(dir: string, flatMd = false): Promise<void> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      let skillFile: string;
      if (flatMd && entry.isFile() && entry.name.endsWith(".md")) {
        skillFile = path.join(dir, entry.name);
      } else if (!flatMd && entry.isDirectory()) {
        skillFile = path.join(dir, entry.name, "SKILL.md");
      } else {
        continue;
      }
      try {
        const text = await fs.readFile(skillFile, "utf-8");
        const { meta, body } = parseFrontmatter(text);
        const { rules, content } = parseRulesBlock(body);
        const key = `${meta.name}:${skillFile}`;
        cache.set(key, { meta, content, rules });
        const ruleTag = rules.length ? ` + ${rules.length} rules` : "";
        console.warn(`[skills] loaded: ${meta.name} (${meta.domain}${ruleTag})`);
      } catch {
        // file missing or parse error — skip
      }
    }
  } catch {
    // directory doesn't exist — skip silently
  }
}

export async function loadSkills(): Promise<void> {
  cache = new Map();
  await loadFromDir(BUILTIN_SKILLS_DIR, false);   // skills/*/SKILL.md
  await loadFromDir(USER_SKILLS_DIR, true);        // data/skills/*.md
}

export function getSkillsForDomain(domain: string): Skill[] {
  const all = [...cache.values()];
  if (domain === "semiconductor") return all;
  return all.filter(s => s.meta.domain === "general");
}

export function formatSkillsForPrompt(skills: Skill[]): string {
  if (skills.length === 0) return "(no domain skills loaded)";
  return skills.map(s => `<skill name="${s.meta.name}">\n${s.content}\n</skill>`).join("\n\n");
}

export function getAllSkills(): Skill[] {
  return [...cache.values()];
}

// Returns all skill-defined rules as RuleDefinition objects (usable by the engine).
export function getSkillRules(): RuleDefinition[] {
  return [...cache.values()].flatMap(s => s.rules.map(buildRuleDefinition));
}
