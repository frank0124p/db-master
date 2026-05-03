import { fileURLToPath } from "url";
import path from "path";
import fs from "fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(__dirname, "../../../../data");
const SYS = "_sys";

export function dataPath(...segments: string[]): string {
  return path.join(DATA_DIR, ...segments);
}

export function sysPath(...segments: string[]): string {
  return path.join(DATA_DIR, SYS, ...segments);
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

// List numeric IDs from JSON files in a directory (used by migration)
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

// List slug-named JSON files in a directory (e.g. "lot_id.json" → "lot_id")
export async function listJsonFileSlugs(dir: string): Promise<string[]> {
  try {
    const files = await fs.readdir(dir);
    return files
      .filter(f => f.endsWith(".json") && !f.startsWith("_"))
      .map(f => f.slice(0, -5))
      .sort();
  } catch {
    return [];
  }
}

// List numeric IDs from subdirectories (used by migration)
export async function listDirIds(dir: string): Promise<number[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory() && !isNaN(parseInt(e.name, 10)))
      .map(e => parseInt(e.name, 10))
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

// List slug-named subdirectories (excludes _sys and numeric dirs)
export async function listDirSlugs(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory() && !e.name.startsWith("_") && isNaN(parseInt(e.name, 10)))
      .map(e => e.name)
      .sort();
  } catch {
    return [];
  }
}

// ── Counters ─────────────────────────────────────────────────────────────────

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
  const file = sysPath("counters.json");
  const counters = (await readJson<Counters>(file)) ?? { ...defaultCounters };
  counters[key]++;
  await writeJson(file, counters);
  return counters[key];
}

// ── Index (reverse lookups + slug maps) ───────────────────────────────────────

export interface Index {
  tableSchema: Record<string, number>;       // tableId → schemaId
  fieldTable: Record<string, number>;        // fieldId → tableId
  wideTableSchema: Record<string, number>;   // wideTableId → schemaId
  schemaIdToSlug: Record<string, string>;    // schemaId → folder slug
  tableIdToName: Record<string, string>;     // tableId → tableName (file stem)
  namingIdToStdName: Record<string, string>; // namingId → stdName (file stem)
  wideTableIdToName: Record<string, string>; // wideTableId → name slug (file stem)
}

const defaultIndex: Index = {
  tableSchema: {}, fieldTable: {}, wideTableSchema: {},
  schemaIdToSlug: {}, tableIdToName: {}, namingIdToStdName: {},
  wideTableIdToName: {},
};

export async function getIndex(): Promise<Index> {
  const raw = await readJson<Partial<Index>>(sysPath("index.json"));
  return { ...defaultIndex, ...(raw ?? {}) };
}

export async function writeIndex(idx: Index): Promise<void> {
  await writeJson(sysPath("index.json"), idx);
}

export async function indexSet(key: "tableSchema" | "fieldTable" | "wideTableSchema", id: number, value: number): Promise<void> {
  const idx = await getIndex();
  idx[key][String(id)] = value;
  await writeIndex(idx);
}

export async function indexSetStr(
  key: "schemaIdToSlug" | "tableIdToName" | "namingIdToStdName" | "wideTableIdToName",
  id: number,
  value: string,
): Promise<void> {
  const idx = await getIndex();
  idx[key][String(id)] = value;
  await writeIndex(idx);
}

export async function indexDelete(key: keyof Index, id: number): Promise<void> {
  const idx = await getIndex();
  delete (idx[key] as Record<string, unknown>)[String(id)];
  await writeIndex(idx);
}

export async function indexGet(key: "tableSchema" | "fieldTable" | "wideTableSchema", id: number): Promise<number | null> {
  const idx = await getIndex();
  const val = idx[key][String(id)];
  return val !== undefined ? val : null;
}

export async function indexGetStr(
  key: "schemaIdToSlug" | "tableIdToName" | "namingIdToStdName" | "wideTableIdToName",
  id: number,
): Promise<string | null> {
  const idx = await getIndex();
  const val = idx[key][String(id)];
  return val !== undefined ? val : null;
}

export async function indexDeleteMany(key: keyof Index, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const idx = await getIndex();
  for (const id of ids) delete (idx[key] as Record<string, unknown>)[String(id)];
  await writeIndex(idx);
}
