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
    sourceTable: opts.sourceTable ?? null,
    sourceField: opts.sourceField ?? null,
  };
}

// ── Schema 1: PLM Core ────────────────────────────────────────────────────────

const plmTables: Table[] = [
  // ── Layer 0: Root reference tables ────────────────────────────────────────
  {
    id: 16, name: "part_categories", comment: "零件分類樹（自參照層級結構）",
    tags: ["reference"], environment: "PROD", layerType: "transaction",
    sampleData: [
      { id: 1, code: "IC",      name: "積體電路",    parent_category_id: null, level: 1 },
      { id: 2, code: "IC-MCU",  name: "微控制器",    parent_category_id: 1,    level: 2 },
      { id: 3, code: "IC-PWR",  name: "電源管理 IC", parent_category_id: 1,    level: 2 },
      { id: 4, code: "PCB",     name: "印刷電路板",  parent_category_id: null, level: 1 },
      { id: 5, code: "MECH",    name: "機構件",      parent_category_id: null, level: 1 },
    ],
    fields: [
      field(1601, 16, "id",                 "INT",          { isPrimaryKey: true, nullable: false }),
      field(1602, 16, "code",               "VARCHAR(32)",  { isUnique: true, nullable: false, comment: "分類代碼，如 IC-MCU" }),
      field(1603, 16, "name",               "VARCHAR(128)", { nullable: false }),
      field(1604, 16, "parent_category_id", "INT",          { comment: "FK → part_categories.id（自參照）" }),
      field(1605, 16, "level",              "TINYINT",      { nullable: false, comment: "層級深度 1-5" }),
      field(1606, 16, "created_at",         "TIMESTAMP",    { nullable: false }),
    ],
  },
  {
    id: 17, name: "units_of_measure", comment: "計量單位主檔",
    tags: ["reference"], environment: "PROD", layerType: "transaction",
    sampleData: [
      { id: 1, uom_code: "EA",  uom_name: "Each",     base_uom_id: null, conversion_factor: 1 },
      { id: 2, uom_code: "KG",  uom_name: "Kilogram", base_uom_id: null, conversion_factor: 1 },
      { id: 3, uom_code: "G",   uom_name: "Gram",     base_uom_id: 2,    conversion_factor: 0.001 },
      { id: 4, uom_code: "M",   uom_name: "Meter",    base_uom_id: null, conversion_factor: 1 },
      { id: 5, uom_code: "MM",  uom_name: "Millimeter",base_uom_id: 4,   conversion_factor: 0.001 },
    ],
    fields: [
      field(1701, 17, "id",                "INT",         { isPrimaryKey: true, nullable: false }),
      field(1702, 17, "uom_code",          "VARCHAR(16)", { isUnique: true, nullable: false }),
      field(1703, 17, "uom_name",          "VARCHAR(64)", { nullable: false }),
      field(1704, 17, "base_uom_id",       "INT",         { comment: "FK → units_of_measure.id（換算基準）" }),
      field(1705, 17, "conversion_factor", "DECIMAL(18,8)",{ nullable: false, defaultValue: "1" }),
    ],
  },
  {
    id: 18, name: "ecr", comment: "工程變更申請（ECR）— ECO 前置流程",
    tags: ["workflow"], environment: "PROD", layerType: "transaction",
    sampleData: [
      { id: 1, ecr_no: "ECR-2024-0018", title: "提議更換 MCU 供應商", requestor_id: "ENG-0012", priority: "high",   status: "approved", created_at: "2024-02-10 09:00:00" },
      { id: 2, ecr_no: "ECR-2024-0029", title: "LDO 耐壓提升至 5.5V",  requestor_id: "ENG-0027", priority: "medium", status: "review",   created_at: "2024-03-20 14:00:00" },
    ],
    fields: [
      field(1801, 18, "id",           "BIGINT",       { isPrimaryKey: true, nullable: false }),
      field(1802, 18, "ecr_no",       "VARCHAR(32)",  { isUnique: true, nullable: false }),
      field(1803, 18, "title",        "VARCHAR(255)", { nullable: false }),
      field(1804, 18, "requestor_id", "VARCHAR(64)",  { nullable: false, comment: "申請人工號" }),
      field(1805, 18, "priority",     "VARCHAR(16)",  { nullable: false, comment: "low / medium / high / critical" }),
      field(1806, 18, "status",       "VARCHAR(32)",  { nullable: false, comment: "draft / review / approved / rejected" }),
      field(1807, 18, "created_at",   "TIMESTAMP",    { nullable: false }),
      field(1808, 18, "updated_at",   "TIMESTAMP",    { nullable: false }),
    ],
  },

  // ── Layer 1: Core entity ────────────────────────────────────────────────────
  {
    id: 10, name: "parts", comment: "零件主檔 — 所有受管控物料的唯一來源",
    sampleData: [
      { id: 1001, part_no: "IC-MCU-001", part_name: "32-bit Cortex-M4 MCU", category_id: 2, uom_id: 1, lifecycle_state: "released", process_node: "TSMC 55nm", created_at: "2024-01-10 08:00:00", updated_at: "2024-03-15 10:30:00" },
      { id: 1002, part_no: "IC-PWR-007", part_name: "3.3V LDO Regulator",   category_id: 3, uom_id: 1, lifecycle_state: "released", process_node: "UMC 0.18µm",created_at: "2024-01-12 09:00:00", updated_at: "2024-02-20 14:00:00" },
      { id: 1003, part_no: "PCB-MB-002", part_name: "Main Board Rev B",      category_id: 4, uom_id: 1, lifecycle_state: "review",   process_node: null,        created_at: "2024-02-01 10:00:00", updated_at: "2024-04-01 16:00:00" },
      { id: 1004, part_no: "MECH-HSK-01",part_name: "Heatsink Assy",         category_id: 5, uom_id: 1, lifecycle_state: "released", process_node: null,        created_at: "2023-11-01 08:00:00", updated_at: "2024-01-05 08:00:00" },
    ],
    fields: [
      field(1001, 10, "id",              "BIGINT",       { isPrimaryKey: true, nullable: false, comment: "系統主鍵" }),
      field(1002, 10, "part_no",         "VARCHAR(32)",  { isUnique: true,     nullable: false, comment: "料號，全域唯一" }),
      field(1003, 10, "part_name",       "VARCHAR(255)", { nullable: false,                    comment: "零件名稱" }),
      field(1004, 10, "category_id",     "INT",          { nullable: false, comment: "FK → part_categories.id" }),
      field(1010, 10, "uom_id",          "INT",          { nullable: false, comment: "FK → units_of_measure.id" }),
      field(1005, 10, "lifecycle_state", "VARCHAR(32)",  { nullable: false, comment: "draft → review → released → obsolete" }),
      field(1006, 10, "process_node",    "VARCHAR(32)",  { comment: "製程節點，如 TSMC 28nm" }),
      field(1007, 10, "description",     "TEXT",         { comment: "技術規格說明" }),
      field(1008, 10, "created_at",      "TIMESTAMP",    { nullable: false, comment: "建立時間" }),
      field(1009, 10, "updated_at",      "TIMESTAMP",    { nullable: false, comment: "更新時間" }),
    ],
  },

  // ── Layer 2: Direct children ────────────────────────────────────────────────
  {
    id: 11, name: "part_revisions", comment: "零件版本管理 — 每次 ECO 後建立新版本",
    sampleData: [
      { id: 101, part_id: 1001, revision_no: "A0", revision_state: "released",  released_at: "2024-01-20 00:00:00", created_at: "2024-01-15 08:00:00", updated_at: "2024-01-20 00:00:00" },
      { id: 102, part_id: 1001, revision_no: "A1", revision_state: "released",  released_at: "2024-03-01 00:00:00", created_at: "2024-02-20 09:00:00", updated_at: "2024-03-01 00:00:00" },
      { id: 103, part_id: 1002, revision_no: "A0", revision_state: "released",  released_at: "2024-01-25 00:00:00", created_at: "2024-01-18 10:00:00", updated_at: "2024-01-25 00:00:00" },
      { id: 104, part_id: 1003, revision_no: "B0", revision_state: "draft",     released_at: null,                  created_at: "2024-02-01 10:00:00", updated_at: "2024-04-01 16:00:00" },
    ],
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
    sampleData: [
      { id: 201, parent_id: 1003, child_id: 1001, quantity: "1.0000", unit: "EA", bom_type: "MBOM", position: 1, created_at: "2024-02-05 08:00:00", updated_at: "2024-02-05 08:00:00" },
      { id: 202, parent_id: 1003, child_id: 1002, quantity: "2.0000", unit: "EA", bom_type: "MBOM", position: 2, created_at: "2024-02-05 08:00:00", updated_at: "2024-02-05 08:00:00" },
      { id: 203, parent_id: 1003, child_id: 1004, quantity: "1.0000", unit: "EA", bom_type: "MBOM", position: 3, created_at: "2024-02-05 08:00:00", updated_at: "2024-02-05 08:00:00" },
    ],
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
    sampleData: [
      { id: 301, ec_no: "ECO-2024-0031", title: "MCU 升級至 Rev A1 — 修正 Timer 問題", status: "approved", approver_id: "ENG-0042", effective_date: "2024-03-01", created_at: "2024-02-20 09:00:00", updated_at: "2024-03-01 00:00:00" },
      { id: 302, ec_no: "ECO-2024-0045", title: "Main Board Rev B 更換 LDO 供應商",    status: "pending",  approver_id: null,        effective_date: null,         created_at: "2024-04-02 10:00:00", updated_at: "2024-04-02 10:00:00" },
    ],
    fields: [
      field(1301, 13, "id",             "BIGINT",       { isPrimaryKey: true, nullable: false }),
      field(1302, 13, "ec_no",          "VARCHAR(32)",  { isUnique: true, nullable: false, comment: "ECO 編號" }),
      field(1303, 13, "title",          "VARCHAR(255)", { nullable: false }),
      field(1309, 13, "ecr_id",         "BIGINT",       { comment: "FK → ecr.id（源自的 ECR 申請）" }),
      field(1304, 13, "status",         "VARCHAR(32)",  { nullable: false, comment: "draft / pending / approved / closed" }),
      field(1305, 13, "approver_id",    "VARCHAR(64)",  { comment: "核准者工號" }),
      field(1306, 13, "effective_date", "DATE",         { }),
      field(1307, 13, "created_at",     "TIMESTAMP",    { nullable: false }),
      field(1308, 13, "updated_at",     "TIMESTAMP",    { nullable: false }),
    ],
  },
  {
    id: 14, name: "suppliers", comment: "供應商主檔",
    sampleData: [
      { id: 401, supplier_code: "SUP-TSMC-001", supplier_name: "台積電股份有限公司",   country: "Taiwan", status: "active", created_at: "2023-01-01 00:00:00", updated_at: "2024-01-01 00:00:00" },
      { id: 402, supplier_code: "SUP-MURATA-01",supplier_name: "Murata Manufacturing", country: "Japan",  status: "active", created_at: "2023-01-01 00:00:00", updated_at: "2024-01-01 00:00:00" },
      { id: 403, supplier_code: "SUP-YAGEO-01", supplier_name: "國巨股份有限公司",     country: "Taiwan", status: "active", created_at: "2023-06-01 00:00:00", updated_at: "2024-03-01 00:00:00" },
    ],
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
    sampleData: [
      { id: 501, part_id: 1001, supplier_id: 401, preferred: 1, lead_time_days: 90, created_at: "2024-01-15 08:00:00" },
      { id: 502, part_id: 1002, supplier_id: 402, preferred: 1, lead_time_days: 14, created_at: "2024-01-15 08:00:00" },
      { id: 503, part_id: 1002, supplier_id: 403, preferred: 0, lead_time_days: 21, created_at: "2024-02-01 08:00:00" },
    ],
    fields: [
      field(1501, 15, "id",              "BIGINT",     { isPrimaryKey: true, nullable: false }),
      field(1502, 15, "part_id",         "BIGINT",     { nullable: false, comment: "FK → parts.id" }),
      field(1503, 15, "supplier_id",     "BIGINT",     { nullable: false, comment: "FK → suppliers.id" }),
      field(1504, 15, "preferred",       "TINYINT(1)", { nullable: false, comment: "是否為首選供應商" }),
      field(1505, 15, "lead_time_days",  "INT",        { comment: "交期（天）" }),
      field(1506, 15, "created_at",      "TIMESTAMP",  { nullable: false }),
    ],
  },
  {
    id: 19, name: "part_documents", comment: "零件相關文件（規格書、圖面、測試報告）",
    tags: ["document"], environment: "PROD", layerType: "transaction",
    sampleData: [
      { id: 601, part_id: 1001, revision_id: 102, doc_type: "SPEC", doc_no: "SPEC-MCU-001-A1", title: "MCU 規格書 Rev A1", version: "A1", status: "released", created_by: "ENG-0012", created_at: "2024-03-01 09:00:00" },
      { id: 602, part_id: 1002, revision_id: 103, doc_type: "DRAW", doc_no: "DWG-LDO-007-A0", title: "LDO 電路圖",         version: "A0", status: "released", created_by: "ENG-0027", created_at: "2024-01-25 10:00:00" },
      { id: 603, part_id: 1003, revision_id: 104, doc_type: "TEST", doc_no: "RPT-MB-002-B0",  title: "Main Board 測試報告", version: "B0", status: "draft",    created_by: "ENG-0042", created_at: "2024-04-01 14:00:00" },
    ],
    fields: [
      field(1901, 19, "id",          "BIGINT",       { isPrimaryKey: true, nullable: false }),
      field(1902, 19, "part_id",     "BIGINT",       { nullable: false, comment: "FK → parts.id" }),
      field(1903, 19, "revision_id", "BIGINT",       { comment: "FK → part_revisions.id（null 表示適用所有版本）" }),
      field(1904, 19, "doc_type",    "VARCHAR(16)",  { nullable: false, comment: "SPEC / DRAW / TEST / CERT" }),
      field(1905, 19, "doc_no",      "VARCHAR(64)",  { isUnique: true, nullable: false, comment: "文件編號" }),
      field(1906, 19, "title",       "VARCHAR(255)", { nullable: false }),
      field(1907, 19, "file_path",   "VARCHAR(512)", { comment: "檔案存儲路徑" }),
      field(1908, 19, "version",     "VARCHAR(8)",   { nullable: false, comment: "文件版本號" }),
      field(1909, 19, "status",      "VARCHAR(32)",  { nullable: false, comment: "draft / review / released / obsolete" }),
      field(1910, 19, "created_by",  "VARCHAR(64)",  { nullable: false, comment: "建立者工號" }),
      field(1911, 19, "created_at",  "TIMESTAMP",    { nullable: false }),
      field(1912, 19, "updated_at",  "TIMESTAMP",    { nullable: false }),
    ],
  },

  // ── Layer 3: Derived / cross-cutting ──────────────────────────────────────────
  {
    id: 24, name: "change_items", comment: "ECO 變更明細 — 記錄每筆 ECO 影響的具體欄位變動",
    tags: ["workflow"], environment: "PROD", layerType: "transaction",
    sampleData: [
      { id: 701, eco_id: 301, part_id: 1001, revision_id: 102, change_type: "REVISION_UP", before_value: "A0", after_value: "A1", created_at: "2024-02-20 09:30:00" },
      { id: 702, eco_id: 301, part_id: 1001, revision_id: 102, change_type: "SPEC_CHANGE", before_value: "Timer 32-bit",   after_value: "Timer 32-bit + DMA", created_at: "2024-02-20 09:31:00" },
      { id: 703, eco_id: 302, part_id: 1002, revision_id: 103, change_type: "SUPPLIER",   before_value: "Murata",          after_value: "Yageo",             created_at: "2024-04-02 10:30:00" },
    ],
    fields: [
      field(2401, 24, "id",          "BIGINT",       { isPrimaryKey: true, nullable: false }),
      field(2402, 24, "eco_id",      "BIGINT",       { nullable: false, comment: "FK → engineering_changes.id" }),
      field(2403, 24, "part_id",     "BIGINT",       { nullable: false, comment: "FK → parts.id",          sourceTable: "parts",          sourceField: "id" }),
      field(2404, 24, "revision_id", "BIGINT",       { comment: "FK → part_revisions.id（變更後版本）",    sourceTable: "part_revisions", sourceField: "id" }),
      field(2405, 24, "change_type", "VARCHAR(32)",  { nullable: false, comment: "REVISION_UP / SPEC_CHANGE / SUPPLIER / BOM_MOD" }),
      field(2406, 24, "before_value","TEXT",         { comment: "變更前值（JSON or text）" }),
      field(2407, 24, "after_value", "TEXT",         { comment: "變更後值（JSON or text）" }),
      field(2408, 24, "created_at",  "TIMESTAMP",    { nullable: false }),
    ],
  },
  {
    id: 25, name: "eco_approvals", comment: "ECO 審批記錄 — 多階段審批流程",
    tags: ["workflow"], environment: "PROD", layerType: "transaction",
    sampleData: [
      { id: 801, eco_id: 301, approver_id: "ENG-0042", approval_role: "PE", decision: "approved", comment: "Timer 問題已驗證",    decided_at: "2024-02-28 17:00:00", created_at: "2024-02-22 09:00:00" },
      { id: 802, eco_id: 301, approver_id: "MGR-0005", approval_role: "QA", decision: "approved", comment: "QA 測試通過",          decided_at: "2024-03-01 08:30:00", created_at: "2024-02-22 09:00:00" },
      { id: 803, eco_id: 302, approver_id: "ENG-0018", approval_role: "PE", decision: "pending",  comment: null,                  decided_at: null,                  created_at: "2024-04-03 10:00:00" },
    ],
    fields: [
      field(2501, 25, "id",            "BIGINT",      { isPrimaryKey: true, nullable: false }),
      field(2502, 25, "eco_id",        "BIGINT",      { nullable: false, comment: "FK → engineering_changes.id" }),
      field(2503, 25, "approver_id",   "VARCHAR(64)", { nullable: false, comment: "審批人工號" }),
      field(2504, 25, "approval_role", "VARCHAR(32)", { nullable: false, comment: "PE / QA / QM / VP" }),
      field(2505, 25, "decision",      "VARCHAR(16)", { nullable: false, comment: "pending / approved / rejected" }),
      field(2506, 25, "comment",       "TEXT",        { }),
      field(2507, 25, "decided_at",    "TIMESTAMP",   { }),
      field(2508, 25, "created_at",    "TIMESTAMP",   { nullable: false }),
    ],
  },
  {
    id: 26, name: "bom_substitutes", comment: "BOM 替代料清單 — 當首選料缺貨時的替代方案",
    tags: [], environment: "PROD", layerType: "transaction",
    sampleData: [
      { id: 901, bom_item_id: 201, substitute_part_id: 1002, priority: 1, reason: "Murata 缺貨替代",   effective_date: "2024-03-15", created_at: "2024-03-10 08:00:00" },
      { id: 902, bom_item_id: 202, substitute_part_id: 1001, priority: 1, reason: "同規格替代料",     effective_date: "2024-01-01", created_at: "2024-01-05 09:00:00" },
    ],
    fields: [
      field(2601, 26, "id",                 "BIGINT",      { isPrimaryKey: true, nullable: false }),
      field(2602, 26, "bom_item_id",        "BIGINT",      { nullable: false, comment: "FK → bom_items.id（被替代的 BOM 項目）" }),
      field(2603, 26, "substitute_part_id", "BIGINT",      { nullable: false, comment: "FK → parts.id（替代料）", sourceTable: "parts", sourceField: "id" }),
      field(2604, 26, "priority",           "TINYINT",     { nullable: false, comment: "替代優先順序，1 最高" }),
      field(2605, 26, "reason",             "VARCHAR(255)", { comment: "替代原因說明" }),
      field(2606, 26, "effective_date",     "DATE",         { comment: "替代料生效日" }),
      field(2607, 26, "created_at",         "TIMESTAMP",   { nullable: false }),
    ],
  },
  {
    id: 27, name: "supplier_quotes", comment: "供應商報價單 — 依零件版本留存歷史報價",
    tags: [], environment: "PROD", layerType: "transaction",
    sampleData: [
      { id: 1001, part_supplier_id: 501, revision_id: 102, quote_no: "Q-2024-TSMC-001", unit_price: "8.50",  currency: "USD", moq: 1000, lead_time_days: 90,  valid_until: "2024-12-31", created_at: "2024-03-05 10:00:00" },
      { id: 1002, part_supplier_id: 502, revision_id: 103, quote_no: "Q-2024-MUR-007",  unit_price: "0.32",  currency: "USD", moq: 5000, lead_time_days: 14,  valid_until: "2024-06-30", created_at: "2024-02-10 11:00:00" },
      { id: 1003, part_supplier_id: 503, revision_id: 103, quote_no: "Q-2024-YAG-007",  unit_price: "0.28",  currency: "USD", moq: 5000, lead_time_days: 21,  valid_until: "2024-09-30", created_at: "2024-03-01 09:00:00" },
    ],
    fields: [
      field(2701, 27, "id",               "BIGINT",        { isPrimaryKey: true, nullable: false }),
      field(2702, 27, "part_supplier_id", "BIGINT",        { nullable: false, comment: "FK → part_suppliers.id" }),
      field(2703, 27, "revision_id",      "BIGINT",        { comment: "FK → part_revisions.id（報價對應的零件版本）", sourceTable: "part_revisions", sourceField: "id" }),
      field(2704, 27, "quote_no",         "VARCHAR(64)",   { isUnique: true, nullable: false, comment: "報價單號" }),
      field(2705, 27, "unit_price",       "DECIMAL(12,4)", { nullable: false }),
      field(2706, 27, "currency",         "VARCHAR(8)",    { nullable: false, defaultValue: "USD" }),
      field(2707, 27, "moq",              "INT",           { comment: "最小訂購量" }),
      field(2708, 27, "lead_time_days",   "INT",           { comment: "交期（天）", sourceTable: "part_suppliers", sourceField: "lead_time_days" }),
      field(2709, 27, "valid_until",      "DATE",          { comment: "報價有效期" }),
      field(2710, 27, "created_at",       "TIMESTAMP",     { nullable: false }),
    ],
  },
];

