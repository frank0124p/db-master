# Schema Studio — Functional Specification

> **版本**：v1.1（2026-05-02）
> **狀態說明**：✅ 已實作 · 🔄 部分實作 · ⬜ 未實作

---

## 儲存架構

> **注意**：本專案已從 MariaDB 改為 **本地 JSON 檔案儲存**。所有資料存放在 `data/` 目錄下，無需資料庫連線。

```
data/
├── _counters.json          # 各實體的自增 ID 計數器
├── _index.json             # 反向索引（tableId→schemaId, fieldId→tableId 等）
├── llm-audit-logs.jsonl    # LLM 呼叫審計日誌（append-only）
├── naming/                 # 命名字典條目（{id}.json）
├── rules/
│   └── overrides.json      # 規則覆蓋（預設值由 core 提供，只存差異）
└── schemas/
    └── {schemaId}/
        ├── meta.json           # Schema 元資料
        ├── tables/
        │   └── {tableId}.json  # Table + 內嵌 Fields 陣列
        ├── versions/
        │   └── {versionId}.json
        └── wide-tables/
            └── {wideTableId}.json  # Wide Table + Sources + Columns
```

---

## Domain Model

### Schema ✅
一個邏輯上的資料庫專案，包含多個 Table。

```ts
Schema {
  id          number
  name        string
  description string | null
  domain      string          // "semiconductor" | "general"
  createdAt   string          // ISO timestamp
  updatedAt   string
}
```

### Table ✅
Schema 內的一張資料表，欄位 (Fields) 內嵌於同一 JSON 檔。

```ts
Table {
  id          number
  name        string          // snake_case, 複數
  comment     string | null   // 中文說明
  fields      Field[]         // 內嵌，不另存檔案
}
```

### Field ✅
Table 內的一個欄位，儲存於 tables/{tableId}.json 內部的 fields 陣列。

```ts
Field {
  id            number
  name          string
  dataType      string        // VARCHAR(255), BIGINT, TIMESTAMP, etc.
  nullable      boolean
  defaultValue  string | null
  isPrimaryKey  boolean
  isUnique      boolean
  comment       string | null
  position      number
}
```

### NamingEntry ✅
命名字典條目，儲存命名規範與 AI 生成說明。

```ts
NamingEntry {
  id             number
  concept        string        // 中文概念，e.g. "設備ID"
  stdName        string        // 標準英文名，e.g. "equip_id"
  aliases        string[]      // 常見別名
  domain         string
  description    string | null // 手動填寫的說明
  aiDescription  string | null // AI 生成的說明（claude-haiku）
  tags           string[]      // AI 分類標籤
  createdAt      string
  updatedAt      string
}
```

### SchemaVersion ✅
每次手動儲存的 Schema 不可變快照，含 diff。

```ts
SchemaVersion {
  id          number
  schemaId    number
  versionNo   number          // 自動遞增
  snapshot    VersionSnapshot // 完整結構（含 tables + wideTables）
  diff        VersionDiff | null  // 與前一版的 diff（首版為 null）
  message     string | null
  createdAt   string
}
```

Diff 格式：
```ts
VersionDiff {
  tables: {
    added: string[]
    removed: string[]
    modified: { name: string; fieldsAdded: string[]; fieldsRemoved: string[]; fieldsModified: { before: string; after: string }[] }[]
  }
  wideTables?: {
    added: string[]; removed: string[]
    modified: { name: string; sourcesAdded: string[]; sourcesRemoved: string[]; columnsAdded: number; columnsRemoved: number }[]
  }
}
```

### WideTable ✅
多表 JOIN 的寬表定義，用於產生 VIEW DDL。

```ts
WideTable {
  id          number
  schemaId    number
  name        string
  description string | null
  sources     WideTableSource[]   // JOIN 來源，含順序與條件
  columns     WideTableColumn[]   // 輸出欄位，含 outputName 與 included 旗標
}
```

### Rule ✅
靜態規則（不走 LLM），由 `@schema-studio/core` 內建，僅 overrides 存檔。

