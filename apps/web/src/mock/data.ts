/**
 * Mock data for all features — semiconductor / PLM domain.
 * Used when VITE_USE_MOCK=true.  No DB or API server required.
 */

import type {
  Schema, SchemaDetail, Table, Field,
  NamingEntry, SchemaVersion,
  WideTableSummary, WideTableDetail,
  RuleDetail,
} from "../api.js";

// ── helpers ───────────────────────────────────────────────────────────────────

const ts = (daysAgo = 0) =>
  new Date(Date.now() - daysAgo * 86_400_000).toISOString();

function field(
  id: number, tableId: number, name: string, dataType: string,
  opts: Partial<Field> = {}
): Field {
  return {
    id, name, dataType,
    nullable: opts.nullable ?? true,
    defaultValue: opts.defaultValue ?? null,
    isPrimaryKey: opts.isPrimaryKey ?? false,
    isUnique: opts.isUnique ?? false,
    comment: opts.comment ?? null,
    position: opts.position ?? id,
  };
}

// ── Schema 1: PLM Core ────────────────────────────────────────────────────────

const plmTables: Table[] = [
  {
    id: 10, name: "parts", comment: "零件主檔 — 所有受管控物料的唯一來源",
    fields: [
      field(1001, 10, "id",              "BIGINT",       { isPrimaryKey: true, nullable: false, comment: "系統主鍵" }),
      field(1002, 10, "part_no",         "VARCHAR(32)",  { isUnique: true,     nullable: false, comment: "料號，全域唯一" }),
      field(1003, 10, "part_name",       "VARCHAR(255)", { nullable: false,                    comment: "零件名稱" }),
      field(1004, 10, "part_type",       "VARCHAR(32)",  { nullable: false,                    comment: "IC / PCB / MECH / ASSY" }),
      field(1005, 10, "lifecycle_state", "VARCHAR(32)",  { nullable: false,                    comment: "draft → review → released → obsolete" }),
      field(1006, 10, "process_node",    "VARCHAR(32)",  { comment: "製程節點，如 TSMC 28nm" }),
      field(1007, 10, "description",     "TEXT",         { comment: "技術規格說明" }),
      field(1008, 10, "created_at",      "TIMESTAMP",    { nullable: false, comment: "建立時間" }),
      field(1009, 10, "updated_at",      "TIMESTAMP",    { nullable: false, comment: "更新時間" }),
    ],
  },
  {
    id: 11, name: "part_revisions", comment: "零件版本管理 — 每次 ECO 後建立新版本",
    fields: [
      field(1101, 11, "id",             "BIGINT",      { isPrimaryKey: true, nullable: false }),
      field(1102, 11, "part_id",        "BIGINT",      { nullable: false, comment: "FK → parts.id" }),
      field(1103, 11, "revision_no",    "VARCHAR(8)",  { nullable: false, comment: "A0 / A1 / B0" }),
      field(1104, 11, "revision_state", "VARCHAR(32)", { nullable: false, comment: "draft / released / obsolete" }),
      field(1105, 11, "released_at",    "TIMESTAMP",   { comment: "正式發行時間" }),
      field(1106, 11, "created_at",     "TIMESTAMP",   { nullable: false }),
      field(1107, 11, "updated_at",     "TIMESTAMP",   { nullable: false }),
    ],
  },
  {
    id: 12, name: "bom_items", comment: "BOM 結構 — 父子零件關係",
    fields: [
      field(1201, 12, "id",        "BIGINT",      { isPrimaryKey: true, nullable: false }),
      field(1202, 12, "parent_id", "BIGINT",      { nullable: false, comment: "FK → parts.id（父件）" }),
      field(1203, 12, "child_id",  "BIGINT",      { nullable: false, comment: "FK → parts.id（子件）" }),
      field(1204, 12, "quantity",  "DECIMAL(12,4)", { nullable: false }),
      field(1205, 12, "unit",      "VARCHAR(16)",  { nullable: false, comment: "EA / KG / M" }),
      field(1206, 12, "bom_type",  "VARCHAR(16)",  { comment: "EBOM / MBOM" }),
      field(1207, 12, "position",  "INT",          { }),
      field(1208, 12, "created_at","TIMESTAMP",   { nullable: false }),
      field(1209, 12, "updated_at","TIMESTAMP",   { nullable: false }),
    ],
  },
  {
    id: 13, name: "engineering_changes", comment: "ECO 工程變更單",
    fields: [
      field(1301, 13, "id",             "BIGINT",       { isPrimaryKey: true, nullable: false }),
      field(1302, 13, "ec_no",          "VARCHAR(32)",  { isUnique: true, nullable: false, comment: "ECO 編號" }),
      field(1303, 13, "title",          "VARCHAR(255)", { nullable: false }),
      field(1304, 13, "status",         "VARCHAR(32)",  { nullable: false, comment: "draft / pending / approved / closed" }),
      field(1305, 13, "approver_id",    "VARCHAR(64)",  { comment: "核准者工號" }),
      field(1306, 13, "effective_date", "DATE",         { }),
      field(1307, 13, "created_at",     "TIMESTAMP",    { nullable: false }),
      field(1308, 13, "updated_at",     "TIMESTAMP",    { nullable: false }),
    ],
  },
  {
    id: 14, name: "suppliers", comment: "供應商主檔",
    fields: [
      field(1401, 14, "id",            "BIGINT",       { isPrimaryKey: true, nullable: false }),
      field(1402, 14, "supplier_code", "VARCHAR(32)",  { isUnique: true, nullable: false }),
      field(1403, 14, "supplier_name", "VARCHAR(255)", { nullable: false }),
      field(1404, 14, "country",       "VARCHAR(64)",  { }),
      field(1405, 14, "status",        "VARCHAR(32)",  { nullable: false, comment: "active / inactive" }),
      field(1406, 14, "created_at",    "TIMESTAMP",    { nullable: false }),
      field(1407, 14, "updated_at",    "TIMESTAMP",    { nullable: false }),
    ],
  },
  {
    id: 15, name: "part_suppliers", comment: "零件供應商對應（多對多）",
    fields: [
      field(1501, 15, "id",              "BIGINT",  { isPrimaryKey: true, nullable: false }),
      field(1502, 15, "part_id",         "BIGINT",  { nullable: false }),
      field(1503, 15, "supplier_id",     "BIGINT",  { nullable: false }),
      field(1504, 15, "preferred",       "TINYINT(1)", { nullable: false, comment: "是否為首選供應商" }),
      field(1505, 15, "lead_time_days",  "INT",     { comment: "交期（天）" }),
      field(1506, 15, "created_at",      "TIMESTAMP", { nullable: false }),
    ],
  },
];

