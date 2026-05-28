import * as store from "../db/fileStore.js";
import type { Severity, RuleConfig } from "@schema-studio/core";

interface RuleOverrideEntry {
  severity?: Severity;
  enabled?: boolean;
  config?: Record<string, unknown>;
}

type RuleOverrides = Record<string, RuleOverrideEntry>;

export interface RuleSnapshot {
  id: string;
  name: string;
  createdAt: string;
  overrides: RuleOverrides;
}

const snapshotsDir = () => store.dataPath("rules", "snapshots");
const snapshotFile = (id: string) => store.dataPath("rules", "snapshots", `${id}.json`);
const overridesFile = () => store.dataPath("rules", "overrides.json");

export async function listSnapshots(): Promise<RuleSnapshot[]> {
  const slugs = await store.listJsonFileSlugs(snapshotsDir());
  const snapshots: RuleSnapshot[] = [];
  for (const slug of slugs) {
    const s = await store.readJson<RuleSnapshot>(snapshotFile(slug));
    if (s) snapshots.push(s);
  }
  return snapshots.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveSnapshot(name: string): Promise<RuleSnapshot> {
  const overrides = (await store.readJson<RuleOverrides>(overridesFile())) ?? {};
  const id = Date.now().toString();
  const createdAt = new Date().toISOString();
  const snapshot: RuleSnapshot = { id, name, createdAt, overrides };
  await store.writeJson(snapshotFile(id), snapshot);
  return snapshot;
}

export async function restoreSnapshot(id: string): Promise<void> {
  const snapshot = await store.readJson<RuleSnapshot>(snapshotFile(id));
  if (!snapshot) throw new Error(`Snapshot not found: ${id}`);
  await store.writeJson(overridesFile(), snapshot.overrides);
}

export async function deleteSnapshot(id: string): Promise<void> {
  await store.deleteFile(snapshotFile(id));
}
