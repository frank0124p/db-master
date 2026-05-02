import { z } from "zod";
import * as store from "../db/fileStore.js";
import { wideTableFile, wideTablesDir, loadTables } from "./schemas.js";

// ── Types ──────────────────────────────────────────────────────────────────────

export type WideTableSummary = {
  id: number; schemaId: number; name: string; description: string | null;
  createdAt: Date; updatedAt: Date;
};

export type WideTableSource = {
  id: number; wideTableId: number; tableId: number; tableName: string;
  colPrefix: string | null; joinType: "BASE" | "INNER" | "LEFT";
  joinCondition: string | null; position: number;
};

export type WideTableColumn = {
  id: number; wideTableId: number; sourceId: number; fieldId: number;
  fieldName: string; fieldType: string; tableName: string;
  outputName: string; included: boolean; position: number;
};

export type WideTableDetail = WideTableSummary & {
  sources: WideTableSource[];
  columns: WideTableColumn[];
};

export interface WideTableFile {
  id: number; schemaId: number; name: string; description: string | null;
  createdAt: string; updatedAt: string;
  sources: WideTableSource[];
  columns: WideTableColumn[];
}

// ── Input validation ───────────────────────────────────────────────────────────

export const CreateWideTableInput = z.object({
  name: z.string().min(1).max(128),
  description: z.string().optional(),
  sources: z.array(z.object({
    tableId: z.number(),
    colPrefix: z.string().max(32).nullable().optional(),
    joinType: z.enum(["BASE", "INNER", "LEFT"]),
    joinCondition: z.string().max(512).nullable().optional(),
    position: z.number().int().min(0),
  })),
  columns: z.array(z.object({
    sourcePosition: z.number().int().min(0),
    fieldId: z.number(),
    outputName: z.string().min(1).max(128),
    included: z.boolean(),
    position: z.number().int().min(0),
  })),
});
export type CreateWideTableInput = z.infer<typeof CreateWideTableInput>;

// ── CRUD ───────────────────────────────────────────────────────────────────────

function toSummary(f: WideTableFile): WideTableSummary {
  return { id: f.id, schemaId: f.schemaId, name: f.name, description: f.description,
    createdAt: new Date(f.createdAt), updatedAt: new Date(f.updatedAt) };
}

