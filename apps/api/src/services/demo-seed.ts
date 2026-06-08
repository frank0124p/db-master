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
