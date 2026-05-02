/**
 * One-time migration: flat JSON seed files → folder-based file store
 * Run with: node scripts/migrate-to-files.mjs
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf-8"));
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf-8");
}

async function main() {
  const schemas      = await readJson(path.join(DATA, "schemas.json"));
  const tables       = await readJson(path.join(DATA, "tables.json"));
  const fields       = await readJson(path.join(DATA, "fields.json"));
  const naming       = await readJson(path.join(DATA, "naming-dictionary.json"));
  const wideTables   = await readJson(path.join(DATA, "wide-tables.json"));
  const wideSources  = await readJson(path.join(DATA, "wide-table-sources.json"));
  const wideColumns  = await readJson(path.join(DATA, "wide-table-columns.json"));

  const tableIndex = {};   // tableId → schemaId
  const fieldIndex = {};   // fieldId → tableId
  const wtIndex    = {};   // wideTableId → schemaId

  // ── Schemas + Tables + Fields ──────────────────────────────────────────────
  for (const s of schemas) {
    const metaFile = path.join(DATA, "schemas", String(s.id), "meta.json");
    await writeJson(metaFile, {
      id: s.id, name: s.name, description: s.description, domain: s.domain,
      createdAt: s.created_at, updatedAt: s.updated_at,
    });

    const schemaTables = tables.filter(t => t.schema_id === s.id);
    for (const t of schemaTables) {
      tableIndex[t.id] = s.id;
      const tableFields = fields.filter(f => f.table_id === t.id).map(f => {
        fieldIndex[f.id] = t.id;
        return {
          id: f.id, tableId: f.table_id, name: f.name, dataType: f.data_type,
          nullable: f.nullable, defaultValue: f.default_value ?? null,
          isPrimaryKey: f.is_primary_key, isUnique: f.is_unique,
          comment: f.comment ?? null, position: f.position,
        };
      });
      const tableFile = path.join(DATA, "schemas", String(s.id), "tables", `${t.id}.json`);
      await writeJson(tableFile, {
        id: t.id, schemaId: s.id, name: t.name, comment: t.comment ?? null,
        createdAt: t.created_at, updatedAt: t.updated_at,
        fields: tableFields.sort((a, b) => a.position - b.position),
      });
    }
  }

  // ── Naming entries ─────────────────────────────────────────────────────────
  for (const n of naming) {
    await writeJson(path.join(DATA, "naming", `${n.id}.json`), {
      id: n.id, concept: n.concept, stdName: n.std_name,
      aliases: n.aliases, domain: n.domain, tags: n.tags,
      aiDescription: n.ai_description ?? null, description: n.description ?? null,
      createdAt: n.created_at, updatedAt: n.updated_at,
    });
  }

  // ── Wide tables ────────────────────────────────────────────────────────────
  for (const wt of wideTables) {
    wtIndex[wt.id] = wt.schema_id;
    const sources = wideSources
      .filter(s => s.wide_table_id === wt.id)
      .map(s => ({
        id: s.id, wideTableId: s.wide_table_id, tableId: s.table_id,
        tableName: s.table_name, colPrefix: s.col_prefix ?? null,
        joinType: s.join_type, joinCondition: s.join_condition ?? null,
        position: s.position,
      }));
    const columns = wideColumns
      .filter(c => c.wide_table_id === wt.id)
      .map(c => ({
        id: c.id, wideTableId: c.wide_table_id, sourceId: c.source_id,
        fieldId: c.field_id, fieldName: c.field_name, fieldType: c.field_type,
        tableName: c.table_name, outputName: c.output_name,
        included: c.included, position: c.position,
      }));
    const wtFile = path.join(DATA, "schemas", String(wt.schema_id), "wide-tables", `${wt.id}.json`);
    await writeJson(wtFile, {
      id: wt.id, schemaId: wt.schema_id, name: wt.name, description: wt.description ?? null,
      createdAt: wt.created_at, updatedAt: wt.updated_at,
      sources, columns,
    });
  }

  // ── Counters ───────────────────────────────────────────────────────────────
  const maxSchemaId    = Math.max(0, ...schemas.map(s => s.id));
  const maxTableId     = Math.max(0, ...tables.map(t => t.id));
  const maxFieldId     = Math.max(0, ...fields.map(f => f.id));
  const maxNamingId    = Math.max(0, ...naming.map(n => n.id));
  const maxWtId        = Math.max(0, ...wideTables.map(w => w.id));
  const maxSrcId       = Math.max(0, ...wideSources.map(s => s.id));
  const maxColId       = Math.max(0, ...wideColumns.map(c => c.id));

  await writeJson(path.join(DATA, "_counters.json"), {
    schemas: maxSchemaId, tables: maxTableId, fields: maxFieldId,
    namingEntries: maxNamingId, versions: 0,
    wideTables: maxWtId, wideSources: maxSrcId, wideColumns: maxColId,
  });

  // ── Index ──────────────────────────────────────────────────────────────────
  await writeJson(path.join(DATA, "_index.json"), {
    tableSchema: tableIndex,
    fieldTable: fieldIndex,
    wideTableSchema: wtIndex,
  });

  // ── Rules override (empty — defaults apply) ────────────────────────────────
  await writeJson(path.join(DATA, "rules", "overrides.json"), {});

  console.log("✅ Migration complete");
  console.log(`   Schemas: ${schemas.length}, Tables: ${tables.length}, Fields: ${fields.length}`);
  console.log(`   Naming entries: ${naming.length}, Wide tables: ${wideTables.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });
