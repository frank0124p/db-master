import { NotFoundError } from "@schema-studio/core";
import * as store from "../db/fileStore.js";
import { tableFile, TableFile } from "./schemas.js";

export async function createField(tableId: number, input: {
  name: string; data_type: string; nullable?: boolean; default_value?: string | null;
  is_primary_key?: boolean; is_unique?: boolean; comment?: string | null; position?: number;
}) {
  const schemaId = await store.indexGet("tableSchema", tableId);
  if (schemaId === null) throw new NotFoundError("Table", tableId);
  const tbl = await store.readJson<TableFile>(tableFile(schemaId, tableId));
  if (!tbl) throw new NotFoundError("Table", tableId);

  const id = await store.nextId("fields");
  const position = input.position ??
    (tbl.fields.length > 0 ? Math.max(...tbl.fields.map(f => f.position)) + 1 : 0);

  const field = {
    id, tableId, name: input.name, dataType: input.data_type,
    nullable: input.nullable ?? true,
    defaultValue: input.default_value ?? null,
    isPrimaryKey: input.is_primary_key ?? false,
    isUnique: input.is_unique ?? false,
    comment: input.comment ?? null,
    position,
  };

  tbl.fields.push(field);
  tbl.updatedAt = new Date().toISOString();
  await store.writeJson(tableFile(schemaId, tableId), tbl);
  await store.indexSet("fieldTable", id, tableId);
  return field;
}

export async function updateField(id: number, input: Partial<{
  name: string; data_type: string; nullable: boolean; default_value: string | null;
  is_primary_key: boolean; is_unique: boolean; comment: string | null; position: number;
}>) {
  const tableId = await store.indexGet("fieldTable", id);
  if (tableId === null) throw new NotFoundError("Field", id);
  const schemaId = await store.indexGet("tableSchema", tableId);
  if (schemaId === null) throw new NotFoundError("Table", tableId);
  const tbl = await store.readJson<TableFile>(tableFile(schemaId, tableId));
  if (!tbl) throw new NotFoundError("Table", tableId);

  const f = tbl.fields.find(f => f.id === id);
  if (!f) throw new NotFoundError("Field", id);

  if (input.name !== undefined) f.name = input.name;
  if (input.data_type !== undefined) f.dataType = input.data_type;
  if (input.nullable !== undefined) f.nullable = input.nullable;
  if (input.default_value !== undefined) f.defaultValue = input.default_value;
  if (input.is_primary_key !== undefined) f.isPrimaryKey = input.is_primary_key;
  if (input.is_unique !== undefined) f.isUnique = input.is_unique;
  if (input.comment !== undefined) f.comment = input.comment;
  if (input.position !== undefined) f.position = input.position;

  tbl.updatedAt = new Date().toISOString();
  await store.writeJson(tableFile(schemaId, tableId), tbl);
}

export async function deleteField(id: number) {
  const tableId = await store.indexGet("fieldTable", id);
  if (tableId === null) throw new NotFoundError("Field", id);
  const schemaId = await store.indexGet("tableSchema", tableId);
  if (schemaId === null) throw new NotFoundError("Table", tableId);
  const tbl = await store.readJson<TableFile>(tableFile(schemaId, tableId));
  if (!tbl) throw new NotFoundError("Table", tableId);

  tbl.fields = tbl.fields.filter(f => f.id !== id);
  tbl.updatedAt = new Date().toISOString();
  await store.writeJson(tableFile(schemaId, tableId), tbl);
  await store.indexDelete("fieldTable", id);
}