export const plmSchema: SchemaDetail = {
  id: 1, name: "PLM Core",
  description: "產品生命週期管理核心 — 零件、BOM、ECO 與供應商管理",
  domain: "semiconductor", suiteId: null, layerType: null,
  tags: [], environment: null, targetDb: null,
  createdAt: ts(30), updatedAt: ts(1),
  tables: plmTables,
};

// ── Schema 2: MES Process ─────────────────────────────────────────────────────

const mesTables: Table[] = [
  {
    id: 20, name: "lots", comment: "批次主檔",
    fields: [
      field(2001, 20, "id",         "BIGINT",      { isPrimaryKey: true, nullable: false }),
      field(2002, 20, "lot_id",     "VARCHAR(32)", { isUnique: true, nullable: false, comment: "批號，格式 LOT-YYYYMMDD-NNN" }),
      field(2003, 20, "product_id", "BIGINT",      { nullable: false, comment: "FK → products.id" }),
      field(2004, 20, "quantity",   "INT",         { nullable: false }),
      field(2005, 20, "status",     "VARCHAR(32)", { nullable: false, comment: "queue / run / hold / complete / scrapped" }),
      field(2006, 20, "created_at", "TIMESTAMP",  { nullable: false }),
      field(2007, 20, "updated_at", "TIMESTAMP",  { nullable: false }),
    ],
  },
  {
    id: 21, name: "wafers", comment: "晶圓片資訊",
    fields: [
      field(2101, 21, "id",         "BIGINT",     { isPrimaryKey: true, nullable: false }),
      field(2102, 21, "lot_id",     "BIGINT",     { nullable: false, comment: "FK → lots.id" }),
      field(2103, 21, "wafer_no",   "TINYINT",    { nullable: false, comment: "片號 1–25" }),
      field(2104, 21, "status",     "VARCHAR(32)", { nullable: false }),
      field(2105, 21, "created_at", "TIMESTAMP",  { nullable: false }),
      field(2106, 21, "updated_at", "TIMESTAMP",  { nullable: false }),
    ],
  },
  {
    id: 22, name: "operations", comment: "製程操作記錄",
    fields: [
      field(2201, 22, "id",             "BIGINT",      { isPrimaryKey: true, nullable: false }),
      field(2202, 22, "lot_id",         "BIGINT",      { nullable: false }),
      field(2203, 22, "operation_code", "VARCHAR(32)", { nullable: false, comment: "站點代碼" }),
      field(2204, 22, "equip_id",       "VARCHAR(32)", { comment: "設備 ID" }),
      field(2205, 22, "operator_id",    "VARCHAR(64)", { comment: "操作員工號" }),
      field(2206, 22, "start_time",     "DATETIME",   { }),
      field(2207, 22, "end_time",       "DATETIME",   { }),
      field(2208, 22, "created_at",     "TIMESTAMP",  { nullable: false }),
      field(2209, 22, "updated_at",     "TIMESTAMP",  { nullable: false }),
    ],
  },
  {
    id: 23, name: "equipment", comment: "設備主檔",
    fields: [
      field(2301, 23, "id",          "BIGINT",       { isPrimaryKey: true, nullable: false }),
      field(2302, 23, "equip_id",    "VARCHAR(32)",  { isUnique: true, nullable: false }),
      field(2303, 23, "equip_name",  "VARCHAR(128)", { nullable: false }),
      field(2304, 23, "equip_type",  "VARCHAR(32)",  { comment: "CVD / CMP / PHOTO / ETCH / DIFF" }),
      field(2305, 23, "status",      "VARCHAR(32)",  { nullable: false, comment: "up / down / pm / idle" }),
      field(2306, 23, "created_at",  "TIMESTAMP",   { nullable: false }),
      field(2307, 23, "updated_at",  "TIMESTAMP",   { nullable: false }),
    ],
  },
];

