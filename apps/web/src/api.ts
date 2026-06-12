export interface ProductSuite {
  id: number; name: string; description: string | null;
  color: string | null; createdAt: string; updatedAt: string;
}

export type SchemaLayer = "transaction" | "r2u" | "unified";
export type RuleLayer = "transaction" | "r2u" | "unified" | "general";
export type SchemaEnvironment = "DEV" | "TEST" | "STAGING" | "PROD";

export interface Schema {
  id: number; name: string; description: string | null; domain: string;
  suiteId: number | null; layerType: SchemaLayer | null;
  tags: string[]; environment: SchemaEnvironment | null;
  targetDb: "mariadb" | "oracle" | "clickhouse" | null;
  createdAt: string; updatedAt: string;
}
export interface Field {
  id: number; name: string; dataType: string; nullable: boolean;
  defaultValue: string | null; isPrimaryKey: boolean; isUnique: boolean;
  comment: string | null; position: number;
  sourceTable?: string | null; sourceField?: string | null;
  isSensitive?: boolean; aliases?: string[];
}
export interface Table { id: number; name: string; comment: string | null; tags?: string[]; environment?: string | null; layerType?: string | null; status?: "active" | "deprecated" | null; fields: Field[]; sampleData?: Record<string, unknown>[]; }

export interface SchemaDetail extends Schema { tables: Table[]; }

export interface ReviewerStatus {
  userId: string;
  name: string;
  signedAt: string | null;
}

export interface NamingEntry {
  id: number; concept: string; stdName: string; aliases: string[];
  domain: string; tags: string[]; aiDescription: string | null; description: string | null;
  layers: string[];
  updatedAt: string;
  status: "pending" | "approved" | "rejected";
  reviewers: ReviewerStatus[];
}

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "suite_owner" | "maintainer" | "viewer";
  suiteIds: number[];
  createdAt: string;
}

export interface RoleDef {
  label: string;
  description: string;
  color: string;
  permissions: Record<string, boolean>;
}

export type MatchStatus = "exact" | "alias" | "fuzzy" | "unknown";
export interface MatchResult {
  status: MatchStatus; stdName: string | null; matchedAlias: string | null; distance: number | null;
}
export interface FieldCheckResult { fieldName: string; result: MatchResult; }
export interface TableNamingCheck { tableId: number; tableName: string; fields: FieldCheckResult[]; }

export interface SearchTableResult {
  schemaId: number; schemaName: string;
  tableId: number; tableName: string; tableComment: string | null;
}
export interface SearchFieldResult {
  schemaId: number; schemaName: string;
  tableId: number; tableName: string;
  fieldId: number; fieldName: string; fieldType: string; fieldComment: string | null;
}
export interface SearchNamingResult {
  id: number; concept: string; stdName: string; domain: string;
}
export interface SearchResults {
  tables: SearchTableResult[];
  fields: SearchFieldResult[];
  naming?: SearchNamingResult[];
}

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
  ddlCheck?: { errors: number; warnings: number; infos: number; passed: boolean; dialect: string } | null;
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
  wideTableType: "unified" | "r2u";
  sourceTableIds: number[];
  createdAt: string; updatedAt: string;
}

