import { parseDDL } from "@schema-studio/ddl-parser";
import { runRules } from "@schema-studio/core";
import { getRuleSettingsMap, getAllRules } from "./rules.js";
import * as store from "../db/fileStore.js";
import { loadTables, tableFile, getSchemaSlug, TableFile } from "./schemas.js";

export interface ImportCheckResult {
  tables: ParsedTableSummary[];
  violations: ViolationSummary[];
  summary: {
    errors: number; warnings: number; infos: number;
    passed: boolean; tablesFound: number;
  };
  parseErrors: string[];
}

export interface ParsedTableSummary {
  name: string; comment: string | null; fieldCount: number;
}

export interface ViolationSummary {
  ruleId: string; severity: "error" | "warning" | "info";
  message: string; tableName: string; fieldName?: string;
  group: "naming" | "semantic" | "structure";
}

export async function checkDDL(sql: string): Promise<ImportCheckResult> {
  const parsed = parseDDL(sql);
  const settingsMap = await getRuleSettingsMap();
  const allRules = getAllRules();
  const checkResult = runRules(parsed.tables, allRules, settingsMap);
  const ruleGroupMap = new Map(allRules.map(r => [r.id, r.group]));
  return {
    tables: parsed.tables.map(t => ({ name: t.name, comment: t.comment, fieldCount: t.fields.length })),
    violations: checkResult.violations.map(v => ({ ...v, group: ruleGroupMap.get(v.ruleId) ?? "structure" })),
    summary: { ...checkResult.summary, tablesFound: parsed.tables.length },
    parseErrors: parsed.errors,
  };
}

export async function importDDL(
  schemaId: number, sql: string
): Promise<{ tablesCreated: number; fieldsCreated: number }> {
  const parsed = parseDDL(sql);
  if (parsed.tables.length === 0) throw new Error("No tables found in DDL");

  const schemaSlug = await getSchemaSlug(schemaId);
  const existingTables = await loadTables(schemaId);
  const tableByName = new Map(existingTables.map(t => [t.name, t]));

  let tablesCreated = 0;
  let fieldsCreated = 0;

  for (const parsedTable of parsed.tables) {
    const existing = tableByName.get(parsedTable.name);

    if (existing) {
      // Upsert: merge fields into existing table file
      const tbl = await store.readJson<TableFile>(tableFile(schemaSlug, existing.name));
      if (!tbl) continue;

      const existingFieldNames = new Map(tbl.fields.map(f => [f.name, f]));
      for (const pf of parsedTable.fields) {
        const ef = existingFieldNames.get(pf.name);
        if (ef) {
          // Update existing field
          ef.dataType = pf.dataType;
          ef.nullable = pf.nullable;
          ef.defaultValue = pf.defaultValue ?? null;
          ef.isPrimaryKey = pf.isPrimaryKey;
          ef.isUnique = pf.isUnique;
          ef.comment = pf.comment ?? null;
          ef.position = pf.position;
        } else {
          // Add new field
          const fieldId = await store.nextId("fields");
          const maxPos = tbl.fields.length > 0 ? Math.max(...tbl.fields.map(f => f.position)) : -1;
          tbl.fields.push({
            id: fieldId, tableId: tbl.id, name: pf.name, dataType: pf.dataType,
            nullable: pf.nullable, defaultValue: pf.defaultValue ?? null,
            isPrimaryKey: pf.isPrimaryKey, isUnique: pf.isUnique,
            comment: pf.comment ?? null, position: maxPos + 1,
          });
          await store.indexSet("fieldTable", fieldId, tbl.id);
          fieldsCreated++;
        }
      }
      tbl.updatedAt = new Date().toISOString();
      await store.writeJson(tableFile(schemaSlug, tbl.name), tbl);
      tablesCreated++;
    } else {
      // Create new table
      const tableId = await store.nextId("tables");
      const now = new Date().toISOString();
      const fields = [];
      for (const pf of parsedTable.fields) {
        const fieldId = await store.nextId("fields");
        fields.push({
          id: fieldId, tableId, name: pf.name, dataType: pf.dataType,
          nullable: pf.nullable, defaultValue: pf.defaultValue ?? null,
          isPrimaryKey: pf.isPrimaryKey, isUnique: pf.isUnique,
          comment: pf.comment ?? null, position: pf.position,
        });
        await store.indexSet("fieldTable", fieldId, tableId);
        fieldsCreated++;
      }
      const newTable: TableFile = {
        id: tableId, schemaId, name: parsedTable.name, comment: parsedTable.comment ?? null,
        createdAt: now, updatedAt: now, fields,
      };
      await store.writeJson(tableFile(schemaSlug, parsedTable.name), newTable);
      await store.indexSet("tableSchema", tableId, schemaId);
      await store.indexSetStr("tableIdToName", tableId, parsedTable.name);
      tablesCreated++;
    }
  }

  return { tablesCreated, fieldsCreated };
}