export const plmSchema: SchemaDetail = {
  id: 1, name: "PLM Core",
  description: "產品生命週期管理核心 — 零件、BOM、ECO、供應商、文件與審批管理",
  domain: "semiconductor", suiteId: null, layerType: null,
  tags: [], environment: null, targetDb: null,
  createdAt: ts(30), updatedAt: ts(1),
  tables: plmTables,
};

// ── Schema 2: MES Process ─────────────────────────────────────────────────────

const mesTables: Table[] = [
  {
    id: 20, name: "lots", comment: "批次主檔",
    sampleData: [
      { id: 601, lot_id: "LOT-20240401-001", product_id: 1001, quantity: 25, status: "complete",  created_at: "2024-04-01 07:00:00", updated_at: "2024-04-03 18:30:00" },
      { id: 602, lot_id: "LOT-20240401-002", product_id: 1001, quantity: 25, status: "run",        created_at: "2024-04-01 07:30:00", updated_at: "2024-04-02 09:00:00" },
      { id: 603, lot_id: "LOT-20240402-001", product_id: 1002, quantity: 50, status: "hold",       created_at: "2024-04-02 06:00:00", updated_at: "2024-04-02 14:00:00" },
      { id: 604, lot_id: "LOT-20240403-001", product_id: 1001, quantity: 25, status: "queue",      created_at: "2024-04-03 06:00:00", updated_at: "2024-04-03 06:00:00" },
    ],
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
    sampleData: [
      { id: 701, lot_id: 601, wafer_no: 1,  status: "pass",    created_at: "2024-04-01 07:00:00", updated_at: "2024-04-03 18:00:00" },
      { id: 702, lot_id: 601, wafer_no: 2,  status: "pass",    created_at: "2024-04-01 07:00:00", updated_at: "2024-04-03 18:00:00" },
      { id: 703, lot_id: 601, wafer_no: 3,  status: "scrap",   created_at: "2024-04-01 07:00:00", updated_at: "2024-04-02 11:30:00" },
      { id: 704, lot_id: 602, wafer_no: 1,  status: "wip",     created_at: "2024-04-01 07:30:00", updated_at: "2024-04-02 09:00:00" },
    ],
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
    sampleData: [
      { id: 801, lot_id: 601, operation_code: "PHOTO-01", equip_id: "EQ-LITHO-001", operator_id: "OP-A034", start_time: "2024-04-01 08:00:00", end_time: "2024-04-01 10:30:00", created_at: "2024-04-01 08:00:00", updated_at: "2024-04-01 10:30:00" },
      { id: 802, lot_id: 601, operation_code: "ETCH-02",  equip_id: "EQ-ETCH-003",  operator_id: "OP-B017", start_time: "2024-04-01 11:00:00", end_time: "2024-04-01 13:45:00", created_at: "2024-04-01 11:00:00", updated_at: "2024-04-01 13:45:00" },
      { id: 803, lot_id: 601, operation_code: "CVD-05",   equip_id: "EQ-CVD-002",   operator_id: "OP-A034", start_time: "2024-04-02 09:00:00", end_time: "2024-04-02 12:00:00", created_at: "2024-04-02 09:00:00", updated_at: "2024-04-02 12:00:00" },
      { id: 804, lot_id: 602, operation_code: "PHOTO-01", equip_id: "EQ-LITHO-002", operator_id: "OP-C009", start_time: "2024-04-01 09:00:00", end_time: null,                  created_at: "2024-04-01 09:00:00", updated_at: "2024-04-02 09:00:00" },
    ],
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
    sampleData: [
      { id: 901, equip_id: "EQ-LITHO-001", equip_name: "ASML NXT:1980Di Scanner #1", equip_type: "PHOTO", status: "up",   created_at: "2022-06-01 00:00:00", updated_at: "2024-04-01 06:00:00" },
      { id: 902, equip_id: "EQ-LITHO-002", equip_name: "ASML NXT:1980Di Scanner #2", equip_type: "PHOTO", status: "pm",   created_at: "2022-06-01 00:00:00", updated_at: "2024-04-02 08:00:00" },
      { id: 903, equip_id: "EQ-ETCH-003",  equip_name: "Lam Research Kiyo 45 Etch",  equip_type: "ETCH",  status: "up",   created_at: "2022-08-01 00:00:00", updated_at: "2024-04-01 06:00:00" },
      { id: 904, equip_id: "EQ-CVD-002",   equip_name: "AMAT Producer GT CVD",       equip_type: "CVD",   status: "down", created_at: "2022-09-01 00:00:00", updated_at: "2024-04-03 14:00:00" },
    ],
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
  { id: 1, name: "PLM Core",    description: plmSchema.description,  domain: "semiconductor", suiteId: null, layerType: null, tags: [], environment: null, targetDb: null, createdAt: ts(30), updatedAt: ts(1) },
  { id: 2, name: "MES Process", description: mesSchema.description, domain: "semiconductor", suiteId: null, layerType: null, tags: [], environment: null, targetDb: null, createdAt: ts(20), updatedAt: ts(2) },
];

// ── Wide Tables (for PLM Core) ────────────────────────────────────────────────

export const mockWideSummaries: WideTableSummary[] = [
  { id: 1, schemaId: 1, name: "v_bom_flat", description: "BOM 展開視圖 — 父件 × 子件 × 版本", wideTableType: "r2u", sourceTableIds: [10, 12, 11], createdAt: ts(5), updatedAt: ts(1) },
];

export const mockWideDetail: WideTableDetail = {
  id: 1, schemaId: 1, name: "v_bom_flat",
  description: "BOM 展開視圖 — 父件 × 子件 × 版本",
  wideTableType: "r2u",
  sourceTableIds: [10, 12, 11],
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
  { id: 1,  concept: "批號",       stdName: "lot_id",           aliases: ["batch_id","lot_no"],          domain: "semiconductor", tags: ["批次相關","識別碼"], aiDescription: "批次唯一識別碼，格式 LOT-YYYYMMDD-NNN，生產批次追蹤主鍵。", description: null, layers: [], updatedAt: "2024-01-01T00:00:00.000Z", status: "approved" as const, reviewers: [] },
  { id: 2,  concept: "晶圓 ID",    stdName: "wafer_id",         aliases: ["wafer_no","wfr_id"],          domain: "semiconductor", tags: ["批次相關","識別碼"], aiDescription: "批次內晶圓片編號，通常為 1–25 的整數，配合 lot_id 唯一定位每片晶圓。", description: null, layers: [], updatedAt: "2024-01-01T00:00:00.000Z", status: "approved" as const, reviewers: [] },
  { id: 3,  concept: "設備 ID",    stdName: "equip_id",         aliases: ["machine_id","tool_id","eqp_id"], domain: "semiconductor", tags: ["設備相關","識別碼"], aiDescription: "製程設備唯一識別碼，對應設備主檔，用於製程履歷查詢與 OEE 分析。", description: null, layers: [], updatedAt: "2024-01-01T00:00:00.000Z", status: "approved" as const, reviewers: [] },
  { id: 4,  concept: "操作員工號", stdName: "operator_id",      aliases: ["op_id","user_id","emp_id"],   domain: "semiconductor", tags: ["操作人員","識別碼"], aiDescription: "執行製程操作的員工工號，用於責任歸屬與稽核追蹤。", description: null, layers: [], updatedAt: "2024-01-01T00:00:00.000Z", status: "approved" as const, reviewers: [] },
  { id: 5,  concept: "料號",       stdName: "part_no",          aliases: ["p_no","item_no","material_no"], domain: "semiconductor", tags: ["產品相關","識別碼"], aiDescription: "零件唯一料號，遵循命名規則，全域不重複，廢止後不得再用。", description: null, layers: [], updatedAt: "2024-01-01T00:00:00.000Z", status: "approved" as const, reviewers: [] },
  { id: 6,  concept: "良率",       stdName: "yield_rate",       aliases: ["yield","pass_rate"],          domain: "semiconductor", tags: ["良率品質","量測值"], aiDescription: "晶圓或批次良率，0~1 之間的小數，代表合格晶粒佔總晶粒的比例。", description: null, layers: [], updatedAt: "2024-01-01T00:00:00.000Z", status: "approved" as const, reviewers: [] },
  { id: 7,  concept: "站點代碼",   stdName: "operation_code",   aliases: ["op_code","step_id","process_step"], domain: "semiconductor", tags: ["製程相關","識別碼"], aiDescription: "製程站點代碼，對應工藝流程圖中的每個加工步驟。", description: null, layers: [], updatedAt: "2024-01-01T00:00:00.000Z", status: "approved" as const, reviewers: [] },
  { id: 8,  concept: "狀態",       stdName: "status",           aliases: ["state","sts"],                domain: "semiconductor", tags: ["狀態"], aiDescription: "業務物件的當前狀態值，具體取值由業務規則定義（如 lot 批次狀態：run/hold/complete）。", description: null, layers: [], updatedAt: "2024-01-01T00:00:00.000Z", status: "approved" as const, reviewers: [] },
  { id: 9,  concept: "數量",       stdName: "quantity",         aliases: ["qty","count","amount"],       domain: "semiconductor", tags: ["數量"], aiDescription: "物料或批次的數量，單位由相關欄位（unit/unit_of_measure）定義。", description: null, layers: [], updatedAt: "2024-01-01T00:00:00.000Z", status: "approved" as const, reviewers: [] },
  { id: 10, concept: "生命週期狀態", stdName: "lifecycle_state", aliases: ["lc_state","life_state"],     domain: "semiconductor", tags: ["狀態","產品相關"], aiDescription: "產品或零件的生命週期階段，如 draft/review/released/obsolete，控制物料的可用性。", description: null, layers: [], updatedAt: "2024-01-01T00:00:00.000Z", status: "approved" as const, reviewers: [] },
  { id: 11, concept: "製程節點",   stdName: "process_node",     aliases: ["node","process","tech_node"], domain: "semiconductor", tags: ["製程相關"], aiDescription: "IC 製造製程技術節點，如 TSMC 28nm、7nm EUV，影響良率與製造成本。", description: null, layers: [], updatedAt: "2024-01-01T00:00:00.000Z", status: "approved" as const, reviewers: [] },
  { id: 12, concept: "交期天數",   stdName: "lead_time_days",   aliases: ["lead_time","lt_days"],        domain: "semiconductor", tags: ["量測值"], aiDescription: "供應商交期天數，從下單到到貨的預計天數，用於採購排程計算。", description: null, layers: [], updatedAt: "2024-01-01T00:00:00.000Z", status: "approved" as const, reviewers: [] },
  { id: 13, concept: "供應商代碼", stdName: "supplier_code",    aliases: ["vendor_code","sup_code"],     domain: "semiconductor", tags: ["識別碼"], aiDescription: "供應商唯一識別代碼，對應供應商主檔，用於採購與物料管理。", description: null, layers: [], updatedAt: "2024-01-01T00:00:00.000Z", status: "approved" as const, reviewers: [] },
  { id: 14, concept: "版本號",     stdName: "revision_no",      aliases: ["rev_no","version","ver"],     domain: "semiconductor", tags: ["識別碼","產品相關"], aiDescription: "零件或文件的版本標識，如 A0/A1/B0，每次 ECO 後遞增，追蹤設計演進歷程。", description: null, layers: [], updatedAt: "2024-01-01T00:00:00.000Z", status: "approved" as const, reviewers: [] },
  { id: 15, concept: "建立時間",   stdName: "created_at",       aliases: ["create_time","created_time"], domain: "semiconductor", tags: ["時間戳"], aiDescription: "記錄建立的 UTC 時間戳，系統自動填入，不可手動修改，用於稽核追蹤。", description: null, layers: [], updatedAt: "2024-01-01T00:00:00.000Z", status: "approved" as const, reviewers: [] },
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