export interface WideTableSource {
  id: number; wideTableId: number; schemaId: number; tableId: number; tableName: string;
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
  schemaId: number; schemaName: string;
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

// ── Lineage types ─────────────────────────────────────────────────────────────

export type LineageTransformType = "direct" | "aggregate" | "join" | "derived" | "filter";
export type LineageNodeKind = "table" | "wide-table" | "governed";
export type LineageSource = "manual" | "wide-table" | "governance" | "field";

export interface LineageEdge {
  id: string;
  fromSchemaId: number; fromSchemaName: string; fromDomain: string;
  fromTableId: number; fromTableName: string; fromKind: LineageNodeKind;
  toSchemaId: number; toSchemaName: string; toDomain: string;
  toTableId: number; toTableName: string; toKind: LineageNodeKind;
  transformType: LineageTransformType;
  description: string;
  source: LineageSource;
  createdAt: string;
}

export interface LineageQueryResult {
  question: string;
  relevantEdgeIds: string[];
  relevantTables: Array<{
    schemaId: number; schemaName: string; domain: string;
    tableId: number; tableName: string; kind: LineageNodeKind;
  }>;
  sql: string;
  explanation: string;
  joinPath: string;
}

export interface LineageThinkingStep {
  step: string;
  text: string;
}

// ── Governance types ──────────────────────────────────────────────────────────

export type GovStatus = "pending" | "approved" | "rejected";
export type GovDraftStatus = "draft" | "passed" | "failed" | "published";
export type GovWtStatus = "proposed" | "discarded" | "drafted";
export type GovBatchStatus = "imported" | "classifying" | "classified" | "review-done";
export type GovStationId = "knowledge" | "classify" | "compose" | "review" | "validate";
export type GovStationStatus = "not-started" | "in-progress" | "done" | "bypassed" | "blocked";

export interface GovSourceDoc {
  id: number; slug: string; title: string; content?: string; format: string;
  chunks?: Array<{ idx: number; text: string }> | number;
  uploadedBy?: string; createdAt: string;
}

export interface GovConceptCard {
  id: number; slug: string; name: string; stdName: string;
  aliases: string[]; definition: string; domain?: string;
  tableHints: Array<{ tableName: string; role: string }>;
  relatedConcepts: number[]; namingDictIds: number[];
  status: GovStatus;
  reviewers: Array<{ userId: number; name: string; signedAt: string | null }>;
  sourceRefs: Array<{ docId: number; chunkIdx: number }>;
  createdAt: string; updatedAt: string;
}

export interface GovBusinessRule {
  id: number; slug: string; title: string; ruleType: string;
  statement: string; machine: Record<string, unknown> | null;
  sourceRefs: Array<{ docId: number; chunkIdx: number }>;
  status: GovStatus;
  reviewers: Array<{ userId: number; name: string; signedAt: string | null }>;
  createdAt: string; updatedAt: string;
}

export interface GovImportBatch {
  id: number; name: string; source: string;
  schemaIds: number[]; tableCount: number;
  status: GovBatchStatus;
  proposals: Array<{
    tableId: number; schemaId: number; tableName: string;
    confidence: number;
    suggested: { suiteId?: number; domain?: string; layerType?: string };
    rationale: {
      matchedConcepts: number[];
      matchedDictEntries: number[];
      similarTables: Array<{ schemaId: number; tableName: string; score: number; reason: string }>;
      summary: string;
    };
    status: "pending" | "accepted" | "overridden";
    override?: { suiteId?: number; domain?: string; layerType?: string; by: string; at: string };
  }>;
  createdAt: string; updatedAt: string;
}

export interface GovProposedColumn {
  name: string; dataType: string; definition: string;
  source: { schemaId: number; tableName: string; fieldName: string };
  conceptId?: number; namingDictId?: number; transform?: string;
  _phantom?: boolean;
}

export interface GovProposedJoin {
  leftRef: string; rightRef: string; type: "inner" | "left";
  on: Array<{ leftField: string; rightField: string }>;
}

export interface GovRelationship {
  targetKind: "table" | "wide-table" | "governed-wide-table";
  targetRef: string; relation: string; onFields: string[]; note: string;
}

export interface GovWtProposal {
  id: number; scenario: string; blockKind: "small" | "medium";
  name: string; description: string;
  columns: GovProposedColumn[];
  joinGraph: GovProposedJoin[];
  relationships: GovRelationship[];
  reasoningTrace: Array<{ step: string; detail: string; refs?: { conceptIds?: number[]; tableRefs?: string[] } }>;
  candidatePool: Array<{ schemaId: number; tableName: string; fromBatchId?: number }>;
  status: GovWtStatus;
  createdAt: string; updatedAt: string;
}

export interface GovEditLogEntry {
  at: string; by: string; action: string; detail: string;
}

export interface GovWtDraft {
  id: number; blockKind: "small" | "medium";
  name: string; description: string;
  columns: GovProposedColumn[];
  joinGraph: GovProposedJoin[];
  relationships: GovRelationship[];
  editLog: GovEditLogEntry[];
  versions: Array<{ version: number; at: string; snapshot: unknown }>;
  status: GovDraftStatus;
  lastReportId?: number;
  proposalId?: number;
  createdAt: string; updatedAt: string;
}

export interface GovValidationReport {
  id: number; draftId: number; ranAt: string;
  ruleResults: Array<{ ruleId: string; severity: string; passed: boolean; violations: Array<{ target?: string; message: string }> }>;
  summary: { errors: number; warnings: number; infos: number; passed: boolean };
}

export interface GovGovernedWideTable {
  id: number; slug: string; draftId: number; reportId: number;
  blockKind: "small" | "medium"; name: string; description: string;
  columns: GovProposedColumn[];
  joinGraph: GovProposedJoin[];
  relationships: GovRelationship[];
  publishedBy: string; publishedAt: string; version: number;
}

export interface GovCatalogGraph {
  generatedAt: string;
  nodes: Array<{ id: string; kind: string; label: string; meta: Record<string, unknown> }>;
  edges: Array<{ from: string; to: string; kind: string; meta?: Record<string, unknown> }>;
}

export interface GovArtifacts {
  sourceDocIds: number[];
  conceptIds: number[];
  businessRuleIds: number[];
  importBatchIds: number[];
  wtProposalIds: number[];
  draftIds: number[];
  reportIds: number[];
  governedIds: number[];
}

export interface GovStationState {
  station: GovStationId;
  status: GovStationStatus;
  enteredAt?: string;
  completedAt?: string;
  bypass?: { by: string; at: string; reason: string };
  manualComplete?: { by: string; at: string; reason: string };
  gate: { required: boolean; source: "policy" | "override" };
  exitCheck?: { met: boolean; detail: string; checkedAt: string };
}

export interface GovInstance {
  id: number;
  slug: string;
  subjectName: string;
  description?: string;
  owner: { userId: number; name: string };
  suiteId?: number;
  routeTemplate: "default-5";
  stations: GovStationState[];
  currentStation: GovStationId | "completed";
  artifacts: GovArtifacts;
  status: "active" | "completed" | "cancelled" | "on-hold";
  holdReason?: string;
  events: Array<{ at: string; by: string; type: string; detail: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface GovGatePolicy {
  stations: Record<GovStationId, { required: boolean; note?: string }>;
  bypassRoles: Array<"admin" | "suite_owner" | "maintainer">;
  manualCompleteRoles: Array<"admin" | "suite_owner">;
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

export interface SkillRuleDef {
  id: string;
  group: "naming" | "semantic" | "structure";
  severity: "error" | "warning" | "info";
  description: string;
  tablePattern?: string;
  requiredFields?: string[];
  forbiddenFields?: string[];
  fieldPattern?: string;
  forbiddenFieldPattern?: string;
}

export interface RuleDetail {
  id: string; group: "naming" | "semantic" | "structure";
  description: string; defaultSeverity: "error" | "warning" | "info";
  defaultConfig: Record<string, unknown>;
  severity: "error" | "warning" | "info";
  enabled: boolean; config: Record<string, unknown>;
  source?: "built-in" | "skill";
  layers: RuleLayer[];
}

export interface RuleSnapshot {
  id: string;
  name: string;
  createdAt: string;
  overrides: Record<string, unknown>;
}

export interface SkillRuleSummary {
  id: string; group: string; severity: string; description: string;
}

export interface SkillInfo {
  name: string; domain: string; tags: string[];
  source: "built-in" | "user";
  ruleCount: number; rules: SkillRuleSummary[]; content: string;
  filePath?: string;
}

// ── Layer Settings ────────────────────────────────────────────────────────────

export interface LayerDef {
  id: string;
  label: string;
}

export interface LayerSettings {
  schemaLayers: LayerDef[];
  dictLayers: LayerDef[];
}

export interface DomainDef {
  id: string;      // matches schema.domain string
  name: string;    // display label
  order: number;
  color: string | null;
}

export interface LlmSettings {
  provider: "anthropic" | "openai";
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface DataHubSettings {
  url: string;
  token: string;
  platform: string;
  env: "PROD" | "DEV" | "STAGING" | "TEST";
}

export interface MinioSettings {
  endpoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
  pathPrefix: string;
}

export interface PushRecord {
  id: string;
  schemaId: number;
  schemaName: string;
  tablesTotal: number;
  tablesOk: number;
  tablesFailed: number;
  errors: string[];
  pushedAt: string;
  status: "ok" | "partial" | "failed";
}

export class ApiError extends Error {
  constructor(message: string, public readonly code?: string, public readonly errors?: string[]) {
    super(message);
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    headers: { "Content-Type": "application/json" }, ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: { message?: string; code?: string; errors?: string[] } };
    throw new ApiError(body.error?.message ?? `HTTP ${res.status}`, body.error?.code, body.error?.errors);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const realApi = {
  schemas: {
    list: () => req<Schema[]>("/schemas"),
    get: (id: number) => req<SchemaDetail>(`/schemas/${id}`),
    create: (b: { name: string; description?: string; domain?: string; suiteId?: number | null; layerType?: SchemaLayer | null; tags?: string[]; environment?: SchemaEnvironment | null; targetDb?: "mariadb" | "oracle" | "clickhouse" | null }) =>
      req<SchemaDetail>("/schemas", { method: "POST", body: JSON.stringify(b) }),
    update: (id: number, b: Partial<{ name: string; description: string | null; domain: string; suiteId: number | null; layerType: SchemaLayer | null; tags: string[]; environment: SchemaEnvironment | null; targetDb: "mariadb" | "oracle" | "clickhouse" | null }>) =>
      req<SchemaDetail>(`/schemas/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
    delete: (id: number) => req<void>(`/schemas/${id}`, { method: "DELETE" }),
    namingCheck: (id: number) => req<TableNamingCheck[]>(`/schemas/${id}/naming-check`, { method: "POST" }),
    ddl: (id: number, dialect?: string) => fetch(`/api/v1/schemas/${id}/ddl${dialect ? `?dialect=${dialect}` : ""}`).then(r => r.text()),
    analyze: (id: number, tableId?: number, signal?: AbortSignal) => fetch(`/api/v1/schemas/${id}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tableId !== null && tableId !== undefined ? { tableId } : {}),
      ...(signal !== null && signal !== undefined ? { signal } : {}),
    }),
    suggest: (id: number, signal?: AbortSignal) => fetch(`/api/v1/schemas/${id}/suggest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      ...(signal !== null && signal !== undefined ? { signal } : {}),
    }),
    exportSchema: (id: number) => fetch(`/api/v1/schemas/${id}/export`),
    importSchema: (body: unknown) => req<SchemaDetail>("/schemas/import", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    versions: {
      list: (id: number) => req<SchemaVersion[]>(`/schemas/${id}/versions`),
      save: (id: number, message?: string) =>
        req<SchemaVersion>(`/schemas/${id}/versions`, { method: "POST", body: JSON.stringify({ message }) }),
    },
    getRules: (id: number) => req<{ selectedRuleIds: string[] }>(`/schemas/${id}/rules`),
    setRules: (id: number, body: { selectedRuleIds: string[] | null }) =>
      req<{ selectedRuleIds: string[] }>(`/schemas/${id}/rules`, { method: "PATCH", body: JSON.stringify(body) }),
  },
  tables: {
    create: (schemaId: number, b: { name: string; comment?: string }) =>
      req<Table>(`/schemas/${schemaId}/tables`, { method: "POST", body: JSON.stringify(b) }),
    update: (id: number, b: Partial<{ name: string; comment: string | null; tags: string[]; environment: string | null; layer_type: string | null; status: "active" | "deprecated" | null; sample_data: Record<string, unknown>[] }>) =>
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
      source_table: string | null; source_field: string | null;
      is_sensitive: boolean; aliases: string[];
    }>) => req<void>(`/fields/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
    delete: (id: number) => req<void>(`/fields/${id}`, { method: "DELETE" }),
    suggestComment: (b: { fieldName: string; dataType: string; tableName: string; tableComment?: string | null; domain: string }) =>
      req<{ comment: string }>("/fields/suggest-comment", { method: "POST", body: JSON.stringify(b) }),
  },
  wideTables: {
    list: (schemaId: number) => req<WideTableSummary[]>(`/schemas/${schemaId}/wide-tables`),
    get: (schemaId: number, id: number) => req<WideTableDetail>(`/schemas/${schemaId}/wide-tables/${id}`),
    preview: (schemaId: number, tableRefs: { schemaId: number; tableId: number }[]) =>
      req<WideTablePreview>(`/schemas/${schemaId}/wide-tables/preview`, { method: "POST", body: JSON.stringify({ tableRefs }) }),
    create: (schemaId: number, body: {
      name: string; description?: string;
      sources: { schemaId?: number; tableId: number; colPrefix?: string | null; joinType: JoinType; joinCondition?: string | null; position: number }[];
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
    createSkillRule: (b: { skillName: string; rule: SkillRuleDef }) =>
      req<{ ok: boolean }>("/rules/skill-rule", { method: "POST", body: JSON.stringify(b) }),
    updateSkillRule: (ruleId: string, rule: Omit<SkillRuleDef, "id">) =>
      req<{ ok: boolean }>(`/rules/skill-rule/${encodeURIComponent(ruleId)}`, { method: "PUT", body: JSON.stringify(rule) }),
    deleteSkillRule: (ruleId: string) =>
      req<{ ok: boolean }>(`/rules/skill-rule/${encodeURIComponent(ruleId)}`, { method: "DELETE" }),
    snapshots: {
      list: () => req<{ snapshots: RuleSnapshot[] }>("/rules/snapshots"),
      save: (name: string) => req<{ snapshot: RuleSnapshot }>("/rules/snapshots", { method: "POST", body: JSON.stringify({ name }) }),
      restore: (id: string) => req<{ rules: RuleDetail[] }>(`/rules/snapshots/${id}/restore`, { method: "POST" }),
      delete: (id: string) => req<void>(`/rules/snapshots/${id}`, { method: "DELETE" }),
    },
  },
  skills: {
    list: () => req<{ skills: SkillInfo[] }>("/skills"),
    create: (b: { name: string; domain?: string; tags?: string[]; description?: string }) =>
      req<{ ok: boolean; filePath: string }>("/skills", { method: "POST", body: JSON.stringify(b) }),
    update: (name: string, content: string) =>
      req<{ ok: boolean }>(`/skills/${encodeURIComponent(name)}`, { method: "PUT", body: JSON.stringify({ content }) }),
    delete: (name: string) =>
      req<{ ok: boolean }>(`/skills/${encodeURIComponent(name)}`, { method: "DELETE" }),
  },
  settings: {
    getLlm: () => req<{ settings: LlmSettings }>("/settings/llm"),
    updateLlm: (patch: Partial<LlmSettings>) =>
      req<{ settings: LlmSettings }>("/settings/llm", { method: "PATCH", body: JSON.stringify(patch) }),
    testLlm: () => req<{ ok: boolean; message: string }>("/settings/llm/test", { method: "POST" }),
    getStorage: () => req<{ minio: Partial<MinioSettings>; ready: boolean }>("/settings/storage"),
    updateStorage: (patch: Partial<MinioSettings>) =>
      req<{ minio: Partial<MinioSettings>; ready: boolean }>("/settings/storage", { method: "PATCH", body: JSON.stringify(patch) }),
    testStorage: () => req<{ ok: boolean; message: string }>("/settings/storage/test", { method: "POST" }),
    pushToStorage: () => req<{ pushed: number; errors: number }>("/settings/storage/push", { method: "POST" }),
    restoreFromStorage: () => req<{ restored: number; errors: number }>("/settings/storage/restore", { method: "POST" }),
    getLayers: () => req<LayerSettings>("/settings/layers"),
    updateLayers: (patch: Partial<LayerSettings>) =>
      req<LayerSettings>("/settings/layers", { method: "PATCH", body: JSON.stringify(patch) }),
    getDomains: () => req<DomainDef[]>("/settings/domains"),
    createDomain: (b: { name: string; id?: string; color?: string | null }) =>
      req<DomainDef>("/settings/domains", { method: "POST", body: JSON.stringify(b) }),
    updateDomain: (id: string, patch: Partial<Pick<DomainDef, "name" | "order" | "color">>) =>
      req<DomainDef>(`/settings/domains/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    deleteDomain: (id: string) => req<void>(`/settings/domains/${id}`, { method: "DELETE" }),
    reorderDomains: (ids: string[]) =>
      req<DomainDef[]>("/settings/domains/reorder", { method: "PATCH", body: JSON.stringify({ ids }) }),
  },
  naming: {
    list: (domain?: string, status?: "pending" | "approved" | "rejected") => {
      const params = new URLSearchParams();
      if (domain) params.set("domain", domain);
      if (status) params.set("status", status);
      const qs = params.toString();
      return req<NamingEntry[]>(`/naming-dictionary${qs ? `?${qs}` : ""}`);
    },
    listPending: () => req<NamingEntry[]>("/naming-dictionary?status=pending"),
    create: (b: { concept: string; std_name: string; aliases: string[]; domain?: string; description?: string }) =>
      req<NamingEntry>("/naming-dictionary", { method: "POST", body: JSON.stringify(b) }),
    update: (id: number, b: Partial<{ concept: string; std_name: string; aliases: string[]; domain: string; tags: string[]; ai_description: string; description: string; layers: string[] }>) =>
      req<NamingEntry>(`/naming-dictionary/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
    delete: (id: number) => req<void>(`/naming-dictionary/${id}`, { method: "DELETE" }),
    check: (names: string[], domain?: string) =>
      req<FieldCheckResult[]>("/naming-dictionary/check", {
        method: "POST", body: JSON.stringify({ names, domain }),
      }),
    suggestAI: (id: number) =>
      req<NamingEntry>(`/naming-dictionary/${id}/suggest`, { method: "POST" }),
    approve: (id: number) =>
      req<NamingEntry>(`/naming-dictionary/${id}/approve`, { method: "POST" }),
    reject: (id: number) =>
      req<NamingEntry>(`/naming-dictionary/${id}/reject`, { method: "POST" }),
    assignReviewers: (id: number, reviewers: { userId: string; name: string }[]) =>
      req<NamingEntry>(`/naming-dictionary/${id}/reviewers`, { method: "POST", body: JSON.stringify({ reviewers }) }),
  },
  llm: {
    generate: (prompt: string, domain = "semiconductor") =>
      fetch("/api/v1/llm/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, domain }),
      }),
    translate: (b: { text: string; context?: string; targetLang?: string }) =>
      req<{ translated: string; detectedLang: string; snakeCaseSuggestion?: string }>(
        "/llm/translate", { method: "POST", body: JSON.stringify(b) }
      ),
  },
  datahub: {
    getSettings: () => req<{ settings: Partial<DataHubSettings> }>("/datahub/settings"),
    updateSettings: (patch: Partial<DataHubSettings>) =>
      req<{ settings: Partial<DataHubSettings> }>("/datahub/settings", { method: "PATCH", body: JSON.stringify(patch) }),
    test: () => req<{ ok: boolean; message: string }>("/datahub/test", { method: "POST" }),
    push: (schemaId: number, opts?: { tableIds?: number[]; wideTableIds?: number[] }) =>
      req<PushRecord>(`/datahub/push/${schemaId}`, { method: "POST", body: JSON.stringify(opts ?? {}) }),
    getPushLog: () => req<PushRecord[]>("/datahub/push-log"),
  },
  users: {
    list: () => req<AppUser[]>("/users"),
    roles: () => req<Record<string, RoleDef>>("/users/roles"),
    create: (b: { name: string; email: string; role: AppUser["role"]; suiteIds?: number[] }) =>
      req<AppUser>("/users", { method: "POST", body: JSON.stringify(b) }),
    update: (id: string, b: Partial<{ name: string; email: string; role: AppUser["role"]; suiteIds: number[] }>) =>
      req<AppUser>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
    delete: (id: string) => req<void>(`/users/${id}`, { method: "DELETE" }),
  },
  suites: {
    list: (): Promise<ProductSuite[]> => req("/suites"),
    create: (b: { name: string; description?: string; color?: string }) =>
      req<ProductSuite>("/suites", { method: "POST", body: JSON.stringify(b) }),
    update: (id: number, b: Partial<{ name: string; description: string | null; color: string | null }>) =>
      req<ProductSuite>(`/suites/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
    delete: (id: number) => req<void>(`/suites/${id}`, { method: "DELETE" }),
  },
  search: (q: string) => req<SearchResults>(`/search?q=${encodeURIComponent(q)}`),
  reload: () => req<{ ok: boolean; reloadedAt: string }>("/reload", { method: "POST" }),

  // ── Governance ──────────────────────────────────────────────────────────────
  knowledge: {
    listSources: () => req<GovSourceDoc[]>("/knowledge/sources"),
    createSource: (b: { title: string; content: string; tags?: string[] }) =>
      req<GovSourceDoc>("/knowledge/sources", { method: "POST", body: JSON.stringify(b) }),
    deleteSource: (id: number) => req<void>(`/knowledge/sources/${id}`, { method: "DELETE" }),
    extractSSE: (sourceId: number) =>
      fetch(`/api/v1/knowledge/sources/${sourceId}/extract`, { method: "POST" }),
    listConcepts: (params?: { status?: string }) =>
      req<GovConceptCard[]>(`/knowledge/concepts${params?.status ? `?status=${params.status}` : ""}`),
    approveConcept: (id: number) => req<GovConceptCard>(`/knowledge/concepts/${id}/approve`, { method: "POST" }),
    rejectConcept: (id: number) => req<GovConceptCard>(`/knowledge/concepts/${id}/reject`, { method: "POST" }),
    listRules: (params?: { status?: string }) =>
      req<GovBusinessRule[]>(`/knowledge/business-rules${params?.status ? `?status=${params.status}` : ""}`),
    approveRule: (id: number) => req<GovBusinessRule>(`/knowledge/business-rules/${id}/approve`, { method: "POST" }),
    rejectRule: (id: number) => req<GovBusinessRule>(`/knowledge/business-rules/${id}/reject`, { method: "POST" }),
    retrieve: (q: string) =>
      req<{ concepts: GovConceptCard[]; rules: GovBusinessRule[] }>(
        "/knowledge/retrieve", { method: "POST", body: JSON.stringify({ query: q }) }
      ),
  },

  importBatches: {
    list: () => req<GovImportBatch[]>("/import-batches"),
    get: (id: number) => req<GovImportBatch>(`/import-batches/${id}`),
    create: (b: { name: string; ddl: string }) =>
      req<GovImportBatch>("/import-batches", { method: "POST", body: JSON.stringify(b) }),
    classifySSE: (id: number) =>
      fetch(`/api/v1/import-batches/${id}/classify`, { method: "POST" }),
    accept: (batchId: number, tableIdx: number) =>
      req<unknown>(`/import-batches/${batchId}/proposals/${tableIdx}/accept`, { method: "POST" }),
    override: (batchId: number, tableIdx: number, b: { blockKind: string; rationale?: string }) =>
      req<unknown>(`/import-batches/${batchId}/proposals/${tableIdx}/override`, { method: "POST", body: JSON.stringify(b) }),
    acceptAll: (batchId: number, threshold?: number) =>
      req<unknown>(`/import-batches/${batchId}/proposals/accept-all`, { method: "POST", body: JSON.stringify({ threshold }) }),
  },

  wtProposals: {
    list: () => req<GovWtProposal[]>("/wide-table-proposals"),
    get: (id: number) => req<GovWtProposal>(`/wide-table-proposals/${id}`),
    composeSSE: (b: { scenario: string; blockKind?: string; batchIds?: number[] }) =>
      fetch("/api/v1/wide-table-proposals/compose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }),
    toDraft: (id: number) => req<GovWtDraft>(`/wide-table-proposals/${id}/to-draft`, { method: "POST" }),
    discard: (id: number) => req<void>(`/wide-table-proposals/${id}/discard`, { method: "POST" }),
  },

  workspace: {
    list: () => req<GovWtDraft[]>("/workspace/drafts"),
    get: (id: number) => req<GovWtDraft>(`/workspace/drafts/${id}`),
    patch: (id: number, b: Partial<GovWtDraft>) =>
      req<GovWtDraft>(`/workspace/drafts/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
    previewSql: (id: number) => req<{ sql: string }>(`/workspace/drafts/${id}/preview-sql`, { method: "POST" }),
    validate: (id: number) => req<GovValidationReport>(`/workspace/drafts/${id}/validate`, { method: "POST" }),
    publish: (id: number, b: { publishedBy: string }) =>
      req<GovGovernedWideTable>(`/workspace/drafts/${id}/publish`, { method: "POST", body: JSON.stringify(b) }),
    delete: (id: number) => req<void>(`/workspace/drafts/${id}`, { method: "DELETE" }),
    saveVersion: (id: number) => req<unknown>(`/workspace/drafts/${id}/versions`, { method: "POST" }),
  },

  catalog: {
    list: () => req<GovGovernedWideTable[]>("/catalog/wide-tables"),
    get: (slug: string) => req<GovGovernedWideTable>(`/catalog/wide-tables/${slug}`),
    patch: (slug: string, b: { name?: string; description?: string; columns?: GovProposedColumn[] }) =>
      req<GovGovernedWideTable>(`/catalog/wide-tables/${slug}`, { method: "PATCH", body: JSON.stringify(b) }),
    getMarkdown: (slug: string) => req<{ markdown: string }>(`/catalog/wide-tables/${slug}/markdown`),
    getGraph: () => req<GovCatalogGraph>("/catalog/graph"),
    retrieve: (q: string) =>
      req<{ wideTables: GovGovernedWideTable[] }>(
        "/catalog/retrieve", { method: "POST", body: JSON.stringify({ query: q }) }
      ),
  },

  instances: {
    list: () => req<GovInstance[]>("/instances"),
    get: (id: number) => req<GovInstance>(`/instances/${id}`),
    create: (b: { subject: string; blockKind: string }) =>
      req<GovInstance>("/instances", { method: "POST", body: JSON.stringify(b) }),
    startStation: (instanceId: number, stationId: string) =>
      req<GovInstance>(`/instances/${instanceId}/stations/${stationId}/start`, { method: "POST" }),
    completeStation: (instanceId: number, stationId: string, b: { artifactId?: number }) =>
      req<GovInstance>(`/instances/${instanceId}/stations/${stationId}/complete`, { method: "POST", body: JSON.stringify(b) }),
    bypassStation: (instanceId: number, stationId: string, b: { reason: string }) =>
      req<GovInstance>(`/instances/${instanceId}/stations/${stationId}/bypass`, { method: "POST", body: JSON.stringify(b) }),
    hold: (id: number, b: { reason: string }) =>
      req<GovInstance>(`/instances/${id}/hold`, { method: "POST", body: JSON.stringify(b) }),
    resume: (id: number) => req<GovInstance>(`/instances/${id}/resume`, { method: "POST" }),
    cancel: (id: number, b: { reason: string }) =>
      req<GovInstance>(`/instances/${id}/cancel`, { method: "POST", body: JSON.stringify(b) }),
    gatePolicy: () => req<GovGatePolicy>("/instances/gate-policy"),
  },

  lineage: {
    list: () => req<LineageEdge[]>("/lineage"),
    add: (b: Omit<LineageEdge, "id" | "createdAt">) =>
      req<LineageEdge>("/lineage", { method: "POST", body: JSON.stringify(b) }),
    remove: (id: string) => req<void>(`/lineage/${id}`, { method: "DELETE" }),
    query: (question: string) =>
      req<LineageQueryResult>("/lineage/query", { method: "POST", body: JSON.stringify({ question }) }),
    queryStream: (question: string) =>
      fetch("/api/v1/lineage/query-stream", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) }),
  },
};

// ── Mock toggle ───────────────────────────────────────────────────────────────
// Set VITE_USE_MOCK=true in apps/web/.env.local to use mock data without a DB.
// All features are covered; mutations update in-memory state for the session.

import { mockApi } from "./mock/api.js";
export const api = (import.meta.env["VITE_USE_MOCK"] === "true" ? mockApi : realApi) as typeof realApi;