```ts
Rule {
  id              string          // e.g. "MISSING_PRIMARY_KEY"
  group           "naming" | "semantic" | "structure"
  description     string
  severity        "error" | "warning" | "info"
  enabled         boolean
  config          Record<string, unknown>
}
```

### LlmAuditLog ✅
每次 LLM 呼叫的記錄，append-only 存於 `data/llm-audit-logs.jsonl`。

```ts
LlmAuditLog {
  ts              string    // ISO timestamp
  model           string
  operation       string    // "generate-schema" | "analyze-schema" | "suggest-naming"
  prompt          string    // 前 200 字
  inputTokens     number
  responseTokens  number
  latencyMs       number
  costUsd         number
}
```

---

## LLM Pipeline

### NL → Schema ✅
```
使用者輸入（自然語言）
  → [載入 Skills: skills/**/SKILL.md，依 domain 篩選]
  → [載入 Naming Dictionary 詞彙快照]
  → [填入 prompts/generate-schema.md 模板]
  → [呼叫 claude-sonnet-4-6，SSE streaming]
  → [解析 JSON 回應為 Schema 模型]
  → [寫入 data/schemas/{id}/ 檔案]
  → 串流送出 token 事件 + 最終 done 事件（含 schemaId）
```

### Schema Analysis ✅
```
現有 Schema
  → [靜態 rule-based checks：primary key, created_at, snake_case 等]
  → [Naming Dictionary 全欄位比對：exact / alias / unknown]
  → 送出 issues 事件（前端立即顯示）
  → [載入 Skills，填入 prompts/analyze-schema-system.md 模板]
  → [呼叫 claude-sonnet-4-6，SSE streaming]
  → 串流送出 token 事件 + done 事件（含 score）
  → 寫入 LLM audit log
```
支援 tableId 參數，可針對單一表分析。

### AI 命名建議 ✅
```
單一 NamingEntry
  → [呼叫 claude-haiku-4-5，非串流]
  → 回傳 aiDescription（中文欄位說明）+ tags（預定義分類標籤）
  → 更新 data/naming/{id}.json
```

---

## REST API

### Schemas ✅
| Method | Path | 說明 |
|---|---|---|
| GET | `/api/v1/schemas` | 列出所有 schemas |
| POST | `/api/v1/schemas` | 建立 schema |
| GET | `/api/v1/schemas/:id` | 取得單一 schema（含 tables + fields）|
| PATCH | `/api/v1/schemas/:id` | 更新 schema metadata |
| DELETE | `/api/v1/schemas/:id` | 刪除 schema（含所有子資源）|
| POST | `/api/v1/schemas/:id/naming-check` | 對 schema 所有欄位執行命名比對 |

### Tables & Fields ✅
| Method | Path | 說明 |
|---|---|---|
| POST | `/api/v1/schemas/:id/tables` | 新增 table |
| PATCH | `/api/v1/tables/:id` | 更新 table |
| DELETE | `/api/v1/tables/:id` | 刪除 table（含欄位） |
| POST | `/api/v1/tables/:id/fields` | 新增 field |
| PATCH | `/api/v1/fields/:id` | 更新 field |
| DELETE | `/api/v1/fields/:id` | 刪除 field |

### Naming Dictionary ✅
| Method | Path | 說明 |
|---|---|---|
| GET | `/api/v1/naming-dictionary` | 列出（可 `?domain=` 過濾）|
| GET | `/api/v1/naming-dictionary/:id` | 取得單一條目 |
| POST | `/api/v1/naming-dictionary` | 新增 |
| PATCH | `/api/v1/naming-dictionary/:id` | 更新 |
| DELETE | `/api/v1/naming-dictionary/:id` | 刪除 |
| POST | `/api/v1/naming-dictionary/check` | 批次比對欄位名，回傳 MatchResult[] |
| POST | `/api/v1/naming-dictionary/:id/suggest` | AI 生成說明與標籤（claude-haiku）|

### DDL ✅
| Method | Path | 說明 |
|---|---|---|
| GET | `/api/v1/schemas/:id/ddl` | 匯出整個 schema 的 DDL |

