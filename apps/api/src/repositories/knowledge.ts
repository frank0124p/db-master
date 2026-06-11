import * as store from "../db/fileStore.js";
import type { SourceDoc, ConceptCard, BusinessRule } from "@schema-studio/core";

// ── Path helpers ──────────────────────────────────────────────────────────────

function sourceDocPath(slug: string): string {
  return store.dataPath("knowledge", "sources", `${slug}.json`);
}
function sourceDocPathById(id: number): string {
  return store.dataPath("knowledge", "sources", `_id_${id}.ref`);
}
function conceptPath(slug: string): string {
  return store.dataPath("knowledge", "concepts", `${slug}.json`);
}
function bizRulePath(slug: string): string {
  return store.dataPath("knowledge", "business-rules", `${slug}.json`);
}

// ── SourceDoc ──────────────────────────────────────────────────────────────────

interface SourceDocIndex {
  idToSlug: Record<string, string>;
}

async function getSourceDocIndex(): Promise<SourceDocIndex> {
  return (await store.readJson<SourceDocIndex>(
    store.dataPath("knowledge", "sources", "_index.json"),
  )) ?? { idToSlug: {} };
}

async function saveSourceDocIndex(idx: SourceDocIndex): Promise<void> {
  await store.writeJson(store.dataPath("knowledge", "sources", "_index.json"), idx);
}

export async function listSourceDocs(): Promise<SourceDoc[]> {
  const idx = await getSourceDocIndex();
  const docs: SourceDoc[] = [];
  for (const slug of Object.values(idx.idToSlug)) {
    const doc = await store.readJson<SourceDoc>(sourceDocPath(slug));
    if (doc) docs.push(doc);
  }
  return docs.sort((a, b) => a.id - b.id);
}

export async function getSourceDoc(id: number): Promise<SourceDoc | null> {
  const idx = await getSourceDocIndex();
  const slug = idx.idToSlug[String(id)];
  if (!slug) return null;
  return store.readJson<SourceDoc>(sourceDocPath(slug));
}

export async function createSourceDoc(
  input: Omit<SourceDoc, "id" | "slug" | "createdAt">,
  slug: string,
): Promise<SourceDoc> {
  const id = await store.nextId("knowledge");
  const now = new Date().toISOString();
  const doc: SourceDoc = { id, slug, ...input, createdAt: now };
  await store.writeJson(sourceDocPath(slug), doc);
  const idx = await getSourceDocIndex();
  idx.idToSlug[String(id)] = slug;
  await saveSourceDocIndex(idx);
  return doc;
}

export async function deleteSourceDoc(id: number): Promise<void> {
  const idx = await getSourceDocIndex();
  const slug = idx.idToSlug[String(id)];
  if (!slug) return;
  await store.deleteFile(sourceDocPath(slug));
  delete idx.idToSlug[String(id)];
  await saveSourceDocIndex(idx);
}

// ── ConceptCard ────────────────────────────────────────────────────────────────

interface ConceptIndex {
  idToSlug: Record<string, string>;
}

async function getConceptIndex(): Promise<ConceptIndex> {
  return (await store.readJson<ConceptIndex>(
    store.dataPath("knowledge", "concepts", "_index.json"),
  )) ?? { idToSlug: {} };
}

async function saveConceptIndex(idx: ConceptIndex): Promise<void> {
  await store.writeJson(store.dataPath("knowledge", "concepts", "_index.json"), idx);
}

export async function listConcepts(opts?: {
  status?: ConceptCard["status"];
  domain?: string;
  q?: string;
}): Promise<ConceptCard[]> {
  const idx = await getConceptIndex();
  const results: ConceptCard[] = [];
  for (const slug of Object.values(idx.idToSlug)) {
    const c = await store.readJson<ConceptCard>(conceptPath(slug));
    if (!c) continue;
    if (opts?.status && c.status !== opts.status) continue;
    if (opts?.domain && c.domain !== opts.domain) continue;
    if (opts?.q) {
      const q = opts.q.toLowerCase();
      const match =
        c.name.toLowerCase().includes(q) ||
        c.stdName.toLowerCase().includes(q) ||
        c.aliases.some(a => a.toLowerCase().includes(q));
      if (!match) continue;
    }
    results.push(c);
  }
  return results.sort((a, b) => a.id - b.id);
}

