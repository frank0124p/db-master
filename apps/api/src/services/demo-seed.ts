/**
 * Auto-seeds demo data on first container boot.
 * Runs after DDL import. No-ops if suites already exist.
 */

import { listSuites, createSuite } from "../repositories/suites.js";
import { listSchemas, updateSchema } from "../repositories/schemas.js";
import { createNamingEntry, approveNamingEntry } from "../repositories/naming.js";
import { saveVersion } from "../repositories/versions.js";
import { createWideTable } from "../repositories/wide-tables.js";
import { getSchemaById } from "../repositories/schemas.js";

const NAMING_ENTRIES = [
  { concept: "設備識別碼",     std_name: "equip_id",       aliases: ["equipment_id","equip_code","machine_id"], domain: "semiconductor", layers: ["transaction","r2u","unified"], description: "製程設備的唯一識別代碼，與 ERP 及 MES 系統對齊。" },
  { concept: "批次識別碼",     std_name: "lot_id",         aliases: ["lot_no","batch_id","batch_no"],           domain: "semiconductor", layers: ["transaction","r2u"],            description: "生產批次唯一識別碼，格式 LOT-YYYYMMDD-NNNN。" },
  { concept: "晶圓識別碼",     std_name: "wafer_id",       aliases: ["wafer_no","wafer_number","wid"],          domain: "semiconductor", layers: ["transaction"],                  description: "晶圓片的唯一識別碼，通常為批次號+槽位組合。" },
  { concept: "製程節點",       std_name: "process_node",   aliases: ["tech_node","process_nm","node"],          domain: "semiconductor", layers: ["transaction","r2u","unified"], description: "製程技術節點，例如 28nm、7nm，用於良率分析分群。" },
  { concept: "產品料號",       std_name: "product_id",     aliases: ["prod_id","product_no","part_number","pn"],domain: "semiconductor", layers: ["transaction","r2u","unified"], description: "產品的唯一料號，與 PLM 及 ERP 系統對齊。" },
  { concept: "良率",           std_name: "yield_rate",     aliases: ["yield","yr","pass_rate"],                 domain: "semiconductor", layers: ["transaction","r2u","unified"], description: "製程良率百分比，範圍 0.00–100.00。" },
  { concept: "製程配方識別碼", std_name: "recipe_id",      aliases: ["recipe_name","recipe_no"],                domain: "semiconductor", layers: ["transaction"],                  description: "設備製程配方唯一代碼，控制製程參數組合。" },
  { concept: "設備類型",       std_name: "equip_type",     aliases: ["equipment_type","machine_type"],          domain: "semiconductor", layers: ["transaction","r2u"],            description: "設備功能分類：FURNACE / CVD / CMP / LITHO / ETCH 等。" },
  { concept: "OEE 綜合效率",   std_name: "oee",            aliases: ["overall_equipment_effectiveness"],        domain: "semiconductor", layers: ["unified"],                     description: "設備綜合效率 = 可用率 × 效能率 × 品質率，範圍 0–100。" },
  { concept: "缺陷類型代碼",   std_name: "defect_type_id", aliases: ["defect_code","fault_type"],               domain: "semiconductor", layers: ["transaction","r2u"],            description: "缺陷分類代碼，對應品質管理系統缺陷主檔。" },
  { concept: "操作員識別碼",   std_name: "operator_id",    aliases: ["op_id","operator_no","emp_id"],           domain: "general",       layers: ["transaction"],                  description: "執行操作的員工識別碼，對應 HR 系統。" },
  { concept: "建立時間",       std_name: "created_at",     aliases: ["create_time","creation_date"],            domain: "general",       layers: ["transaction","r2u","unified"], description: "資料列建立的 UTC 時間戳記，所有資料表必填。" },
  { concept: "更新時間",       std_name: "updated_at",     aliases: ["update_time","modify_time"],              domain: "general",       layers: ["transaction","r2u","unified"], description: "資料列最後更新的 UTC 時間戳記。" },
];

// DDL loader converts filename → schema name via: remove .sql, replace -_ with space,
// capitalize first letter of each word (e.g. mes_equipment.sql → "Mes Equipment")
const SCHEMA_CONFIG: Record<string, { layer: "transaction" | "r2u" | "unified"; env: "DEV"|"TEST"|"STAGING"|"PROD"; suiteKey: "semi"|"sys" }> = {
  "Mes Equipment":      { layer: "transaction", env: "PROD",    suiteKey: "semi" },
  "Mes Process":        { layer: "transaction", env: "PROD",    suiteKey: "semi" },
  "Wip Tracking":       { layer: "transaction", env: "DEV",     suiteKey: "semi" },
  "Plm Core":           { layer: "r2u",         env: "STAGING", suiteKey: "sys"  },
  "Test Quality":       { layer: "r2u",         env: "TEST",    suiteKey: "semi" },
  "Unified Analytics":  { layer: "unified",     env: "PROD",    suiteKey: "semi" },
};

