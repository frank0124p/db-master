/**
 * PLM Core Schema Seed
 * Creates a full Part / BOM / Engineering Change schema with realistic
 * semiconductor PLM data and detailed semantic field descriptions.
 */

import { config } from "dotenv";
config({ path: "../../apps/api/.env.local", override: true });

const BASE = "http://localhost:3005/api/v1";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`POST ${path} failed ${res.status}: ${err}`);
  }
  return res.json() as Promise<T>;
}

// ── field helper ─────────────────────────────────────────────────────────────
type FieldDef = {
  name: string; data_type: string; nullable?: boolean;
  default_value?: string | null; is_primary_key?: boolean; is_unique?: boolean;
  comment: string;
};

async function createTable(schemaId: number, name: string, comment: string, fields: FieldDef[]) {
  const t = await post<{ id: number }>(`/schemas/${schemaId}/tables`, { name, comment });
  console.log(`  table: ${name}`);
  for (const f of fields) {
    await post(`/tables/${t.id}/fields`, {
      name: f.name, data_type: f.data_type,
      nullable: f.nullable ?? true,
      default_value: f.default_value ?? null,
      is_primary_key: f.is_primary_key ?? false,
      is_unique: f.is_unique ?? false,
      comment: f.comment,
    });
  }
  return t.id;
}

// ── common tail fields ────────────────────────────────────────────────────────
const AUDIT: FieldDef[] = [
  { name: "created_by", data_type: "VARCHAR(64)", nullable: true, comment: "建立者帳號或工號，記錄誰建立此筆資料，用於稽核與責任歸屬追蹤" },
  { name: "updated_by", data_type: "VARCHAR(64)", nullable: true, comment: "最後更新者帳號或工號，每次修改時記錄操作人員" },
  { name: "created_at", data_type: "TIMESTAMP", nullable: false, default_value: "CURRENT_TIMESTAMP", comment: "記錄建立時間戳，UTC 時區，系統自動填入，不可手動修改" },
  { name: "updated_at", data_type: "TIMESTAMP", nullable: false, default_value: "CURRENT_TIMESTAMP", comment: "記錄最後更新時間戳，UTC 時區，每次欄位異動時自動更新" },
];

