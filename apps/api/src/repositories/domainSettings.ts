import * as store from "../db/fileStore.js";

const FILE = () => store.dataPath("settings", "domains.json");

export interface DomainDef {
  id: string;    // unique key; matches schema.domain string
  name: string;  // display label
  order: number;
  color: string | null;
}

const DEFAULTS: DomainDef[] = [
  { id: "semiconductor", name: "半導體製造", order: 0, color: null },
  { id: "general",       name: "通用",       order: 1, color: null },
];

export async function listDomains(): Promise<DomainDef[]> {
  const raw = await store.readJson<{ domains: DomainDef[] }>(FILE());
  return (raw?.domains ?? DEFAULTS).sort((a, b) => a.order - b.order);
}

async function save(domains: DomainDef[]): Promise<void> {
  await store.writeJson(FILE(), { domains });
}

export async function createDomain(body: { name: string; id?: string; color?: string | null }): Promise<DomainDef> {
  const domains = await listDomains();
  const id = (body.id?.trim() || body.name.trim().toLowerCase().replace(/\s+/g, "_")).replace(/[^a-z0-9_-]/g, "");
  if (domains.find(d => d.id === id)) throw new Error(`Domain id "${id}" already exists`);
  const entry: DomainDef = { id, name: body.name.trim(), order: domains.length, color: body.color ?? null };
  await save([...domains, entry]);
  return entry;
}

export async function updateDomain(id: string, patch: Partial<Pick<DomainDef, "name" | "order" | "color">>): Promise<DomainDef> {
  const domains = await listDomains();
  const idx = domains.findIndex(d => d.id === id);
  if (idx === -1) throw new Error(`Domain "${id}" not found`);
  const updated = { ...domains[idx]!, ...patch };
  domains[idx] = updated;
  await save(domains);
  return updated;
}

export async function deleteDomain(id: string): Promise<void> {
  const domains = await listDomains();
  await save(domains.filter(d => d.id !== id));
}

export async function reorderDomains(ids: string[]): Promise<DomainDef[]> {
  const domains = await listDomains();
  const map = new Map(domains.map(d => [d.id, d]));
  const reordered = ids.map((id, i) => ({ ...map.get(id)!, order: i })).filter(Boolean);
  const rest = domains.filter(d => !ids.includes(d.id)).map((d, i) => ({ ...d, order: ids.length + i }));
  const merged = [...reordered, ...rest];
  await save(merged);
  return merged.sort((a, b) => a.order - b.order);
}
