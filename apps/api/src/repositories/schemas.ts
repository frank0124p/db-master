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
  tags?: string[]; environment?: string | null; layerType?: string | null;
  createdAt: string; updatedAt: string;
  fields: FieldEntry[];
  sampleData?: Record<string, unknown>[];
}

interface SchemaMeta {
  id: number; name: string; description: string | null; domain: string;
  suiteId: number | null; layerType: string | null;
  selectedRuleIds: string[] | null;
  tags: string[]; environment: string | null; targetDb: string | null;
  createdAt: string; updatedAt: string;
}

export interface SchemaWithTables {
  id: number; name: string; description: string | null; domain: string;
  suiteId: number | null; layerType: string | null;
  selectedRuleIds: string[] | null;
  tags: string[]; environment: string | null; targetDb: string | null;
  createdAt: Date; updatedAt: Date;
  tables: {
    id: number; name: string; comment: string | null;
    tags?: string[]; environment?: string | null; layerType?: string | null;
    fields: FieldEntry[];
    sampleData?: Record<string, unknown>[];
  }[];
}

// ── Slug helpers ───────────────────────────────────────────────────────────────

export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "schema";
}

async function uniqueSlug(base: string): Promise<string> {
  const existing = new Set(await store.listDirSlugs(store.dataPath("schemas")));
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

// ── Path functions (take slug/name strings, synchronous) ──────────────────────

export function schemaDir(slug: string): string { return store.dataPath("schemas", slug); }
export function metaFile(slug: string): string { return store.dataPath("schemas", slug, "meta.json"); }
export function tablesDir(slug: string): string { return store.dataPath("schemas", slug, "tables"); }
export function tableFile(schemaSlug: string, tableName: string): string {
  return store.dataPath("schemas", schemaSlug, "tables", `${tableName}.json`);
}
export function versionsDir(slug: string): string { return store.dataPath("schemas", slug, "versions"); }
export function versionFile(schemaSlug: string, versionNo: number): string {
  return store.dataPath("schemas", schemaSlug, "versions", `v${versionNo}.json`);
}
export function wideTablesDir(slug: string): string { return store.dataPath("schemas", slug, "wide-tables"); }
export function wideTableFile(schemaSlug: string, wtNameSlug: string): string {
  return store.dataPath("schemas", schemaSlug, "wide-tables", `${wtNameSlug}.json`);
}

// ── Async resolvers (ID → path) ────────────────────────────────────────────────

export async function getSchemaSlug(id: number): Promise<string> {
  const slug = await store.indexGetStr("schemaIdToSlug", id);
  if (!slug) throw new NotFoundError("Schema", id);
  return slug;
}

// Returns the full table file path for a given schemaId + tableId
export async function getTableFilePath(schemaId: number, tableId: number): Promise<string> {
  const idx = await store.getIndex();
  const slug = idx.schemaIdToSlug[String(schemaId)];
  if (!slug) throw new NotFoundError("Schema", schemaId);
  const name = idx.tableIdToName[String(tableId)];
  if (!name) throw new NotFoundError("Table", tableId);
  return tableFile(slug, name);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

export async function loadTables(schemaId: number): Promise<SchemaWithTables["tables"]> {
  const slug = await getSchemaSlug(schemaId);
  const names = await store.listJsonFileSlugs(tablesDir(slug));
  const tables: SchemaWithTables["tables"] = [];
  for (const name of names) {
    const t = await store.readJson<TableFile>(tableFile(slug, name));
    if (!t) continue;
    tables.push({
      id: t.id,
      name: t.name,
      comment: t.comment,
      tags: t.tags ?? [],
      environment: t.environment ?? null,
      layerType: t.layerType ?? null,
      fields: [...t.fields].sort((a, b) => a.position - b.position),
      sampleData: t.sampleData ?? [],
    });
  }
  return tables.sort((a, b) => a.id - b.id);
}

// ── CRUD ───────────────────────────────────────────────────────────────────────

export async function listSchemas() {
  const slugs = await store.listDirSlugs(store.dataPath("schemas"));
  const schemas = [];
  for (const slug of slugs) {
    const meta = await store.readJson<SchemaMeta>(metaFile(slug));
    if (!meta) continue;
    schemas.push({
      id: meta.id, name: meta.name, description: meta.description, domain: meta.domain,
      suiteId: meta.suiteId ?? null, layerType: meta.layerType ?? null,
      selectedRuleIds: meta.selectedRuleIds ?? null,
      tags: meta.tags ?? [], environment: meta.environment ?? null,
      targetDb: meta.targetDb ?? null,
      createdAt: new Date(meta.createdAt), updatedAt: new Date(meta.updatedAt),
    });
  }
  return schemas.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

export async function getSchemaByName(name: string): Promise<{ id: number } | null> {
  const slugs = await store.listDirSlugs(store.dataPath("schemas"));
  const lower = name.toLowerCase();
  for (const slug of slugs) {
    const meta = await store.readJson<SchemaMeta>(metaFile(slug));
    if (meta?.name.toLowerCase() === lower) return { id: meta.id };
  }
  return null;
}

export async function getSchemaById(id: number): Promise<SchemaWithTables> {
  const slug = await getSchemaSlug(id);
  const meta = await store.readJson<SchemaMeta>(metaFile(slug));
  if (!meta) throw new NotFoundError("Schema", id);
  const tables = await loadTables(id);
  return {
    id: meta.id, name: meta.name, description: meta.description, domain: meta.domain,
    suiteId: meta.suiteId ?? null, layerType: meta.layerType ?? null,
    selectedRuleIds: meta.selectedRuleIds ?? null,
    tags: meta.tags ?? [], environment: meta.environment ?? null,
    targetDb: meta.targetDb ?? null,
    createdAt: new Date(meta.createdAt), updatedAt: new Date(meta.updatedAt),
    tables,
  };
}

export async function createSchema(input: { name: string; description?: string | null; domain?: string; suiteId?: number | null; layerType?: string | null; tags?: string[]; environment?: string | null; targetDb?: string | null }) {
  const id = await store.nextId("schemas");
  const slug = await uniqueSlug(toSlug(input.name));
  const now = new Date().toISOString();
  const meta: SchemaMeta = {
    id, name: input.name, description: input.description ?? null,
    domain: input.domain ?? "semiconductor", suiteId: input.suiteId ?? null,
    layerType: input.layerType ?? null, selectedRuleIds: null,
    tags: input.tags ?? [], environment: input.environment ?? null,
    targetDb: input.targetDb ?? null,
    createdAt: now, updatedAt: now,
  };
  await store.writeJson(metaFile(slug), meta);
  await store.indexSetStr("schemaIdToSlug", id, slug);
  return getSchemaById(id);
}

export async function updateSchema(id: number, input: Partial<{ name: string; description: string | null; domain: string; suiteId: number | null; layerType: string | null; selectedRuleIds: string[] | null; tags: string[]; environment: string | null; targetDb: string | null }>) {
  const slug = await getSchemaSlug(id);
  const meta = await store.readJson<SchemaMeta>(metaFile(slug));
  if (!meta) throw new NotFoundError("Schema", id);
  if (input.name !== undefined) meta.name = input.name;
  if (input.description !== undefined) meta.description = input.description;
  if (input.domain !== undefined) meta.domain = input.domain;
  if ("suiteId" in input) meta.suiteId = input.suiteId ?? null;
  if ("layerType" in input) meta.layerType = input.layerType ?? null;
  if ("selectedRuleIds" in input) meta.selectedRuleIds = input.selectedRuleIds ?? null;
  if (input.tags !== undefined) meta.tags = input.tags;
  if ("environment" in input) meta.environment = input.environment ?? null;
  if ("targetDb" in input) meta.targetDb = input.targetDb ?? null;
  meta.updatedAt = new Date().toISOString();
  await store.writeJson(metaFile(slug), meta);
  return getSchemaById(id);
}

export async function deleteSchema(id: number) {
  const slug = await getSchemaSlug(id);
  const meta = await store.readJson<SchemaMeta>(metaFile(slug));
  if (!meta) throw new NotFoundError("Schema", id);

  const idx = await store.getIndex();
  const tableIds = Object.entries(idx.tableSchema)
    .filter(([, sid]) => sid === id)
    .map(([tid]) => Number(tid));

  const fieldIds: number[] = [];
  for (const tid of tableIds) {
    const tName = idx.tableIdToName[String(tid)];
    if (!tName) continue;
    const t = await store.readJson<TableFile>(tableFile(slug, tName));
    if (t) for (const f of t.fields) fieldIds.push(f.id);
  }

  const wtIds = Object.entries(idx.wideTableSchema)
    .filter(([, sid]) => sid === id)
    .map(([wtid]) => Number(wtid));

  // Batch update index
  for (const tid of tableIds) {
    delete idx.tableSchema[String(tid)];
    delete idx.tableIdToName[String(tid)];
  }
  for (const fid of fieldIds) delete idx.fieldTable[String(fid)];
  for (const wtid of wtIds) {
    delete idx.wideTableSchema[String(wtid)];
    delete idx.wideTableIdToName[String(wtid)];
  }
  delete idx.schemaIdToSlug[String(id)];
  await store.writeIndex(idx);

  await store.deleteDir(schemaDir(slug));
}
