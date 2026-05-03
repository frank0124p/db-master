export interface Schema {
  id: number; name: string; description: string | null; domain: string;
  createdAt: string; updatedAt: string;
}
export interface Field {
  id: number; name: string; dataType: string; nullable: boolean;
  defaultValue: string | null; isPrimaryKey: boolean; isUnique: boolean;
  comment: string | null; position: number;
}
export interface Table { id: number; name: string; comment: string | null; fields: Field[]; }
export interface SchemaDetail extends Schema { tables: Table[]; }

export interface NamingEntry {
  id: number; concept: string; stdName: string; aliases: string[];
  domain: string; tags: string[]; aiDescription: string | null; description: string | null;
  updatedAt: string;
}

export type MatchStatus = "exact" | "alias" | "fuzzy" | "unknown";
export interface MatchResult {
  status: MatchStatus; stdName: string | null; matchedAlias: string | null; distance: number | null;
}
export interface FieldCheckResult { fieldName: string; result: MatchResult; }
export interface TableNamingCheck { tableId: number; tableName: string; fields: FieldCheckResult[]; }

export interface WideTableVersionEntry {
  id: number; name: string; description: string | null;
  sources: { tableName: string; joinType: string }[];
  includedColumns: { outputName: string; fieldType: string; tableName: string }[];
}

export interface VersionSnapshot extends SchemaDetail {
  wideTables?: WideTableVersionEntry[];
}

export interface SchemaVersion {
  id: number; schemaId: number; versionNo: number; message: string | null;
  createdAt: string; diff: VersionDiff | null; snapshot: VersionSnapshot;
}

export interface FieldPropChange { prop: string; before: string | null; after: string | null; }
export interface FieldModifiedDiff { name: string; changes: FieldPropChange[]; }
export interface TableModifiedDiff {
  name: string;
  commentBefore?: string | null; commentAfter?: string | null;
  fieldsAdded: string[]; fieldsRemoved: string[];
  /** structured format (new) or legacy string format */
  fieldsModified: FieldModifiedDiff[] | { before: string; after: string }[];
}
export interface VersionDiff {
  tables: { added: string[]; removed: string[]; modified: TableModifiedDiff[] };
  wideTables?: {
    added: string[]; removed: string[];
    modified: { name: string; sourcesAdded: string[]; sourcesRemoved: string[]; columnsAdded: number; columnsRemoved: number }[];
  };
}

// ── Wide Tables ───────────────────────────────────────────────────────────────

export type JoinType = "BASE" | "INNER" | "LEFT";

export interface WideTableSummary {
  id: number; schemaId: number; name: string; description: string | null;
  createdAt: string; updatedAt: string;
}

export interface WideTableSource {
  id: number; wideTableId: number; tableId: number; tableName: string;
  colPrefix: string | null; joinType: JoinType; joinCondition: string | null; position: number;
}

export interface WideTableColumn {
  id: number; wideTableId: number; sourceId: number;
  fieldId: number; fieldName: string; fieldType: string; tableName: string;
  outputName: string; included: boolean; position: number;
}

export interface WideTableDetail extends WideTableSummary {
  sources: WideTableSource[];
  columns: WideTableColumn[];
}

export interface PreviewSource {
  tableId: number; tableName: string; colPrefix: string;
  joinType: JoinType; joinCondition: string | null; position: number;
}

export interface PreviewColumn {
  sourcePosition: number; tableId: number; tableName: string;
  fieldId: number; fieldName: string; dataType: string;
  outputName: string; included: boolean; hasConflict: boolean;
}

export interface WideTablePreview {
  sources: PreviewSource[];
  columns: PreviewColumn[];
  sql: string;
}

// ── DDL Import ────────────────────────────────────────────────────────────────

export interface ParsedTableSummary {
  name: string; comment: string | null; fieldCount: number;
}

export interface ViolationSummary {
  ruleId: string; severity: "error" | "warning" | "info";
  message: string; tableName: string; fieldName?: string;
  group: "naming" | "semantic" | "structure";
}

