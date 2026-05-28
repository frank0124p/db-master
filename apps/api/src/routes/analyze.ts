import { Router, type Router as ExpressRouter } from "express";
import { getSchemaById } from "../repositories/schemas.js";
import { listNamingEntries } from "../repositories/naming.js";
import { getRuleSettingsMap } from "../repositories/rules.js";
import { checkFieldName, BUILT_IN_RULES, runRules } from "@schema-studio/core";
import { analyzeSchemaStream, type AnalyzeIssue } from "../services/llm.js";
import { getSkillsForDomain, formatSkillsForPrompt, getSkillRules } from "../services/skills.js";
import { resolveSchemaRuleIds } from "./schemaRules.js";

const router: ExpressRouter = Router({ mergeParams: true });

router.post("/", async (req, res, next) => {
  try {
    const schemaId = Number((req.params as Record<string, string>)["schemaId"]);
    const { tableId } = (req.body ?? {}) as { tableId?: number };
    const schema = await getSchemaById(schemaId);
    const entries = await listNamingEntries(schema.domain);
    const settingsMap = await getRuleSettingsMap();

    const tables = tableId != null
      ? schema.tables.filter(t => t.id === tableId)
      : schema.tables;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    // Run all rules: built-in + skill-defined, filtered by schema's selected rule IDs
    const allRules = [...BUILT_IN_RULES, ...getSkillRules()];
    const selectedIds = resolveSchemaRuleIds(schema, allRules);
    const activeRules = allRules.filter(r => selectedIds.has(r.id));
    const tableContexts = tables.map(t => ({
      name: t.name, comment: t.comment,
      fields: t.fields.map(f => ({
        name: f.name, dataType: f.dataType, nullable: f.nullable,
        isPrimaryKey: f.isPrimaryKey, isUnique: f.isUnique,
        isAutoIncrement: false, defaultValue: f.defaultValue, comment: f.comment, position: f.position,
      })),
    }));
    const ruleResult = runRules(tableContexts, activeRules, settingsMap);

    const ruleViolations: AnalyzeIssue[] = ruleResult.violations.map(v => ({
      severity: v.severity,
      source: "rule",
      target: v.fieldName ? `${v.tableName}.${v.fieldName}` : v.tableName,
      message: v.message,
      suggestion: null,
    }));

    // Naming dictionary check
    const namingIssues: AnalyzeIssue[] = [];
    const sys = new Set(["id", "created_at", "updated_at", "deleted_at"]);
    for (const table of tables) {
      for (const field of table.fields) {
        if (sys.has(field.name)) continue;
        const r = checkFieldName(field.name, entries);
        if (r.status === "alias") {
          namingIssues.push({ severity: "info", source: "naming", target: `${table.name}.${field.name}`, message: `"${field.name}" 是 ${r.stdName} 的別名，建議改為標準名`, suggestion: r.stdName });
        } else if (r.status === "unknown") {
          namingIssues.push({ severity: "info", source: "naming", target: `${table.name}.${field.name}`, message: `"${field.name}" 未登錄命名字典`, suggestion: null });
        }
      }
    }

    send({ type: "issues", issues: [...ruleViolations, ...namingIssues] });

    const skills = getSkillsForDomain(schema.domain);
    const skillsText = formatSkillsForPrompt(skills);
    const scopeLabel = tableId != null ? `表「${tables[0]?.name ?? tableId}」` : `Schema「${schema.name}」`;
    const schemaJson = JSON.stringify({
      name: scopeLabel, tables: tables.map(t => ({
        name: t.name, comment: t.comment,
        fields: t.fields.map(f => ({ name: f.name, dataType: f.dataType, isPrimaryKey: f.isPrimaryKey, nullable: f.nullable, comment: f.comment })),
      })),
    }, null, 2);

    for await (const event of analyzeSchemaStream(schemaJson, ruleViolations, namingIssues, skillsText)) {
      if (event.type === "error") { send({ type: "error", message: event.message }); res.end(); return; }
      send(event);
    }

    res.end();
  } catch (e) { next(e); }
});

export default router;
