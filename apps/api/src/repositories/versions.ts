import * as store from "../db/fileStore.js";
import { getSchemaById, versionFile, versionsDir, getSchemaSlug, type SchemaWithTables } from "./schemas.js";
import { listWideTables, getWideTable, type WideTableDetail } from "./wide-tables.js";

type WideTableSnapshot = {
  id: number; name: string; description: string | null;
  sources: { tableName: string; joinType: string }[];
  includedColumns: { outputName: string; fieldType: string; tableName: string }[];
};

type VersionSnapshot = SchemaWithTables & { wideTables: WideTableSnapshot[] };

export interface DdlCheckSummary {
  errors: number; warnings: number; infos: number; passed: boolean; dialect: string;
}

interface VersionFile {
  id: number; schemaId: number; versionNo: number;
  message: string | null; createdAt: string;
  snapshot: VersionSnapshot; diff: unknown | null;
  ddlCheck?: DdlCheckSummary | null;
}

function toWideTableSnapshot(wt: WideTableDetail): WideTableSnapshot {
  return {
    id: wt.id, name: wt.name, description: wt.description,
    sources: wt.sources.map(s => ({ tableName: s.tableName, joinType: s.joinType })),
    includedColumns: wt.columns
      .filter(c => c.included)
      .map(c => ({ outputName: c.outputName, fieldType: c.fieldType, tableName: c.tableName })),
  };
}

function namingScore(schema: SchemaWithTables): number {
  const sys = new Set(["id", "created_at", "updated_at", "deleted_at"]);
  let total = 0, known = 0;
  for (const t of schema.tables) {
    for (const f of t.fields) {
      total++;
      if (sys.has(f.name)) known++;
    }
  }
  return total === 0 ? 100 : Math.round((known / total) * 100);
}

function computeWideTableDiff(prev: WideTableSnapshot[], curr: WideTableSnapshot[]) {
  const prevMap = new Map(prev.map(w => [w.name, w]));
  const currMap = new Map(curr.map(w => [w.name, w]));
  const added: string[] = [], removed: string[] = [];
  const modified: { name: string; sourcesAdded: string[]; sourcesRemoved: string[]; columnsAdded: number; columnsRemoved: number }[] = [];
  for (const [n] of currMap) { if (!prevMap.has(n)) added.push(n); }
  for (const [n] of prevMap) { if (!currMap.has(n)) removed.push(n); }
  for (const [name, cw] of currMap) {
    const pw = prevMap.get(name);
    if (!pw) continue;
    const prevSrcs = new Set(pw.sources.map(s => s.tableName));
    const currSrcs = new Set(cw.sources.map(s => s.tableName));
    const sourcesAdded = [...currSrcs].filter(s => !prevSrcs.has(s));
    const sourcesRemoved = [...prevSrcs].filter(s => !currSrcs.has(s));
    const columnsAdded = Math.max(0, cw.includedColumns.length - pw.includedColumns.length);
    const columnsRemoved = Math.max(0, pw.includedColumns.length - cw.includedColumns.length);
    if (sourcesAdded.length || sourcesRemoved.length || columnsAdded || columnsRemoved)
      modified.push({ name, sourcesAdded, sourcesRemoved, columnsAdded, columnsRemoved });
  }
  return { added, removed, modified };
}

type FieldPropChange = { prop: string; before: string | null; after: string | null };
type FieldModified = { name: string; changes: FieldPropChange[] };
type TableModified = { name: string; commentBefore?: string | null; commentAfter?: string | null; fieldsAdded: string[]; fieldsRemoved: string[]; fieldsModified: FieldModified[] };

