import * as store from "../db/fileStore.js";
import type { ProductSuite } from "@schema-studio/core";

interface SuiteFile {
  id: number;
  name: string;
  description: string | null;
  color: string | null;
  createdAt: string;
  updatedAt: string;
}

function suiteFilePath(id: number): string {
  return store.dataPath("suites", `${id}.json`);
}

export async function listSuites(): Promise<ProductSuite[]> {
  const dir = store.dataPath("suites");
  await store.ensureDir(dir);
  const ids = await store.listJsonFileIds(dir);
  const suites: ProductSuite[] = [];
  for (const id of ids) {
    const data = await store.readJson<SuiteFile>(suiteFilePath(id));
    if (data) suites.push(data);
  }
  return suites.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getSuiteById(id: number): Promise<ProductSuite | null> {
  return store.readJson<SuiteFile>(suiteFilePath(id));
}

export async function createSuite(input: { name: string; description?: string | null; color?: string | null }): Promise<ProductSuite> {
  const id = await store.nextId("suites");
  const now = new Date().toISOString();
  const suite: SuiteFile = {
    id,
    name: input.name,
    description: input.description ?? null,
    color: input.color ?? null,
    createdAt: now,
    updatedAt: now,
  };
  await store.writeJson(suiteFilePath(id), suite);
  return suite;
}

export async function updateSuite(
  id: number,
  input: Partial<{ name: string; description: string | null; color: string | null }>,
): Promise<ProductSuite | null> {
  const existing = await store.readJson<SuiteFile>(suiteFilePath(id));
  if (!existing) return null;
  const updated: SuiteFile = { ...existing, ...input, updatedAt: new Date().toISOString() };
  await store.writeJson(suiteFilePath(id), updated);
  return updated;
}

export async function deleteSuite(id: number): Promise<boolean> {
  const existing = await store.readJson<SuiteFile>(suiteFilePath(id));
  if (!existing) return false;
  await store.deleteFile(suiteFilePath(id));
  return true;
}
