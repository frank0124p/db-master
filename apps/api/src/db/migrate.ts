/**
 * One-time migration: converts numeric-ID-based data paths to human-readable slugs.
 *
 * Old structure:
 *   data/_counters.json          → data/_sys/counters.json
 *   data/_index.json             → data/_sys/index.json
 *   data/_ddl-manifest.json      → data/_sys/ddl-manifest.json
 *   data/schemas/{id}/           → data/schemas/{slug}/
 *   data/schemas/{id}/tables/{tableId}.json     → .../tables/{tableName}.json
 *   data/schemas/{id}/versions/{versionId}.json → .../versions/v{N}.json
 *   data/schemas/{id}/wide-tables/{wtId}.json   → .../wide-tables/{nameSlug}.json
 *   data/naming/{id}.json        → data/naming/{stdName}.json
 *
 * Runs at startup; no-ops if old numeric paths are no longer present.
 */

import fs from "fs/promises";
import path from "path";
import {
  DATA_DIR, sysPath, dataPath,
  readJson, writeJson, deleteDir,
  listDirIds, listJsonFileIds,
  Index,
} from "./fileStore.js";
import { toSlug } from "../repositories/schemas.js";

interface LegacyCounters {
  schemas: number; tables: number; fields: number; namingEntries: number;
  versions: number; wideTables: number; wideSources: number; wideColumns: number;
}

interface LegacySchemaMeta {
  id: number; name: string; description: string | null; domain: string;
  createdAt: string; updatedAt: string;
}

interface LegacyTableFile {
  id: number; schemaId: number; name: string; comment: string | null;
  createdAt: string; updatedAt: string;
  fields: { id: number; [key: string]: unknown }[];
}

interface LegacyVersionFile {
  id: number; schemaId: number; versionNo: number;
  message: string | null; createdAt: string;
  snapshot: unknown; diff: unknown;
}

interface LegacyWideTableFile {
  id: number; schemaId: number; name: string;
  [key: string]: unknown;
}

interface LegacyNamingFile {
  id: number; stdName: string;
  [key: string]: unknown;
}

interface LegacyIndex {
  tableSchema?: Record<string, number>;
  fieldTable?: Record<string, number>;
  wideTableSchema?: Record<string, number>;
}

