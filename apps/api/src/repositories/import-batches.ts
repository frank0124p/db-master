import * as store from "../db/fileStore.js";
import type { ImportBatch, ClassificationProposal } from "@schema-studio/core";

function batchPath(id: number): string {
  return store.dataPath("imports", "batches", `${id}.json`);
}

export async function listImportBatches(): Promise<ImportBatch[]> {
  const ids = await store.listJsonFileIds(store.dataPath("imports", "batches"));
  const batches: ImportBatch[] = [];
  for (const id of ids) {
    const b = await store.readJson<ImportBatch>(batchPath(id));
    if (b) batches.push(b);
  }
  return batches.sort((a, b) => b.id - a.id);
}

export async function getImportBatch(id: number): Promise<ImportBatch | null> {
  return store.readJson<ImportBatch>(batchPath(id));
}

export async function createImportBatch(
  data: Omit<ImportBatch, "id" | "createdAt" | "updatedAt">,
): Promise<ImportBatch> {
  const id = await store.nextId("importBatch");
  const now = new Date().toISOString();
  const batch: ImportBatch = { id, ...data, createdAt: now, updatedAt: now };
  await store.writeJson(batchPath(id), batch);
  return batch;
}

export async function updateImportBatch(
  id: number,
  patch: Partial<Omit<ImportBatch, "id" | "createdAt">>,
): Promise<ImportBatch | null> {
  const existing = await getImportBatch(id);
  if (!existing) return null;
  const updated: ImportBatch = {
    ...existing,
    ...patch,
    id,
    updatedAt: new Date().toISOString(),
  };
  await store.writeJson(batchPath(id), updated);
  return updated;
}

export async function updateProposal(
  batchId: number,
  tableId: number,
  patch: Partial<ClassificationProposal>,
): Promise<ImportBatch | null> {
  const batch = await getImportBatch(batchId);
  if (!batch) return null;
  batch.proposals = batch.proposals.map(p =>
    p.tableId === tableId ? { ...p, ...patch } : p,
  );
  batch.updatedAt = new Date().toISOString();
  await store.writeJson(batchPath(batchId), batch);
  return batch;
}
