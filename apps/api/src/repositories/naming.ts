import { NotFoundError, type NamingEntry } from "@schema-studio/core";
import * as store from "../db/fileStore.js";
import { z } from "zod";

export const CreateNamingEntryInput = z.object({
  concept: z.string().min(1).max(100),
  std_name: z.string().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/, "Must be snake_case"),
  aliases: z.array(z.string()).default([]),
  domain: z.string().default("semiconductor"),
  tags: z.array(z.string()).default([]),
  ai_description: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
});
export type CreateNamingEntryInput = z.infer<typeof CreateNamingEntryInput>;

interface NamingFile {
  id: number; concept: string; stdName: string; aliases: string[];
  domain: string; tags: string[]; aiDescription: string | null;
  description: string | null; createdAt: string; updatedAt: string;
}

function namingFile(id: number) { return store.dataPath("naming", `${id}.json`); }

function toEntry(f: NamingFile): NamingEntry {
  return {
    id: f.id, concept: f.concept, stdName: f.stdName, aliases: f.aliases,
    domain: f.domain, tags: f.tags, aiDescription: f.aiDescription,
    description: f.description, updatedAt: f.updatedAt,
  };
}

export async function listNamingEntries(domain?: string): Promise<NamingEntry[]> {
  const ids = await store.listJsonFileIds(store.dataPath("naming"));
  const entries: NamingEntry[] = [];
  for (const id of ids) {
    const f = await store.readJson<NamingFile>(namingFile(id));
    if (!f) continue;
    if (domain && f.domain !== domain) continue;
    entries.push(toEntry(f));
  }
  return entries.sort((a, b) => a.stdName.localeCompare(b.stdName));
}

export async function getNamingEntry(id: number): Promise<NamingEntry> {
  const f = await store.readJson<NamingFile>(namingFile(id));
  if (!f) throw new NotFoundError("NamingEntry", id);
  return toEntry(f);
}

export async function createNamingEntry(input: CreateNamingEntryInput): Promise<NamingEntry> {
  const id = await store.nextId("namingEntries");
  const now = new Date().toISOString();
  const f: NamingFile = {
    id, concept: input.concept, stdName: input.std_name,
    aliases: input.aliases ?? [], domain: input.domain ?? "semiconductor",
    tags: input.tags ?? [], aiDescription: input.ai_description ?? null,
    description: input.description ?? null, createdAt: now, updatedAt: now,
  };
  await store.writeJson(namingFile(id), f);
  return toEntry(f);
}

export async function updateNamingEntry(id: number, input: Partial<CreateNamingEntryInput>): Promise<NamingEntry> {
  const f = await store.readJson<NamingFile>(namingFile(id));
  if (!f) throw new NotFoundError("NamingEntry", id);
  if (input.concept !== undefined) f.concept = input.concept;
  if (input.std_name !== undefined) f.stdName = input.std_name;
  if (input.aliases !== undefined) f.aliases = input.aliases;
  if (input.domain !== undefined) f.domain = input.domain;
  if (input.tags !== undefined) f.tags = input.tags;
  if (input.ai_description !== undefined) f.aiDescription = input.ai_description ?? null;
  if (input.description !== undefined) f.description = input.description ?? null;
  f.updatedAt = new Date().toISOString();
  await store.writeJson(namingFile(id), f);
  return toEntry(f);
}

export async function deleteNamingEntry(id: number): Promise<void> {
  const f = await store.readJson<NamingFile>(namingFile(id));
  if (!f) throw new NotFoundError("NamingEntry", id);
  await store.deleteFile(namingFile(id));
}
