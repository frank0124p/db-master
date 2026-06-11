import * as store from "../db/fileStore.js";
import type { WideTableDraft } from "@schema-studio/core";

function draftPath(id: number): string {
  return store.dataPath("workspace", "drafts", `${id}.json`);
}

export async function listDrafts(opts?: {
  status?: WideTableDraft["status"];
}): Promise<WideTableDraft[]> {
  const ids = await store.listJsonFileIds(store.dataPath("workspace", "drafts"));
  const results: WideTableDraft[] = [];
  for (const id of ids) {
    const d = await store.readJson<WideTableDraft>(draftPath(id));
    if (!d) continue;
    if (opts?.status && d.status !== opts.status) continue;
    results.push(d);
  }
  return results.sort((a, b) => b.id - a.id);
}

export async function getDraft(id: number): Promise<WideTableDraft | null> {
  return store.readJson<WideTableDraft>(draftPath(id));
}

export async function createDraft(
  data: Omit<WideTableDraft, "id" | "createdAt" | "updatedAt">,
): Promise<WideTableDraft> {
  const id = await store.nextId("wtDraft");
  const now = new Date().toISOString();
  const draft: WideTableDraft = {
    id, ...data,
    editLog: data.editLog ?? [],
    versions: data.versions ?? [],
    createdAt: now,
    updatedAt: now,
  };
  await store.writeJson(draftPath(id), draft);
  return draft;
}

export async function updateDraft(
  id: number,
  patch: Partial<Omit<WideTableDraft, "id" | "createdAt">>,
): Promise<WideTableDraft | null> {
  const existing = await getDraft(id);
  if (!existing) return null;
  const updated: WideTableDraft = {
    ...existing,
    ...patch,
    id,
    updatedAt: new Date().toISOString(),
  };
  await store.writeJson(draftPath(id), updated);
  return updated;
}

export async function deleteDraft(id: number): Promise<void> {
  await store.deleteFile(draftPath(id));
}