export async function seedDemoDataIfNeeded(): Promise<void> {
  const existing = await listSuites();
  if (existing.length > 0) return; // already seeded

  console.warn("[demo-seed] No suites found — seeding demo data...");

  // ── Suites ──────────────────────────────────────────────────────────────────
  const suiteSemi = await createSuite({ name: "半導體製造", color: "#38b6f0" });
  const suiteSystem = await createSuite({ name: "系統整合", color: "#a78bfa" });
  const suiteMap = { semi: suiteSemi.id, sys: suiteSystem.id };
  console.warn(`[demo-seed] Created suites: ${suiteSemi.name}, ${suiteSystem.name}`);

  // ── Schema layer + suite assignment ─────────────────────────────────────────
  const schemas = await listSchemas();
  for (const s of schemas) {
    const cfg = SCHEMA_CONFIG[s.name];
    if (!cfg) continue;
    await updateSchema(s.id, {
      layerType: cfg.layer,
      environment: cfg.env,
      suiteId: suiteMap[cfg.suiteKey],
      domain: "semiconductor",
    });
  }
  console.warn(`[demo-seed] Assigned layers/suites to ${schemas.length} schemas`);

  // ── Naming dictionary ────────────────────────────────────────────────────────
  for (const entry of NAMING_ENTRIES) {
    try {
      const created = await createNamingEntry({
        concept: entry.concept,
        std_name: entry.std_name,
        aliases: entry.aliases,
        domain: entry.domain,
        tags: [],
        layers: entry.layers,
        description: entry.description,
      });
      await approveNamingEntry(created.id);
    } catch {
      // skip if stdName already exists
    }
  }
  console.warn(`[demo-seed] Seeded ${NAMING_ENTRIES.length} naming dict entries`);

  // ── Version snapshots ────────────────────────────────────────────────────────
  const freshSchemas = await listSchemas();
  for (const s of freshSchemas) {
    try {
      await saveVersion(s.id, "v1: 初始版本 — 從 DDL 自動匯入");
    } catch {
      // skip if save fails
    }
  }
  console.warn("[demo-seed] Created v1 snapshots for all schemas");

  // ── Wide table (Unified Analytics) ───────────────────────────────────────────
  const unified = freshSchemas.find(s => s.name === "Unified Analytics");
  if (unified) {
    try {
      const detail = await getSchemaById(unified.id);
      const tables = detail?.tables ?? [];
      if (tables.length >= 2) {
        const base = tables[0]!;
        const join = tables[1]!;
        const baseCols = (base.fields ?? []).slice(0, 4);
        const joinCols = (join.fields ?? []).slice(0, 3);
        await createWideTable(unified.id, {
          name: "生產日報 × 良率趨勢",
          description: "整合每日生產彙總與週良率趨勢的跨表分析寬表",
          wideTableType: "unified",
          sources: [
            { tableId: base.id, colPrefix: "daily", joinType: "BASE", position: 0 },
            { tableId: join.id, colPrefix: "trend", joinType: "LEFT",
              joinCondition: "daily.product_id = trend.product_id AND daily.process_node = trend.process_node",
              position: 1 },
          ],
          columns: [
            ...baseCols.map((f, i) => ({ sourcePosition: 0, fieldId: f.id, outputName: `daily_${f.name}`, included: true, position: i })),
            ...joinCols.map((f, i) => ({ sourcePosition: 1, fieldId: f.id, outputName: `trend_${f.name}`, included: true, position: baseCols.length + i })),
          ],
        });
        console.warn("[demo-seed] Created wide table: 生產日報 × 良率趨勢");
      }
    } catch (e) {
      console.warn("[demo-seed] Wide table skipped:", e);
    }
  }

  console.warn("[demo-seed] ✓ Done");
}

// ─────────────────────────────────────────────────────────────────────────────
// Governance workflow demo seed
// Guard: only runs if no concepts exist yet
// ─────────────────────────────────────────────────────────────────────────────