async function main() {
  console.log("🌱 PLM Core seed starting…");

  // ── Schema ────────────────────────────────────────────────────────────────
  const schema = await post<{ id: number }>("/schemas", {
    name: "PLM Core",
    description: "產品生命週期管理核心 Schema — 涵蓋零件主檔、BOM、工程變更單與版本管理，符合半導體設計製造流程（EBOM/MBOM）",
    domain: "semiconductor",
  });
  const sid = schema.id;
  console.log(`✓ Schema created: id=${sid}`);

  // ── 1. parts ──────────────────────────────────────────────────────────────
  await createTable(sid, "parts", "零件主檔 — 所有受管控物料的唯一來源，包含 IC、PCB、機構件與組件", [
    { name: "id",              data_type: "BIGINT",       nullable: false, is_primary_key: true,  comment: "系統唯一主鍵，由資料庫自動遞增產生，跨系統整合時作為穩定參照 ID" },
    { name: "part_no",        data_type: "VARCHAR(32)",  nullable: false, is_unique: true,        comment: "公司料號，遵循命名規則 {類型}-{系列}-{序號}，例如 IC-CTRL-001；全域唯一，不可重複，廢止後不得再用" },
    { name: "part_name",      data_type: "VARCHAR(255)", nullable: false,                         comment: "零件名稱，中英文皆可，應簡潔描述零件用途，例如「32-bit MCU with CAN」；供語意搜尋與料表顯示使用" },
    { name: "part_type",      data_type: "VARCHAR(32)",  nullable: false,                         comment: "零件類型代碼：IC（積體電路）、PCB（電路板）、MECH（機構件）、ASSY（組件/半成品）、ELEC（電子元件）、RAW（原料）" },
    { name: "lifecycle_state",data_type: "VARCHAR(32)",  nullable: false, default_value: "'draft'", comment: "生命週期狀態機：draft（草稿，僅工程使用）→ review（審核中）→ released（正式發行，可用於量產）→ obsolete（廢止，停止採購與生產）" },
    { name: "unit_of_measure",data_type: "VARCHAR(16)",  nullable: false, default_value: "'EA'",  comment: "計量單位：EA（個/片）、M（公尺）、KG（公斤）、L（公升）、SET（組）；影響 BOM 用量計算與採購訂單" },
    { name: "description",    data_type: "TEXT",         nullable: true,                          comment: "零件完整技術描述，包含功能概述、主要電性規格、封裝型式、溫度範圍等；此欄為語意搜尋（Semantic Search）的主要索引來源，應儘量詳細填寫" },
    { name: "process_node",   data_type: "VARCHAR(32)",  nullable: true,                          comment: "IC 製程節點，例如 TSMC 28nm HPC+、Samsung 7nm EUV、Intel 10nm；用於製程分析、良率預測與供應鏈風險評估" },
    { name: "die_revision",   data_type: "VARCHAR(16)",  nullable: true,                          comment: "晶片 Die 版本，如 A0（工程樣品）、B0（修正後）、B1（小幅 ECO）；每次 Tape-out 遞增，與 part_revisions 中的版本號區分" },
    { name: "package_type",   data_type: "VARCHAR(32)",  nullable: true,                          comment: "IC 封裝型式：BGA（球柵陣列）、QFN（無引腳方形扁平）、WLCSP（晶圓級封裝）、DIP、SOP；影響 PCB Layout 與焊接工藝" },
    { name: "pin_count",      data_type: "INT",          nullable: true,                          comment: "IC 接腳數量，如 128、256、512；用於 PCB 設計複雜度評估與自動化選型" },
    { name: "approved_vendor",data_type: "VARCHAR(128)", nullable: true,                          comment: "核准供應商（AVL — Approved Vendor List），多家以逗號分隔，如「TSMC, UMC」；管控供應商切換需經 ECO 核准" },
    { name: "rohs_compliant", data_type: "TINYINT(1)",   nullable: false, default_value: "1",     comment: "是否符合 RoHS 環保法規（無鉛/無鎘等有害物質限制），1=符合、0=不符合；歐盟出口必須為 1" },
    { name: "mass_kg",        data_type: "DECIMAL(15,4)",nullable: true,                          comment: "零件重量（公斤），精確至小數點後四位；用於整機重量計算、包裝設計與國際運輸申報" },
    { name: "released_at",    data_type: "TIMESTAMP",    nullable: true,                          comment: "零件正式發行時間，lifecycle_state 轉為 released 時自動記錄；此後採購與生產可引用此版本" },
    ...AUDIT,
  ]);

  // ── 2. part_revisions ────────────────────────────────────────────────────
  await createTable(sid, "part_revisions", "零件版本歷程 — 記錄每個零件的所有版本變更，追蹤設計演進", [
    { name: "id",            data_type: "BIGINT",       nullable: false, is_primary_key: true,  comment: "版本記錄唯一主鍵" },
    { name: "part_id",       data_type: "BIGINT",       nullable: false,                        comment: "關聯 parts.id，所屬零件；一個零件可有多個版本記錄，形成完整版本歷史" },
    { name: "revision_no",   data_type: "VARCHAR(8)",   nullable: false,                        comment: "版本號碼，字母制如 A、B、C（大變更）或帶小寫後綴 A1、B2（小修正）；每次 ECO 核准後遞增" },
    { name: "revision_type", data_type: "VARCHAR(16)",  nullable: false, default_value: "'minor'", comment: "版本變更層級：major（重大設計修改，需重新驗證）、minor（小幅修正，不影響形式裝配功能 Form/Fit/Function）、cosmetic（僅外觀/文件調整）" },
    { name: "change_summary",data_type: "TEXT",         nullable: true,                         comment: "本版次變更摘要，逐條列出相對前版的差異，例如「1. 修改電容 C12 從 10uF 改為 22uF 以改善電源穩定性；2. 更新 Layout 以符合 DFM 規範」；語意搜尋的重要索引" },
    { name: "eco_no",        data_type: "VARCHAR(32)",  nullable: true,                         comment: "觸發此版次的工程變更單號，關聯 engineering_changes.eco_no；可追蹤版本變更的完整審核鏈" },
    { name: "approved_by",   data_type: "VARCHAR(64)",  nullable: true,                         comment: "版本核准者工號，通常為 FAE 主管或設計主任；版本正式化的最終責任人" },
    { name: "effective_date",data_type: "DATE",         nullable: true,                         comment: "版本生效日期，此日期後的新訂單與生產需使用此版本；庫存中舊版本可依庫存耗用期繼續使用" },
    { name: "is_current",    data_type: "TINYINT(1)",   nullable: false, default_value: "0",    comment: "是否為現行版本，同一 part_id 下只有一筆為 1；查詢現行版本時使用此欄位做快速篩選" },
    ...AUDIT,
  ]);

  // ── 3. part_classifications ──────────────────────────────────────────────
  await createTable(sid, "part_classifications", "零件分類樹狀結構 — 支援多層級分類，用於搜尋、報表與採購分析", [
    { name: "id",            data_type: "BIGINT",       nullable: false, is_primary_key: true,  comment: "分類節點唯一主鍵" },
    { name: "parent_id",     data_type: "BIGINT",       nullable: true,                         comment: "父分類 ID，關聯本表 id；NULL 表示根節點（最頂層分類）；支援任意深度的樹狀分類結構" },
    { name: "class_code",    data_type: "VARCHAR(32)",  nullable: false, is_unique: true,        comment: "分類代碼，點分層次式，例如 ELEC.IC.MCU（電子元件 > 積體電路 > 微控制器）；用於快速路徑查詢" },
    { name: "class_name",    data_type: "VARCHAR(128)", nullable: false,                         comment: "分類名稱，中文顯示用，例如「微控制器」；支援雙語（可加 class_name_en）" },
    { name: "class_name_en", data_type: "VARCHAR(128)", nullable: true,                          comment: "分類英文名稱，例如 Microcontroller Unit；用於國際化報表與跨系統資料交換" },
    { name: "unspsc_code",   data_type: "VARCHAR(16)",  nullable: true,                          comment: "UNSPSC 國際採購分類代碼（聯合國標準產品與服務代碼），8位數字，用於 ERP 採購分析與政府標案申報" },
    { name: "description",   data_type: "TEXT",         nullable: true,                          comment: "分類詳細說明，描述此分類包含的零件範圍、常見規格、適用場景；語意搜尋輔助索引" },
    { name: "sort_order",    data_type: "INT",          nullable: false, default_value: "0",     comment: "同層顯示排序，數字小的排前面；用於 UI 下拉選單與樹狀結構顯示的排列順序" },
    { name: "is_active",     data_type: "TINYINT(1)",   nullable: false, default_value: "1",     comment: "分類是否啟用，0=停用（隱藏但保留歷史資料），1=啟用；廢止分類時設為 0 而非刪除" },
    ...AUDIT,
  ]);

  // ── 4. bom_headers ───────────────────────────────────────────────────────
  await createTable(sid, "bom_headers", "BOM 標頭 — 定義母件（組件）的 BOM 版本及有效期間", [
    { name: "id",               data_type: "BIGINT",      nullable: false, is_primary_key: true,  comment: "BOM 標頭唯一主鍵" },
    { name: "part_id",          data_type: "BIGINT",      nullable: false,                        comment: "母件零件 ID，關聯 parts.id；此 BOM 所屬的上層組件或成品，例如一塊 PCB 組件" },
    { name: "bom_type",         data_type: "VARCHAR(16)", nullable: false, default_value: "'engineering'", comment: "BOM 類型：engineering（EBOM，工程設計 BOM，由研發定義）、manufacturing（MBOM，製造 BOM，含製程工藝料件）、service（SBOM，售後維修用）" },
    { name: "revision_no",      data_type: "VARCHAR(8)",  nullable: false,                        comment: "此 BOM 的版本號，應與母件零件的 part_revisions.revision_no 對應；版本一致性是 BOM 管控的核心" },
    { name: "effectivity_start",data_type: "DATE",        nullable: true,                         comment: "BOM 版本生效起始日，此日期起的新生產工單使用此 BOM；NULL 表示從建立起即生效" },
    { name: "effectivity_end",  data_type: "DATE",        nullable: true,                         comment: "BOM 版本生效終止日，NULL 表示目前仍有效（現行版本）；超過此日期的版本僅供歷史查詢" },
    { name: "is_active",        data_type: "TINYINT(1)",  nullable: false, default_value: "1",    comment: "是否為現行有效 BOM，同一 part_id + bom_type 下通常只有一筆 is_active=1；切換版本時舊版設為 0" },
    { name: "alt_bom_id",       data_type: "BIGINT",      nullable: true,                         comment: "替代 BOM 標頭 ID，自關聯；當主 BOM 缺料時可切換使用替代 BOM，兩者物料略有差異但功能等效" },
    { name: "notes",            data_type: "TEXT",         nullable: true,                         comment: "BOM 版本說明，記錄此版次的特殊規定、試產限制、替代料資訊等；語意查詢輔助" },
    ...AUDIT,
  ]);

  // ── 5. bom_items ─────────────────────────────────────────────────────────
  await createTable(sid, "bom_items", "BOM 明細 — 子件清單，定義母件組裝所需的每一項物料", [
    { name: "id",             data_type: "BIGINT",        nullable: false, is_primary_key: true,  comment: "BOM 明細唯一主鍵" },
    { name: "bom_id",         data_type: "BIGINT",        nullable: false,                        comment: "所屬 BOM 標頭 ID，關聯 bom_headers.id；決定此明細屬於哪個組件的哪個版本 BOM" },
    { name: "seq_no",         data_type: "INT",           nullable: false,                        comment: "項次序號，建議以 10 為間距（10、20、30…）方便後續插入；對應工程圖面的 BOM 表項次" },
    { name: "child_part_id",  data_type: "BIGINT",        nullable: false,                        comment: "子件零件 ID，關聯 parts.id；此 BOM 項目所使用的物料；需為 lifecycle_state=released 的零件" },
    { name: "qty",            data_type: "DECIMAL(15,4)", nullable: false, default_value: "1",    comment: "每個母件的用量，精確至小數點四位；依 parts.unit_of_measure 的單位計算，例如 1.0000 個、0.5000 公尺" },
    { name: "ref_designator", data_type: "VARCHAR(255)",  nullable: true,                         comment: "PCB 元件參考位號（Reference Designator），多個以逗號分隔，例如 R1, R3, C12, C15；位號數量應等於 qty；用於 PCB 焊接與測試追蹤" },
    { name: "find_no",        data_type: "INT",           nullable: true,                         comment: "爆炸圖對應序號（Find Number），對應工程組裝圖紙上的氣泡號碼；機構件 BOM 必填，電子件可選填" },
    { name: "is_phantom",     data_type: "TINYINT(1)",    nullable: false, default_value: "0",    comment: "是否為幻象件（Phantom Item），1=幻象件（虛擬組件，不實際入庫，直接展開子件計算），0=一般物料；用於簡化 BOM 層級" },
    { name: "alt_group",      data_type: "VARCHAR(16)",   nullable: true,                         comment: "替代料群組代碼，同群組內的子件可相互替代；例如 ALT-A 表示此組的零件功能等效，缺料時優先抓同群組其他料" },
    { name: "alt_priority",   data_type: "INT",           nullable: true,  default_value: "1",    comment: "替代料使用優先順序，數字小者優先；主料為 1，第一替代料為 2，依此類推；生產領料時依此順序判斷" },
    { name: "waste_factor",   data_type: "DECIMAL(5,4)",  nullable: false, default_value: "0",    comment: "加工廢料率，0~1 的小數，例如 0.02 表示 2% 損耗；計算實際採購量時：訂購量 = qty × (1 + waste_factor)；適用於裁切、電鍍等有損耗的製程" },
    { name: "notes",          data_type: "TEXT",          nullable: true,                         comment: "BOM 行備註，記錄特殊規格要求、焊接條件、替代料限制等工程說明；語意搜尋索引欄位" },
    ...AUDIT,
  ]);

  // ── 6. engineering_changes ───────────────────────────────────────────────
  await createTable(sid, "engineering_changes", "工程變更單 (ECO) — 管控所有設計與製程變更的審核流程", [
    { name: "id",                data_type: "BIGINT",       nullable: false, is_primary_key: true,  comment: "工程變更單唯一主鍵" },
    { name: "eco_no",            data_type: "VARCHAR(32)",  nullable: false, is_unique: true,        comment: "工程變更單號，公司內部唯一，格式建議 ECO-YYYY-NNNN，例如 ECO-2024-0042；一旦建立不可修改，作為跨系統追蹤的穩定鍵值" },
    { name: "title",             data_type: "VARCHAR(255)", nullable: false,                         comment: "變更標題，簡潔描述本次工程變更主旨，例如「修改 U5 旁路電容值以改善 EMI 問題」；語意搜尋主要索引" },
    { name: "change_type",       data_type: "VARCHAR(32)",  nullable: false,                         comment: "變更類型：design（電路/Layout 設計變更）、process（製造製程參數調整）、supplier（供應商或料號切換，需重新驗證）、document（僅文件修正，不影響物料）、safety（安全性緊急修正）" },
    { name: "priority",          data_type: "VARCHAR(16)",  nullable: false, default_value: "'normal'", comment: "處理優先等級：critical（24hr 內必須完成，影響產品安全或重大客訴）、high（本週完成，影響量產出貨）、normal（本月完成，常規設計改善）、low（排期完成，文件美化或長期優化）" },
    { name: "status",            data_type: "VARCHAR(16)",  nullable: false, default_value: "'draft'", comment: "ECO 狀態流程：draft（草稿，起案工程師填寫）→ review（審核中，等待多部門會簽）→ approved（核准，可開始執行）→ implementing（執行中，物料與文件更新中）→ closed（結案，所有動作確認完成）→ rejected（駁回，退回修改）" },
    { name: "reason",            data_type: "TEXT",         nullable: true,                          comment: "變更原因詳細說明，描述觸發此 ECO 的根本原因（Root Cause），例如客訴分析、可靠性測試失效、成本優化需求；為後續類似問題查詢的重要語意索引" },
    { name: "impact_assessment", data_type: "TEXT",         nullable: true,                          comment: "影響評估，說明此變更對以下面向的影響：1.功能性（Form/Fit/Function）2.成本（NRE+單位成本差異）3.交期（驗證時程）4.庫存處置（舊版本庫存如何消耗或報廢）；審核委員會核准的重要依據" },
    { name: "affected_customer", data_type: "VARCHAR(255)", nullable: true,                          comment: "受影響的客戶名稱，多個以逗號分隔；若變更影響已出貨品，需通知客戶並取得同意；空白表示僅影響內部開發版本" },
    { name: "verification_plan", data_type: "TEXT",         nullable: true,                          comment: "驗證計畫，說明核准後需執行的測試項目，例如「1.EMI 掃描測試 2.溫度循環可靠性測試（-40°C~125°C，100 cycles）3.客戶 PPAP 確認」" },
    { name: "requestor_id",      data_type: "VARCHAR(64)",  nullable: false,                         comment: "ECO 提案者工號，即起案的工程師；負責填寫原因、影響評估並追蹤審核進度" },
    { name: "approver_id",       data_type: "VARCHAR(64)",  nullable: true,                          comment: "最終核准者工號，通常為硬體主管或 PLM 管理者；核准後 ECO 狀態轉為 approved" },
    { name: "approved_at",       data_type: "TIMESTAMP",    nullable: true,                          comment: "ECO 核准時間點，UTC；計算審核週期（Approval Cycle Time）的重要指標" },
    { name: "effective_date",    data_type: "DATE",          nullable: true,                          comment: "工程變更生效日，此日期後新開工單必須依照變更後版本製造；庫存舊版零件依協議可繼續消耗至特定批號" },
    { name: "closed_at",         data_type: "TIMESTAMP",    nullable: true,                          comment: "ECO 結案時間點；從 approved_at 到 closed_at 的時差為 ECO 執行週期，是工程效能的 KPI 指標之一" },
    ...AUDIT,
  ]);

  // ── 7. ec_items ──────────────────────────────────────────────────────────
  await createTable(sid, "ec_items", "工程變更影響零件明細 — 列出每份 ECO 所涉及的零件及其版本動作", [
    { name: "id",            data_type: "BIGINT",      nullable: false, is_primary_key: true,  comment: "明細唯一主鍵" },
    { name: "eco_id",        data_type: "BIGINT",      nullable: false,                        comment: "所屬工程變更單 ID，關聯 engineering_changes.id；一個 ECO 可同時影響多個零件" },
    { name: "part_id",       data_type: "BIGINT",      nullable: false,                        comment: "受影響零件 ID，關聯 parts.id；此零件因本 ECO 而需要更新版本或廢止" },
    { name: "action",        data_type: "VARCHAR(16)", nullable: false,                        comment: "對此零件的動作：add（ECO 新增此零件至 BOM 或系統）、remove（廢止或從 BOM 移除此零件）、modify（修改零件屬性或版本遞升）、supersede（以新料號取代，舊料號廢止）" },
    { name: "from_revision", data_type: "VARCHAR(8)",  nullable: true,                         comment: "變更前版本號，modify/supersede 動作必填；記錄此次 ECO 執行前的版本狀態，用於版本差異比對" },
    { name: "to_revision",   data_type: "VARCHAR(8)",  nullable: true,                         comment: "變更後版本號，modify/supersede 動作必填；ECO 執行後零件應達到的目標版本" },
    { name: "disposition",   data_type: "VARCHAR(32)", nullable: true,                         comment: "舊版庫存處置方式：use_as_is（直接使用，不影響功能）、rework（重工後使用）、scrap（報廢，損失計提 ECO 成本）、return_to_vendor（退供應商）；影響 ECO 總成本計算" },
    { name: "notes",         data_type: "TEXT",        nullable: true,                          comment: "針對此零件的特殊說明，例如「舊版電容庫存（約 5000pcs）於 2024Q2 耗盡前繼續使用，之後切換新版本」；語意查詢索引" },
    ...AUDIT,
  ]);

  // ── 8. approved_supplier_list ─────────────────────────────────────────────
  await createTable(sid, "approved_supplier_list", "核准供應商清單 (AVL) — 管控每個零件的合格供應商與替代料源", [
    { name: "id",              data_type: "BIGINT",       nullable: false, is_primary_key: true,  comment: "AVL 記錄唯一主鍵" },
    { name: "part_id",         data_type: "BIGINT",       nullable: false,                        comment: "零件 ID，關聯 parts.id；每個零件可有多家核准供應商，形成風險分散的供應策略" },
    { name: "supplier_name",   data_type: "VARCHAR(128)", nullable: false,                        comment: "供應商名稱，例如 TSMC、Samsung Foundry、Murata、TDK；需與 ERP 供應商主檔一致" },
    { name: "supplier_part_no",data_type: "VARCHAR(64)",  nullable: true,                         comment: "供應商料號（MPN — Manufacturer Part Number），例如 GRM155R61A104KA01D；用於採購詢價、訂單與到料驗收" },
    { name: "mfr_name",        data_type: "VARCHAR(128)", nullable: true,                         comment: "製造商名稱（當供應商為代理商時填寫），例如 Murata Manufacturing；區分 Distributor（代理）與 Manufacturer（直接製造商）" },
    { name: "approval_status", data_type: "VARCHAR(16)",  nullable: false, default_value: "'pending'", comment: "核准狀態：pending（待驗證）、qualified（合格，已通過 AQL 驗收）、preferred（優選，品質穩定且價格競爭力強）、restricted（受限使用，需工程簽核）、disqualified（取消資格，禁止採購）" },
    { name: "qualification_date", data_type: "DATE",      nullable: true,                         comment: "供應商通過資格驗證的日期；首批樣品測試、可靠性驗證全部通過後填寫；是採購部門的採購授權依據" },
    { name: "lead_time_days",  data_type: "INT",          nullable: true,                         comment: "供應商交期（工作天），從下單到到料的標準時間；影響安全庫存計算與 MRP 計畫的訂單提前量" },
    { name: "min_order_qty",   data_type: "INT",          nullable: true,                         comment: "最小訂購量（MOQ）；低於此數量供應商不接單，影響小批量試產的採購策略" },
    { name: "notes",           data_type: "TEXT",         nullable: true,                          comment: "供應商備註，例如「需搭配 NDA」、「供貨受出口管制，需申請許可證」、「價格有效期至 2024-12-31」；語意查詢索引" },
    ...AUDIT,
  ]);

  console.log(`\n✅ PLM Core schema seeded successfully! Schema ID: ${sid}`);
  console.log("   8 tables created: parts, part_revisions, part_classifications,");
  console.log("   bom_headers, bom_items, engineering_changes, ec_items, approved_supplier_list");
}

main().catch(e => { console.error(e); process.exit(1); });