export interface ImportCheckSummary {
  errors: number; warnings: number; infos: number;
  passed: boolean; tablesFound: number;
}

export interface ImportCheckResult {
  tables: ParsedTableSummary[];
  violations: ViolationSummary[];
  summary: ImportCheckSummary;
  parseErrors: string[];
}

export interface DryRunResult { dryRun: true; check: ImportCheckResult; }
export interface ImportResult { dryRun: false; check: ImportCheckResult; import: { tablesCreated: number; fieldsCreated: number }; }

// ── Rules ─────────────────────────────────────────────────────────────────────

export interface RuleDetail {
  id: string; group: "naming" | "semantic" | "structure";
  description: string; defaultSeverity: "error" | "warning" | "info";
  defaultConfig: Record<string, unknown>;
  severity: "error" | "warning" | "info";
  enabled: boolean; config: Record<string, unknown>;
  source?: "built-in" | "skill";
}

export interface SkillRuleSummary {
  id: string; group: string; severity: string; description: string;
}

export interface SkillInfo {
  name: string; domain: string; tags: string[];
  source: "built-in" | "user";
  ruleCount: number; rules: SkillRuleSummary[]; content: string;
}

export interface LlmSettings {
  provider: "anthropic" | "openai";
  apiKey: string;
  baseUrl: string;
  model: string;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    headers: { "Content-Type": "application/json" }, ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const realApi = {
  schemas: {
    list: () => req<Schema[]>("/schemas"),
    get: (id: number) => req<SchemaDetail>(`/schemas/${id}`),
    create: (b: { name: string; description?: string; domain?: string }) =>
      req<SchemaDetail>("/schemas", { method: "POST", body: JSON.stringify(b) }),
    update: (id: number, b: Partial<{ name: string; description: string; domain: string }>) =>
      req<SchemaDetail>(`/schemas/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
    delete: (id: number) => req<void>(`/schemas/${id}`, { method: "DELETE" }),
    namingCheck: (id: number) => req<TableNamingCheck[]>(`/schemas/${id}/naming-check`, { method: "POST" }),
    ddl: (id: number, dialect?: string) => fetch(`/api/v1/schemas/${id}/ddl${dialect ? `?dialect=${dialect}` : ""}`).then(r => r.text()),
    analyze: (id: number, tableId?: number, signal?: AbortSignal) => fetch(`/api/v1/schemas/${id}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tableId != null ? { tableId } : {}),
      ...(signal != null ? { signal } : {}),
    }),
    versions: {
      list: (id: number) => req<SchemaVersion[]>(`/schemas/${id}/versions`),
      save: (id: number, message?: string) =>
        req<SchemaVersion>(`/schemas/${id}/versions`, { method: "POST", body: JSON.stringify({ message }) }),
    },
  },
  tables: {
    create: (schemaId: number, b: { name: string; comment?: string }) =>
      req<Table>(`/schemas/${schemaId}/tables`, { method: "POST", body: JSON.stringify(b) }),
    update: (id: number, b: Partial<{ name: string; comment: string }>) =>
      req<void>(`/tables/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
    delete: (id: number) => req<void>(`/tables/${id}`, { method: "DELETE" }),
  },
  fields: {
    create: (tableId: number, b: {
      name: string; data_type: string; nullable?: boolean; default_value?: string | null;
      is_primary_key?: boolean; is_unique?: boolean; comment?: string | null; position?: number;
    }) => req<Field>(`/tables/${tableId}/fields`, { method: "POST", body: JSON.stringify(b) }),
    update: (id: number, b: Partial<{
      name: string; data_type: string; nullable: boolean; default_value: string | null;
      is_primary_key: boolean; is_unique: boolean; comment: string | null;
    }>) => req<void>(`/fields/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
    delete: (id: number) => req<void>(`/fields/${id}`, { method: "DELETE" }),
  },
  wideTables: {
    list: (schemaId: number) => req<WideTableSummary[]>(`/schemas/${schemaId}/wide-tables`),
    get: (schemaId: number, id: number) => req<WideTableDetail>(`/schemas/${schemaId}/wide-tables/${id}`),
    preview: (schemaId: number, tableIds: number[]) =>
      req<WideTablePreview>(`/schemas/${schemaId}/wide-tables/preview`, { method: "POST", body: JSON.stringify({ tableIds }) }),
    create: (schemaId: number, body: {
      name: string; description?: string;
      sources: { tableId: number; colPrefix?: string | null; joinType: JoinType; joinCondition?: string | null; position: number }[];
      columns: { sourcePosition: number; fieldId: number; outputName: string; included: boolean; position: number }[];
    }) => req<WideTableDetail>(`/schemas/${schemaId}/wide-tables`, { method: "POST", body: JSON.stringify(body) }),
    delete: (schemaId: number, id: number) => req<void>(`/schemas/${schemaId}/wide-tables/${id}`, { method: "DELETE" }),
    ddl: (schemaId: number, id: number) => fetch(`/api/v1/schemas/${schemaId}/wide-tables/${id}/ddl`).then(r => r.text()),
  },
  importDdl: {
    check: (schemaId: number, sql: string) =>
      req<DryRunResult>(`/schemas/${schemaId}/import-ddl`, { method: "POST", body: JSON.stringify({ sql, dryRun: true }) }),
    import: (schemaId: number, sql: string) =>
      req<ImportResult>(`/schemas/${schemaId}/import-ddl`, { method: "POST", body: JSON.stringify({ sql, dryRun: false }) }),
  },
  rules: {
    list: () => req<{ rules: RuleDetail[] }>("/rules"),
    update: (ruleId: string, patch: Partial<{ severity: "error" | "warning" | "info"; enabled: boolean; config: Record<string, unknown> }>) =>
      req<{ rule: RuleDetail }>(`/rules/${ruleId}`, { method: "PATCH", body: JSON.stringify(patch) }),
  },
  skills: {
    list: () => req<{ skills: SkillInfo[] }>("/skills"),
  },
  settings: {
    getLlm: () => req<{ settings: LlmSettings }>("/settings/llm"),
    updateLlm: (patch: Partial<LlmSettings>) =>
      req<{ settings: LlmSettings }>("/settings/llm", { method: "PATCH", body: JSON.stringify(patch) }),
    testLlm: () => req<{ ok: boolean; message: string }>("/settings/llm/test", { method: "POST" }),
  },
  naming: {
    list: (domain?: string) => req<NamingEntry[]>(`/naming-dictionary${domain ? `?domain=${domain}` : ""}`),
    create: (b: { concept: string; std_name: string; aliases: string[]; domain?: string; description?: string }) =>
      req<NamingEntry>("/naming-dictionary", { method: "POST", body: JSON.stringify(b) }),
    update: (id: number, b: Partial<{ concept: string; std_name: string; aliases: string[]; domain: string; tags: string[]; ai_description: string; description: string }>) =>
      req<NamingEntry>(`/naming-dictionary/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
    delete: (id: number) => req<void>(`/naming-dictionary/${id}`, { method: "DELETE" }),
    check: (names: string[], domain?: string) =>
      req<FieldCheckResult[]>("/naming-dictionary/check", {
        method: "POST", body: JSON.stringify({ names, domain }),
      }),
    suggestAI: (id: number) =>
      req<NamingEntry>(`/naming-dictionary/${id}/suggest`, { method: "POST" }),
  },
  llm: {
    generate: (prompt: string, domain = "semiconductor") =>
      fetch("/api/v1/llm/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, domain }),
      }),
  },
  reload: () => req<{ ok: boolean; reloadedAt: string }>("/reload", { method: "POST" }),
};

// ── Mock toggle ───────────────────────────────────────────────────────────────
// Set VITE_USE_MOCK=true in apps/web/.env.local to use mock data without a DB.
// All features are covered; mutations update in-memory state for the session.

import { mockApi } from "./mock/api.js";
export const api = import.meta.env["VITE_USE_MOCK"] === "true" ? mockApi : realApi;