export async function seedGovernanceDemoIfNeeded(): Promise<void> {
  const { listConcepts, createConcept, updateConcept, createSourceDoc, createBusinessRule, updateBusinessRule } = await import("../repositories/knowledge.js");
  const { createImportBatch } = await import("../repositories/import-batches.js");
  const { createWtProposal } = await import("../repositories/wt-proposals.js");
  const { createDraft, updateDraft } = await import("../repositories/workspace.js");
  const { createReport, saveGoverned, saveCatalogGraph, saveMarkdownExport } = await import("../repositories/governance.js");
  const { createInstance, updateInstance, getGatePolicy, buildInitialStations } = await import("../repositories/instances.js");
  const { nextId } = await import("../db/fileStore.js");

  const existing = await listConcepts();
  if (existing.length > 0) return; // already seeded

  console.warn("[gov-seed] No concepts found — seeding governance demo data...");
  const now = new Date().toISOString();

  // ── 1. Source Documents ──────────────────────────────────────────────────────
  const doc1 = await createSourceDoc({
    format: "markdown",
    title: "MES 系統業務規格書 v2.3",
    content: `# MES 在製品追蹤系統規格書

## 1. 核心概念定義

### 1.1 批次 (Lot)
批次是半導體生產的最小排程單位，由一組晶圓組成。每個批次有唯一識別碼（lot_id），格式為 LOT-YYYYMMDD-NNNN。批次的 SSOT 資料表為 wip_lots，所有下游系統應以此為唯一來源。

### 1.2 設備 (Equipment)
生產設備是晶圓製造的主要工具。每台設備有唯一識別碼（equip_id），SSOT 為 equipment_master。設備類型包含：FURNACE（擴散爐）、CVD（化學氣相沉積）、CMP（化學機械研磨）、LITHO（微影）、ETCH（蝕刻）。

### 1.3 製程節點 (Process Node)
製程節點代表技術世代，例如 28nm、14nm、7nm。process_node 欄位必須與 PLM 系統中的產品定義一致。

## 2. 業務規則

### 規則 BR-001: 批次 SSOT
所有批次資訊（狀態、位置、工站）的單一真相來源為 wip_lots 表。任何記錄批次資訊的複本表或快取表，必須標記為 replica 並定期從 wip_lots 同步。

### 規則 BR-002: 設備稼動率計算
OEE = 可用率 × 效能率 × 品質率。計算所需的三個維度資料應分別來自 equipment_downtime（可用率）、process_records（效能率）、test_results（品質率）。

### 規則 BR-003: 工站完成條件
批次進入下一工站前，必須滿足：(1) 當前工站製程參數已記錄至 process_records；(2) 品質抽測結果已記錄至 test_results；(3) 操作員已在 lot_history 留下簽核記錄。`,
    chunks: [
      { idx: 0, text: "批次是半導體生產的最小排程單位，由一組晶圓組成。每個批次有唯一識別碼（lot_id），格式為 LOT-YYYYMMDD-NNNN。批次的 SSOT 資料表為 wip_lots。" },
      { idx: 1, text: "生產設備是晶圓製造的主要工具。每台設備有唯一識別碼（equip_id），SSOT 為 equipment_master。設備類型包含：FURNACE、CVD、CMP、LITHO、ETCH。" },
      { idx: 2, text: "規則 BR-001: 所有批次資訊的 SSOT 為 wip_lots 表。規則 BR-002: OEE = 可用率 × 效能率 × 品質率。規則 BR-003: 批次工站完成條件需三項記錄。" },
    ],
    uploadedBy: "admin",
  }, "mes-spec-v2-3");

  const doc2 = await createSourceDoc({
    format: "markdown",
    title: "資料治理命名規範 v1.0",
    content: `# 半導體廠資料治理命名規範

## 命名原則
1. 所有欄位名稱使用 snake_case 小寫
2. 主鍵統一以 _id 結尾
3. 時間欄位統一使用 UTC，欄位名以 _at 結尾
4. 外鍵命名與對應表主鍵相同

## 核心欄位標準

| 概念 | 標準欄位名 | 別名 | SSOT 表 |
|------|-----------|------|---------|
| 批次識別碼 | lot_id | lot_no, batch_id | wip_lots |
| 設備識別碼 | equip_id | equipment_id, machine_id | equipment_master |
| 製程節點 | process_node | tech_node, node_nm | product_master |
| 操作員識別碼 | operator_id | op_id, emp_id | hr_employees |

## Wide Table 建構規範

### Small Block
單一業務實體的完整欄位集合，不跨表 JOIN。例如：設備主檔寬表，只包含 equipment_master 的所有欄位加上展開的列舉值說明。

### Medium Block
跨業務實體的 JOIN 寬表，用於分析用途。例如：在製品追蹤寬表，整合 wip_lots + process_records + test_results 三表。Medium Block 不得 JOIN 另一個 Medium Block（禁止層級遞迴）。`,
    chunks: [
      { idx: 0, text: "命名原則：snake_case 小寫，主鍵以 _id 結尾，時間欄位以 _at 結尾。lot_id 別名 lot_no/batch_id，SSOT 為 wip_lots。equip_id 別名 equipment_id/machine_id，SSOT 為 equipment_master。" },
      { idx: 1, text: "Small Block：單一業務實體完整欄位集合，不跨表 JOIN。Medium Block：跨業務實體 JOIN 寬表，分析用途。Medium Block 不得 JOIN 另一個 Medium Block。" },
    ],
    uploadedBy: "admin",
  }, "data-governance-naming-v1-0");

  console.warn(`[gov-seed] Created 2 source documents`);

  // ── 2. Concept Cards ─────────────────────────────────────────────────────────
  const concept1 = await createConcept({
    slug: "lot-identity",
    name: "批次識別碼",
    stdName: "lot_id",
    definition: "在製品生產批次的全域唯一識別碼，格式 LOT-YYYYMMDD-NNNN，貫穿整個製造生命週期。",
    aliases: ["lot_no", "batch_id", "batch_no", "wip_lot_id"],
    domain: "semiconductor",
    relatedConcepts: [],
    tableHints: [
      { tableName: "wip_lots", role: "ssot", note: "批次資料的 SSOT 表" },
      { tableName: "lot_history", role: "replica", note: "歷史追蹤副本" },
    ],
    namingDictIds: [2],
    sourceRefs: [{ docId: doc1.id, chunkIdx: 0 }],
    status: "approved",
    reviewers: [{ userId: 1, name: "Admin", signedAt: now }],
  });

  const concept2 = await createConcept({
    slug: "equipment-identity",
    name: "設備識別碼",
    stdName: "equip_id",
    definition: "製程設備的唯一識別代碼，對應 ERP 資產模組與 MES 設備主檔，跨系統全域唯一。",
    aliases: ["equipment_id", "equip_code", "machine_id", "tool_id"],
    domain: "semiconductor",
    relatedConcepts: [],
    tableHints: [
      { tableName: "equipment_master", role: "ssot", note: "設備主檔 SSOT" },
    ],
    namingDictIds: [1],
    sourceRefs: [{ docId: doc1.id, chunkIdx: 1 }],
    status: "approved",
    reviewers: [{ userId: 1, name: "Admin", signedAt: now }],
  });

  const concept3 = await createConcept({
    slug: "process-node",
    name: "製程節點",
    stdName: "process_node",
    definition: "半導體製程的技術世代節點，例如 28nm、14nm、7nm，用於良率分析的主要分群維度。",
    aliases: ["tech_node", "process_nm", "node", "tech_generation"],
    domain: "semiconductor",
    relatedConcepts: [],
    tableHints: [
      { tableName: "product_master", role: "ssot" },
      { tableName: "wip_lots", role: "reference" },
    ],
    namingDictIds: [4],
    sourceRefs: [{ docId: doc2.id, chunkIdx: 0 }],
    status: "approved",
    reviewers: [{ userId: 1, name: "Admin", signedAt: now }],
  });

  const concept4 = await createConcept({
    slug: "oee-metric",
    name: "設備綜合效率",
    stdName: "oee",
    definition: "Overall Equipment Effectiveness，OEE = 可用率 × 效能率 × 品質率，範圍 0–100，是設備管理的核心 KPI。",
    aliases: ["overall_equipment_effectiveness", "equipment_effectiveness"],
    domain: "semiconductor",
    relatedConcepts: [concept2.id],
    tableHints: [
      { tableName: "equipment_oee_daily", role: "ssot" },
    ],
    namingDictIds: [9],
    sourceRefs: [{ docId: doc1.id, chunkIdx: 2 }],
    status: "pending",
    reviewers: [],
  });

  const concept5 = await createConcept({
    slug: "yield-rate",
    name: "製程良率",
    stdName: "yield_rate",
    definition: "批次或晶圓在特定製程工站的通過率，計算方式為（合格數 / 投入數）× 100。",
    aliases: ["yield", "yr", "pass_rate", "process_yield"],
    domain: "semiconductor",
    relatedConcepts: [concept1.id, concept3.id],
    tableHints: [
      { tableName: "test_results", role: "ssot" },
    ],
    namingDictIds: [6],
    sourceRefs: [{ docId: doc1.id, chunkIdx: 2 }],
    status: "pending",
    reviewers: [],
  });

  const concept6 = await createConcept({
    slug: "equipment-maintenance",
    name: "設備保養",
    stdName: "equipment_maintenance",
    definition: "對製程設備執行的預防性或矯正性保養作業，包含定期清潔、零件更換、校準，以維持設備稼動率與製程穩定性。",
    aliases: ["equip_maintenance", "pm_activity", "maintenance_event", "preventive_maintenance"],
    domain: "semiconductor",
    relatedConcepts: [concept2.id, concept4.id],
    tableHints: [
      { tableName: "equipment_pm_schedule", role: "ssot", note: "保養排程主檔" },
      { tableName: "equipment_pm_log", role: "replica", note: "實際保養執行記錄" },
    ],
    namingDictIds: [8],
    sourceRefs: [{ docId: doc1.id, chunkIdx: 1 }],
    status: "pending",
    reviewers: [],
  });

  console.warn(`[gov-seed] Created 6 concept cards (3 approved, 3 pending)`);

  // ── 3. Business Rules ────────────────────────────────────────────────────────
  const rule1 = await createBusinessRule({
    slug: "br-001-lot-ssot",
    title: "BR-001：批次資料 SSOT 聲明",
    ruleType: "ssot",
    statement: "所有批次資訊（狀態、位置、工站歷程）的單一真相來源為 wip_lots 表。下游系統不得將批次資訊的副本表視為權威來源。",
    machine: {
      kind: "ssot_declaration",
      conceptId: concept1.id,
      ssotTable: { schemaId: 1, tableName: "wip_lots" },
    },
    sourceRefs: [{ docId: doc1.id, chunkIdx: 2 }],
    status: "approved",
    reviewers: [{ userId: 1, name: "Admin", signedAt: now }],
  });

  const rule2 = await createBusinessRule({
    slug: "br-002-equip-ssot",
    title: "BR-002：設備主檔 SSOT 聲明",
    ruleType: "ssot",
    statement: "設備基本屬性（名稱、類型、廠牌、製程能力）的單一真相來源為 equipment_master 表。MES、ERP 的設備資料均應以此為主。",
    machine: {
      kind: "ssot_declaration",
      conceptId: concept2.id,
      ssotTable: { schemaId: 1, tableName: "equipment_master" },
    },
    sourceRefs: [{ docId: doc1.id, chunkIdx: 1 }],
    status: "approved",
    reviewers: [{ userId: 1, name: "Admin", signedAt: now }],
  });

  const rule3 = await createBusinessRule({
    slug: "br-003-station-completion",
    title: "BR-003：工站完成退出條件",
    ruleType: "process",
    statement: "批次進入下一工站前必須滿足三個條件：(1) process_records 已記錄製程參數；(2) test_results 已記錄品質抽測；(3) lot_history 已記錄操作員簽核。",
    machine: {
      kind: "field_constraint",
      fieldPattern: "station_exit_*",
      requirement: "all_three_records_exist",
    },
    sourceRefs: [{ docId: doc1.id, chunkIdx: 2 }],
    status: "approved",
    reviewers: [{ userId: 1, name: "Admin", signedAt: now }],
  });

  const rule4 = await createBusinessRule({
    slug: "br-004-medium-block-no-join-medium",
    title: "BR-004：Medium Block 不得 JOIN 另一 Medium Block",
    ruleType: "constraint",
    statement: "寬表種類為 Medium Block 時，其 JOIN 圖中的所有參考表均不得是另一個已治理的 Medium Block。此規則防止寬表層級遞迴導致的資料重複與血緣斷鏈。",
    sourceRefs: [{ docId: doc2.id, chunkIdx: 1 }],
    status: "pending",
    reviewers: [],
  });

  console.warn(`[gov-seed] Created 4 business rules (3 approved, 1 pending)`);

  // ── 4. Import Batch ──────────────────────────────────────────────────────────
  const batch = await createImportBatch({
    name: "MES WIP 模組 DDL v3",
    source: "ui-upload",
    schemaIds: [1, 2],
    tableCount: 5,
    status: "classified",
    proposals: [
      {
        tableId: 101, schemaId: 1, tableName: "wip_lots",
        suggested: { domain: "semiconductor", layerType: "transaction" },
        confidence: 0.91,
        rationale: {
          matchedConcepts: [concept1.id],
          matchedDictEntries: [2],
          similarTables: [{ schemaId: 1, tableName: "lot_archive", score: 0.78, reason: "欄位結構高度相似（lot_id, product_id, process_node）" }],
          summary: "主批次追蹤表，包含 lot_id PK 及完整製程屬性，命中批次概念，SSOT 聲明匹配，信心度 91%。",
        },
        status: "accepted",
      },
      {
        tableId: 102, schemaId: 1, tableName: "equipment_master",
        suggested: { domain: "semiconductor", layerType: "transaction" },
        confidence: 0.88,
        rationale: {
          matchedConcepts: [concept2.id],
          matchedDictEntries: [1],
          similarTables: [],
          summary: "設備主檔表，含 equip_id PK 及設備屬性，命中設備識別碼概念，SSOT 聲明匹配，信心度 88%。",
        },
        status: "accepted",
      },
      {
        tableId: 103, schemaId: 1, tableName: "process_records",
        suggested: { domain: "semiconductor", layerType: "transaction" },
        confidence: 0.82,
        rationale: {
          matchedConcepts: [concept1.id, concept2.id],
          matchedDictEntries: [2, 1],
          similarTables: [],
          summary: "製程記錄表，外鍵參考 lot_id 與 equip_id，命中批次及設備兩個概念，信心度 82%。",
        },
        status: "accepted",
      },
      {
        tableId: 104, schemaId: 1, tableName: "test_results",
        suggested: { domain: "semiconductor", layerType: "transaction" },
        confidence: 0.75,
        rationale: {
          matchedConcepts: [concept1.id, concept5.id],
          matchedDictEntries: [2, 6],
          similarTables: [],
          summary: "品質測試結果表，含 yield_rate 欄位，命中批次及良率概念，信心度 75%。",
        },
        status: "accepted",
      },
      {
        tableId: 105, schemaId: 2, tableName: "lot_history",
        suggested: { domain: "semiconductor", layerType: "r2u" },
        confidence: 0.65,
        rationale: {
          matchedConcepts: [concept1.id],
          matchedDictEntries: [2],
          similarTables: [{ schemaId: 1, tableName: "wip_lots", score: 0.65, reason: "部分欄位重疊，但為歷史副本表" }],
          summary: "批次歷史表，為 wip_lots 的 replica，信心度 65%，建議歸類為 r2u 層。",
        },
        status: "pending",
      },
    ],
  });

  console.warn(`[gov-seed] Created import batch: ${batch.name}`);

  // ── 5. Wide Table Proposal ───────────────────────────────────────────────────
  const proposal = await createWtProposal({
    scenario: "分析在製品批次的完整生命週期：包含批次基本資訊、在每個工站的製程參數記錄、品質測試結果，以及操作設備資訊，用於製程良率改善分析。",
    blockKind: "medium",
    name: "wip_lot_lifecycle_wide",
    description: "在製品批次生命週期寬表，整合批次主檔、製程記錄、品質測試三表，提供完整的製程分析視圖。",
    columns: [
      { name: "lot_id", dataType: "VARCHAR(32)", definition: "在製品批次的唯一識別碼，SSOT=wip_lots，格式 LOT-YYYYMMDD-NNNN。", source: { schemaId: 1, tableName: "wip_lots", fieldName: "lot_id" }, conceptId: concept1.id, namingDictId: 2 },
      { name: "product_id", dataType: "VARCHAR(20)", definition: "產品料號，關聯 PLM 產品定義，決定製程路徑與規格。", source: { schemaId: 1, tableName: "wip_lots", fieldName: "product_id" }, namingDictId: 5 },
      { name: "process_node", dataType: "VARCHAR(10)", definition: "製程技術節點（28nm/14nm/7nm），用於良率分析的主要分群維度。", source: { schemaId: 1, tableName: "wip_lots", fieldName: "process_node" }, conceptId: concept3.id, namingDictId: 4 },
      { name: "equip_id", dataType: "VARCHAR(20)", definition: "執行當前製程的設備識別碼，SSOT=equipment_master。", source: { schemaId: 1, tableName: "process_records", fieldName: "equip_id" }, conceptId: concept2.id, namingDictId: 1 },
      { name: "recipe_id", dataType: "VARCHAR(30)", definition: "製程配方識別碼，控制設備製程參數組合。", source: { schemaId: 1, tableName: "process_records", fieldName: "recipe_id" }, namingDictId: 7 },
      { name: "yield_rate", dataType: "DECIMAL(5,2)", definition: "批次在當前工站的製程良率（%），來源 test_results，計算公式：(pass_count/total_count)*100。", source: { schemaId: 1, tableName: "test_results", fieldName: "yield_rate" }, conceptId: concept5.id, namingDictId: 6 },
      { name: "process_start_at", dataType: "DATETIME", definition: "批次開始製程的 UTC 時間戳記。", source: { schemaId: 1, tableName: "process_records", fieldName: "start_at" } },
      { name: "process_end_at", dataType: "DATETIME", definition: "批次完成製程的 UTC 時間戳記。", source: { schemaId: 1, tableName: "process_records", fieldName: "end_at" } },
    ],
    joinGraph: [
      { leftRef: "wip_lots", rightRef: "process_records", type: "left", on: [{ leftField: "lot_id", rightField: "lot_id" }] },
      { leftRef: "wip_lots", rightRef: "test_results", type: "left", on: [{ leftField: "lot_id", rightField: "lot_id" }] },
    ],
    relationships: [
      { targetKind: "table", targetRef: "equipment_master", relation: "shares_key", onFields: ["equip_id"], note: "透過 equip_id 可延伸查詢設備主檔屬性" },
    ],
    reasoningTrace: [
      { step: "concept-retrieval", detail: "命中 3 個概念: lot_id, equip_id, yield_rate", refs: { conceptIds: [concept1.id, concept2.id, concept5.id] } },
      { step: "candidate-selection", detail: "選取 4 張候選表: wip_lots, process_records, test_results, equipment_master", refs: { tableRefs: ["wip_lots", "process_records", "test_results", "equipment_master"] } },
      { step: "ssot-check", detail: "確認 lot_id SSOT=wip_lots（BR-001），equip_id SSOT=equipment_master（BR-002）" },
      { step: "compose", detail: "Medium Block：wip_lots LEFT JOIN process_records ON lot_id，LEFT JOIN test_results ON lot_id" },
    ],
    candidatePool: [
      { schemaId: 1, tableName: "wip_lots", fromBatchId: batch.id },
      { schemaId: 1, tableName: "process_records", fromBatchId: batch.id },
      { schemaId: 1, tableName: "test_results", fromBatchId: batch.id },
    ],
    status: "drafted",
  });

  console.warn(`[gov-seed] Created wide table proposal: ${proposal.name}`);

  // ── 6. Workspace Draft ───────────────────────────────────────────────────────
  const draft = await createDraft({
    proposalId: proposal.id,
    blockKind: "medium",
    name: "wip_lot_lifecycle_wide",
    description: "在製品批次生命週期寬表，整合批次主檔、製程記錄、品質測試三表，提供完整的製程分析視圖。",
    columns: proposal.columns,
    joinGraph: proposal.joinGraph,
    relationships: proposal.relationships,
    editLog: [
      { at: now, by: "admin", action: "edit-meta", detail: "從提案轉入工作區，確認欄位定義完整度" },
    ],
    versions: [],
    status: "passed",
  });

  console.warn(`[gov-seed] Created workspace draft: ${draft.name}`);

  // ── 7. Validation Report ─────────────────────────────────────────────────────
  const report = await createReport({
    draftId: draft.id,
    ranAt: now,
    ruleResults: [
      { ruleId: "gov.single_source_of_truth", severity: "error", passed: true, violations: [] },
      { ruleId: "gov.lineage_complete", severity: "error", passed: true, violations: [] },
      { ruleId: "gov.block_hierarchy", severity: "error", passed: true, violations: [] },
      { ruleId: "gov.join_key_validity", severity: "warning", passed: true, violations: [] },
      { ruleId: "gov.naming_dict_coverage", severity: "warning", passed: true, violations: [] },
      { ruleId: "gov.definition_required", severity: "error", passed: true, violations: [] },
      { ruleId: "gov.no_duplicate_semantics", severity: "warning", passed: true, violations: [] },
    ],
    summary: { errors: 0, warnings: 0, infos: 0, passed: true },
  });

  await updateDraft(draft.id, { lastReportId: report.id, status: "passed" });
  console.warn(`[gov-seed] Created validation report #${report.id}`);

  // ── 8. Governed Wide Table (published) ───────────────────────────────────────
  const gwt = {
    id: await nextId("governedWt"),
    slug: "wip-lot-lifecycle-wide",
    draftId: draft.id,
    reportId: report.id,
    blockKind: "medium" as const,
    name: "WIP 批次生命週期寬表",
    description: "在製品批次從投片到完工的完整製程數據，整合批次主檔、製程記錄、品質測試，用於良率改善與製程分析。",
    columns: draft.columns,
    joinGraph: draft.joinGraph,
    relationships: draft.relationships,
    publishedBy: "admin",
    publishedAt: now,
    version: 1,
  };
  await saveGoverned(gwt);

  // Build catalog graph
  const catalogGraph = {
    generatedAt: now,
    nodes: [
      { id: "gwt:wip-lot-lifecycle-wide", kind: "governed-wide-table" as const, label: "WIP 批次生命週期寬表", meta: { description: gwt.description, blockKind: "medium", version: 1 } },
      { id: "tbl:wip_lots", kind: "table" as const, label: "wip_lots", meta: { schemaId: 1 } },
      { id: "tbl:process_records", kind: "table" as const, label: "process_records", meta: { schemaId: 1 } },
      { id: "tbl:test_results", kind: "table" as const, label: "test_results", meta: { schemaId: 1 } },
      { id: "fld:wip_lots.lot_id", kind: "field" as const, label: "wip_lots.lot_id", meta: { definition: "在製品批次唯一識別碼", dataType: "VARCHAR(32)" } },
      { id: "fld:process_records.equip_id", kind: "field" as const, label: "process_records.equip_id", meta: { definition: "設備識別碼", dataType: "VARCHAR(20)" } },
      { id: "fld:test_results.yield_rate", kind: "field" as const, label: "test_results.yield_rate", meta: { definition: "製程良率", dataType: "DECIMAL(5,2)" } },
      { id: `cpt:${concept1.id}`, kind: "concept" as const, label: "批次識別碼 (lot_id)", meta: {} },
      { id: `cpt:${concept5.id}`, kind: "concept" as const, label: "製程良率 (yield_rate)", meta: {} },
    ],
    edges: [
      { from: "gwt:wip-lot-lifecycle-wide", to: "tbl:wip_lots", kind: "composed_from" as const },
      { from: "gwt:wip-lot-lifecycle-wide", to: "tbl:process_records", kind: "composed_from" as const },
      { from: "gwt:wip-lot-lifecycle-wide", to: "tbl:test_results", kind: "composed_from" as const },
      { from: "tbl:wip_lots", to: "fld:wip_lots.lot_id", kind: "has_field" as const },
      { from: "tbl:process_records", to: "fld:process_records.equip_id", kind: "has_field" as const },
      { from: "tbl:test_results", to: "fld:test_results.yield_rate", kind: "has_field" as const },
      { from: "fld:wip_lots.lot_id", to: `cpt:${concept1.id}`, kind: "maps_to_concept" as const },
      { from: "fld:test_results.yield_rate", to: `cpt:${concept5.id}`, kind: "maps_to_concept" as const },
    ],
  };
  await saveCatalogGraph(catalogGraph);

  // Markdown export
  const md = `---
kind: governed-wide-table
slug: wip-lot-lifecycle-wide
block: medium
version: 1
published_at: ${now}
concepts: [${concept1.id}, ${concept2.id}, ${concept3.id}, ${concept5.id}]
sources: [wip_lots, process_records, test_results]
---

## Why (用途)
在製品批次從投片到完工的完整製程數據，整合批次主檔、製程記錄、品質測試，用於良率改善與製程分析。

## Columns (欄位定義)
| column | type | definition | source(lineage) |
|---|---|---|---|
| lot_id | VARCHAR(32) | 批次唯一識別碼 | wip_lots.lot_id |
| product_id | VARCHAR(20) | 產品料號 | wip_lots.product_id |
| process_node | VARCHAR(10) | 製程技術節點 | wip_lots.process_node |
| equip_id | VARCHAR(20) | 設備識別碼 | process_records.equip_id |
| recipe_id | VARCHAR(30) | 製程配方識別碼 | process_records.recipe_id |
| yield_rate | DECIMAL(5,2) | 製程良率(%) | test_results.yield_rate |
| process_start_at | DATETIME | 製程開始時間 | process_records.start_at |
| process_end_at | DATETIME | 製程結束時間 | process_records.end_at |

## Relationships (關聯)
- shares_key \`equipment_master\` on \`equip_id\` — 透過 equip_id 可延伸查詢設備主檔屬性

## Verify (治理狀態)
- report #${report.id}: published by admin
`;
  await saveMarkdownExport("wip-lot-lifecycle-wide", md);
  console.warn(`[gov-seed] Published governed wide table: wip-lot-lifecycle-wide`);

  // ── 9. Governance Instances ──────────────────────────────────────────────────
  const policy = await getGatePolicy();

  // Instance 1: completed
  const inst1 = await createInstance({
    subjectName: "WIP 批次生命週期寬表",
    description: "首次治理：整合 wip_lots + process_records + test_results 三表，建立中型寬表。",
    owner: { userId: 1, name: "Admin" },
    routeTemplate: "default-5",
    status: "active",
  });
  const completedStations = buildInitialStations(policy).map((s, i) => ({
    ...s,
    status: (i < 4 ? "done" : "done") as "done",
    enteredAt: now,
    completedAt: now,
  }));
  await updateInstance(inst1.id, {
    stations: completedStations,
    currentStation: "completed" as const,
    status: "completed" as const,
    artifacts: {
      sourceDocIds: [doc1.id, doc2.id],
      conceptIds: [concept1.id, concept2.id, concept3.id],
      businessRuleIds: [rule1.id, rule2.id, rule3.id],
      importBatchIds: [batch.id],
      wtProposalIds: [proposal.id],
      draftIds: [draft.id],
      reportIds: [report.id],
      governedIds: [gwt.id],
    },
    events: [
      { at: now, by: "admin", type: "station-complete", detail: "knowledge: 上傳 2 份業務規格文件，抽取 5 個概念、4 條規則" },
      { at: now, by: "admin", type: "station-complete", detail: "classify: MES WIP 模組 DDL 批次，5 張表已分類" },
      { at: now, by: "admin", type: "station-complete", detail: "compose: 生成寬表提案 wip_lot_lifecycle_wide" },
      { at: now, by: "admin", type: "station-complete", detail: "review: 欄位定義審閱完成，editLog 1 筆" },
      { at: now, by: "admin", type: "station-complete", detail: "validate: 7 項治理規則全部通過" },
      { at: now, by: "admin", type: "publish", detail: "已發布至治理目錄: wip-lot-lifecycle-wide v1" },
    ],
  });

  // Instance 2: in-progress at compose station
  const inst2 = await createInstance({
    subjectName: "設備 OEE 分析寬表",
    description: "建立設備綜合效率分析寬表，整合設備主檔、停機記錄、製程記錄三表。",
    owner: { userId: 1, name: "Admin" },
    routeTemplate: "default-5",
    status: "active",
  });
  const inProgressStations = buildInitialStations(policy).map((s, i) => ({
    ...s,
    status: (i === 0 ? "done" : i === 1 ? "done" : i === 2 ? "in-progress" : "not-started") as "done" | "in-progress" | "not-started",
    enteredAt: i <= 2 ? now : undefined,
    completedAt: i < 2 ? now : undefined,
  }));
  await updateInstance(inst2.id, {
    stations: inProgressStations,
    currentStation: "compose" as const,
    artifacts: {
      sourceDocIds: [doc1.id],
      conceptIds: [concept2.id, concept4.id],
      businessRuleIds: [rule2.id],
      importBatchIds: [batch.id],
      wtProposalIds: [],
      draftIds: [],
      reportIds: [],
      governedIds: [],
    },
    events: [
      { at: now, by: "admin", type: "station-complete", detail: "knowledge: 確認設備主檔業務規格" },
      { at: now, by: "admin", type: "station-complete", detail: "classify: 設備相關表分類完成" },
      { at: now, by: "admin", type: "station-start", detail: "compose: 開始組裝 OEE 分析寬表" },
    ],
  });

  // Instance 3: on-hold
  const inst3 = await createInstance({
    subjectName: "良率趨勢分析寬表",
    description: "整合批次良率、製程條件、設備狀態，用於製程良率趨勢分析與改善。",
    owner: { userId: 1, name: "Admin" },
    routeTemplate: "default-5",
    status: "active",
  });
  const onHoldStations = buildInitialStations(policy).map((s, i) => ({
    ...s,
    status: (i === 0 ? "done" : "not-started") as "done" | "not-started",
    enteredAt: i === 0 ? now : undefined,
    completedAt: i === 0 ? now : undefined,
  }));
  await updateInstance(inst3.id, {
    stations: onHoldStations,
    currentStation: "classify" as const,
    status: "on-hold" as const,
    holdReason: "等待品質部門確認 yield_rate 計算公式與 test_results 表的對應關係",
    events: [
      { at: now, by: "admin", type: "station-complete", detail: "knowledge: yield_rate 概念待審核中" },
      { at: now, by: "admin", type: "hold", detail: "暫停：等待品質部門確認 yield_rate 計算公式" },
    ],
  });

  // Instance 4: equipment maintenance subject — knowledge station in-progress
  const inst4 = await createInstance({
    subjectName: "設備保養資料主題",
    description: "治理設備保養相關資料主題，整合保養排程、執行記錄與 OEE 影響分析，建立設備保養寬表。",
    owner: { userId: 1, name: "Admin" },
    routeTemplate: "default-5",
    status: "active",
  });
  const maintenanceStations = buildInitialStations(policy).map((s, i) => ({
    ...s,
    status: (i === 0 ? "in-progress" : "not-started") as "in-progress" | "not-started",
    enteredAt: i === 0 ? now : undefined,
    completedAt: undefined,
  }));
  await updateInstance(inst4.id, {
    stations: maintenanceStations,
    currentStation: "knowledge" as const,
    status: "active" as const,
    artifacts: {
      sourceDocIds: [doc1.id],
      conceptIds: [concept2.id, concept4.id, concept6.id],
      businessRuleIds: [rule2.id],
      importBatchIds: [],
      wtProposalIds: [],
      draftIds: [],
      reportIds: [],
      governedIds: [],
    },
    events: [
      { at: now, by: "admin", type: "created", detail: "Instance created for subject: 設備保養資料主題" },
      { at: now, by: "admin", type: "station-start", detail: "knowledge: 開始整理設備保養業務概念，已初步關聯設備識別碼、設備綜合效率、設備保養三個概念" },
    ],
  });

  console.warn(`[gov-seed] Created 4 governance instances (1 completed, 1 in-progress, 1 on-hold, 1 knowledge-in-progress)`);
  console.warn("[gov-seed] ✓ Governance demo data seeded successfully");
}