export async function getConcept(id: number): Promise<ConceptCard | null> {
  const idx = await getConceptIndex();
  const slug = idx.idToSlug[String(id)];
  if (!slug) return null;
  return store.readJson<ConceptCard>(conceptPath(slug));
}

export async function createConcept(
  data: Omit<ConceptCard, "id" | "createdAt" | "updatedAt">,
): Promise<ConceptCard> {
  const id = await store.nextId("concept");
  const now = new Date().toISOString();
  const card: ConceptCard = { id, ...data, createdAt: now, updatedAt: now };
  await store.writeJson(conceptPath(card.slug), card);
  const idx = await getConceptIndex();
  idx.idToSlug[String(id)] = card.slug;
  await saveConceptIndex(idx);
  return card;
}

export async function updateConcept(
  id: number,
  patch: Partial<Omit<ConceptCard, "id" | "createdAt">>,
): Promise<ConceptCard | null> {
  const idx = await getConceptIndex();
  const slug = idx.idToSlug[String(id)];
  if (!slug) return null;
  const existing = await store.readJson<ConceptCard>(conceptPath(slug));
  if (!existing) return null;
  const updated: ConceptCard = {
    ...existing,
    ...patch,
    id,
    updatedAt: new Date().toISOString(),
  };
  await store.writeJson(conceptPath(updated.slug), updated);
  if (updated.slug !== slug) {
    await store.deleteFile(conceptPath(slug));
    idx.idToSlug[String(id)] = updated.slug;
    await saveConceptIndex(idx);
  }
  return updated;
}

// ── BusinessRule ──────────────────────────────────────────────────────────────

interface BizRuleIndex {
  idToSlug: Record<string, string>;
}

async function getBizRuleIndex(): Promise<BizRuleIndex> {
  return (await store.readJson<BizRuleIndex>(
    store.dataPath("knowledge", "business-rules", "_index.json"),
  )) ?? { idToSlug: {} };
}

async function saveBizRuleIndex(idx: BizRuleIndex): Promise<void> {
  await store.writeJson(
    store.dataPath("knowledge", "business-rules", "_index.json"),
    idx,
  );
}

export async function listBusinessRules(opts?: {
  status?: BusinessRule["status"];
}): Promise<BusinessRule[]> {
  const idx = await getBizRuleIndex();
  const results: BusinessRule[] = [];
  for (const slug of Object.values(idx.idToSlug)) {
    const r = await store.readJson<BusinessRule>(bizRulePath(slug));
    if (!r) continue;
    if (opts?.status && r.status !== opts.status) continue;
    results.push(r);
  }
  return results.sort((a, b) => a.id - b.id);
}

export async function getBusinessRule(id: number): Promise<BusinessRule | null> {
  const idx = await getBizRuleIndex();
  const slug = idx.idToSlug[String(id)];
  if (!slug) return null;
  return store.readJson<BusinessRule>(bizRulePath(slug));
}

export async function createBusinessRule(
  data: Omit<BusinessRule, "id" | "createdAt" | "updatedAt">,
): Promise<BusinessRule> {
  const id = await store.nextId("bizRule");
  const now = new Date().toISOString();
  const rule: BusinessRule = { id, ...data, createdAt: now, updatedAt: now };
  await store.writeJson(bizRulePath(rule.slug), rule);
  const idx = await getBizRuleIndex();
  idx.idToSlug[String(id)] = rule.slug;
  await saveBizRuleIndex(idx);
  return rule;
}

export async function updateBusinessRule(
  id: number,
  patch: Partial<Omit<BusinessRule, "id" | "createdAt">>,
): Promise<BusinessRule | null> {
  const idx = await getBizRuleIndex();
  const slug = idx.idToSlug[String(id)];
  if (!slug) return null;
  const existing = await store.readJson<BusinessRule>(bizRulePath(slug));
  if (!existing) return null;
  const updated: BusinessRule = {
    ...existing,
    ...patch,
    id,
    updatedAt: new Date().toISOString(),
  };
  await store.writeJson(bizRulePath(updated.slug), updated);
  if (updated.slug !== slug) {
    await store.deleteFile(bizRulePath(slug));
    idx.idToSlug[String(id)] = updated.slug;
    await saveBizRuleIndex(idx);
  }
  return updated;
}
