import { Router, type Request, type Response } from "express";
import { type Router as RouterType } from "express";
import { z } from "zod";
import fs from "fs/promises";
import { listRules, updateRule, getAllRules } from "../repositories/rules.js";
import {
  listSnapshots,
  saveSnapshot,
  restoreSnapshot,
  deleteSnapshot,
} from "../repositories/ruleSnapshots.js";
import { getAllSkills, loadSkills, getUserSkillFilePath } from "../services/skills.js";
import { validateSkillRule } from "@schema-studio/core";

// ── Skill rule serialization helpers ──────────────────────────────────────────

interface SerializableRule {
  id: string;
  group: string;
  severity: string;
  description: string;
  tablePattern?: string;
  requiredFields?: string[];
  forbiddenFields?: string[];
  fieldPattern?: string;
  forbiddenFieldPattern?: string;
}

function serializeRule(r: SerializableRule): string {
  const lines = [
    `- id: ${r.id}`,
    `  group: ${r.group}`,
    `  severity: ${r.severity}`,
    `  description: ${r.description}`,
  ];
  if (r.tablePattern) lines.push(`  tablePattern: ${r.tablePattern}`);
  if (r.requiredFields?.length) lines.push(`  requiredFields: [${r.requiredFields.join(", ")}]`);
  if (r.forbiddenFields?.length) lines.push(`  forbiddenFields: [${r.forbiddenFields.join(", ")}]`);
  if (r.fieldPattern) lines.push(`  fieldPattern: ${r.fieldPattern}`);
  if (r.forbiddenFieldPattern) lines.push(`  forbiddenFieldPattern: ${r.forbiddenFieldPattern}`);
  return lines.join("\n");
}

function parseEntryId(entry: string): string | null {
  return entry.match(/^- id:\s*(.+)/m)?.[1]?.trim() ?? null;
}

// Read skill file, modify its rules block, write back, reload skills
async function mutateSkillRules(filePath: string, fn: (entries: string[]) => string[]): Promise<void> {
  const text = await fs.readFile(filePath, "utf-8");
  const blockMatch = text.match(/(```rules\n)([\s\S]*?)(```)/);
  if (!blockMatch) throw new Error("No rules block found in skill file");
  const rawBlock = blockMatch[2]!;
  // Split into individual rule entries (each starts with "- id:")
  const entries = rawBlock.split(/(?=^- id:)/m).map(e => e.trim()).filter(Boolean);
  const updated = fn(entries);
  const newBlock = blockMatch[1] + (updated.length ? updated.join("\n\n") + "\n" : "") + blockMatch[3];
  const newText = text.replace(blockMatch[0], newBlock);
  await fs.writeFile(filePath, newText, "utf-8");
  await loadSkills();
}

const router: RouterType = Router();

// Static registry of governance rule IDs — kept in sync with governance-rules.ts
const GOVERNANCE_RULE_DEFS: Array<{ id: string; group: string; severity: string; description: string }> = [
  { id: "gov.single_source_of_truth", group: "governance", severity: "error",   description: "每個有 conceptId 的欄位必須有對應 SSOT 宣告且來源表符合" },
  { id: "gov.lineage_complete",        group: "governance", severity: "error",   description: "所有欄位必須有完整的 lineage（source.tableName + source.fieldName）" },
  { id: "gov.block_hierarchy",         group: "governance", severity: "error",   description: "Medium block 不可引用其他 medium block" },
  { id: "gov.join_key_validity",       group: "governance", severity: "warning", description: "JOIN 鍵兩端至少一端為 PK/UNIQUE，避免笛卡兒積" },
  { id: "gov.naming_dict_coverage",    group: "governance", severity: "warning", description: "欄位命名字典覆蓋率 ≥ 80%" },
  { id: "gov.definition_required",     group: "governance", severity: "error",   description: "每個欄位需有業務定義（至少 10 字）" },
  { id: "gov.no_duplicate_semantics",  group: "governance", severity: "warning", description: "不可有相同概念 + 來源的重複欄位" },
  { id: "gov.owner_required",          group: "governance", severity: "warning", description: "寬表必須指定 Data Owner（ownerUserId）" },
  { id: "gov.sensitivity_declared",    group: "governance", severity: "info",    description: "PII 特徵欄位必須宣告 sensitivity" },
  { id: "gov.no_deprecated_source",    group: "governance", severity: "error",   description: "不可引用已 deprecated 的來源表" },
  { id: "gov.freshness_declared",      group: "governance", severity: "info",    description: "來源表需宣告 refreshCycle，資料新鮮度覆蓋率 ≥ 50%" },
];

