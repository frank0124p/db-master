import * as store from "../db/fileStore.js";
import type { LineageEdge, LineageTransformType, LineageNodeKind, LineageSource } from "@schema-studio/core";
import { randomUUID } from "crypto";

const FILE = () => store.sysPath("lineage.json");

interface LineageStore { edges: LineageEdge[] }

async function read(): Promise<LineageStore> {
  const raw = await store.readJson<LineageStore>(FILE());
  return raw ?? { edges: [] };
}

async function write(data: LineageStore): Promise<void> {
  await store.writeJson(FILE(), data);
}

export async function listEdges(): Promise<LineageEdge[]> {
  return (await read()).edges;
}

export async function addEdge(edge: Omit<LineageEdge, "id" | "createdAt">): Promise<LineageEdge> {
  const s = await read();
  // Deduplicate: skip if an identical from→to edge already exists
  const dupe = s.edges.find(e =>
    e.fromSchemaId === edge.fromSchemaId && e.fromTableId === edge.fromTableId &&
    e.toSchemaId === edge.toSchemaId && e.toTableId === edge.toTableId
  );
  if (dupe) return dupe;
  const newEdge: LineageEdge = { ...edge, id: randomUUID(), createdAt: new Date().toISOString() };
  s.edges.push(newEdge);
  await write(s);
  return newEdge;
}

export async function removeEdge(id: string): Promise<boolean> {
  const s = await read();
  const before = s.edges.length;
  s.edges = s.edges.filter(e => e.id !== id);
  if (s.edges.length === before) return false;
  await write(s);
  return true;
}

// ── Helper used by auto-recording hooks ──────────────────────────────────────

export async function recordEdge(params: {
  fromSchemaId: number; fromSchemaName: string; fromDomain: string;
  fromTableId: number; fromTableName: string; fromKind?: LineageNodeKind;
  toSchemaId: number; toSchemaName: string; toDomain: string;
  toTableId: number; toTableName: string; toKind?: LineageNodeKind;
  transformType: LineageTransformType;
  description: string;
  source: LineageSource;
}): Promise<void> {
  await addEdge({
    ...params,
    fromKind: params.fromKind ?? "table",
    toKind: params.toKind ?? "table",
  });
}
