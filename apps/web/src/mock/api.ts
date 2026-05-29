/**
 * Mock API — mirrors the real `api` object interface.
 * Used when VITE_USE_MOCK=true.  Mutations return plausible responses
 * but do NOT persist state across refreshes (in-memory only).
 */

import {
  mockSchemas, plmSchema, mesSchema,
  mockWideSummaries, mockWideDetail,
  mockNaming, mockVersions, mockRules,
  mockAnalysisIssues, mockAnalysisSummary,
} from "./data.js";

import type {
  Schema, SchemaDetail, Table, Field,
  NamingEntry, SchemaVersion,
  WideTableSummary, WideTableDetail, WideTablePreview,
  DryRunResult, ImportResult, RuleDetail, RuleSnapshot,
  TableNamingCheck, LayerSettings,
} from "../api.js";

// ── in-memory mutable state ───────────────────────────────────────────────────

let schemas = [...mockSchemas];
const schemaDetails: Record<number, SchemaDetail> = { 1: { ...plmSchema }, 2: { ...mesSchema } };
let naming = [...mockNaming];
let rules = [...mockRules];

function getDetail(id: number): SchemaDetail {
  return schemaDetails[id] ?? { ...plmSchema, id, tables: [] };
}

// ── helpers ───────────────────────────────────────────────────────────────────

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function sseStream(issues: typeof mockAnalysisIssues, summary: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (obj: unknown) =>
        ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      send({ type: "issues", issues });

      const chars = [...summary];
      for (let i = 0; i < chars.length; i += 4) {
        await delay(10);
        send({ type: "token", text: chars.slice(i, i + 4).join("") });
      }
      send({ type: "done", score: 82 });
      ctrl.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
}

let nextId = 9000;
const uid = () => ++nextId;

// ── mock API ──────────────────────────────────────────────────────────────────

