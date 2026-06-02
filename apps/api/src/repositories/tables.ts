import { NotFoundError } from "@schema-studio/core";
import * as store from "../db/fileStore.js";
import { tableFile, toSlug, TableFile, getSchemaSlug, getTableFilePath, getSchemaById } from "./schemas.js";

export async function createTable(schemaId: number, input: { name: string; comment?: string | null; sampleData?: Record<string, unknown>[] }) {
  await getSchemaById(schemaId); // verify schema exists
  const id = await store.nextId("tables");
  const now = new Date().toISOString();
  const tbl: TableFile = {
    id, schemaId, name: input.name, comment: input.comment ?? null,
    createdAt: now, updatedAt: now, fields: [],
    sampleData: input.sampleData ?? [],
  };
  const schemaSlug = await getSchemaSlug(schemaId);
  await store.writeJson(tableFile(schemaSlug, input.name), tbl);
  await store.indexSet("tableSchema", id, schemaId);
  await store.indexSetStr("tableIdToName", id, input.name);
  return { id, schemaId, name: tbl.name, comment: tbl.comment };
}

export async function updateTable(id: number, input: Partial<{ name: string; comment: string | null; tags: string[]; environment: string | null; layerType: string | null; sampleData: Record<string, unknown>[] }>) {
  const schemaId = await store.indexGet("tableSchema", id);
  if (schemaId === null) throw new NotFoundError("Table", id);
  const oldPath = await getTableFilePath(schemaId, id);
  const tbl = await store.readJson<TableFile>(oldPath);
  if (!tbl) throw new NotFoundError("Table", id);

  const nameChanged = input.name !== undefined && input.name !== tbl.name;
  if (input.name !== undefined) tbl.name = input.name;
  if (input.comment !== undefined) tbl.comment = input.comment;
  if (input.tags !== undefined) tbl.tags = input.tags;
  if (input.environment !== undefined) tbl.environment = input.environment;
  if (input.layerType !== undefined) tbl.layerType = input.layerType;
  if (input.sampleData !== undefined) tbl.sampleData = input.sampleData;
  tbl.updatedAt = new Date().toISOString();

  if (nameChanged) {
    // Write to new path, delete old
    const schemaSlug = await getSchemaSlug(schemaId);
    await store.writeJson(tableFile(schemaSlug, tbl.name), tbl);
    await store.deleteFile(oldPath);
    await store.indexSetStr("tableIdToName", id, tbl.name);
  } else {
    await store.writeJson(oldPath, tbl);
  }
}

export async function deleteTable(id: number) {
  const schemaId = await store.indexGet("tableSchema", id);
  if (schemaId === null) throw new NotFoundError("Table", id);
  const filePath = await getTableFilePath(schemaId, id);
  const tbl = await store.readJson<TableFile>(filePath);
  if (!tbl) throw new NotFoundError("Table", id);

  const fieldIds = tbl.fields.map(f => f.id);
  await store.deleteFile(filePath);

  const idx = await store.getIndex();
  delete idx.tableSchema[String(id)];
  delete idx.tableIdToName[String(id)];
  for (const fid of fieldIds) delete idx.fieldTable[String(fid)];
  await store.writeIndex(idx);
}

// Re-export toSlug for use in other modules
export { toSlug };