### DDL Import ✅
| Method | Path | 說明 |
|---|---|---|
| POST | `/api/v1/schemas/:id/import-ddl` | 匯入 DDL（`dryRun: true` 僅檢查，`false` 實際寫入）|

回傳：`ImportCheckResult`（tables、violations、summary、parseErrors）

### Wide Tables ✅
| Method | Path | 說明 |
|---|---|---|
| GET | `/api/v1/schemas/:id/wide-tables` | 列出 schema 下的寬表 |
| GET | `/api/v1/schemas/:id/wide-tables/:id` | 取得寬表詳情（含 sources + columns）|
| POST | `/api/v1/schemas/:id/wide-tables/preview` | 預覽寬表（依 tableIds，回傳 columns + SQL）|
| POST | `/api/v1/schemas/:id/wide-tables/auto-compose` | 自動推薦 JOIN 順序（BFS FK 分析）|
| POST | `/api/v1/schemas/:id/wide-tables` | 建立寬表 |
| DELETE | `/api/v1/schemas/:id/wide-tables/:id` | 刪除寬表 |
| GET | `/api/v1/schemas/:id/wide-tables/:id/ddl` | 匯出寬表 VIEW DDL |

### LLM ✅
| Method | Path | 說明 |
|---|---|---|
| POST | `/api/v1/llm/generate` | NL → Schema（SSE streaming）|

### Schema Analysis ✅
| Method | Path | 說明 |
|---|---|---|
| POST | `/api/v1/schemas/:id/analyze` | 分析 Schema（SSE streaming，支援 `tableId` 參數）|

### Versions ✅
| Method | Path | 說明 |
|---|---|---|
| GET | `/api/v1/schemas/:id/versions` | 列出版本歷史 |
| GET | `/api/v1/schemas/:id/versions/:vno` | 取得特定版本（by versionNo）|
| POST | `/api/v1/schemas/:id/versions` | 手動建立版本快照 |

### Rules ✅
| Method | Path | 說明 |
|---|---|---|
| GET | `/api/v1/rules` | 列出所有規則（預設 + overrides 合併）|
| PATCH | `/api/v1/rules/:ruleId` | 更新規則 severity / enabled / config |

---

## Naming Dictionary — 比對邏輯

1. 完全比對 `stdName` → `exact`（無建議）
2. 比對 `aliases` 陣列 → `alias`（建議改為 `stdName`）
3. Levenshtein distance ≤ 2（任一 stdName 或別名）→ `fuzzy`（可能是相似名稱）
4. 無比對 → `unknown`（未登錄字典）

實作位置：`packages/core/src/naming/`（`levenshtein.ts` + `checkFieldName()`）

---

## Naming Dictionary — 半導體預設詞彙

以下為 seed 資料，domain = `semiconductor`（存於 `data/naming/`）：

| 概念 | std_name | 常見別名 |
|---|---|---|
| 設備 ID | equip_id | equipment_id, eqp_id, machine_id, tool_id |
| 批次 ID | lot_id | lot_no, lotid, batch_id |
| 晶圓 ID | wafer_id | wafer_no, wfr_id |
| 片號 | slot_no | slot_id, wafer_slot |
| 製程配方 ID | recipe_id | recipe_no, rcp_id |
| 腔體 ID | chamber_id | chamber_no, chmb_id |
| 製程步驟序號 | step_seq | step_no, step_id, process_step |
| 操作員 ID | operator_id | op_id, user_id, operator |
| 量測值 | meas_value | measurement, value, measure_val |
| 量測時間 | meas_at | measure_time, meas_time, measured_at |
| 設備狀態 | equip_status | machine_status, tool_status, status |
| 批次狀態 | lot_status | batch_status, lot_state |
| 良率 | yield_rate | yield, yield_pct |
| 缺陷數 | defect_count | defect_num, defect_qty |
| 保養類型 | maint_type | maintenance_type, pm_type |
| 保養時間 | maint_at | maintenance_time, pm_time |
| 下次保養時間 | next_maint_at | next_pm, next_maintenance |
| 產品 ID | product_id | prod_id, part_id |
| 製程 ID | process_id | proc_id, process_no |

