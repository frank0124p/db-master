# 2026-06-12 — Data Lineage 跨域血緣追蹤

## 新增功能

### 1. 全局血緣圖（Global Lineage Graph）

**入口**：頂部導覽 → 「全局血緣圖」

- 所有 schema + table 按 domain 分欄排列，以 SVG 視覺化呈現
- 彩色連線依 transform 類型區分（direct / join / aggregate / derived / filter）
- Legend 說明節點種類（table / wide-table / governed）
- 支援 domain 篩選下拉選單
- 點擊節點顯示側邊欄（上游 / 下游列表）
- Hover 連線顯示刪除按鈕（金色高亮）
- 新增血緣邊表單（4 欄 grid）

**相關檔案**：
- `apps/web/src/pages/GlobalGraphPage.tsx` — 全局圖頁面
- `apps/web/src/pages/LineageGraph.tsx` — 共用 SVG 元件（calcLayout、edgePath、LineageSvgGraph）

---

### 2. Data Lineage NL 查詢（思路 + 動態子圖）

**入口**：頂部導覽 → 「Data Lineage」

- 左側：自然語言輸入框 + 範例問題 + 思路串流區
- 右側上方：查詢完成後動態渲染 SVG 子圖（金色高亮相關節點與邊）
- 右側下方：JOIN 路徑、涉及表格 badge、完整 SQL（可展開 / 複製）
- AI 分 5 步思路串流（SSE）：識別問題 → 搜尋 Domain → 追蹤血緣路徑 → 確認關聯鍵 → 建構 SQL
- 思路區載入動畫（方格閃爍 placeholder）

**相關檔案**：
- `apps/web/src/pages/LineagePage.tsx` — 查詢頁面
- `apps/api/src/routes/lineage.ts` — REST + SSE endpoints
- `apps/api/src/services/lineage-query.ts` — AI 查詢服務（支援 Anthropic / OpenAI 串流）
- `prompts/lineage-query-stream.md` — 串流提示詞模板

---

### 3. Mock 模式（無需 LLM API）

**設定**：`apps/api/.env.local` → `LINEAGE_MOCK=true`

5 個預寫情境，每個含 5 步思路 + 動態建構的 SQL 結果：

| ID | 觸發關鍵字 | 涉及表 |
|---|---|---|
| `equipment-pm` | 設備保養、PM | equipments → equipment_pm_records |
| `lot-wafer` | 批次晶圓、lot/wafer | lots → wafers |
| `parts-bom` | 零件版本、BOM | parts → part_revisions → bom_items |
| `yield-analysis` | 良率、SPC、缺陷 | wafer_lots → inspection → yield_info |
| `oee-kpi` | OEE、KPI、跨系統 | Unified Analytics 4 表 |

結果中的 edge ID / table ID 皆從即時資料動態解析，不硬編碼。

**相關檔案**：
- `apps/api/src/services/lineage-mock-config.ts` — Mock 設定檔

---

### 4. 自動血緣記錄（Hooks）

在以下動作後自動 fire-and-forget 記錄血緣邊（non-critical，不影響主流程）：

- **建立寬表**：source tables → wide-table 節點（`source: "wide-table"`）
- **Governance Publish**：source tables → governed 節點（`source: "governance"`）

**相關檔案**：
- `apps/api/src/routes/wide-tables.ts` — wide-table hook
- `apps/api/src/services/governance-publish.ts` — governance hook
- `apps/api/src/repositories/lineage.ts` — CRUD + 去重邏輯

---

### 5. 跨域 Demo 血緣資料（33 條邊）

啟動時若無資料自動 seed 33 條半導體製造域血緣邊：

| 資料流方向 | 邊數 |
|---|---|
| PLM Core → MES Process | 3 |
| MES Equipment → MES Process / Unified | 4 |
| MES Process 內部 | 4 |
| MES Process → Test Quality | 2 |
| MES Process → Wip Tracking | 2 |
| PLM Core 內部 | 5 |
| Test Quality 內部 | 4 |
| Wip Tracking 內部 | 2 |
| 各域 → Unified Analytics（ETL 聚合） | 7 |

**相關檔案**：
- `apps/api/src/services/demo-seed.ts` → `seedLineageDemoIfNeeded()`

---

### 6. Schema 編輯器分割面板拖拉

左側表格列表與右側欄位編輯器之間的分隔線可用滑鼠拖拉調整寬度（120–380px）。

**相關檔案**：
- `apps/web/src/pages/SchemaEditorPage.tsx` — 使用 `useResizable` hook
- `apps/web/src/hooks/useResizable.ts` — 拖拉 hook

---

## Bug 修正

- **lineage route 未掛載**：`lineageRouter` 誤加入未使用的 `app.ts`，應加在 `main.ts`（`apps/api/src/main.ts`）
- **Lineage / 全局血緣圖頁面被 Suite Splash 攔截**：新增 `SUITE_FREE_PAGES` 讓這兩個跨域頁面不需選擇 Suite 即可顯示（`apps/web/src/App.tsx`）

---

## 核心類型

```typescript
// packages/core/src/lineage.ts
type LineageTransformType = "direct" | "aggregate" | "join" | "derived" | "filter";
type LineageNodeKind      = "table" | "wide-table" | "governed";
type LineageSource        = "manual" | "wide-table" | "governance" | "field";

interface LineageEdge {
  id: string;
  fromSchemaId: number; fromSchemaName: string; fromDomain: string;
  fromTableId:  number; fromTableName:  string; fromKind: LineageNodeKind;
  toSchemaId:   number; toSchemaName:   string; toDomain: string;
  toTableId:    number; toTableName:    string; toKind:   LineageNodeKind;
  transformType: LineageTransformType;
  description:   string;
  source:        LineageSource;
  createdAt:     string;
}
```

---

## 環境設定

```bash
# apps/api/.env.local

# Mock 模式（LLM API 未接入時使用）
LINEAGE_MOCK=true

# 切換到真實 LLM
# LINEAGE_MOCK=false
# ANTHROPIC_API_KEY=sk-ant-...
```
