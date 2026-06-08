#!/usr/bin/env node
/**
 * Demo data seed script for DB Master.
 * Usage:  node scripts/seed-demo.mjs [API_BASE] [DATA_DIR]
 * Default API_BASE: http://localhost:3005
 * Default DATA_DIR: ./data
 *
 * What it does:
 *  1. Wipes all existing runtime data (schemas, naming, suites, versions, wide tables)
 *  2. Clears the DDL manifest so reload re-imports all .sql seed files
 *  3. Triggers DDL reload
 *  4. Creates Product Suites
 *  5. Assigns layer types + suites to each schema
 *  6. Seeds Naming Dictionary (approved entries)
 *  7. Creates version snapshots for each schema
 *  8. Creates one Wide Table definition
 */

import fs from "fs/promises";
import path from "path";

const BASE     = process.argv[2] ?? "http://localhost:3005";
const DATA_DIR = process.argv[3] ?? path.resolve("data");
const API      = `${BASE}/api/v1`;

async function req(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: body != null ? { "Content-Type": "application/json" } : {},
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") return undefined;
  return res.json().catch(() => undefined);
}

function log(msg) { process.stdout.write(`  ${msg}\n`); }

// ── Step 0: health check ──────────────────────────────────────────────────────
process.stdout.write("\n🔍 Checking API health...\n");
const health = await req("GET", "/health").catch(() => null);
if (!health?.ok) {
  console.error(`❌ API not reachable at ${BASE}. Start the server first.`);
  process.exit(1);
}
log(`API OK — ${BASE}`);

// ── Step 1: wipe existing data ─────────────────────────────────────────────
process.stdout.write("\n🗑️  Clearing existing data...\n");

const [existingSchemas, existingNaming, existingSuites] = await Promise.all([
  req("GET", "/schemas"),
  req("GET", "/naming-dictionary?status=approved"),
  req("GET", "/suites"),
]);

// Delete all schemas
for (const s of existingSchemas ?? []) {
  await req("DELETE", `/schemas/${s.id}`);
  log(`Deleted schema: ${s.name}`);
}

// Delete all pending naming entries too
const pendingNaming = await req("GET", "/naming-dictionary?status=pending") ?? [];
for (const e of [...(existingNaming ?? []), ...pendingNaming]) {
  await req("DELETE", `/naming-dictionary/${e.id}`);
  log(`Deleted naming entry: ${e.stdName}`);
}

// Delete all suites
for (const s of existingSuites ?? []) {
  await req("DELETE", `/suites/${s.id}`);
  log(`Deleted suite: ${s.name}`);
}

// ── Step 2: clear DDL manifest so reload re-imports all files ─────────────────
process.stdout.write("\n📂 Reloading DDL files...\n");
const manifestPath = path.join(DATA_DIR, "_sys", "ddl-manifest.json");
await fs.unlink(manifestPath).catch(() => {}); // ignore if not present
log("DDL manifest cleared");

await req("POST", "/reload");
log("DDL reload triggered");

// Wait for import to complete
await new Promise(r => setTimeout(r, 2000));

const schemas = await req("GET", "/schemas");
log(`Imported ${schemas.length} schemas from DDL`);
if (schemas.length === 0) {
  console.error("❌ No schemas after reload. Check data/ddl/ directory.");
  process.exit(1);
}

// ── Step 3: Create Product Suites ─────────────────────────────────────────────
process.stdout.write("\n🗂️  Creating Product Suites...\n");

const suiteSemi = await req("POST", "/suites", {
  name: "半導體製造", color: "#38b6f0",
});
log(`Suite: 半導體製造 (id=${suiteSemi.id})`);

const suiteSystem = await req("POST", "/suites", {
  name: "系統整合", color: "#a78bfa",
});
log(`Suite: 系統整合 (id=${suiteSystem.id})`);

// ── Step 4: Assign layer + suite to each schema ────────────────────────────────
process.stdout.write("\n🔧 Assigning layers and suites to schemas...\n");

// Map DDL filename → { layer, suiteId, env }
const schemaConfig = {
  "Mes Equipment": { layer: "transaction", suiteId: suiteSemi.id, env: "PROD" },
  "Mes Process":   { layer: "transaction", suiteId: suiteSemi.id, env: "PROD" },
  "Wip Tracking":  { layer: "transaction", suiteId: suiteSemi.id, env: "DEV" },
  "Plm Core":      { layer: "r2u",         suiteId: suiteSystem.id, env: "STAGING" },
  "Test Quality":  { layer: "r2u",         suiteId: suiteSemi.id,  env: "TEST" },
  "Unified Analytics": { layer: "unified", suiteId: suiteSemi.id, env: "PROD" },
};