---

## Rule 列表（v1 — 11 條已實作）

規則以 `group.name` 格式識別，可透過 `PATCH /api/v1/rules/:ruleId` 個別調整 severity / enabled / config。

| rule_id | group | 預設 severity | 說明 |
|---|---|---|---|
| naming.snake_case | naming | error | Table 和 field 名稱必須符合 `/^[a-z][a-z0-9_]*$/` |
| naming.reserved_words | naming | error | 名稱不得為 SQL 保留字（select、from、index 等 30+ 個）|
| naming.max_length | naming | warning | 名稱長度不得超過上限（預設 table 64、field 64，可配置）|
| naming.table_singular | naming | warning | Table 名稱疑似單數（_info、_data 後綴或單詞無底線）→ 建議複數 |
| naming.fk_convention | naming | warning | FK 欄位（_id 結尾、非 PK）不應使用 ref/parent/child/target 等模糊詞 |
| semantic.field_comment | semantic | warning | 欄位應有注釋（預設最短 2 字元，可配置 minLength）|
| semantic.table_comment | semantic | info | Table 應有注釋說明用途（最短 4 字元）|
| semantic.blob_needs_comment | semantic | warning | BLOB / TEXT / JSON 型別欄位必須有注釋 |
| structure.has_primary_key | structure | error | 每張 table 必須有 primary key |
| structure.timestamp_columns | structure | warning | Table 應有 created_at 和 updated_at 欄位 |
| structure.no_double_underscore | structure | warning | 名稱不得包含連續底線（`__`）|

> **注意**：命名字典相關規則（DICT_ALIAS_MATCH、DICT_UNKNOWN）目前透過 **Analysis 流程**（`/analyze`）比對，尚未整合進靜態規則引擎。

---

## Frontend Pages

| Page | 路由 | 說明 |
|---|---|---|
| SchemasPage | `/` | Schema 列表，可新增 / 刪除 |
| SchemaEditorPage | `/schemas/:id` | Table / Field CRUD，DDL 匯出，DDL 匯入，版本儲存 |
| VersionHistoryPage | `/schemas/:id/versions` | 版本列表，diff 檢視，命名規範分數與徽章 |
| NamingDictPage | `/naming` | 命名字典管理，AI 建議，批次命名比對 |
| AnalysisPage | `/schemas/:id/analysis` | Schema 分析（SSE streaming + rule issues）|
| WideTablePage | `/schemas/:id/wide-tables` | 寬表建立、預覽、DDL 匯出 |
| ErDiagramPage | `/schemas/:id/er` | ER 圖（靜態視覺化）|
| NamingPage | `/naming-check` | 欄位命名即時比對工具 |

NL → Schema 入口：Sidebar 上方「✦ AI」按鈕，彈出 Modal 後 SSE 串流生成。

---

## Skills Engine ✅

Skills 是 Markdown 格式的領域知識文件，在 API 啟動時載入，注入 LLM prompt。

```
skills/
├── schema-design/SKILL.md
├── naming-dictionary/SKILL.md
└── ddl-parser/SKILL.md
```

Frontmatter 格式：
```yaml
---
name: Schema Design Best Practices
domain: semiconductor
---
```

載入函式：`apps/api/src/services/skills.ts`
- `loadSkills()` — server startup 時掃描所有 SKILL.md
- `getSkillsForDomain(domain)` — 依 domain 篩選
- `formatSkillsForPrompt(skills)` — 輸出 `<skill name="...">...</skill>` XML 格式

---

## Prompt Templates

存放於 `prompts/`，執行時讀取（不 inline 在 TS 程式碼中）：

| 檔案 | 用途 | Placeholders |
|---|---|---|
| `generate-schema.md` | NL → Schema | `{{naming_dictionary}}`, `{{skills}}`, `{{user_prompt}}` |
| `analyze-schema-system.md` | Schema 分析 | `{{skills}}`, `{{rule_violations}}`, `{{naming_issues}}`, `{{schema_json}}` |
| `generate-field-description.md` | 命名建議（未使用，保留）| — |
