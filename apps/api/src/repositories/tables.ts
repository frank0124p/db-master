import { NotFoundError } from "@schema-studio/core";
import * as store from "../db/fileStore.js";
import { tableFile, TableFile, getSchemaById } from "./schemas.js";

export async function createTable(schemaId: number, input: { name: string; comment?: string | null }) {
  await getSchemaById(schemaId); // verify schema exists
  const id = await store.nextId("tables");
  const now = new Date().toISOString();
  const tbl: TableFile = {
    id, schemaId, name: input.name, comment: input.comment ?? null,
    createdAt: now, updatedAt: now, fields: [],
  };
  await store.writeJson(tableFile(schemaId, id), tbl);
  await store.indexSet("tableSchema", id, schemaId);
  return { id, schemaId, name: tbl.name, comment: tbl.comment };
}

export async function updateTable(id: number, input: Partial<{ name: string; comment: string | null }>) {
  const schemaId = await store.indexGet("tableSchema", id);
  if (schemaId === null) throw new NotFoundError("Table", id);
  const tbl = await store.readJson<TableFile>(tableFile(schemaId, id));
  if (!tbl) throw new NotFoundError("Table", id);
  if (input.name !== undefined) tbl.name = input.name;
  if (input.comment !== undefined) tbl.comment = input.comment;
  tbl.updatedAt = new Date().toISOString();
  await store.writeJson(tableFile(schemaId, id), tbl);
}

export async function deleteTable(id: number) {
  const schemaId = await store.indexGet("tableSchema", id);
  if (schemaId === null) throw new NotFoundError("Table", id);
  const tbl = await store.readJson<TableFile>(tableFile(schemaId, id));
  if (!tbl) throw new NotFoundError("Table", id);

  const fieldIds = tbl.fields.map(f => f.id);
  await store.deleteFile(tableFile(schemaId, id));
  await store.indexDelete("tableSchema", id);
  await store.indexDeleteMany("fieldTable", fieldIds);
}