const updatedSchemas = [];
for (const s of schemas) {
  const cfg = schemaConfig[s.name];
  if (!cfg) {
    log(`⚠ No config for schema "${s.name}", skipping`);
    updatedSchemas.push(s);
    continue;
  }
  const updated = await req("PATCH", `/schemas/${s.id}`, {
    layerType: cfg.layer,
    suiteId: cfg.suiteId,
    environment: cfg.env,
    domain: "semiconductor",
  });
  log(`${s.name} → layer=${cfg.layer}, env=${cfg.env}`);
  updatedSchemas.push(updated ?? s);
}

// ── Step 5: Seed Naming Dictionary ────────────────────────────────────────────
process.stdout.write("\n📖 Seeding Naming Dictionary...\n");

const namingEntries = [
  {
    concept: "設備識別碼", std_name: "equip_id",
    aliases: ["equipment_id", "equip_code", "machine_id"],
    domain: "semiconductor", layers: ["transaction", "r2u", "unified"],
    description: "製程設備的唯一識別代碼，與 ERP 及 MES 系統對齊。格式：大寫英文+數字。",
  },
  {
    concept: "批次識別碼", std_name: "lot_id",
    aliases: ["lot_no", "batch_id", "batch_no", "lot_number"],
    domain: "semiconductor", layers: ["transaction", "r2u"],
    description: "生產批次唯一識別碼，格式 LOT-YYYYMMDD-NNNN。",
  },
  {
    concept: "晶圓識別碼", std_name: "wafer_id",
    aliases: ["wafer_no", "wafer_number", "wid"],
    domain: "semiconductor", layers: ["transaction"],
    description: "晶圓片的唯一識別碼，通常為批次號+槽位組合。",
  },
  {
    concept: "製程節點", std_name: "process_node",
    aliases: ["tech_node", "process_nm", "node"],
    domain: "semiconductor", layers: ["transaction", "r2u", "unified"],
    description: "製程技術節點，例如 28nm、7nm。用於良率分析分群。",
  },
  {
    concept: "產品料號", std_name: "product_id",
    aliases: ["prod_id", "product_no", "part_number", "pn"],
    domain: "semiconductor", layers: ["transaction", "r2u", "unified"],
    description: "產品的唯一料號，與 PLM 及 ERP 系統對齊。",
  },
  {
    concept: "良率", std_name: "yield_rate",
    aliases: ["yield", "yr", "pass_rate"],
    domain: "semiconductor", layers: ["transaction", "r2u", "unified"],
    description: "製程良率百分比，範圍 0.00–100.00。",
  },
  {
    concept: "製程配方識別碼", std_name: "recipe_id",
    aliases: ["recipe_name", "recipe_no", "process_recipe"],
    domain: "semiconductor", layers: ["transaction"],
    description: "設備製程配方唯一代碼，控制製程參數組合。",
  },
  {
    concept: "設備類型", std_name: "equip_type",
    aliases: ["equipment_type", "machine_type", "tool_type"],
    domain: "semiconductor", layers: ["transaction", "r2u"],
    description: "設備功能分類：FURNACE / CVD / CMP / LITHO / ETCH 等。",
  },
  {
    concept: "OEE 綜合效率", std_name: "oee",
    aliases: ["overall_equipment_effectiveness", "oee_rate"],
    domain: "semiconductor", layers: ["unified"],
    description: "設備綜合效率 = 可用率 × 效能率 × 品質率，範圍 0.00–100.00。",
  },
  {
    concept: "缺陷類型代碼", std_name: "defect_type_id",
    aliases: ["defect_code", "fault_type", "defect_id"],
    domain: "semiconductor", layers: ["transaction", "r2u"],
    description: "缺陷分類代碼，對應品質管理系統缺陷主檔。",
  },
  {
    concept: "操作員識別碼", std_name: "operator_id",
    aliases: ["op_id", "operator_no", "emp_id"],
    domain: "general", layers: ["transaction"],
    description: "執行操作的員工識別碼，對應 HR 系統。",
  },
  {
    concept: "建立時間", std_name: "created_at",
    aliases: ["create_time", "creation_date", "insert_time"],
    domain: "general", layers: ["transaction", "r2u", "unified"],
    description: "資料列建立的 UTC 時間戳記，所有資料表必填。",
  },
  {
    concept: "更新時間", std_name: "updated_at",
    aliases: ["update_time", "modify_time", "last_modified"],
    domain: "general", layers: ["transaction", "r2u", "unified"],
    description: "資料列最後更新的 UTC 時間戳記，ON UPDATE CURRENT_TIMESTAMP。",
  },
];