function computeDiff(prev: VersionSnapshot, curr: VersionSnapshot) {
  const prevMap = new Map(prev.tables.map(t => [t.name, t]));
  const currMap = new Map(curr.tables.map(t => [t.name, t]));
  const added: string[] = [], removed: string[] = [];
  const modified: TableModified[] = [];
  for (const [n] of currMap) { if (!prevMap.has(n)) added.push(n); }
  for (const [n] of prevMap) { if (!currMap.has(n)) removed.push(n); }
  for (const [name, ct] of currMap) {
    const pt = prevMap.get(name);
    if (!pt) continue;
    const pf = new Map(pt.fields.map(f => [f.name, f]));
    const cf = new Map(ct.fields.map(f => [f.name, f]));
    const fa: string[] = [], fr: string[] = [];
    const fm: FieldModified[] = [];
    for (const [fn, fd] of cf) {
      if (!pf.has(fn)) { fa.push(fn); continue; }
      const pd = pf.get(fn)!;
      const changes: FieldPropChange[] = [];
      if (pd.dataType     !== fd.dataType)     changes.push({ prop: "dataType",     before: pd.dataType,                   after: fd.dataType });
      if (pd.nullable     !== fd.nullable)     changes.push({ prop: "nullable",     before: pd.nullable ? "NULL" : "NOT NULL", after: fd.nullable ? "NULL" : "NOT NULL" });
      if ((pd.defaultValue ?? null) !== (fd.defaultValue ?? null))
        changes.push({ prop: "defaultValue", before: pd.defaultValue ?? null,       after: fd.defaultValue ?? null });
      if ((pd.comment ?? null) !== (fd.comment ?? null))
        changes.push({ prop: "comment",      before: pd.comment ?? null,            after: fd.comment ?? null });
      if (pd.isPrimaryKey !== fd.isPrimaryKey) changes.push({ prop: "isPrimaryKey", before: pd.isPrimaryKey ? "是" : "否",   after: fd.isPrimaryKey ? "是" : "否" });
      if (pd.isUnique     !== fd.isUnique)     changes.push({ prop: "isUnique",     before: pd.isUnique ? "是" : "否",       after: fd.isUnique ? "是" : "否" });
      if (changes.length) fm.push({ name: fn, changes });
    }
    for (const [fn] of pf) { if (!cf.has(fn)) fr.push(fn); }
    const commentChanged = (pt.comment ?? null) !== (ct.comment ?? null);
    if (fa.length || fr.length || fm.length || commentChanged) {
      const entry: TableModified = { name, fieldsAdded: fa, fieldsRemoved: fr, fieldsModified: fm };
      if (commentChanged) { entry.commentBefore = pt.comment ?? null; entry.commentAfter = ct.comment ?? null; }
      modified.push(entry);
    }
  }
  const wideTables = computeWideTableDiff(prev.wideTables ?? [], curr.wideTables ?? []);
  return { tables: { added, removed, modified }, wideTables };
}

export async function listVersions(schemaId: number) {
  const slug = await getSchemaSlug(schemaId);
  const slugs = await store.listJsonFileSlugs(versionsDir(slug));
  const versions = [];
  for (const s of slugs) {
    // s is like "v1", "v2", etc.
    const vno = parseInt(s.slice(1), 10);
    if (isNaN(vno)) continue;
    const v = await store.readJson<VersionFile>(versionFile(slug, vno));
    if (!v) continue;
    versions.push({
      id: v.id, schemaId: v.schemaId, versionNo: v.versionNo,
      snapshot: v.snapshot, diff: v.diff, message: v.message,
      ddlCheck: v.ddlCheck ?? null,
      createdAt: new Date(v.createdAt),
    });
  }
  return versions.sort((a, b) => b.versionNo - a.versionNo);
}

export async function getVersionByNo(schemaId: number, vno: number) {
  const versions = await listVersions(schemaId);
  return versions.find(v => v.versionNo === vno) ?? null;
}

export async function saveVersion(schemaId: number, message?: string, ddlCheck?: DdlCheckSummary | null) {
  const schema = await getSchemaById(schemaId);
  const wtSummaries = await listWideTables(schemaId);
  const wtDetails = await Promise.all(wtSummaries.map(wt => getWideTable(wt.id)));
  const wideTables = wtDetails
    .filter((wt): wt is WideTableDetail => wt !== null)
    .map(toWideTableSnapshot);

  const currentSnapshot: VersionSnapshot = { ...schema, wideTables };
  const versions = await listVersions(schemaId);
  const versionNo = versions.length > 0 ? Math.max(...versions.map(v => v.versionNo)) + 1 : 1;

  let diff: unknown | null = null;
  if (versions.length > 0) diff = computeDiff(versions[0]!.snapshot, currentSnapshot);

  const id = await store.nextId("versions");
  const slug = await getSchemaSlug(schemaId);
  const vf: VersionFile = {
    id, schemaId, versionNo, message: message ?? null,
    createdAt: new Date().toISOString(),
    snapshot: currentSnapshot, diff,
    ddlCheck: ddlCheck ?? null,
  };
  await store.writeJson(versionFile(slug, versionNo), vf);

  return {
    id, versionNo, schemaId, message: message ?? null,
    score: namingScore(schema), diff, ddlCheck: ddlCheck ?? null,
    createdAt: new Date(vf.createdAt),
  };
}