export async function listWideTables(schemaId: number): Promise<WideTableSummary[]> {
  const ids = await store.listJsonFileIds(wideTablesDir(schemaId));
  const result: WideTableSummary[] = [];
  for (const id of ids) {
    const f = await store.readJson<WideTableFile>(wideTableFile(schemaId, id));
    if (!f) continue;
    result.push(toSummary(f));
  }
  return result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getWideTable(id: number): Promise<WideTableDetail | null> {
  const schemaId = await store.indexGet("wideTableSchema", id);
  if (schemaId === null) return null;
  const f = await store.readJson<WideTableFile>(wideTableFile(schemaId, id));
  if (!f) return null;
  return { ...toSummary(f), sources: f.sources, columns: f.columns };
}

export async function createWideTable(schemaId: number, input: CreateWideTableInput): Promise<WideTableDetail> {
  const wtId = await store.nextId("wideTables");
  const now = new Date().toISOString();

  // Resolve sourceIds by position
  const sourceIdByPosition = new Map<number, number>();
  const sources: WideTableSource[] = [];

  for (const src of input.sources) {
    const srcId = await store.nextId("wideSources");
    sourceIdByPosition.set(src.position, srcId);
    // Look up tableName from the schema's table files
    const tables = await loadTables(schemaId);
    const tbl = tables.find(t => t.id === src.tableId);
    sources.push({
      id: srcId, wideTableId: wtId, tableId: src.tableId,
      tableName: tbl?.name ?? String(src.tableId),
      colPrefix: src.colPrefix ?? null,
      joinType: src.joinType,
      joinCondition: src.joinCondition ?? null,
      position: src.position,
    });
  }

  const columns: WideTableColumn[] = [];
  for (const col of input.columns) {
    const srcId = sourceIdByPosition.get(col.sourcePosition);
    if (!srcId) continue;
    const colId = await store.nextId("wideColumns");
    // Look up fieldName and fieldType
    const tables = await loadTables(schemaId);
    let fieldName = String(col.fieldId);
    let fieldType = "VARCHAR(255)";
    let tableName = "";
    outer: for (const t of tables) {
      for (const f of t.fields) {
        if (f.id === col.fieldId) {
          fieldName = f.name;
          fieldType = f.dataType;
          tableName = t.name;
          break outer;
        }
      }
    }
    columns.push({
      id: colId, wideTableId: wtId, sourceId: srcId, fieldId: col.fieldId,
      fieldName, fieldType, tableName, outputName: col.outputName,
      included: col.included, position: col.position,
    });
  }

  const wf: WideTableFile = {
    id: wtId, schemaId, name: input.name, description: input.description ?? null,
    createdAt: now, updatedAt: now, sources, columns,
  };
  await store.writeJson(wideTableFile(schemaId, wtId), wf);
  await store.indexSet("wideTableSchema", wtId, schemaId);
  return { ...toSummary(wf), sources, columns };
}

export async function deleteWideTable(id: number): Promise<void> {
  const schemaId = await store.indexGet("wideTableSchema", id);
  if (schemaId === null) return;
  await store.deleteFile(wideTableFile(schemaId, id));
  await store.indexDelete("wideTableSchema", id);
}

// ── Preview (stateless, no DB) ─────────────────────────────────────────────────

export type PreviewSource = {
  tableId: number; tableName: string; colPrefix: string;
  joinType: "BASE" | "INNER" | "LEFT"; joinCondition: string | null;
  position: number;
};

export type PreviewColumn = {
  sourcePosition: number; tableId: number; tableName: string;
  fieldId: number; fieldName: string; dataType: string;
  outputName: string; included: boolean; hasConflict: boolean;
};

export type WideTablePreview = {
  sources: PreviewSource[];
  columns: PreviewColumn[];
  sql: string;
};

interface FieldInfo { id: number; name: string; data_type: string; is_primary_key: boolean; }
interface TableInfo { id: number; name: string; }

function fkMatchScore(fieldStem: string, tableName: string): number {
  if (tableName === fieldStem) return 1.0;
  if (tableName === fieldStem + "s") return 0.95;
  if (tableName === fieldStem + "es") return 0.9;
  if (tableName.startsWith(fieldStem + "_")) return 0.7;
  return 0;
}

type FkEdge = { fromTable: TableInfo; fromField: string; toTable: TableInfo; score: number; };

function buildFkEdges(tables: TableInfo[], fieldsByTable: Map<number, FieldInfo[]>): FkEdge[] {
  const edges: FkEdge[] = [];
  for (const tbl of tables) {
    const fields = fieldsByTable.get(tbl.id) ?? [];
    for (const f of fields) {
      if (!f.name.endsWith("_id") || f.is_primary_key) continue;
      const stem = f.name.slice(0, -3);
      if (stem === tbl.name || stem === "parent") continue;
      for (const candidate of tables) {
        if (candidate.id === tbl.id) continue;
        const score = fkMatchScore(stem, candidate.name);
        if (score > 0) edges.push({ fromTable: tbl, fromField: f.name, toTable: candidate, score });
      }
    }
  }
  return edges;
}

export type AutoComposeResult = {
  orderedIds: number[];
  joinMap: Map<number, { fromTable: TableInfo; fromField: string; toTable: TableInfo; score: number }>;
};

function autoComposeOrder(tables: TableInfo[], fieldsByTable: Map<number, FieldInfo[]>): AutoComposeResult {
  if (tables.length === 0) return { orderedIds: [], joinMap: new Map() };
  if (tables.length === 1) return { orderedIds: [tables[0]!.id], joinMap: new Map() };

  const edges = buildFkEdges(tables, fieldsByTable);
  const inDegree = new Map<number, number>(tables.map(t => [t.id, 0]));
  const bestEdgeTo = new Map<number, FkEdge>();

  for (const e of edges) {
    inDegree.set(e.toTable.id, (inDegree.get(e.toTable.id) ?? 0) + 1);
    const existing = bestEdgeTo.get(e.fromTable.id);
    if (!existing || e.score > existing.score) bestEdgeTo.set(e.fromTable.id, e);
  }

  const sortedByRef = [...tables].sort((a, b) => (inDegree.get(b.id) ?? 0) - (inDegree.get(a.id) ?? 0));
  const root = sortedByRef[0]!;
  const visited = new Set<number>([root.id]);
  const queue = [root];
  const orderedIds: number[] = [root.id];
  const joinMap = new Map<number, { fromTable: TableInfo; fromField: string; toTable: TableInfo; score: number }>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const e of edges) {
      if (e.fromTable.id === current.id && !visited.has(e.toTable.id)) {
        visited.add(e.toTable.id); queue.push(e.toTable);
        orderedIds.push(e.toTable.id); joinMap.set(e.toTable.id, e);
      }
      if (e.toTable.id === current.id && !visited.has(e.fromTable.id)) {
        visited.add(e.fromTable.id); queue.push(e.fromTable);
        orderedIds.push(e.fromTable.id); joinMap.set(e.fromTable.id, e);
      }
    }
  }

  for (const t of tables) { if (!visited.has(t.id)) orderedIds.push(t.id); }
  return { orderedIds, joinMap };
}

