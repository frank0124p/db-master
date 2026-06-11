import { runGovernanceRules } from "@schema-studio/core";
import type { WideTableDraft, ValidationReport, GovernanceContext } from "@schema-studio/core";
import * as knowledgeRepo from "../repositories/knowledge.js";
import * as govRepo from "../repositories/governance.js";
import * as schemaRepo from "../repositories/schemas.js";
import * as namingRepo from "../repositories/naming.js";
import * as rulesRepo from "../repositories/rules.js";

export async function validateDraft(draft: WideTableDraft): Promise<ValidationReport> {
  // Build governance context
  const [concepts, businessRules, dictEntries, allSchemas, governed] = await Promise.all([
    knowledgeRepo.listConcepts({ status: "approved" }),
    knowledgeRepo.listBusinessRules({ status: "approved" }),
    namingRepo.listNamingEntries(undefined, "approved"),
    schemaRepo.listSchemas(),
    govRepo.listGoverned(),
  ]);

  // Build allTables from all schemas
  const allTables: GovernanceContext["allTables"] = [];
  for (const schema of allSchemas) {
    try {
      const full = await schemaRepo.getSchemaById(schema.id);
      for (const table of full.tables) {
        allTables.push({
          schemaId: schema.id,
          schemaSlug: full.name.toLowerCase().replace(/\s+/g, "-"),
          table: {
            name: table.name,
            fields: table.fields.map(f => ({
              name: f.name,
              dataType: f.dataType,
              isPrimaryKey: f.isPrimaryKey,
              isUnique: f.isUnique,
            })),
          },
        });
      }
    } catch { /* skip */ }
  }

  const ruleOverrides = await rulesRepo.getRuleOverrides().catch(() => ({}));

  const ctx: GovernanceContext = {
    allTables,
    concepts,
    businessRules,
    namingDict: dictEntries.map(d => ({ id: d.id, stdName: d.stdName, aliases: d.aliases })),
    governedWideTables: governed,
    ruleOverrides,
  };

  const ruleResults = runGovernanceRules(draft, ctx);

  const summary = {
    errors: ruleResults.filter(r => r.severity === "error" && !r.passed).length,
    warnings: ruleResults.filter(r => r.severity === "warning" && !r.passed).length,
    infos: ruleResults.filter(r => r.severity === "info" && !r.passed).length,
    passed: ruleResults.filter(r => r.severity === "error" && !r.passed).length === 0,
  };

  const report = await govRepo.createReport({
    draftId: draft.id,
    ranAt: new Date().toISOString(),
    ruleResults,
    summary,
  });

  return report;
}
