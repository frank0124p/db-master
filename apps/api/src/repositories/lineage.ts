import * as store from "../db/fileStore.js";
import type { LineageEdge, LineageTransformType } from "@schema-studio/core";
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