export async function previewWideTable(schemaId: number, tableIds: number[]): Promise<WideTablePreview> {
  // Load tables from file store
  const allTables = await loadTables(schemaId);
  const requestedTables = allTables.filter(t => tableIds.includes(t.id));
  if (!requestedTables.length) return { sources: [], columns: [], sql: "" };

  const tableMap = new Map<number, TableInfo>(requestedTables.map(t => ({ id: t.id, name: t.name })).map(t => [t.id, t]));
  const fieldsByTable = new Map<number, FieldInfo[]>();
  for (const t of requestedTables) {
    fieldsByTable.set(t.id, t.fields.map(f => ({
      id: f.id, name: f.name, data_type: f.dataType, is_primary_key: f.isPrimaryKey,
    })));
  }

  const inputTables = tableIds.map(id => tableMap.get(id)).filter(Boolean) as TableInfo[];
  const { orderedIds, joinMap } = autoComposeOrder(inputTables, fieldsByTable);
  const orderedTables = orderedIds.map(id => tableMap.get(id)).filter(Boolean) as TableInfo[];

  const sources: PreviewSource[] = orderedTables.map((tbl, pos) => {
    if (pos === 0) return { tableId: tbl.id, tableName: tbl.name, colPrefix: "", joinType: "BASE" as const, joinCondition: null, position: 0 };
    const edge = joinMap.get(tbl.id);
    let joinCondition: string | null = null;
    if (edge) {
      if (edge.fromTable.id === tbl.id)
        joinCondition = `\`${tbl.name}\`.\`${edge.fromField}\` = \`${edge.toTable.name}\`.\`id\``;
      else
        joinCondition = `\`${edge.fromTable.name}\`.\`${edge.fromField}\` = \`${tbl.name}\`.\`id\``;
    }
    return { tableId: tbl.id, tableName: tbl.name, colPrefix: `${tbl.name}_`, joinType: "LEFT" as const, joinCondition, position: pos };
  });

  const allOutputNames = new Map<string, number>();
  const rawColumns: PreviewColumn[] = [];
  for (const src of sources) {
    const fields = fieldsByTable.get(src.tableId) ?? [];
    for (const f of fields) {
      const rawOut = src.colPrefix ? `${src.colPrefix}${f.name}` : f.name;
      allOutputNames.set(rawOut, (allOutputNames.get(rawOut) ?? 0) + 1);
      rawColumns.push({ sourcePosition: src.position, tableId: src.tableId, tableName: src.tableName, fieldId: f.id, fieldName: f.name, dataType: f.data_type, outputName: rawOut, included: true, hasConflict: false });
    }
  }

  const usedNames = new Set<string>();
  const columns: PreviewColumn[] = rawColumns.map(col => {
    const count = allOutputNames.get(col.outputName) ?? 1;
    const hasConflict = count > 1;
    let outputName = col.outputName;
    if (hasConflict && col.sourcePosition > 0) outputName = `${col.tableName}_${col.fieldName}`;
    if (usedNames.has(outputName)) outputName = `${outputName}_${col.sourcePosition}`;
    usedNames.add(outputName);
    return { ...col, outputName, hasConflict };
  });

  const sql = buildViewSql("(view_name)", sources, columns);
  return { sources, columns, sql };
}

export function buildViewSql(viewName: string, sources: PreviewSource[], columns: PreviewColumn[]): string {
  const included = columns.filter(c => c.included);
  const selects = included.map(c => `  \`${c.tableName}\`.\`${c.fieldName}\` AS \`${c.outputName}\``);
  const baseTable = sources.find(s => s.position === 0);
  if (!baseTable) return "";
  const joins = sources
    .filter(s => s.position > 0)
    .map(s => {
      const jt = s.joinType === "INNER" ? "INNER JOIN" : "LEFT JOIN";
      const on = s.joinCondition ? ` ON ${s.joinCondition}` : "";
      return `${jt} \`${s.tableName}\`${on}`;
    });
  return [
    `CREATE OR REPLACE VIEW \`${viewName}\` AS`, `SELECT`,
    selects.join(",\n"), `FROM \`${baseTable.tableName}\``, ...joins, ";",
  ].join("\n");
}
