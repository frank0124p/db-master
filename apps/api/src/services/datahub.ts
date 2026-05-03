import type { DataHubSettings } from "../repositories/settings.js";
import { getSchemaById } from "../repositories/schemas.js";
import { listWideTables, getWideTable } from "../repositories/wide-tables.js";
import * as store from "../db/fileStore.js";

// ── Types ──────────────────────────────────────────────────────────────────────

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

export interface DataHubDataset {
  urn: string;
  platform: string;
  name: string;
  description: string | null;
  env: string;
  fields: DataHubField[];
}

export interface DataHubField {
  fieldPath: string;
  type: string;
  nativeDataType: string;
  nullable: boolean;
  description: string | null;
  isPrimaryKey: boolean;
}

// ── Push log (last 100 entries) ───────────────────────────────────────────────

const LOG_FILE = () => store.dataPath("datahub-push-log.json");

export async function getPushLog(): Promise<PushRecord[]> {
  return (await store.readJson<PushRecord[]>(LOG_FILE())) ?? [];
}

async function appendLog(record: PushRecord): Promise<void> {
  const log = await getPushLog();
  log.unshift(record);
  await store.writeJson(LOG_FILE(), log.slice(0, 100));
}

// ── Schema → DataHub mapping ───────────────────────────────────────────────────

function sqlTypeToDataHubType(sqlType: string): string {
  const upper = sqlType.toUpperCase();
  if (upper.startsWith("VARCHAR") || upper.startsWith("CHAR") || upper === "TEXT" || upper === "LONGTEXT") return "STRING";
  if (upper === "TINYINT" || upper === "SMALLINT" || upper === "MEDIUMINT" || upper === "INT" || upper === "BIGINT") return "NUMBER";
  if (upper.startsWith("DECIMAL") || upper.startsWith("FLOAT") || upper.startsWith("DOUBLE")) return "NUMBER";
  if (upper === "BOOLEAN" || upper === "TINYINT(1)") return "BOOLEAN";
  if (upper === "DATE") return "DATE";
  if (upper === "DATETIME" || upper === "TIMESTAMP") return "TIME";
  if (upper.startsWith("JSON")) return "UNION";
  return "BYTES";
}

function buildUrn(platform: string, env: string, schemaName: string, tableName: string): string {
  const platformLower = platform.toLowerCase();
  const envUpper = env.toUpperCase();
  return `urn:li:dataset:(urn:li:dataPlatform:${platformLower},${schemaName}.${tableName},${envUpper})`;
}

// ── Test connection (stub — implement with real DataHub REST when URL known) ──

export async function testConnection(settings: Partial<DataHubSettings>): Promise<{ ok: boolean; message: string }> {
  if (!settings.url?.trim()) {
    return { ok: false, message: "未設定 DataHub URL" };
  }
  // TODO: replace with real HTTP check when API URL is provided
  // Real impl: GET {url}/config  with Authorization: Bearer {token}
  return { ok: false, message: "STUB：API URL 尚未實作，請提供 DataHub REST API 端點後更新此函式" };
}

export interface PushOpts {
  tableIds?: number[];     // if omitted → all tables in schema
  wideTableIds?: number[]; // if omitted → no wide tables
}

// ── Push one schema (stub — implement when DataHub REST API is known) ─────────

export async function pushSchema(
  schemaId: number,
  settings: Partial<DataHubSettings>,
  opts?: PushOpts,
): Promise<PushRecord> {
  const record: PushRecord = {
    id: `${Date.now()}-${schemaId}`,
    schemaId,
    schemaName: "",
    tablesTotal: 0,
    tablesOk: 0,
    tablesFailed: 0,
    errors: [],
    pushedAt: new Date().toISOString(),
    status: "failed",
  };

  if (!settings.url?.trim() || !settings.token?.trim()) {
    record.errors.push("DataHub URL 或 Token 未設定，請先在設定頁填寫");
    await appendLog(record);
    return record;
  }

  const schema = await getSchemaById(schemaId);
  record.schemaName = schema.name;

  const platform = settings.platform ?? "mariadb";
  const env = settings.env ?? "DEV";
  const schemaSlug = schema.name.toLowerCase().replace(/\s+/g, "_");

  // ── Build table datasets ──────────────────────────────────────────────────
  const tables = opts?.tableIds
    ? schema.tables.filter(t => opts.tableIds!.includes(t.id))
    : schema.tables;

  const tableDatasets: DataHubDataset[] = tables.map(table => ({
    urn: buildUrn(platform, env, schemaSlug, table.name),
    platform,
    name: `${schemaSlug}.${table.name}`,
    description: table.comment,
    env,
    fields: table.fields.map(f => ({
      fieldPath: f.name,
      type: sqlTypeToDataHubType(f.dataType),
      nativeDataType: f.dataType,
      nullable: f.nullable,
      description: f.comment,
      isPrimaryKey: f.isPrimaryKey,
    })),
  }));

  // ── Build wide table datasets ─────────────────────────────────────────────
  const wideDatasets: DataHubDataset[] = [];
  if (opts?.wideTableIds?.length) {
    for (const wid of opts.wideTableIds) {
      const wt = await getWideTable(wid);
      if (!wt) continue;
      const includedCols = wt.columns.filter(c => c.included);
      wideDatasets.push({
        urn: buildUrn(platform, env, schemaSlug, wt.name),
        platform,
        name: `${schemaSlug}.${wt.name}`,
        description: wt.description,
        env,
        fields: includedCols.map(c => ({
          fieldPath: c.outputName,
          type: sqlTypeToDataHubType(c.fieldType),
          nativeDataType: c.fieldType,
          nullable: true,
          description: null,
          isPrimaryKey: false,
        })),
      });
    }
  }

  const allDatasets = [...tableDatasets, ...wideDatasets];
  record.tablesTotal = allDatasets.length;

  // TODO: replace loop below with real DataHub REST calls
  // Real impl (DataHub GMS):
  //   POST {url}/entities?action=ingest
  //   Headers: Authorization: Bearer {token}, Content-Type: application/json
  //   Body: { proposal: { entityType: "dataset", entityUrn: urn, aspectName: "schemaMetadata", aspect: { ... } } }
  //
  // Or using newer OpenAPI v3:
  //   POST {url}/openapi/v2/entity/dataset
  for (const dataset of allDatasets) {
    record.errors.push(`STUB [${dataset.name}]：API 呼叫尚未實作 — urn=${dataset.urn}`);
    record.tablesFailed++;
  }

  record.status = record.tablesOk === record.tablesTotal ? "ok"
    : record.tablesOk > 0 ? "partial"
    : "failed";

  await appendLog(record);
  return record;
}
