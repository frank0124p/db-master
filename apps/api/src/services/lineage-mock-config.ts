/**
 * Lineage query mock scenarios.
 *
 * Set LINEAGE_MOCK=true in apps/api/.env.local to activate.
 * When mock is on, queryWithLineageStream() uses these pre-written responses
 * instead of calling the LLM API.
 *
 * Each scenario has:
 *   match      — regex tested against the user's question
 *   steps      — pre-written thinking steps (streamed with delay)
 *   buildResult — builds a LineageQueryResult from live edges + schemas,
 *                 so table IDs and edge IDs are always accurate
 *
 * To connect the real LLM: remove LINEAGE_MOCK from .env.local (or set it to false).
 */

import type { LineageEdge, LineageQueryResult, LineageThinkingStep } from "@schema-studio/core";
import type { SchemaWithTables } from "../repositories/schemas.js";

export interface MockScenario {
  id: string;
  label: string;
  match: RegExp;
  steps: LineageThinkingStep[];
  buildResult(
    question: string,
    edges: LineageEdge[],
    schemas: SchemaWithTables[],
  ): LineageQueryResult;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function findEdgesByTable(
  edges: LineageEdge[],
  fromTable: string,
  toTable?: string,
): LineageEdge[] {
  return edges.filter(
    e => e.fromTableName === fromTable && (toTable == null || e.toTableName === toTable),
  );
}

type TableEntry = { schema: SchemaWithTables; table: SchemaWithTables["tables"][number] };

function findTable(schemas: SchemaWithTables[], tableName: string): TableEntry | null {
  for (const s of schemas) {
    const t = s.tables.find(t => t.name === tableName);
    if (t) return { schema: s, table: t };
  }
  return null;
}

function tableRef(e: TableEntry | null, kind: "table" | "wide-table" | "governed" = "table") {
  if (!e) return null;
  return {
    schemaId: e.schema.id,
    schemaName: e.schema.name,
    domain: e.schema.domain ?? "semiconductor",
    tableId: e.table.id,
    tableName: e.table.name,
    kind,
  } as const;
}

// ── Scenario definitions ──────────────────────────────────────────────────────

export const MOCK_SCENARIOS: MockScenario[] = [
  // ────────────────────────────────────────────────────────────────────────────
  // 1. 設備保養 (Equipment PM)
  // ────────────────────────────────────────────────────────────────────────────
  {
    id: "equipment-pm",
    label: "設備保養記錄查詢",
    match: /設備.*保養|保養.*設備|pm.*記錄|equipment.*pm|equipment.*maintenance|保養記錄/i,
    steps: [
      {
        step: "1.識別問題",
        text: "用戶詢問設備保養相關資料，屬於 MES 設備管理領域（Mes Equipment domain）。核心需求：追蹤設備保養歷史記錄，了解各設備的 PM 執行狀況。",
      },
      {
        step: "2.搜尋相關Domain",
        text: "掃描所有 domain → semiconductor 域下找到 Mes Equipment schema（id=13），包含 equipments（製程設備主檔）與 equipment_pm_records（設備保養記錄）兩張關鍵表。",
      },
      {
        step: "3.追蹤血緣路徑",
        text: "血緣圖找到一條邊：equipments(table) --[join]--> equipment_pm_records(table)，source=manual，transformType=join。這是設備主檔到保養記錄的直接關聯。",
      },
      {
        step: "4.確認關聯鍵",
        text: "分析欄位結構：equipment_pm_records.equipment_id 為外鍵，對應 equipments.id（PK）。JOIN 條件確認為 equipment_pm_records.equipment_id = equipments.id。",
      },
      {
        step: "5.建構SQL",
        text: "建立 SELECT 語句，以 equipments 為主表，LEFT JOIN equipment_pm_records 取得所有保養記錄。加入 pm_date、pm_type、technician 欄位，並以 pm_date DESC 排序呈現最新記錄。",
      },
    ],
    buildResult(question, edges, schemas) {
      const pmEdges = findEdgesByTable(edges, "equipments", "equipment_pm_records");
      const relevant = [
        tableRef(findTable(schemas, "equipments")),
        tableRef(findTable(schemas, "equipment_pm_records")),
      ].filter((x): x is NonNullable<typeof x> => x != null);
      return {
        question,
        relevantEdgeIds: pmEdges.map(e => e.id),
        relevantTables: relevant,
        joinPath: "equipments ──[equipment_id]──▶ equipment_pm_records",
        sql: [
          "SELECT",
          "  e.id            AS equipment_id,",
          "  e.equip_id      AS equip_code,",
          "  e.name          AS equipment_name,",
          "  e.model,",
          "  p.pm_date,",
          "  p.pm_type,",
          "  p.technician,",
          "  p.hours_spent,",
          "  p.result,",
          "  p.next_pm_date",
          "FROM equipments e",
          "LEFT JOIN equipment_pm_records p ON p.equipment_id = e.id",
          "ORDER BY p.pm_date DESC;",
        ].join("\n"),
        explanation:
          "以 equipments 為主表，LEFT JOIN equipment_pm_records，透過 equipment_id 欄位關聯。可查詢每台設備的完整保養歷程，包含保養日期、類型、技術員與執行結果。未有保養記錄的設備也會出現（LEFT JOIN）。",
      };
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  // 2. 批次晶圓追蹤 (Lot → Wafer)
  // ────────────────────────────────────────────────────────────────────────────
  {
    id: "lot-wafer",
    label: "批次晶圓生產追蹤",
    match: /批次.*晶圓|晶圓.*批次|lot.*wafer|wafer.*lot|製程.*追蹤|lot.*追蹤|生產.*批次/i,
    steps: [
      {
        step: "1.識別問題",
        text: "用戶詢問批次與晶圓的關聯，涉及 MES 製程管理（Mes Process domain）。核心需求：追蹤生產批次下各晶圓的狀態與流向。",
      },
      {
        step: "2.搜尋相關Domain",
        text: "掃描 domain 清單 → semiconductor/Mes Process schema（id=14）包含 lots（生產批次主檔）與 wafers（晶圓追蹤）。同時注意到 Test Quality 域的 wafer_lots 與 Wip Tracking 的 wip_lot 也可能相關。",
      },
      {
        step: "3.追蹤血緣路徑",
        text: "血緣圖找到：lots(table) --[join]--> wafers(table)，為 Mes Process 內部 JOIN 關係。Wafers 是 lots 的明細，一個批次（lot）對應多片晶圓（wafer）。",
      },
      {
        step: "4.確認關聯鍵",
        text: "wafers.lot_id 外鍵對應 lots.id（PK）；wafers.wafer_id（片號）在批次內唯一。JOIN 條件：wafers.lot_id = lots.id。",
      },
      {
        step: "5.建構SQL",
        text: "建構批次晶圓完整追蹤 SQL，以 lots 為主，INNER JOIN wafers，帶入批次狀態、晶圓狀態、當前製程位置等欄位，支援按 lot_no 篩選。",
      },
    ],
    buildResult(question, edges, schemas) {
      const lotEdges = findEdgesByTable(edges, "lots", "wafers");
      const relevant = [
        tableRef(findTable(schemas, "lots")),
        tableRef(findTable(schemas, "wafers")),
      ].filter((x): x is NonNullable<typeof x> => x != null);
      return {
        question,
        relevantEdgeIds: lotEdges.map(e => e.id),
        relevantTables: relevant,
        joinPath: "lots ──[lot_id]──▶ wafers",
        sql: [
          "SELECT",
          "  l.id            AS lot_id,",
          "  l.lot_no,",
          "  l.product_code,",
          "  l.qty           AS lot_qty,",
          "  l.status        AS lot_status,",
          "  l.start_time    AS lot_start,",
          "  w.wafer_id,",
          "  w.seq_no        AS wafer_seq,",
          "  w.status        AS wafer_status,",
          "  w.current_step,",
          "  w.scrap_flag",
          "FROM lots l",
          "INNER JOIN wafers w ON w.lot_id = l.id",
          "-- WHERE l.lot_no = :lot_no",
          "ORDER BY l.lot_no, w.seq_no;",
        ].join("\n"),
        explanation:
          "以 lots（批次主檔）為主表 INNER JOIN wafers（晶圓追蹤），透過 lot_id 關聯。結果顯示每個批次下所有晶圓的當前狀態、所在製程步驟與是否報廢。可加入 WHERE l.lot_no = :lot_no 篩選特定批次。",
      };
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  // 3. 零件 BOM 版本 (Parts → BOM → Revisions)
  // ────────────────────────────────────────────────────────────────────────────
  {
    id: "parts-bom",
    label: "零件 BOM 版本查詢",
    match: /零件.*版本|版本.*零件|bom|part.*revision|part.*bom|物料清單|engineering.*change|工程變更/i,
    steps: [
      {
        step: "1.識別問題",
        text: "用戶詢問零件版本或 BOM（物料清單）相關資料，屬於 PLM 產品生命週期管理（Plm Core domain）。需追蹤零件的版本歷史與 BOM 層級結構。",
      },
      {
        step: "2.搜尋相關Domain",
        text: "semiconductor/Plm Core schema（id=15）包含：parts（零件主檔）、part_revisions（版本管理）、bom_items（BOM 結構）、engineering_changes（ECO 工程變更單）、suppliers（供應商）。這些表構成完整的 PLM 資料模型。",
      },
      {
        step: "3.追蹤血緣路徑",
        text: "血緣圖找到：parts(table) --[join]--> part_revisions(table)，為 PLM 內部版本追蹤關係。bom_items 以 parent_part_id / child_part_id 形成樹狀結構，可擴展追蹤上下游物料。",
      },
      {
        step: "4.確認關聯鍵",
        text: "part_revisions.part_id → parts.id（版本對應零件）。bom_items.parent_part_id 與 child_part_id 均參照 parts.id 形成自關聯 BOM 樹。engineering_changes 透過 part_id 關聯零件版本變更。",
      },
      {
        step: "5.建構SQL",
        text: "以 parts 為主表，JOIN part_revisions 取得所有版本，LEFT JOIN bom_items 展開下階物料，可額外 JOIN engineering_changes 查看對應 ECO 記錄。",
      },
    ],
    buildResult(question, edges, schemas) {
      const partEdges = findEdgesByTable(edges, "parts", "part_revisions");
      const relevant = [
        tableRef(findTable(schemas, "parts")),
        tableRef(findTable(schemas, "part_revisions")),
        tableRef(findTable(schemas, "bom_items")),
      ].filter((x): x is NonNullable<typeof x> => x != null);
      return {
        question,
        relevantEdgeIds: partEdges.map(e => e.id),
        relevantTables: relevant,
        joinPath:
          "parts ──[part_id]──▶ part_revisions   parts ──[parent_part_id]──▶ bom_items ──[child_part_id]──▶ parts",
        sql: [
          "SELECT",
          "  p.id          AS part_id,",
          "  p.part_no,",
          "  p.name        AS part_name,",
          "  p.category,",
          "  r.revision    AS rev_no,",
          "  r.status      AS rev_status,",
          "  r.effective_date,",
          "  r.description AS rev_desc,",
          "  b.child_part_id,",
          "  b.qty         AS bom_qty,",
          "  b.unit",
          "FROM parts p",
          "JOIN  part_revisions r ON r.part_id       = p.id",
          "LEFT JOIN bom_items  b ON b.parent_part_id = p.id",
          "                      AND b.revision       = r.revision",
          "-- WHERE r.status = 'RELEASED'",
          "ORDER BY p.part_no, r.revision DESC;",
        ].join("\n"),
        explanation:
          "以 parts 為主表，JOIN part_revisions 取得版本歷程，LEFT JOIN bom_items 展開每個版本的下階物料清單。加 WHERE r.status='RELEASED' 可僅查詢已發行版本。若要追蹤 ECO 工程變更，可再 JOIN engineering_changes ON ec.part_id = p.id。",
      };
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  // 4. 良率跨域分析 (Cross-domain yield / quality)
  // ────────────────────────────────────────────────────────────────────────────
  {
    id: "yield-analysis",
    label: "良率跨域分析",
    match: /良率|yield|品質.*分析|quality.*analysis|spc|缺陷|defect|inspection|檢測/i,
    steps: [
      {
        step: "1.識別問題",
        text: "用戶詢問良率或品質分析，這是跨域問題，涉及 Mes Process（wafers）與 Test Quality（wafer_lots、inspection_records、yield_info）兩個 schema。",
      },
      {
        step: "2.搜尋相關Domain",
        text: "找到兩個相關 schema：\n• Mes Process (id=14)：wafers 表含晶圓製程數據\n• Test Quality (id=16)：wafer_lots（批次主檔）、inspection_records（檢測記錄）、yield_info（良率統計）、defect_items（缺陷明細）\n兩者透過 lot_no / wafer_id 隱式關聯。",
      },
      {
        step: "3.追蹤血緣路徑",
        text: "跨域血緣路徑：Mes Process.wafers → Test Quality.wafer_lots（透過 lot_no 關聯）→ Test Quality.inspection_records → Test Quality.yield_info。目前血緣圖中跨 schema 邊尚未顯式記錄，但欄位層面存在 lot_no 的隱式關聯。",
      },
      {
        step: "4.確認關聯鍵",
        text: "跨域連接鍵：wafers.lot_id ↔ wafer_lots.lot_no（需確認一致性），inspection_records.lot_id → wafer_lots.id，yield_info.lot_id → wafer_lots.id，defect_items.inspection_id → inspection_records.id。",
      },
      {
        step: "5.建構SQL",
        text: "從 Test Quality.wafer_lots 出發，JOIN inspection_records 取得檢測結果，JOIN yield_info 取得統計良率，LEFT JOIN defect_items 展開缺陷明細，計算良率 = good_die / total_die × 100%。",
      },
    ],
    buildResult(question, edges, schemas) {
      const relevant = [
        tableRef(findTable(schemas, "wafer_lots")),
        tableRef(findTable(schemas, "inspection_records")),
        tableRef(findTable(schemas, "yield_info")),
        tableRef(findTable(schemas, "defect_items")),
      ].filter((x): x is NonNullable<typeof x> => x != null);
      return {
        question,
        relevantEdgeIds: [],
        relevantTables: relevant,
        joinPath:
          "wafer_lots ──[lot_id]──▶ inspection_records   wafer_lots ──[lot_id]──▶ yield_info   inspection_records ──[inspection_id]──▶ defect_items",
        sql: [
          "SELECT",
          "  wl.lot_no,",
          "  wl.product_code,",
          "  wl.wafer_qty,",
          "  yi.good_die_qty,",
          "  yi.total_die_qty,",
          "  ROUND(yi.good_die_qty * 100.0 / NULLIF(yi.total_die_qty, 0), 2) AS yield_pct,",
          "  yi.measured_at,",
          "  COUNT(di.id)    AS defect_count,",
          "  di.defect_code  AS primary_defect",
          "FROM wafer_lots wl",
          "JOIN  inspection_records ir ON ir.lot_id       = wl.id",
          "JOIN  yield_info         yi ON yi.lot_id       = wl.id",
          "LEFT JOIN defect_items   di ON di.inspection_id = ir.id",
          "GROUP BY wl.lot_no, wl.product_code, wl.wafer_qty,",
          "         yi.good_die_qty, yi.total_die_qty, yi.measured_at, di.defect_code",
          "ORDER BY yi.measured_at DESC;",
        ].join("\n"),
        explanation:
          "跨 Test Quality 域的良率分析：以 wafer_lots 為主表，JOIN inspection_records（檢測記錄）與 yield_info（良率統計），LEFT JOIN defect_items 統計缺陷數量。計算良率 = good_die / total_die × 100%。若要進一步關聯 Mes Process 的 wafers，可透過 lot_no 欄位做跨 schema JOIN。",
      };
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  // 5. 跨系統 OEE / KPI 整合分析
  // ────────────────────────────────────────────────────────────────────────────
  {
    id: "oee-kpi",
    label: "跨系統 OEE / KPI 整合",
    match:
      /oee|kpi|整合.*分析|analytics|跨系統|cross.*system|設備效率|生產效率|daily.*summary|每日生產|prod.*summary/i,
    steps: [
      {
        step: "1.識別問題",
        text: "用戶詢問 OEE（整體設備效率）或跨系統 KPI，這是最高層的整合分析需求，資料來源橫跨 MES、PLM、Test Quality 等多個 domain，最終匯整到 Unified Analytics schema。",
      },
      {
        step: "2.搜尋相關Domain",
        text: "Unified Analytics schema（id=17）是整合層，包含：\n• prod_daily_summary（每日生產彙總）\n• yield_trend（良率趨勢週報）\n• equip_oee_summary（設備 OEE 效率彙總）\n• cross_system_kpi（跨系統 KPI 整合）\n這些表是各 domain 資料經 ETL 後的聚合結果。",
      },
      {
        step: "3.追蹤血緣路徑",
        text: "上游血緣推算（基於 domain 知識）：\n• equip_oee_summary ← Mes Equipment.equipments\n• prod_daily_summary ← Mes Process.lots + wafers\n• yield_trend ← Test Quality.yield_info\n• cross_system_kpi 整合以上三者\n目前整合層血緣尚未在血緣圖中顯式記錄，建議後續補充。",
      },
      {
        step: "4.確認關聯鍵",
        text: "Unified Analytics 各表透過 date（日期）、equip_id（設備編號）、product_code（產品代碼）作為跨表 JOIN 的維度鍵，時間粒度為 daily（每日）或 weekly（每週）。",
      },
      {
        step: "5.建構SQL",
        text: "以 cross_system_kpi 為整合主表，JOIN prod_daily_summary（每日產量）、equip_oee_summary（設備 OEE）、yield_trend（良率週報），呈現完整生產效率儀表板資料。",
      },
    ],
    buildResult(question, edges, schemas) {
      const relevant = [
        tableRef(findTable(schemas, "prod_daily_summary")),
        tableRef(findTable(schemas, "equip_oee_summary")),
        tableRef(findTable(schemas, "yield_trend")),
        tableRef(findTable(schemas, "cross_system_kpi")),
      ].filter((x): x is NonNullable<typeof x> => x != null);
      return {
        question,
        relevantEdgeIds: [],
        relevantTables: relevant,
        joinPath:
          "prod_daily_summary ──[date]──▶ cross_system_kpi ◀──[date]── equip_oee_summary   yield_trend ──[week range]──▶ cross_system_kpi",
        sql: [
          "SELECT",
          "  k.date,",
          "  k.period_label,",
          "  p.total_lots        AS lots_in,",
          "  p.completed_lots    AS lots_out,",
          "  p.wafer_output,",
          "  o.equip_count,",
          "  o.avg_oee_pct,",
          "  o.top_downtime_code,",
          "  y.avg_yield_pct,",
          "  y.yield_change_pct  AS wow_yield_delta,",
          "  k.overall_score",
          "FROM cross_system_kpi k",
          "JOIN prod_daily_summary  p ON p.report_date = k.date",
          "JOIN equip_oee_summary   o ON o.report_date = k.date",
          "JOIN yield_trend         y ON y.week_start <= k.date",
          "                         AND y.week_end   >= k.date",
          "-- WHERE k.date BETWEEN :start_date AND :end_date",
          "ORDER BY k.date DESC",
          "LIMIT 30;",
        ].join("\n"),
        explanation:
          "以 cross_system_kpi 為整合主表，JOIN prod_daily_summary（每日產量）、equip_oee_summary（設備 OEE）、yield_trend（良率週報）。良率週報粒度為週，透過日期範圍 JOIN 對應每日 KPI。可加 WHERE k.date BETWEEN :start AND :end 篩選時間範圍。",
      };
    },
  },
];

// ── Fallback (no scenario matched) ───────────────────────────────────────────

export const MOCK_FALLBACK: MockScenario = {
  id: "fallback",
  label: "通用關聯查詢",
  match: /.*/,
  steps: [
    {
      step: "1.識別問題",
      text: "用戶提出查詢，正在分析語意以找出相關的 domain 與資料表。",
    },
    {
      step: "2.搜尋相關Domain",
      text: "搜尋所有 domain：semiconductor 域下共有 Mes Equipment、Mes Process、Plm Core、Test Quality、Unified Analytics、Wip Tracking 六個 schema，合計 22 張資料表。",
    },
    {
      step: "3.追蹤血緣路徑",
      text: "掃描血緣圖中所有已記錄的邊（edge），找出可能與問題相關的資料流路徑。目前血緣圖共 33 條顯式關聯，涵蓋 MES Equipment、MES Process、PLM、Test Quality、Unified Analytics、Wip Tracking 六個 domain。",
    },
    {
      step: "4.確認關聯鍵",
      text: "分析各表之間的外鍵結構，確認可以安全進行 JOIN 的欄位組合，避免笛卡兒積（Cartesian product）。",
    },
    {
      step: "5.建構SQL",
      text: "依據找到的血緣路徑與關聯鍵，建構最小化但完整的 SQL 查詢，確保覆蓋用戶問題所需的所有欄位。",
    },
  ],
  buildResult(question, edges, schemas) {
    const allTables = schemas
      .flatMap(s =>
        s.tables.slice(0, 2).map(t => ({
          schemaId: s.id,
          schemaName: s.name,
          domain: s.domain ?? "semiconductor",
          tableId: t.id,
          tableName: t.name,
          kind: "table" as const,
        })),
      )
      .slice(0, 4);
    return {
      question,
      relevantEdgeIds: edges.slice(0, 2).map(e => e.id),
      relevantTables: allTables,
      joinPath:
        edges
          .slice(0, 1)
          .map(e => `${e.fromTableName} ──[id]──▶ ${e.toTableName}`)
          .join(" → ") || "（暫無直接血緣路徑）",
      sql: `-- 根據問題「${question}」自動生成\nSELECT *\nFROM ${allTables[0]?.tableName ?? "your_table"}\nLIMIT 100;`,
      explanation: `根據問題「${question}」，在現有血緣圖中找到 ${edges.length} 條相關路徑。請確認問題中的表名或 domain，建議補充相關血緣邊以獲得更準確的路徑追蹤。`,
    };
  },
};