export const mesSchema: SchemaDetail = {
  id: 2, name: "MES Process",
  description: "製造執行系統 — 批次、晶圓、製程操作與設備管理",
  domain: "semiconductor", suiteId: null, layerType: null,
  tags: [], environment: null, targetDb: null,
  createdAt: ts(20), updatedAt: ts(2),
  tables: mesTables,
};

// ── Schema list ───────────────────────────────────────────────────────────────

export const mockSchemas: Schema[] = [
  { id: 1, name: "PLM Core",    description: plmSchema.description, domain: "semiconductor", suiteId: null, layerType: null, tags: [], environment: null, targetDb: null, createdAt: ts(30), updatedAt: ts(1) },
  { id: 2, name: "MES Process", description: mesSchema.description, domain: "semiconductor", suiteId: null, layerType: null, tags: [], environment: null, targetDb: null, createdAt: ts(20), updatedAt: ts(2) },
];

// ── Wide Tables (for PLM Core) ────────────────────────────────────────────────

export const mockWideSummaries: WideTableSummary[] = [
  { id: 1, schemaId: 1, name: "v_bom_flat", description: "BOM 展開視圖 — 父件 × 子件 × 版本", createdAt: ts(5), updatedAt: ts(1) },
];

export const mockWideDetail: WideTableDetail = {
  id: 1, schemaId: 1, name: "v_bom_flat",
  description: "BOM 展開視圖 — 父件 × 子件 × 版本",
  createdAt: ts(5), updatedAt: ts(1),
  sources: [
    { id: 1, wideTableId: 1, schemaId: 1, tableId: 10, tableName: "parts",          colPrefix: "parent", joinType: "BASE",  joinCondition: null,                           position: 0 },
    { id: 2, wideTableId: 1, schemaId: 1, tableId: 12, tableName: "bom_items",      colPrefix: null,     joinType: "INNER", joinCondition: "bom_items.parent_id = parts.id", position: 1 },
    { id: 3, wideTableId: 1, schemaId: 1, tableId: 11, tableName: "part_revisions", colPrefix: "rev",    joinType: "LEFT",  joinCondition: "part_revisions.part_id = bom_items.child_id", position: 2 },
  ],
  columns: [
    { id: 1,  wideTableId: 1, sourceId: 1, fieldId: 1002, fieldName: "part_no",        fieldType: "VARCHAR(32)",   tableName: "parts",          outputName: "parent_part_no",    included: true,  position: 0 },
    { id: 2,  wideTableId: 1, sourceId: 1, fieldId: 1003, fieldName: "part_name",      fieldType: "VARCHAR(255)",  tableName: "parts",          outputName: "parent_part_name",  included: true,  position: 1 },
    { id: 3,  wideTableId: 1, sourceId: 1, fieldId: 1005, fieldName: "lifecycle_state",fieldType: "VARCHAR(32)",   tableName: "parts",          outputName: "parent_lifecycle",  included: true,  position: 2 },
    { id: 4,  wideTableId: 1, sourceId: 2, fieldId: 1203, fieldName: "child_id",       fieldType: "BIGINT",        tableName: "bom_items",      outputName: "child_id",          included: true,  position: 3 },
    { id: 5,  wideTableId: 1, sourceId: 2, fieldId: 1204, fieldName: "quantity",       fieldType: "DECIMAL(12,4)", tableName: "bom_items",      outputName: "quantity",          included: true,  position: 4 },
    { id: 6,  wideTableId: 1, sourceId: 2, fieldId: 1206, fieldName: "bom_type",       fieldType: "VARCHAR(16)",   tableName: "bom_items",      outputName: "bom_type",          included: true,  position: 5 },
    { id: 7,  wideTableId: 1, sourceId: 3, fieldId: 1103, fieldName: "revision_no",    fieldType: "VARCHAR(8)",    tableName: "part_revisions", outputName: "rev_revision_no",   included: true,  position: 6 },
    { id: 8,  wideTableId: 1, sourceId: 3, fieldId: 1104, fieldName: "revision_state", fieldType: "VARCHAR(32)",   tableName: "part_revisions", outputName: "rev_revision_state",included: true,  position: 7 },
    { id: 9,  wideTableId: 1, sourceId: 3, fieldId: 1105, fieldName: "released_at",    fieldType: "TIMESTAMP",     tableName: "part_revisions", outputName: "rev_released_at",   included: false, position: 8 },
  ],
};