function makeSlugUnique(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

export async function runMigration(): Promise<void> {
  const oldCountersPath = dataPath("_counters.json");
  const countersExist = await fs.access(oldCountersPath).then(() => true).catch(() => false);
  if (!countersExist) return; // already migrated or no data

  console.warn("[migrate] Starting data path migration to human-readable slugs...");

  // ── Step 1: Move sys files ─────────────────────────────────────────────────
  const counters = await readJson<LegacyCounters>(oldCountersPath);
  if (counters) {
    await writeJson(sysPath("counters.json"), counters);
    await fs.unlink(oldCountersPath).catch(() => {});
  }

  const oldManifestPath = dataPath("_ddl-manifest.json");
  const manifest = await readJson<unknown>(oldManifestPath);
  if (manifest) {
    await writeJson(sysPath("ddl-manifest.json"), manifest);
    await fs.unlink(oldManifestPath).catch(() => {});
  }

  // Load old index
  const oldIndexPath = dataPath("_index.json");
  const oldIndex = (await readJson<LegacyIndex>(oldIndexPath)) ?? {};

  // ── Step 2: Build new index ────────────────────────────────────────────────
  const newIndex: Index = {
    tableSchema: oldIndex.tableSchema ?? {},
    fieldTable: oldIndex.fieldTable ?? {},
    wideTableSchema: oldIndex.wideTableSchema ?? {},
    schemaIdToSlug: {},
    tableIdToName: {},
    namingIdToStdName: {},
    wideTableIdToName: {},
  };

  // ── Step 3: Migrate schemas ────────────────────────────────────────────────
  const schemaIds = await listDirIds(dataPath("schemas"));
  const usedSlugs = new Set<string>();

  for (const schemaId of schemaIds) {
    const oldSchemaDir = dataPath("schemas", String(schemaId));
    const meta = await readJson<LegacySchemaMeta>(path.join(oldSchemaDir, "meta.json"));
    if (!meta) continue;

    const slug = makeSlugUnique(toSlug(meta.name), usedSlugs);
    usedSlugs.add(slug);
    newIndex.schemaIdToSlug[String(schemaId)] = slug;

    const newSchemaDir = dataPath("schemas", slug);
    await fs.mkdir(newSchemaDir, { recursive: true });

    // Copy meta.json
    await writeJson(path.join(newSchemaDir, "meta.json"), meta);

    // ── Tables ──────────────────────────────────────────────────────────────
    const oldTablesDir = path.join(oldSchemaDir, "tables");
    const tableIds = await listJsonFileIds(oldTablesDir);
    const newTablesDir = path.join(newSchemaDir, "tables");
    await fs.mkdir(newTablesDir, { recursive: true });

    for (const tableId of tableIds) {
      const oldTablePath = path.join(oldTablesDir, `${tableId}.json`);
      const tbl = await readJson<LegacyTableFile>(oldTablePath);
      if (!tbl) continue;
      const tableName = tbl.name;
      newIndex.tableIdToName[String(tableId)] = tableName;
      await writeJson(path.join(newTablesDir, `${tableName}.json`), tbl);
    }

    // ── Versions ─────────────────────────────────────────────────────────────
    const oldVersionsDir = path.join(oldSchemaDir, "versions");
    const versionIds = await listJsonFileIds(oldVersionsDir);
    if (versionIds.length > 0) {
      const newVersionsDir = path.join(newSchemaDir, "versions");
      await fs.mkdir(newVersionsDir, { recursive: true });
      for (const versionId of versionIds) {
        const oldVersionPath = path.join(oldVersionsDir, `${versionId}.json`);
        const v = await readJson<LegacyVersionFile>(oldVersionPath);
        if (!v) continue;
        await writeJson(path.join(newVersionsDir, `v${v.versionNo}.json`), v);
      }
    }

    // ── Wide tables ───────────────────────────────────────────────────────────
    const oldWideTablesDir = path.join(oldSchemaDir, "wide-tables");
    const wtIds = await listJsonFileIds(oldWideTablesDir);
    if (wtIds.length > 0) {
      const newWideTablesDir = path.join(newSchemaDir, "wide-tables");
      await fs.mkdir(newWideTablesDir, { recursive: true });
      const usedWtSlugs = new Set<string>();
      for (const wtId of wtIds) {
        const oldWtPath = path.join(oldWideTablesDir, `${wtId}.json`);
        const wt = await readJson<LegacyWideTableFile>(oldWtPath);
        if (!wt) continue;
        const wtSlug = makeSlugUnique(toSlug(wt.name), usedWtSlugs);
        usedWtSlugs.add(wtSlug);
        newIndex.wideTableIdToName[String(wtId)] = wtSlug;
        await writeJson(path.join(newWideTablesDir, `${wtSlug}.json`), wt);
      }
    }

    // Remove old numeric schema directory
    await deleteDir(oldSchemaDir);
  }

  // ── Step 4: Migrate naming entries ────────────────────────────────────────
  const namingDir = dataPath("naming");
  const namingIds = await listJsonFileIds(namingDir);
  for (const id of namingIds) {
    const oldPath = path.join(namingDir, `${id}.json`);
    const entry = await readJson<LegacyNamingFile>(oldPath);
    if (!entry) continue;
    const stdName = entry.stdName as string;
    newIndex.namingIdToStdName[String(id)] = stdName;
    await writeJson(path.join(namingDir, `${stdName}.json`), entry);
    await fs.unlink(oldPath).catch(() => {});
  }

  // ── Step 5: Write new index + remove old ──────────────────────────────────
  await writeJson(sysPath("index.json"), newIndex);
  await fs.unlink(oldIndexPath).catch(() => {});

  console.warn("[migrate] Migration complete.");
}
