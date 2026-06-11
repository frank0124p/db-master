import * as store from "../db/fileStore.js";
import type { ValidationReport, GovernedWideTable, CatalogGraph } from "@schema-studio/core";

// ── ValidationReport ──────────────────────────────────────────────────────────

function reportPath(id: number): string {
  return store.dataPath("governance", "reports", `${id}.json`);
}

export async function listReports(opts?: {
  draftId?: number;
}): Promise<ValidationReport[]> {
  const ids = await store.listJsonFileIds(store.dataPath("governance", "reports"));
  const results: ValidationReport[] = [];
  for (const id of ids) {
    const r = await store.readJson<ValidationReport>(reportPath(id));
    if (!r) continue;
    if (opts?.draftId !== undefined && r.draftId !== opts.draftId) continue;
    results.push(r);
  }
  return results.sort((a, b) => b.id - a.id);
}

export async function getReport(id: number): Promise<ValidationReport | null> {
  return store.readJson<ValidationReport>(reportPath(id));
}

export async function createReport(
  data: Omit<ValidationReport, "id">,
): Promise<ValidationReport> {
  const id = await store.nextId("valReport");
  const report: ValidationReport = { id, ...data };
  await store.writeJson(reportPath(id), report);
  return report;
}

// ── GovernedWideTable ─────────────────────────────────────────────────────────

function governedPath(slug: string): string {
  return store.dataPath("governance", "catalog", "wide-tables", `${slug}.json`);
}

interface GovernedIndex {
  idToSlug: Record<string, string>;
}

async function getGovernedIndex(): Promise<GovernedIndex> {
  return (await store.readJson<GovernedIndex>(
    store.dataPath("governance", "catalog", "_index.json"),
  )) ?? { idToSlug: {} };
}

async function saveGovernedIndex(idx: GovernedIndex): Promise<void> {
  await store.writeJson(store.dataPath("governance", "catalog", "_index.json"), idx);
}

export async function listGoverned(): Promise<GovernedWideTable[]> {
  const idx = await getGovernedIndex();
  const results: GovernedWideTable[] = [];
  for (const slug of Object.values(idx.idToSlug)) {
    const g = await store.readJson<GovernedWideTable>(governedPath(slug));
    if (g) results.push(g);
  }
  return results.sort((a, b) => b.id - a.id);
}

export async function getGoverned(slug: string): Promise<GovernedWideTable | null> {
  return store.readJson<GovernedWideTable>(governedPath(slug));
}

export async function getGovernedById(id: number): Promise<GovernedWideTable | null> {
  const idx = await getGovernedIndex();
  const slug = idx.idToSlug[String(id)];
  if (!slug) return null;
  return getGoverned(slug);
}

export async function saveGoverned(gwt: GovernedWideTable): Promise<void> {
  await store.writeJson(governedPath(gwt.slug), gwt);
  const idx = await getGovernedIndex();
  idx.idToSlug[String(gwt.id)] = gwt.slug;
  await saveGovernedIndex(idx);
}

// ── CatalogGraph ──────────────────────────────────────────────────────────────

const graphPath = () =>
  store.dataPath("governance", "catalog", "graph.json");

export async function getCatalogGraph(): Promise<CatalogGraph | null> {
  return store.readJson<CatalogGraph>(graphPath());
}

export async function saveCatalogGraph(graph: CatalogGraph): Promise<void> {
  await store.writeJson(graphPath(), graph);
}

// ── Markdown export ───────────────────────────────────────────────────────────

export async function saveMarkdownExport(slug: string, md: string): Promise<void> {
  const filePath = store.dataPath("governance", "catalog", "exports", `${slug}.md`);
  const { promises: fs } = await import("fs");
  await import("path").then(async (pathMod) => {
    await fs.mkdir(pathMod.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, md, "utf-8");
  });
}

export async function getMarkdownExport(slug: string): Promise<string | null> {
  const { promises: fs } = await import("fs");
  const filePath = store.dataPath("governance", "catalog", "exports", `${slug}.md`);
  return fs.readFile(filePath, "utf-8").catch(() => null);
}