const createdIds = [];
for (const entry of namingEntries) {
  const created = await req("POST", "/naming-dictionary", entry);
  if (created?.id) {
    // Approve immediately
    await req("POST", `/naming-dictionary/${created.id}/approve`);
    log(`✓ ${entry.std_name} (${entry.concept})`);
    createdIds.push(created.id);
  }
}

// ── Step 6: Create version snapshots ─────────────────────────────────────────
process.stdout.write("\n🕐 Creating version snapshots...\n");

const allSchemas = await req("GET", "/schemas");
for (const s of allSchemas) {
  const v = await req("POST", `/schemas/${s.id}/versions`, {
    message: `v1: 初始版本 — 從 DDL 自動匯入`,
  });
  if (v?.id) {
    log(`${s.name} → v1 saved`);
  }
}

// ── Step 7: Create a Wide Table demo ──────────────────────────────────────────
process.stdout.write("\n📊 Creating Wide Table demo...\n");

const unified = allSchemas.find(s => s.name === "Unified Analytics");

if (unified) {
  // Load schema detail to get tables + fields
  const detail = await req("GET", `/schemas/${unified.id}`);
  const tables = detail?.tables ?? [];

  if (tables.length >= 2) {
    const baseTable = tables[0]; // prod_daily_summary
    const joinTable = tables[1]; // yield_trend

    // Pick first 4 fields from each table
    const baseCols = (baseTable.fields ?? []).slice(0, 4);
    const joinCols = (joinTable.fields ?? []).slice(0, 3);

    const sources = [
      { tableId: baseTable.id, colPrefix: "daily", joinType: "BASE", position: 0 },
      { tableId: joinTable.id, colPrefix: "trend", joinType: "LEFT",
        joinCondition: `daily.product_id = trend.product_id AND daily.process_node = trend.process_node`,
        position: 1 },
    ];

    const columns = [
      ...baseCols.map((f, i) => ({
        sourcePosition: 0, fieldId: f.id,
        outputName: `daily_${f.name}`, included: true, position: i,
      })),
      ...joinCols.map((f, i) => ({
        sourcePosition: 1, fieldId: f.id,
        outputName: `trend_${f.name}`, included: true, position: baseCols.length + i,
      })),
    ];

    const wt = await req("POST", `/schemas/${unified.id}/wide-tables`, {
      name: "生產日報 × 良率趨勢",
      description: "整合每日生產彙總與週良率趨勢的跨表分析寬表",
      wideTableType: "unified",
      sources,
      columns,
    }).catch(e => { log(`⚠ Wide table: ${e.message}`); return null; });

    if (wt?.id) log(`Wide table created: ${wt.name} (id=${wt.id})`);
  } else {
    log("⚠ Not enough tables in Unified Analytics for wide table demo");
  }
}

// ── Done ───────────────────────────────────────────────────────────────────────
process.stdout.write("\n✅ Demo data seeded successfully!\n\n");

const finalSchemas = await req("GET", "/schemas");
const finalNaming  = await req("GET", "/naming-dictionary?status=approved");
const finalSuites  = await req("GET", "/suites");

const byLayer = { transaction: 0, r2u: 0, unified: 0, null: 0 };
for (const s of finalSchemas) byLayer[s.layerType ?? "null"]++;

process.stdout.write("📈 Summary:\n");
process.stdout.write(`   Schemas: ${finalSchemas.length} (transaction: ${byLayer.transaction}, r2u: ${byLayer.r2u}, unified: ${byLayer.unified})\n`);
process.stdout.write(`   Naming Dict: ${finalNaming?.length ?? 0} approved entries\n`);
process.stdout.write(`   Suites: ${finalSuites?.length ?? 0}\n\n`);
