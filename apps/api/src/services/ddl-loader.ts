import fs from "fs/promises";
import path from "path";
import { createSchema, getSchemaByName } from "../repositories/schemas.js";
import { importDDL } from "../repositories/ddl-import.js";
import { DATA_DIR, sysPath, readJson, writeJson } from "../db/fileStore.js";

const DDL_INPUT_DIR = path.join(DATA_DIR, "ddl");
const MANIFEST_FILE = sysPath("ddl-manifest.json");

interface ManifestEntry {
  schemaId: number;
  mtimeMs: number;
  importedAt: string;
}

type Manifest = Record<string, ManifestEntry>;

export async function loadDdlFiles(): Promise<void> {
  let files: string[];
  try {
    const entries = await fs.readdir(DDL_INPUT_DIR);
    files = entries.filter(f => f.endsWith(".sql"));
  } catch {
    return; // ddl-input directory doesn't exist yet
  }

  if (files.length === 0) return;

  const manifest = (await readJson<Manifest>(MANIFEST_FILE)) ?? {};
  let changed = false;

  for (const file of files) {
    const filePath = path.join(DDL_INPUT_DIR, file);
    const stat = await fs.stat(filePath);
    const prev = manifest[file];

    if (prev && prev.mtimeMs === stat.mtimeMs) continue; // unchanged

    const sql = await fs.readFile(filePath, "utf-8");
    // Convert filename to human-readable schema name: "plm-core.sql" → "PLM Core"
    const schemaName = file
      .replace(/\.sql$/i, "")
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, c => c.toUpperCase());

    let schemaId: number;
    const existing = await getSchemaByName(schemaName);
    if (existing) {
      schemaId = existing.id;
    } else {
      const created = await createSchema({ name: schemaName, description: `從 ${file} 匯入`, domain: "semiconductor" });
      schemaId = created.id;
    }

    const result = await importDDL(schemaId, sql);
    manifest[file] = { schemaId, mtimeMs: stat.mtimeMs, importedAt: new Date().toISOString() };
    changed = true;

    console.warn(`[ddl-loader] ${file} → schema #${schemaId} (${result.tablesCreated} tables, ${result.fieldsCreated} fields)`);
  }

  if (changed) await writeJson(MANIFEST_FILE, manifest);
}