// ── Naming Dictionary ─────────────────────────────────────────────────────────

export const mockNaming: NamingEntry[] = [
  { id: 1,  concept: "批號",       stdName: "lot_id",           aliases: ["batch_id","lot_no"],          domain: "semiconductor", tags: ["批次相關","識別碼"], aiDescription: "批次唯一識別碼，格式 LOT-YYYYMMDD-NNN，生產批次追蹤主鍵。", description: null, layers: [], updatedAt: "2024-01-01T00:00:00.000Z" },
  { id: 2,  concept: "晶圓 ID",    stdName: "wafer_id",         aliases: ["wafer_no","wfr_id"],          domain: "semiconductor", tags: ["批次相關","識別碼"], aiDescription: "批次內晶圓片編號，通常為 1–25 的整數，配合 lot_id 唯一定位每片晶圓。", description: null, layers: [], updatedAt: "2024-01-01T00:00:00.000Z" },
  { id: 3,  concept: "設備 ID",    stdName: "equip_id",         aliases: ["machine_id","tool_id","eqp_id"], domain: "semiconductor", tags: ["設備相關","識別碼"], aiDescription: "製程設備唯一識別碼，對應設備主檔，用於製程履歷查詢與 OEE 分析。", description: null, layers: [], updatedAt: "2024-01-01T00:00:00.000Z" },
  { id: 4,  concept: "操作員工號", stdName: "operator_id",      aliases: ["op_id","user_id","emp_id"],   domain: "semiconductor", tags: ["操作人員","識別碼"], aiDescription: "執行製程操作的員工工號，用於責任歸屬與稽核追蹤。", description: null, layers: [], updatedAt: "2024-01-01T00:00:00.000Z" },
  { id: 5,  concept: "料號",       stdName: "part_no",          aliases: ["p_no","item_no","material_no"], domain: "semiconductor", tags: ["產品相關","識別碼"], aiDescription: "零件唯一料號，遵循命名規則，全域不重複，廢止後不得再用。", description: null, layers: [], updatedAt: "2024-01-01T00:00:00.000Z" },
  { id: 6,  concept: "良率",       stdName: "yield_rate",       aliases: ["yield","pass_rate"],          domain: "semiconductor", tags: ["良率品質","量測值"], aiDescription: "晶圓或批次良率，0~1 之間的小數，代表合格晶粒佔總晶粒的比例。", description: null, layers: [], updatedAt: "2024-01-01T00:00:00.000Z" },
  { id: 7,  concept: "站點代碼",   stdName: "operation_code",   aliases: ["op_code","step_id","process_step"], domain: "semiconductor", tags: ["製程相關","識別碼"], aiDescription: "製程站點代碼，對應工藝流程圖中的每個加工步驟。", description: null, layers: [], updatedAt: "2024-01-01T00:00:00.000Z" },
  { id: 8,  concept: "狀態",       stdName: "status",           aliases: ["state","sts"],                domain: "semiconductor", tags: ["狀態"], aiDescription: "業務物件的當前狀態值，具體取值由業務規則定義（如 lot 批次狀態：run/hold/complete）。", description: null, layers: [], updatedAt: "2024-01-01T00:00:00.000Z" },
  { id: 9,  concept: "數量",       stdName: "quantity",         aliases: ["qty","count","amount"],       domain: "semiconductor", tags: ["數量"], aiDescription: "物料或批次的數量，單位由相關欄位（unit/unit_of_measure）定義。", description: null, layers: [], updatedAt: "2024-01-01T00:00:00.000Z" },
  { id: 10, concept: "生命週期狀態", stdName: "lifecycle_state", aliases: ["lc_state","life_state"],     domain: "semiconductor", tags: ["狀態","產品相關"], aiDescription: "產品或零件的生命週期階段，如 draft/review/released/obsolete，控制物料的可用性。", description: null, layers: [], updatedAt: "2024-01-01T00:00:00.000Z" },
  { id: 11, concept: "製程節點",   stdName: "process_node",     aliases: ["node","process","tech_node"], domain: "semiconductor", tags: ["製程相關"], aiDescription: "IC 製造製程技術節點，如 TSMC 28nm、7nm EUV，影響良率與製造成本。", description: null, layers: [], updatedAt: "2024-01-01T00:00:00.000Z" },
  { id: 12, concept: "交期天數",   stdName: "lead_time_days",   aliases: ["lead_time","lt_days"],        domain: "semiconductor", tags: ["量測值"], aiDescription: "供應商交期天數，從下單到到貨的預計天數，用於採購排程計算。", description: null, layers: [], updatedAt: "2024-01-01T00:00:00.000Z" },
  { id: 13, concept: "供應商代碼", stdName: "supplier_code",    aliases: ["vendor_code","sup_code"],     domain: "semiconductor", tags: ["識別碼"], aiDescription: "供應商唯一識別代碼，對應供應商主檔，用於採購與物料管理。", description: null, layers: [], updatedAt: "2024-01-01T00:00:00.000Z" },
  { id: 14, concept: "版本號",     stdName: "revision_no",      aliases: ["rev_no","version","ver"],     domain: "semiconductor", tags: ["識別碼","產品相關"], aiDescription: "零件或文件的版本標識，如 A0/A1/B0，每次 ECO 後遞增，追蹤設計演進歷程。", description: null, layers: [], updatedAt: "2024-01-01T00:00:00.000Z" },
  { id: 15, concept: "建立時間",   stdName: "created_at",       aliases: ["create_time","created_time"], domain: "semiconductor", tags: ["時間戳"], aiDescription: "記錄建立的 UTC 時間戳，系統自動填入，不可手動修改，用於稽核追蹤。", description: null, layers: [], updatedAt: "2024-01-01T00:00:00.000Z" },
];