// GET /api/v1/rules/definitions — flat list of all rule IDs + metadata for linking UI
router.get("/definitions", (_req: Request, res: Response) => {
  const allRuleDefns = getAllRules();
  const studioRules = allRuleDefns.map(r => ({
    id: r.id,
    group: r.group,
    severity: r.defaultSeverity,
    description: r.description,
  }));
  res.json({ studioRules, governanceRules: GOVERNANCE_RULE_DEFS });
});

// GET /api/v1/rules — list all rules (built-in + skill) with current settings
router.get("/", async (_req: Request, res: Response) => {
  const rules = await listRules();
  const allRuleDefns = getAllRules();
  res.json({
    rules: rules.map(r => {
      const ruleDefn = allRuleDefns.find(x => x.id === r.ruleId);
      return {
        id: r.ruleId,
        group: r.group,
        description: r.description,
        defaultSeverity: ruleDefn?.defaultSeverity ?? r.severity,
        defaultConfig: ruleDefn?.defaultConfig ?? {},
        severity: r.severity,
        enabled: r.enabled,
        config: r.config,
        source: r.source,
        layers: ruleDefn?.layers ?? ["general"],
      };
    }),
  });
});

// GET /api/v1/rules/snapshots
router.get("/snapshots", async (_req: Request, res: Response) => {
  const snapshots = await listSnapshots();
  res.json({ snapshots });
});

const SaveSnapshotBody = z.object({
  name: z.string().min(1),
});

// POST /api/v1/rules/snapshots
router.post("/snapshots", async (req: Request, res: Response) => {
  const parsed = SaveSnapshotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", detail: parsed.error.format() } });
    return;
  }
  const snapshot = await saveSnapshot(parsed.data.name);
  res.status(201).json({ snapshot });
});

// POST /api/v1/rules/snapshots/:id/restore
router.post("/snapshots/:id/restore", async (req: Request, res: Response) => {
  const id = (req.params as Record<string, string>)["id"]!;
  try {
    await restoreSnapshot(id);
  } catch {
    res.status(404).json({ error: { code: "NOT_FOUND", message: `Snapshot ${id} not found` } });
    return;
  }
  const rules = await listRules();
  const allRuleDefns = getAllRules();
  res.json({
    rules: rules.map(r => {
      const ruleDefn = allRuleDefns.find(x => x.id === r.ruleId);
      return {
        id: r.ruleId,
        group: r.group,
        description: r.description,
        defaultSeverity: ruleDefn?.defaultSeverity ?? r.severity,
        defaultConfig: ruleDefn?.defaultConfig ?? {},
        severity: r.severity,
        enabled: r.enabled,
        config: r.config,
        source: r.source,
        layers: ruleDefn?.layers ?? ["general"],
      };
    }),
  });
});

// DELETE /api/v1/rules/snapshots/:id
router.delete("/snapshots/:id", async (req: Request, res: Response) => {
  const id = (req.params as Record<string, string>)["id"]!;
  await deleteSnapshot(id);
  res.status(204).send();
});

// ── Skill rule Zod schemas ────────────────────────────────────────────────────

const SkillRuleDefSchema = z.object({
  id: z.string().min(1),
  group: z.enum(["naming", "semantic", "structure"]),
  severity: z.enum(["error", "warning", "info"]),
  description: z.string().min(1),
  tablePattern: z.string().optional(),
  requiredFields: z.array(z.string()).optional(),
  forbiddenFields: z.array(z.string()).optional(),
  fieldPattern: z.string().optional(),
  forbiddenFieldPattern: z.string().optional(),
});

const CreateSkillRuleBody = z.object({
  skillName: z.string().min(1),
  rule: SkillRuleDefSchema,
});

const UpdateSkillRuleBody = SkillRuleDefSchema.partial().omit({ id: true });