export const mockApi = {
  schemas: {
    list: async (): Promise<Schema[]> => {
      await delay(80);
      return [...schemas];
    },

    get: async (id: number): Promise<SchemaDetail> => {
      await delay(60);
      return getDetail(id);
    },

    create: async (b: { name: string; description?: string; domain?: string; suiteId?: number | null; layerType?: import("../api.js").SchemaLayer | null; tags?: string[]; environment?: import("../api.js").SchemaEnvironment | null; targetDb?: "mariadb" | "oracle" | "clickhouse" | null }): Promise<SchemaDetail> => {
      await delay(100);
      const id = uid();
      const now = new Date().toISOString();
      const detail: SchemaDetail = {
        id, name: b.name, description: b.description ?? null,
        domain: b.domain ?? "semiconductor", suiteId: b.suiteId ?? null,
        layerType: b.layerType ?? null, tags: b.tags ?? [], environment: b.environment ?? null,
        targetDb: b.targetDb ?? null,
        createdAt: now, updatedAt: now, tables: [],
      };
      schemaDetails[id] = detail;
      schemas = [...schemas, { id, name: b.name, description: b.description ?? null, domain: detail.domain, suiteId: b.suiteId ?? null, layerType: b.layerType ?? null, tags: b.tags ?? [], environment: b.environment ?? null, targetDb: b.targetDb ?? null, createdAt: now, updatedAt: now }];
      return detail;
    },

    update: async (id: number, b: Partial<{ name: string; description: string | null; domain: string; suiteId: number | null; layerType: import("../api.js").SchemaLayer | null; tags: string[]; environment: import("../api.js").SchemaEnvironment | null; targetDb: "mariadb" | "oracle" | "clickhouse" | null }>): Promise<SchemaDetail> => {
      await delay(80);
      const d = getDetail(id);
      const updated = { ...d, ...b, updatedAt: new Date().toISOString() };
      schemaDetails[id] = updated;
      schemas = schemas.map(s => s.id === id ? { ...s, ...b } : s);
      return updated;
    },

    delete: async (_id: number): Promise<void> => {
      await delay(80);
    },

    namingCheck: async (id: number): Promise<TableNamingCheck[]> => {
      await delay(120);
      const schema = getDetail(id);
      return schema.tables.map(t => ({
        tableId: t.id, tableName: t.name,
        fields: t.fields.map(f => ({
          fieldName: f.name,
          result: { status: "exact" as const, stdName: f.name, matchedAlias: null, distance: null },
        })),
      }));
    },

    ddl: async (id: number, dialect?: string): Promise<string> => {
      await delay(100);
      const schema = getDetail(id);
      const isOracle = dialect === "oracle";
      const isCH = dialect === "clickhouse";
      const q = (n: string) => isOracle ? `"${n}"` : `\`${n}\``;
      return schema.tables.map(t => {
        const cols = t.fields.map(f => {
          if (isCH) return `  ${q(f.name)} ${f.nullable ? `Nullable(${f.dataType})` : f.dataType}${f.comment ? ` COMMENT '${f.comment}'` : ""}`;
          if (isOracle) return `  ${q(f.name)} ${f.dataType}${f.isPrimaryKey ? " GENERATED ALWAYS AS IDENTITY" : ""}${!f.nullable && !f.isPrimaryKey ? " NOT NULL" : ""}`;
          return `  ${q(f.name)} ${f.dataType}${f.nullable ? "" : " NOT NULL"}${f.isPrimaryKey ? " AUTO_INCREMENT" : ""}${f.comment ? ` COMMENT '${f.comment}'` : ""}`;
        }).join(",\n");
        const pk = t.fields.find(f => f.isPrimaryKey);
        if (isCH) return `CREATE TABLE ${q(t.name)} (\n${cols}\n) ENGINE = MergeTree()\nORDER BY (${pk ? q(pk.name) : "tuple()"});`;
        if (isOracle) {
          const pkLine = pk ? `,\n  CONSTRAINT pk_${t.name} PRIMARY KEY (${q(pk.name)})` : "";
          return `CREATE TABLE ${q(t.name)} (\n${cols}${pkLine}\n);\n${t.comment ? `COMMENT ON TABLE ${q(t.name)} IS '${t.comment}';\n` : ""}`;
        }
        return `CREATE TABLE ${q(t.name)} (\n${cols}${pk ? `,\n  PRIMARY KEY (${q(pk.name)})` : ""}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`;
      }).join("\n\n");
    },

    analyze: (_id: number, _tableId?: number): Response => {
      return sseStream(mockAnalysisIssues, mockAnalysisSummary);
    },

    suggest: (_id: number): Response => {
      const encoder = new TextEncoder();
      const mockText = "## AI 設計建議\n\n### 1. 資料表命名\n目前命名符合規範。\n\n### 2. 欄位命名\n建議統一使用 `snake_case` 格式。\n\n### 3. 缺失欄位\n可考慮加入 `created_at`、`updated_at` 追蹤時間戳記。\n\n（Mock 模式 — 連接真實 API 以獲得 AI 建議）";
      const stream = new ReadableStream({
        async start(ctrl) {
          const send = (obj: unknown) =>
            ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
          const chars = [...mockText];
          for (let i = 0; i < chars.length; i += 4) {
            await delay(10);
            send({ type: "token", text: chars.slice(i, i + 4).join("") });
          }
          send({ type: "done" });
          ctrl.close();
        },
      });
      return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
    },

    exportSchema: async (id: number): Promise<Response> => {
      await delay(100);
      const schema = getDetail(id);
      const body = JSON.stringify({ exportVersion: 1, exportedAt: new Date().toISOString(), schema: { name: schema.name, description: schema.description, domain: schema.domain, layerType: schema.layerType, tags: schema.tags, environment: schema.environment, targetDb: schema.targetDb, tables: schema.tables.map(t => ({ name: t.name, comment: t.comment, sampleData: t.sampleData ?? [], fields: t.fields })) } });
      return new Response(body, { headers: { "Content-Type": "application/json" } });
    },

    importSchema: async (body: { schema?: { name?: string } }): Promise<SchemaDetail> => {
      await delay(200);
      const name = body?.schema?.name ?? "imported-schema";
      const id = uid();
      const now = new Date().toISOString();
      const detail: SchemaDetail = { id, name, description: null, domain: "semiconductor", suiteId: null, layerType: null, tags: [], environment: null, targetDb: null, createdAt: now, updatedAt: now, tables: [] };
      schemaDetails[id] = detail;
      schemas = [...schemas, { id, name, description: null, domain: "semiconductor", suiteId: null, layerType: null, tags: [], environment: null, targetDb: null, createdAt: now, updatedAt: now }];
      return detail;
    },

    versions: {
      list: async (id: number): Promise<SchemaVersion[]> => {
        await delay(80);
        return id === 1 ? mockVersions : [];
      },
      save: async (id: number, message?: string): Promise<SchemaVersion> => {
        await delay(120);
        const versionNo = id === 1 ? mockVersions.length + 1 : 1;
        return {
          id: uid(), schemaId: id, versionNo,
          message: message ?? null,
          createdAt: new Date().toISOString(),
          diff: null,
          snapshot: { ...getDetail(id), wideTables: [] },
        };
      },
    },
    getRules: async (_id: number): Promise<{ selectedRuleIds: string[] }> => {
      await delay(60);
      return { selectedRuleIds: rules.map(r => r.id) };
    },
    setRules: async (_id: number, body: { selectedRuleIds: string[] | null }): Promise<{ selectedRuleIds: string[] }> => {
      await delay(80);
      return { selectedRuleIds: body.selectedRuleIds ?? rules.map(r => r.id) };
    },
  },

  tables: {
    create: async (schemaId: number, b: { name: string; comment?: string }): Promise<Table> => {
      await delay(80);
      const t: Table = { id: uid(), name: b.name, comment: b.comment ?? null, fields: [] };
      const d = getDetail(schemaId);
      schemaDetails[schemaId] = { ...d, tables: [...d.tables, t] };
      return t;
    },
    update: async (_id: number, _b: unknown): Promise<void> => { await delay(60); },
    delete: async (_id: number): Promise<void> => { await delay(60); },
  },

  fields: {
    create: async (tableId: number, b: {
      name: string; data_type: string; nullable?: boolean;
      default_value?: string | null; is_primary_key?: boolean;
      is_unique?: boolean; comment?: string | null; position?: number;
    }): Promise<Field> => {
      await delay(60);
      return {
        id: uid(), name: b.name, dataType: b.data_type,
        nullable: b.nullable ?? true, defaultValue: b.default_value ?? null,
        isPrimaryKey: b.is_primary_key ?? false,
        isUnique: b.is_unique ?? false,
        comment: b.comment ?? null,
        position: b.position ?? 0,
      };
      void tableId;
    },
    update: async (_id: number, _b: unknown): Promise<void> => { await delay(60); },
    delete: async (_id: number): Promise<void> => { await delay(60); },
  },

  wideTables: {
    list: async (schemaId: number): Promise<WideTableSummary[]> => {
      await delay(70);
      return schemaId === 1 ? mockWideSummaries : [];
    },
    get: async (_schemaId: number, id: number): Promise<WideTableDetail> => {
      await delay(80);
      return id === 1 ? mockWideDetail : { ...mockWideDetail, id, sources: [], columns: [] };
    },
    preview: async (schemaId: number, tableRefs: { schemaId: number; tableId: number }[]): Promise<WideTablePreview> => {
      await delay(150);
      const schema = getDetail(schemaId);
      const tableIds = tableRefs.map(r => r.tableId);
      const sourceTables = schema.tables.filter(t => tableIds.includes(t.id));
      const sources = sourceTables.map((t, i) => ({
        schemaId, schemaName: schema.name,
        tableId: t.id, tableName: t.name,
        colPrefix: i === 0 ? "" : t.name,
        joinType: (i === 0 ? "BASE" : "LEFT") as "BASE" | "LEFT",
        joinCondition: i === 0 ? null : `${t.name}.id = ${sourceTables[0]?.name ?? "t"}.id`,
        position: i,
      }));
      const columns = sourceTables.flatMap((t, si) =>
        t.fields.map((f, fi) => ({
          sourcePosition: si, tableId: t.id, tableName: t.name,
          fieldId: f.id, fieldName: f.name, dataType: f.dataType,
          outputName: si === 0 ? f.name : `${t.name}_${f.name}`,
          included: true, hasConflict: false,
          position: si * 100 + fi,
        }))
      );
      const sql = `CREATE OR REPLACE VIEW v_preview AS\nSELECT\n${columns.map(c => `  ${c.tableName}.${c.fieldName} AS ${c.outputName}`).join(",\n")}\nFROM ${sources.map((s, i) => i === 0 ? s.tableName : `${s.joinType} JOIN ${s.tableName} ON ${s.joinCondition}`).join("\n")};`;
      return { sources, columns, sql };
    },
    create: async (_schemaId: number, body: { name: string; description?: string; sources: unknown[]; columns: unknown[] }): Promise<WideTableDetail> => {
      await delay(120);
      return { ...mockWideDetail, id: uid(), name: body.name, description: body.description ?? null };
    },
    delete: async (_schemaId: number, _id: number): Promise<void> => { await delay(80); },
    ddl: async (_schemaId: number, id: number): Promise<string> => {
      await delay(80);
      return id === 1 ? `CREATE OR REPLACE VIEW \`v_bom_flat\` AS\nSELECT\n  parts.part_no AS parent_part_no,\n  parts.part_name AS parent_part_name,\n  bom_items.quantity,\n  bom_items.bom_type,\n  part_revisions.revision_no AS rev_revision_no\nFROM parts\nINNER JOIN bom_items ON bom_items.parent_id = parts.id\nLEFT JOIN part_revisions ON part_revisions.part_id = bom_items.child_id;` : "";
    },
  },

  importDdl: {
    check: async (_schemaId: number, sql: string): Promise<DryRunResult> => {
      await delay(200);
      const tableMatches = [...sql.matchAll(/CREATE\s+TABLE\s+`?(\w+)`?/gi)];
      return {
        dryRun: true,
        check: {
          tables: tableMatches.map(m => ({ name: m[1] ?? "unknown", comment: null, fieldCount: 3 })),
          violations: [],
          summary: { errors: 0, warnings: 0, infos: 0, passed: true, tablesFound: tableMatches.length },
          parseErrors: [],
        },
      };
    },
    import: async (_schemaId: number, sql: string): Promise<ImportResult> => {
      await delay(300);
      const tableMatches = [...sql.matchAll(/CREATE\s+TABLE\s+`?(\w+)`?/gi)];
      return {
        dryRun: false,
        check: {
          tables: tableMatches.map(m => ({ name: m[1] ?? "unknown", comment: null, fieldCount: 3 })),
          violations: [],
          summary: { errors: 0, warnings: 0, infos: 0, passed: true, tablesFound: tableMatches.length },
          parseErrors: [],
        },
        import: { tablesCreated: tableMatches.length, fieldsCreated: tableMatches.length * 3 },
      };
    },
  },

  rules: {
    list: async (): Promise<{ rules: RuleDetail[] }> => {
      await delay(60);
      return { rules: [...rules] };
    },
    update: async (ruleId: string, patch: Partial<{ severity: "error" | "warning" | "info"; enabled: boolean; config: Record<string, unknown> }>): Promise<{ rule: RuleDetail }> => {
      await delay(80);
      rules = rules.map(r => r.id === ruleId ? { ...r, ...patch } : r);
      const rule = rules.find(r => r.id === ruleId) ?? rules[0]!;
      return { rule };
    },
    snapshots: {
      list: async (): Promise<{ snapshots: RuleSnapshot[] }> => {
        await delay(60);
        return { snapshots: [] as RuleSnapshot[] };
      },
      save: async (name: string): Promise<{ snapshot: RuleSnapshot }> => {
        await delay(100);
        return { snapshot: { id: Date.now().toString(), name, createdAt: new Date().toISOString(), overrides: {} } as RuleSnapshot };
      },
      restore: async (_id: string): Promise<{ rules: RuleDetail[] }> => {
        await delay(80);
        return { rules: [] as RuleDetail[] };
      },
      delete: async (_id: string): Promise<void> => {
        await delay(60);
      },
    },
  },

  naming: {
    list: async (_domain?: string): Promise<NamingEntry[]> => {
      await delay(80);
      return [...naming];
    },
    create: async (b: { concept: string; std_name: string; aliases: string[]; domain?: string; description?: string }): Promise<NamingEntry> => {
      await delay(100);
      const entry: NamingEntry = {
        id: uid(), concept: b.concept, stdName: b.std_name,
        aliases: b.aliases, domain: b.domain ?? "semiconductor",
        tags: [], layers: [], aiDescription: null, description: b.description ?? null,
        updatedAt: new Date().toISOString(),
      };
      naming = [...naming, entry];
      return entry;
    },
    update: async (id: number, b: Partial<{ concept: string; std_name: string; aliases: string[]; domain: string; tags: string[]; ai_description: string; description: string; layers: string[] }>): Promise<NamingEntry> => {
      await delay(80);
      naming = naming.map(e => e.id === id ? {
        ...e,
        concept: b.concept ?? e.concept,
        stdName: b.std_name ?? e.stdName,
        aliases: b.aliases ?? e.aliases,
        domain: b.domain ?? e.domain,
        tags: b.tags ?? e.tags,
        layers: b.layers ?? e.layers,
        aiDescription: b.ai_description ?? e.aiDescription,
        description: b.description ?? e.description,
      } : e);
      return naming.find(e => e.id === id)!;
    },
    delete: async (id: number): Promise<void> => {
      await delay(80);
      naming = naming.filter(e => e.id !== id);
    },
    check: async (names: string[]) => {
      await delay(100);
      return names.map(n => ({
        fieldName: n,
        result: {
          status: "exact" as const,
          stdName: n, matchedAlias: null, distance: null,
        },
      }));
    },
    suggestAI: async (id: number): Promise<NamingEntry> => {
      // ┌─────────────────────────────────────────────────────────────────────┐
      // │  [API_SETUP] mock suggestAI — real impl calls Claude via            │
      // │  POST /api/v1/naming-dictionary/:id/suggest                         │
      // │  Set VITE_USE_MOCK=false and configure ANTHROPIC_API_KEY to enable  │
      // └─────────────────────────────────────────────────────────────────────┘
      await delay(1200);
      const entry = naming.find(e => e.id === id);
      if (!entry) throw new Error("Not found");
      const updated = {
        ...entry,
        aiDescription: `（Mock）${entry.concept} — 在半導體製造流程中作為 ${entry.stdName} 使用，用於識別與追蹤相關業務實體。`,
        tags: entry.tags.length ? entry.tags : ["識別碼"],
      };
      naming = naming.map(e => e.id === id ? updated : e);
      return updated;
    },
  },
  llm: {
    generate: async (_prompt: string, _domain = "semiconductor"): Promise<Response> => {
      const mockSse = new ReadableStream({
        start(controller) {
          const enc = new TextEncoder();
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: "token", text: "（Mock）已生成 Schema。" })}\n\n`));
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: "done", schemaId: 1, schemaName: "Mock Schema", tableCount: 2 })}\n\n`));
          controller.close();
        },
      });
      return new Response(mockSse, { headers: { "Content-Type": "text/event-stream" } });
    },
  },
  skills: {
    list: async () => ({ skills: [] }),
    update: async (_name: string, _content: string) => ({ ok: true }),
  },
  settings: {
    getLlm: async () => ({ settings: { provider: "anthropic" as const, apiKey: "", baseUrl: "", model: "" } }),
    updateLlm: async (patch: Record<string, unknown>) => ({ settings: { provider: "anthropic" as const, apiKey: "", baseUrl: "", model: "", ...patch } as { provider: "anthropic" | "openai"; apiKey: string; baseUrl: string; model: string } }),
    testLlm: async () => ({ ok: false, message: "Mock mode — no real API" }),
    getStorage: async () => ({ minio: {}, ready: false }),
    updateStorage: async (_patch: Record<string, unknown>) => ({ minio: {}, ready: false }),
    testStorage: async () => ({ ok: false, message: "Mock mode" }),
    pushToStorage: async () => ({ pushed: 0, errors: 0 }),
    restoreFromStorage: async () => ({ restored: 0, errors: 0 }),
    getLayers: async (): Promise<LayerSettings> => ({
      schemaLayers: [{ id: "transaction", label: "Transaction" }, { id: "r2u", label: "R2U" }, { id: "unified", label: "Unified" }],
      dictLayers:   [{ id: "transaction", label: "Transaction" }, { id: "r2u", label: "R2U" }, { id: "unified", label: "Unified" }, { id: "general", label: "General" }],
    }),
    updateLayers: async (patch: Partial<LayerSettings>): Promise<LayerSettings> => ({
      schemaLayers: patch.schemaLayers ?? [{ id: "transaction", label: "Transaction" }, { id: "r2u", label: "R2U" }, { id: "unified", label: "Unified" }],
      dictLayers:   patch.dictLayers   ?? [{ id: "transaction", label: "Transaction" }, { id: "r2u", label: "R2U" }, { id: "unified", label: "Unified" }, { id: "general", label: "General" }],
    }),
  },
  datahub: {
    getSettings: async () => ({ settings: { url: "", token: "", platform: "mysql", env: "PROD" as const } }),
    updateSettings: async (patch: Record<string, unknown>) => ({ settings: { url: "", token: "", platform: "mysql", env: "PROD" as const, ...patch } as import("../api.js").DataHubSettings }),
    test: async () => ({ ok: false, message: "Mock mode — no real DataHub" }),
    push: async (_schemaId: number, _opts?: { tableIds?: number[]; wideTableIds?: number[] }) => ({
      id: "mock-" + Date.now(), schemaId: _schemaId, schemaName: "mock-schema",
      tablesTotal: 0, tablesOk: 0, tablesFailed: 0, errors: ["Mock mode"],
      pushedAt: new Date().toISOString(), status: "failed" as const,
    }),
    getPushLog: async () => [],
  },
  suites: {
    list: async () => [],
    create: async (_b: { name: string; description?: string; color?: string }) => ({
      id: uid(), name: _b.name, description: _b.description ?? null, color: _b.color ?? null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }),
    update: async (id: number, _b: Partial<{ name: string; description: string | null; color: string | null }>) => ({
      id, name: _b.name ?? "", description: _b.description ?? null, color: _b.color ?? null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }),
    delete: async (_id: number): Promise<void> => { await delay(60); },
  },
  reload: async () => ({ ok: true, reloadedAt: new Date().toISOString() }),
};