// ── Version History (for PLM Core) ───────────────────────────────────────────

const v1Snapshot = {
  ...plmSchema,
  tables: plmTables.slice(0, 3),   // initial: parts, part_revisions, bom_items
  wideTables: [],
};

const v2Snapshot = {
  ...plmSchema,
  tables: plmTables.slice(0, 4),   // added: engineering_changes
  wideTables: [],
};

const v3Snapshot = {
  ...plmSchema,
  tables: plmTables,               // added: suppliers, part_suppliers
  wideTables: [{
    id: 1, name: "v_bom_flat", description: "BOM 展開視圖",
    sources: [
      { tableName: "parts",          joinType: "BASE"  },
      { tableName: "bom_items",      joinType: "INNER" },
      { tableName: "part_revisions", joinType: "LEFT"  },
    ],
    includedColumns: mockWideDetail.columns.filter(c => c.included).map(c => ({
      outputName: c.outputName, fieldType: c.fieldType, tableName: c.tableName,
    })),
  }],
};

export const mockVersions: SchemaVersion[] = [
  {
    id: 3, schemaId: 1, versionNo: 3, message: "新增供應商表與 BOM 寬表",
    createdAt: ts(1),
    diff: {
      tables: {
        added: ["suppliers", "part_suppliers"],
        removed: [],
        modified: [],
      },
      wideTables: {
        added: ["v_bom_flat"],
        removed: [],
        modified: [],
      },
    },
    snapshot: v3Snapshot,
  },
  {
    id: 2, schemaId: 1, versionNo: 2, message: "加入 ECO 工程變更單模組",
    createdAt: ts(8),
    diff: {
      tables: {
        added: ["engineering_changes"],
        removed: [],
        modified: [
          {
            name: "parts",
            fieldsAdded: ["process_node", "description"],
            fieldsRemoved: [],
            fieldsModified: [
              { before: "part_type VARCHAR(16)", after: "part_type VARCHAR(32)" },
            ],
          },
        ],
      },
      wideTables: { added: [], removed: [], modified: [] },
    },
    snapshot: v2Snapshot,
  },
  {
    id: 1, schemaId: 1, versionNo: 1, message: "初始版本 — PLM 核心三表",
    createdAt: ts(30),
    diff: null,
    snapshot: v1Snapshot,
  },
];

