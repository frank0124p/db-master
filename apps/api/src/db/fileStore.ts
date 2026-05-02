import { fileURLToPath } from "url";
import path from "path";
import fs from "fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(__dirname, "../../../../data");

export function dataPath(...segments: string[]): string {
  return path.join(DATA_DIR, ...segments);
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function writeJson(filePath: string, data: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export async function deleteFile(filePath: string): Promise<void> {
  await fs.unlink(filePath).catch((e: NodeJS.ErrnoException) => {
    if (e.code !== "ENOENT") throw e;
  });
}

export async function deleteDir(dirPath: string): Promise<void> {
  await fs.rm(dirPath, { recursive: true, force: true });
}

// List numeric IDs from JSON files in a directory (e.g. naming/1.json → 1)
export async function listJsonFileIds(dir: string): Promise<number[]> {
  try {
    const files = await fs.readdir(dir);
    return files
      .filter(f => f.endsWith(".json") && !f.startsWith("_"))
      .map(f => parseInt(f.replace(".json", ""), 10))
      .filter(n => !isNaN(n))
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

// List numeric IDs from subdirectories (e.g. schemas/1/ → 1)
export async function listDirIds(dir: string): Promise<number[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory())
      .map(e => parseInt(e.name, 10))
      .filter(n => !isNaN(n))
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

// ── Counters ───────────────────────────────────────────────────────────────────

interface Counters {
  schemas: number;
  tables: number;
  fields: number;
  namingEntries: number;
  versions: number;
  wideTables: number;
  wideSources: number;
  wideColumns: number;
}

const defaultCounters: Counters = {
  schemas: 0, tables: 0, fields: 0, namingEntries: 0,
  versions: 0, wideTables: 0, wideSources: 0, wideColumns: 0,
};

export async function nextId(key: keyof Counters): Promise<number> {
  const file = dataPath("_counters.json");
  const counters = (await readJson<Counters>(file)) ?? { ...defaultCounters };
  counters[key]++;
  await writeJson(file, counters);
  return counters[key];
}

// ── Index (reverse lookups) ────────────────────────────────────────────────────

interface Index {
  tableSchema: Record<string, number>;     // tableId → schemaId
  fieldTable: Record<string, number>;      // fieldId → tableId
  wideTableSchema: Record<string, number>; // wideTableId → schemaId
}

const defaultIndex: Index = { tableSchema: {}, fieldTable: {}, wideTableSchema: {} };

export async function getIndex(): Promise<Index> {
  return (await readJson<Index>(dataPath("_index.json"))) ?? { ...defaultIndex };
}

export async function indexSet(key: keyof Index, id: number, value: number): Promise<void> {
  const idx = await getIndex();
  idx[key][String(id)] = value;
  await writeJson(dataPath("_index.json"), idx);
}

export async function indexDelete(key: keyof Index, id: number): Promise<void> {
  const idx = await getIndex();
  delete idx[key][String(id)];
  await writeJson(dataPath("_index.json"), idx);
}

export async function indexGet(key: keyof Index, id: number): Promise<number | null> {
  const idx = await getIndex();
  const val = idx[key][String(id)];
  return val !== undefined ? val : null;
}

// Bulk index delete for a set of IDs (single write)
export async function indexDeleteMany(key: keyof Index, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const idx = await getIndex();
  for (const id of ids) delete idx[key][String(id)];
  await writeJson(dataPath("_index.json"), idx);
}
