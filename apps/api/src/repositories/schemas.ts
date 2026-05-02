import { NotFoundError } from "@schema-studio/core";
import * as store from "../db/fileStore.js";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface FieldEntry {
  id: number; tableId: number; name: string; dataType: string; nullable: boolean;
  defaultValue: string | null; isPrimaryKey: boolean; isUnique: boolean;
  comment: string | null; position: number;
}

export interface TableFile {
  id: number; schemaId: number; name: string; comment: string | null;
  createdAt: string; updatedAt: string;
  fields: FieldEntry[];
}

interface SchemaMeta {
  id: number; name: string; description: string | null; domain: string;
  createdAt: string; updatedAt: string;
}

export interface SchemaWithTables {
  id: number; name: string; description: string | null; domain: string;
  createdAt: Date; updatedAt: Date;
  tables: {
    id: number; name: string; comment: string | null;
    fields: FieldEntry[];
  }[];
}

// ── Paths ──────────────────────────────────────────────────────────────────────

export function schemaDir(id: number) { return store.dataPath("schemas", String(id)); }
export function metaFile(id: number) { return store.dataPath("schemas", String(id), "meta.json"); }
export function tablesDir(id: number) { return store.dataPath("schemas", String(id), "tables"); }
export function tableFile(schemaId: number, tableId: number) {
  return store.dataPath("schemas", String(schemaId), "tables", `${tableId}.json`);
}
export function versionsDir(id: number) { return store.dataPath("schemas", String(id), "versions"); }
export function versionFile(schemaId: number, versionId: number) {
  return store.dataPath("schemas", String(schemaId), "versions", `${versionId}.json`);
}
export function wideTablesDir(id: number) { return store.dataPath("schemas", String(id), "wide-tables"); }
export function wideTableFile(schemaId: number, wtId: number) {
  return store.dataPath("schemas", String(schemaId), "wide-tables", `${wtId}.json`);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

export async function loadTables(schemaId: number): Promise<SchemaWithTables["tables"]> {
  const ids = await store.listJsonFileIds(tablesDir(schemaId));
  const tables: SchemaWithTables["tables"] = [];
  for (const tid of ids) {
    const t = await store.readJson<TableFile>(tableFile(schemaId, tid));
    if (!t) continue;
    tables.push({
      id: t.id,
      name: t.name,
      comment: t.comment,
      fields: [...t.fields].sort((a, b) => a.position - b.position),
    });
  }
  return tables.sort((a, b) => a.id - b.id);
}

// ── CRUD ───────────────────────────────────────────────────────────────────────

export async function listSchemas() {
  const ids = await store.listDirIds(store.dataPath("schemas"));
  const schemas = [];
  for (const id of ids) {
    const meta = await store.readJson<SchemaMeta>(metaFile(id));
    if (!meta) continue;
    schemas.push({
      id: meta.id, name: meta.name, description: meta.description, domain: meta.domain,
      createdAt: new Date(meta.createdAt), updatedAt: new Date(meta.updatedAt),
    });
  }
  return schemas.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

export async function getSchemaByName(name: string): Promise<{ id: number } | null> {
  const ids = await store.listDirIds(store.dataPath("schemas"));
  const lower = name.toLowerCase();
  for (const id of ids) {
    const meta = await store.readJson<SchemaMeta>(metaFile(id));
    if (meta?.name.toLowerCase() === lower) return { id: meta.id };
  }
  return null;
}

export async function getSchemaById(id: number): Promise<SchemaWithTables> {
  const meta = await store.readJson<SchemaMeta>(metaFile(id));
  if (!meta) throw new NotFoundError("Schema", id);
  const tables = await loadTables(id);
  return {
    id: meta.id, name: meta.name, description: meta.description, domain: meta.domain,
    createdAt: new Date(meta.createdAt), updatedAt: new Date(meta.updatedAt),
    tables,
  };
}

export async function createSchema(input: { name: string; description?: string | null; domain?: string }) {
  const id = await store.nextId("schemas");
  const now = new Date().toISOString();
  const meta: SchemaMeta = {
    id, name: input.name, description: input.description ?? null,
    domain: input.domain ?? "semiconductor", createdAt: now, updatedAt: now,
  };
  await store.writeJson(metaFile(id), meta);
  return getSchemaById(id);
}

export async function updateSchema(id: number, input: Partial<{ name: string; description: string | null; domain: string }>) {
  const meta = await store.readJson<SchemaMeta>(metaFile(id));
  if (!meta) throw new NotFoundError("Schema", id);
  if (input.name !== undefined) meta.name = input.name;
  if (input.description !== undefined) meta.description = input.description;
  if (input.domain !== undefined) meta.domain = input.domain;
  meta.updatedAt = new Date().toISOString();
  await store.writeJson(metaFile(id), meta);
  return getSchemaById(id);
}

export async function deleteSchema(id: number) {
  const meta = await store.readJson<SchemaMeta>(metaFile(id));
  if (!meta) throw new NotFoundError("Schema", id);

  // Clean up index entries for all tables and fields
  const idx = await store.getIndex();
  const tableIds = Object.entries(idx.tableSchema)
    .filter(([, sid]) => sid === id)
    .map(([tid]) => Number(tid));

  const fieldIds: number[] = [];
  for (const tid of tableIds) {
    const t = await store.readJson<TableFile>(tableFile(id, tid));
    if (t) for (const f of t.fields) fieldIds.push(f.id);
  }

  const wtIds = Object.entries(idx.wideTableSchema)
    .filter(([, sid]) => sid === id)
    .map(([wtid]) => Number(wtid));

  // Batch update index
  for (const tid of tableIds) delete idx.tableSchema[String(tid)];
  for (const fid of fieldIds) delete idx.fieldTable[String(fid)];
  for (const wtid of wtIds) delete idx.wideTableSchema[String(wtid)];
  await store.writeJson(store.dataPath("_index.json"), idx);

  await store.deleteDir(schemaDir(id));
}