// POST /api/v1/rules/skill-rule — add a new rule to a user skill
router.post("/skill-rule", async (req: Request, res: Response) => {
  const parsed = CreateSkillRuleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", detail: parsed.error.format() } });
    return;
  }
  const { skillName, rule } = parsed.data;

  const validation = validateSkillRule(rule);
  if (!validation.valid) {
    res.status(422).json({ error: { code: "RULE_INVALID", message: "Rule failed validation", errors: validation.errors } });
    return;
  }

  const filePath = getUserSkillFilePath(skillName);
  if (!filePath) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: `User skill "${skillName}" not found` } });
    return;
  }

  let conflict = false;
  try {
    await mutateSkillRules(filePath, entries => {
      const existing = entries.find(e => parseEntryId(e) === rule.id);
      if (existing) { conflict = true; return entries; }
      return [...entries, serializeRule(rule)];
    });
  } catch (e) {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: String(e) } });
    return;
  }

  if (conflict) {
    res.status(409).json({ error: { code: "CONFLICT", message: `Rule "${rule.id}" already exists in skill "${skillName}"` } });
    return;
  }

  const rules = await listRules();
  res.status(201).json({ ok: true, rules });
});

// PUT /api/v1/rules/skill-rule/:ruleId — update a skill rule's definition
router.put("/skill-rule/:ruleId", async (req: Request, res: Response) => {
  const ruleId = (req.params as Record<string, string>)["ruleId"]!;
  const parsed = UpdateSkillRuleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", detail: parsed.error.format() } });
    return;
  }
  const updates = parsed.data;

  // Validate the merged rule (pass ruleId as id since it can't change)
  const validation = validateSkillRule({ id: ruleId, ...updates });
  if (!validation.valid) {
    res.status(422).json({ error: { code: "RULE_INVALID", message: "Rule failed validation", errors: validation.errors } });
    return;
  }

  // Find which user skill owns this ruleId
  const skill = getAllSkills().find(s => s.source === "user" && s.rules.some(r => r.id === ruleId));
  if (!skill) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: `Skill-defined rule "${ruleId}" not found` } });
    return;
  }

  try {
    await mutateSkillRules(skill.filePath, entries =>
      entries.map(entry => {
        if (parseEntryId(entry) !== ruleId) return entry;
        // Parse existing entry fields to merge
        const get = (key: string) => {
          const m = entry.match(new RegExp(`\\b${key}:\\s*(.+)`));
          return m?.[1]?.trim().replace(/^["']|["']$/g, "") ?? undefined;
        };
        const getList = (key: string): string[] | undefined => {
          const m = entry.match(new RegExp(`\\b${key}:\\s*\\[([^\\]]+)\\]`));
          if (!m) return undefined;
          return m[1]!.split(",").map((s: string) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
        };
        const existing: SerializableRule = {
          id: ruleId,
          group: (get("group") ?? "semantic") as SerializableRule["group"],
          severity: (get("severity") ?? "warning") as SerializableRule["severity"],
          description: get("description") ?? ruleId,
          tablePattern: get("tablePattern"),
          fieldPattern: get("fieldPattern"),
          forbiddenFieldPattern: get("forbiddenFieldPattern"),
          requiredFields: getList("requiredFields"),
          forbiddenFields: getList("forbiddenFields"),
        };
        const merged: SerializableRule = {
          ...existing,
          ...updates,
        };
        return serializeRule(merged);
      })
    );
  } catch (e) {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: String(e) } });
    return;
  }

  const rules = await listRules();
  const updated = rules.find(r => r.ruleId === ruleId);
  res.json({ ok: true, rule: updated ?? null });
});

// DELETE /api/v1/rules/skill-rule/:ruleId — remove a skill rule from its file
router.delete("/skill-rule/:ruleId", async (req: Request, res: Response) => {
  const ruleId = (req.params as Record<string, string>)["ruleId"]!;

  // Find which user skill owns this ruleId
  const skill = getAllSkills().find(s => s.source === "user" && s.rules.some(r => r.id === ruleId));
  if (!skill) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: `Skill-defined rule "${ruleId}" not found` } });
    return;
  }

  try {
    await mutateSkillRules(skill.filePath, entries =>
      entries.filter(e => parseEntryId(e) !== ruleId)
    );
  } catch (e) {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: String(e) } });
    return;
  }

  res.status(204).send();
});

const PatchBody = z.object({
  severity: z.enum(["error", "warning", "info"]).optional(),
  enabled: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
});

// PATCH /api/v1/rules/:ruleId
router.patch("/:ruleId", async (req: Request, res: Response) => {
  const ruleId = (req.params as Record<string, string>)["ruleId"]!;
  const parsed = PatchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", detail: parsed.error.format() } });
    return;
  }

  const allRules = getAllRules();
  if (!allRules.find(r => r.id === ruleId)) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: `Rule ${ruleId} not found` } });
    return;
  }

  const updated = await updateRule(ruleId, parsed.data);
  res.json({ rule: updated });
});

export default router;