// ─────────────────────────────────────────────────────────────────────────────
// Lineage sample data seed
// Guard: only runs if no lineage edges exist yet
// ─────────────────────────────────────────────────────────────────────────────

export async function seedLineageDemoIfNeeded(): Promise<void> {
  const { listEdges, recordEdge } = await import("../repositories/lineage.js");
  const existing = await listEdges();
  if (existing.length > 0) return;

  const schemas = await listSchemas();
  if (schemas.length === 0) return;

  const schemaDetails = await Promise.all(schemas.map(s => getSchemaById(s.id)));

  type SchemaDetail = typeof schemaDetails[0];

  function findSchema(namePart: string): SchemaDetail | undefined {
    return schemaDetails.find(s => s.name.toLowerCase().includes(namePart.toLowerCase()));
  }
  function findTable(schema: SchemaDetail | undefined, namePart: string) {
    return schema?.tables.find(t => t.name.toLowerCase().includes(namePart.toLowerCase()));
  }

  type EdgeDef = {
    fromS: SchemaDetail | undefined;
    fromTName: string;
    toS: SchemaDetail | undefined;
    toTName: string;
    transform: Parameters<typeof recordEdge>[0]["transformType"];
    desc: string;
    source?: Parameters<typeof recordEdge>[0]["source"];
  };

  const mesEquip = findSchema("mes equipment");
  const mesProcess = findSchema("mes process");
  const plmCore = findSchema("plm");
  const testQuality = findSchema("test quality");
  const unified = findSchema("unified analytics");
  const wip = findSchema("wip");

  const edgeDefs: EdgeDef[] = [
    // ── MES Equipment 內部 ───────────────────────────────────────────
    { fromS: mesEquip, fromTName: "equipments", toS: mesEquip, toTName: "equipment_pm_records",
      transform: "join",    desc: "設備主檔 → 保養記錄：equipment_pm_records.equipment_id = equipments.id" },
    { fromS: mesEquip, fromTName: "equipments", toS: mesEquip, toTName: "equipment_alarms",
      transform: "direct",  desc: "設備主檔 → 設備警報：equipment_alarms.equipment_id = equipments.id" },
    // ── MES Equipment → MES Process ─────────────────────────────────
    { fromS: mesEquip, fromTName: "equipments", toS: mesProcess, toTName: "process_steps",
      transform: "join",    desc: "設備參與製程步驟：process_steps.equipment_id = equipments.id" },
    // ── MES Process 內部 ────────────────────────────────────────────
    { fromS: mesProcess, fromTName: "lots",          toS: mesProcess, toTName: "wafers",
      transform: "join",    desc: "批次拆解為晶圓：wafers.lot_id = lots.id" },
    { fromS: mesProcess, fromTName: "lots",          toS: mesProcess, toTName: "process_steps",
      transform: "direct",  desc: "批次拆解為製程步驟：process_steps.lot_id = lots.id" },
    { fromS: mesProcess, fromTName: "wafers",        toS: mesProcess, toTName: "process_steps",
      transform: "direct",  desc: "晶圓對應製程步驟：process_steps.wafer_id = wafers.id" },
    { fromS: mesProcess, fromTName: "process_steps", toS: mesProcess, toTName: "measurements",
      transform: "derived", desc: "製程步驟產生量測數據：measurements.step_id = process_steps.id" },
    // ── PLM → MES Process ───────────────────────────────────────────
    { fromS: plmCore, fromTName: "parts",         toS: mesProcess, toTName: "lots",
      transform: "join",    desc: "零件（產品）定義對應生產批次：lots.product_code = parts.part_no" },
    { fromS: plmCore, fromTName: "part_revisions",toS: mesProcess, toTName: "lots",
      transform: "join",    desc: "零件版本決定批次使用規格：lots.rev = part_revisions.revision" },
    { fromS: plmCore, fromTName: "bom_items",     toS: mesProcess, toTName: "lots",
      transform: "derived", desc: "BOM 展開後驅動生產批次物料用料計畫" },
    // ── PLM 內部 ────────────────────────────────────────────────────
    { fromS: plmCore, fromTName: "parts",              toS: plmCore, toTName: "part_revisions",
      transform: "join",    desc: "零件版本追蹤：part_revisions.part_id = parts.id" },
    { fromS: plmCore, fromTName: "parts",              toS: plmCore, toTName: "bom_items",
      transform: "direct",  desc: "零件主檔展開 BOM 結構：bom_items.parent_part_id = parts.id" },
    { fromS: plmCore, fromTName: "engineering_changes",toS: plmCore, toTName: "part_revisions",
      transform: "derived", desc: "ECO 工程變更觸發新版本建立：part_revisions.ec_no = engineering_changes.ec_no" },
    { fromS: plmCore, fromTName: "suppliers",          toS: plmCore, toTName: "part_suppliers",
      transform: "direct",  desc: "供應商主檔關聯零件供應商：part_suppliers.supplier_id = suppliers.id" },
    { fromS: plmCore, fromTName: "parts",              toS: plmCore, toTName: "part_suppliers",
      transform: "direct",  desc: "零件與供應商多對多：part_suppliers.part_id = parts.id" },
    // ── MES Process → Test Quality ──────────────────────────────────
    { fromS: mesProcess, fromTName: "lots",   toS: testQuality, toTName: "wafer_lots",
      transform: "direct",  desc: "生產批次流入品質檢測：wafer_lots.lot_no = lots.lot_no" },
    { fromS: mesProcess, fromTName: "wafers", toS: testQuality, toTName: "inspection_records",
      transform: "direct",  desc: "晶圓進入檢測站：inspection_records.wafer_id = wafers.wafer_id" },
    // ── Test Quality 內部 ───────────────────────────────────────────
    { fromS: testQuality, fromTName: "wafer_lots",        toS: testQuality, toTName: "inspection_records",
      transform: "direct",  desc: "品質批次觸發檢測記錄：inspection_records.lot_id = wafer_lots.id" },
    { fromS: testQuality, fromTName: "inspection_records",toS: testQuality, toTName: "defect_items",
      transform: "direct",  desc: "檢測記錄展開缺陷明細：defect_items.inspection_id = inspection_records.id" },
    { fromS: testQuality, fromTName: "inspection_records",toS: testQuality, toTName: "yield_info",
      transform: "derived", desc: "檢測彙總計算良率統計：yield_info.lot_id = wafer_lots.id" },
    { fromS: testQuality, fromTName: "spc_charts",        toS: testQuality, toTName: "inspection_records",
      transform: "filter",  desc: "SPC 管制圖依規格篩選檢測記錄判斷標準" },
    // ── MES Process → Wip Tracking ──────────────────────────────────
    { fromS: mesProcess, fromTName: "lots",   toS: wip, toTName: "wip_lot",
      transform: "direct",  desc: "生產批次同步至 WIP 追蹤：wip_lot.lot_no = lots.lot_no" },
    { fromS: mesProcess, fromTName: "wafers", toS: wip, toTName: "wip_move",
      transform: "direct",  desc: "晶圓移動事件記錄於 WIP：wip_move.wafer_id = wafers.wafer_id" },
    // ── Wip Tracking 內部 ───────────────────────────────────────────
    { fromS: wip, fromTName: "wip_lot",  toS: wip, toTName: "wip_move",
      transform: "direct",  desc: "WIP 批次展開移動明細：wip_move.wip_lot_id = wip_lot.id" },
    { fromS: wip, fromTName: "wip_move", toS: wip, toTName: "wip_defect",
      transform: "direct",  desc: "移動過程發現缺陷記錄：wip_defect.wip_move_id = wip_move.id" },
    // ── 各 domain → Unified Analytics（ETL 聚合整合層）───────────────
    { fromS: mesProcess,  fromTName: "lots",                toS: unified, toTName: "prod_daily_summary",
      transform: "aggregate", desc: "每日生產批次彙總至 prod_daily_summary（ETL 日結）", source: "governance" },
    { fromS: mesProcess,  fromTName: "wafers",              toS: unified, toTName: "prod_daily_summary",
      transform: "aggregate", desc: "晶圓產出數量納入每日生產彙總", source: "governance" },
    { fromS: mesEquip,    fromTName: "equipments",          toS: unified, toTName: "equip_oee_summary",
      transform: "aggregate", desc: "設備稼動數據彙總為 OEE 效率報表", source: "governance" },
    { fromS: testQuality, fromTName: "yield_info",          toS: unified, toTName: "yield_trend",
      transform: "aggregate", desc: "良率統計週彙總至良率趨勢週報", source: "governance" },
    { fromS: testQuality, fromTName: "inspection_records",  toS: unified, toTName: "yield_trend",
      transform: "aggregate", desc: "檢測記錄納入良率趨勢計算", source: "governance" },
    { fromS: unified, fromTName: "prod_daily_summary",  toS: unified, toTName: "cross_system_kpi",
      transform: "aggregate", desc: "每日生產彙總匯入跨系統 KPI", source: "governance" },
    { fromS: unified, fromTName: "yield_trend",          toS: unified, toTName: "cross_system_kpi",
      transform: "aggregate", desc: "良率趨勢週報匯入跨系統 KPI", source: "governance" },
    { fromS: unified, fromTName: "equip_oee_summary",    toS: unified, toTName: "cross_system_kpi",
      transform: "aggregate", desc: "設備 OEE 彙總匯入跨系統 KPI", source: "governance" },
  ];

  let seeded = 0;
  for (const def of edgeDefs) {
    const fromT = findTable(def.fromS, def.fromTName);
    const toT   = findTable(def.toS,   def.toTName);
    if (!def.fromS || !def.toS || !fromT || !toT) continue;
    await recordEdge({
      fromSchemaId: def.fromS.id, fromSchemaName: def.fromS.name,
      fromDomain: def.fromS.domain || "semiconductor",
      fromTableId: fromT.id, fromTableName: fromT.name, fromKind: "table",
      toSchemaId: def.toS.id, toSchemaName: def.toS.name,
      toDomain: def.toS.domain || "semiconductor",
      toTableId: toT.id, toTableName: toT.name, toKind: "table",
      transformType: def.transform, description: def.desc,
      source: def.source ?? "manual",
    }).catch(() => undefined);
    seeded++;
  }

  if (seeded > 0) {
    console.warn(`[lineage-seed] ✓ Seeded ${seeded} lineage edges across 6 domains`);
  }
}