// ── Analysis mock result ──────────────────────────────────────────────────────

export interface MockIssue {
  severity: "error" | "warning" | "info";
  source: string;
  target: string;
  message: string;
  suggestion: string | null;
}

export const mockAnalysisIssues: MockIssue[] = [
  { severity: "warning", source: "rule",   target: "bom_items",         message: "表「bom_items」缺少 updated_at 欄位",          suggestion: null },
  { severity: "info",    source: "naming", target: "parts.part_no",     message: "\"part_no\" 是 parts 的別名，建議改為標準名",   suggestion: "part_no" },
  { severity: "info",    source: "naming", target: "operations.equip_id", message: "\"equip_id\" 未登錄命名字典",                 suggestion: null },
  { severity: "warning", source: "rule",   target: "part_suppliers",    message: "表「part_suppliers」缺少 updated_at 欄位",     suggestion: null },
  { severity: "info",    source: "naming", target: "parts.process_node", message: "\"process_node\" 未登錄命名字典",              suggestion: null },
];

export const mockAnalysisSummary = `Schema「PLM Core」分析報告

整體評分：82/100

✓ 結構規範檢查通過。
⚠ 有 2 張表缺少 updated_at 欄位，建議補齊以維持審計完整性。
⚠ 有 3 個欄位命名未登錄命名字典，建議補充後可提升跨表語義一致性。

共 6 張表、49 個欄位。

建議事項：
• bom_items：補充 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
• part_suppliers：同上
• operations.equip_id：已在命名字典中定義，建議對應 equip_id 標準名稱
• parts.process_node：建議新增至命名字典，補充製程節點的語義定義`;

// ── Rules ─────────────────────────────────────────────────────────────────────

export const mockRules: RuleDetail[] = [
  {
    id: "require-primary-key", group: "structure",
    description: "每張表必須有 Primary Key",
    defaultSeverity: "error", severity: "error", enabled: true,
    defaultConfig: {}, config: {}, layers: ["general"],
  },
  {
    id: "require-timestamps", group: "structure",
    description: "每張表必須包含 created_at 與 updated_at",
    defaultSeverity: "warning", severity: "warning", enabled: true,
    defaultConfig: {}, config: {}, layers: ["transaction"],
  },
  {
    id: "snake-case-fields", group: "naming",
    description: "欄位名稱應使用 snake_case，不得含大寫字母",
    defaultSeverity: "warning", severity: "warning", enabled: true,
    defaultConfig: {}, config: {}, layers: ["general"],
  },
  {
    id: "field-name-length", group: "naming",
    description: "欄位名稱不得超過 64 字元",
    defaultSeverity: "error", severity: "error", enabled: true,
    defaultConfig: { maxLength: 64 }, config: { maxLength: 64 }, layers: ["general"],
  },
  {
    id: "naming-dict-check", group: "naming",
    description: "欄位名稱應登錄命名字典，使用標準名稱（非別名）",
    defaultSeverity: "info", severity: "info", enabled: true,
    defaultConfig: {}, config: {}, layers: ["general"],
  },
  {
    id: "no-reserved-words", group: "naming",
    description: "欄位名稱不得使用 SQL 保留字",
    defaultSeverity: "error", severity: "error", enabled: true,
    defaultConfig: {}, config: {}, layers: ["general"],
  },
];
