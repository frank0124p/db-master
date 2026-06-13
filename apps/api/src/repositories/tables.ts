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

export async function updateTable(id: number, input: Partial<{
  name: string; comment: string | null; tags: string[]; environment: string | null;
  layerType: string | null; status: "active" | "deprecated" | null;
  sampleData: Record<string, unknown>[];
  // Phase 10 stewardship + operational + lifecycle
  ownerUserId: number | null; stewardUserId: number | null;
  refreshCycle: import("@schema-studio/core").RefreshCycle | null;
  dataPeriod: string | null; sourceSystem: string | null;
  deprecated: boolean | null; deprecatedAt: string | null;
  deprecationNote: string | null; replacedByRef: string | null;
}>) {
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
  if (input.status !== undefined) tbl.status = input.status;
  if (input.sampleData !== undefined) tbl.sampleData = input.sampleData;
  if (input.ownerUserId !== undefined) tbl.ownerUserId = input.ownerUserId ?? undefined;
  if (input.stewardUserId !== undefined) tbl.stewardUserId = input.stewardUserId ?? undefined;
  if (input.refreshCycle !== undefined) tbl.refreshCycle = input.refreshCycle ?? undefined;
  if (input.dataPeriod !== undefined) tbl.dataPeriod = input.dataPeriod ?? undefined;
  if (input.sourceSystem !== undefined) tbl.sourceSystem = input.sourceSystem ?? undefined;
  if (input.deprecated !== undefined) tbl.deprecated = input.deprecated ?? undefined;
  if (input.deprecatedAt !== undefined) tbl.deprecatedAt = input.deprecatedAt ?? undefined;
  if (input.deprecationNote !== undefined) tbl.deprecationNote = input.deprecationNote ?? undefined;
  if (input.replacedByRef !== undefined) tbl.replacedByRef = input.replacedByRef ?? undefined;
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
