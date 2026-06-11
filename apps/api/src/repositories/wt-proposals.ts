import * as store from "../db/fileStore.js";
import type { WideTableProposal } from "@schema-studio/core";

function proposalPath(id: number): string {
  return store.dataPath("proposals", "wide-tables", `${id}.json`);
}

export async function listWtProposals(opts?: {
  status?: WideTableProposal["status"];
}): Promise<WideTableProposal[]> {
  const ids = await store.listJsonFileIds(store.dataPath("proposals", "wide-tables"));
  const results: WideTableProposal[] = [];
  for (const id of ids) {
    const p = await store.readJson<WideTableProposal>(proposalPath(id));
    if (!p) continue;
    if (opts?.status && p.status !== opts.status) continue;
    results.push(p);
  }
  return results.sort((a, b) => b.id - a.id);
}

export async function getWtProposal(id: number): Promise<WideTableProposal | null> {
  return store.readJson<WideTableProposal>(proposalPath(id));
}

export async function createWtProposal(
  data: Omit<WideTableProposal, "id" | "createdAt">,
): Promise<WideTableProposal> {
  const id = await store.nextId("wtProposal");
  const now = new Date().toISOString();
  const proposal: WideTableProposal = { id, ...data, createdAt: now };
  await store.writeJson(proposalPath(id), proposal);
  return proposal;
}

export async function updateWtProposal(
  id: number,
  patch: Partial<Omit<WideTableProposal, "id" | "createdAt">>,
): Promise<WideTableProposal | null> {
  const existing = await getWtProposal(id);
  if (!existing) return null;
  const updated: WideTableProposal = { ...existing, ...patch, id };
  await store.writeJson(proposalPath(id), updated);
  return updated;
}
