# DB Master — Schema Studio

> 半導體製造業 DB Schema 設計與命名規範管理平台

針對 MES / 資料工程小型團隊（2–10 人）設計。核心理念：**讓每位工程師設計出的 Schema 都符合團隊命名慣例，並且第一天就可被同事讀懂。**

---

## 目錄

- [快速啟動](#快速啟動)
- [核心工作流程](#核心工作流程)
- [功能總覽](#功能總覽)
- [專案架構](#專案架構)
- [資料儲存說明](#資料儲存說明)
- [規則與 Skills](#規則與-skills)
- [LLM 設定](#llm-設定)
- [DataHub 整合](#datahub-整合)
- [API 端點](#api-端點)
- [API 注意事項](#api-注意事項)
- [開發指引](#開發指引)
- [Docker 部署](#docker-部署)

---

## 快速啟動

```bash
# 1. 安裝依賴
npm install

# 2. 建置共用套件
npm run build -w packages/core
npm run build -w packages/ddl-parser

# 3. 設定 API 環境變數（可選，不設定則 AI 功能不可用）
cp apps/api/.env.example apps/api/.env.local

# 4. 啟動（前端 + 後端同在 port 3005）
npm run dev
```

瀏覽器開啟 [http://localhost:3005](http://localhost:3005)

> **語言切換**：右上角可切換繁體中文 / English。

---

## 核心工作流程

### 方式一：放入 DDL 檔案（推薦初始匯入）

啟動時自動掃描 `data/ddl/` 目錄，將 `.sql` 匯入為 Schema：

```
data/ddl/
├── plm-core.sql          ← 啟動後自動建立「PLM Core」Schema
├── mes-process.sql
├── mes_equipment.sql
├── test-quality.sql
├── wip-tracking.sql
└── your-schema.sql       ← 加入你自己的 DDL
```

新增檔案後，按前端側邊欄的 **↺ 重新載入**（或呼叫 `POST /api/v1/reload`）即可套用，無需重啟。

### 方式二：透過 UI 操作

1. **手動建立**：側邊欄「+ 新建 Schema」→ 建立 Table / Field
2. **貼入 DDL**：Schema 編輯器 DDL 頁籤 → 先 dry-run 語法 + 命名檢查，確認後套用

### 方式三：AI 自然語言生成

在 Schema 列表側邊欄使用「✦ AI」按鈕，以中文描述需求，系統自動套用命名字典生成符合規範的 Schema 草稿。（需設定 LLM API Key）

---

## 功能總覽

| 功能 | 說明 | 入口 |
|------|------|------|
| **DDL 自動匯入** | 放入 `.sql` → 啟動 / Reload 自動建立 Schema | `data/ddl/` |
| **Schema 編輯** | 手動管理 Table / Field，命名建議即時提示 | Schema 編輯器 |
| **DDL 匯入（手動）** | 貼入 DDL 文字，先 dry-run 檢查，確認後套用 | 編輯器 → DDL 頁籤 |
| **DDL 匯出** | 匯出 MariaDB / Oracle / ClickHouse 標準語句 | 編輯器 → DDL 頁籤 |
| **方言語法檢查** | 切換目標 DB 方言時自動檢查語法，即時顯示錯誤 | 編輯器 → 方言選擇器 |
| **版本管理** | 儲存版本快照，含命名分數 + 版本備註 | 編輯器 → 儲存版本 |
| **版本 Diff** | 展開版本比較，逐欄位顯示屬性變更 | 版本歷史 |
| **AI 分析** | 規則檢查 + 命名比對 + LLM 建議（SSE 串流）| 分析 |
| **命名字典** | 管理標準欄位名 / 別名 / AI 建議定義；批次名稱檢查 | 命名字典 |
| **ER 圖** | 自動生成 Mermaid ER 圖 | ER 圖 |
| **寬表建構** | 跨 Schema 多表 JOIN 定義 + SQL VIEW 產生 + 關聯圖 | 寬表 |
| **規則設定** | 即時啟停規則、調整嚴重度、一鍵還原預設；點擊規則展開完整說明 + Config | 規則 & Skills |
| **Skills 管理** | 查看已載入 Skill、展開說明、一鍵重新載入 | 規則 & Skills |
| **自訂規則** | 放入 `.md` Skill 檔案即可新增規則，無需重啟 | `data/skills/` |
| **DataHub 整合** | 選擇性推送單張 Table 或寬表至 DataHub；設定連線；推送記錄 | DataHub |
| **LLM 設定** | UI 設定 Provider / API Key / Model；測試連線；持久化儲存 | 規則 → LLM 設定 |
| **語言切換** | 介面支援繁體中文 / English | 右上角 |
| **AI 自然語言生成** | 中文描述需求 → AI 自動生成 Schema 草稿 | 側邊欄 ✦ AI |

---

## 專案架構

```
DB Master/
├── apps/
│   ├── api/                          # Express + TypeScript 後端（port 3005）
│   │   └── src/
│   │       ├── main.ts               # 入口：路由掛載、Vite 中介、DDL/Skills 載入
│   │       │
│   │       ├── routes/               # HTTP 路由（薄層，只做輸入驗證 + 呼叫 service/repo）
│   │       │   ├── schemas.ts        # Schema CRUD + naming-check
│   │       │   ├── tables.ts         # Table CRUD
│   │       │   ├── fields.ts         # Field CRUD
│   │       │   ├── versions.ts       # 版本快照 list / save
│   │       │   ├── ddl.ts            # DDL 匯出（text/plain）
│   │       │   ├── import-ddl.ts     # DDL 匯入（dryRun / 實際執行）
│   │       │   ├── analyze.ts        # AI 分析（SSE 串流）
│   │       │   ├── wide-tables.ts    # 寬表 CRUD + preview + auto-compose
│   │       │   ├── naming.ts         # 命名字典 CRUD + check + AI suggest
│   │       │   ├── rules.ts          # 規則設定 list / update
│   │       │   ├── skills.ts         # Skills 清單
│   │       │   ├── llm.ts            # AI 自然語言生成 Schema（SSE）
│   │       │   ├── settings.ts       # LLM 連線設定
│   │       │   └── datahub.ts        # DataHub 設定 / 測試 / 推送 / 推送記錄
│   │       │
│   │       ├── repositories/         # 檔案 I/O 層（JSON 讀寫，Zod 驗證）
│   │       │   ├── schemas.ts        # Schema / Table 讀寫（slug 路徑）
│   │       │   ├── fields.ts         # Field 讀寫
│   │       │   ├── naming.ts         # 命名字典讀寫
│   │       │   ├── versions.ts       # 版本快照讀寫
│   │       │   ├── wide-tables.ts    # 寬表讀寫 + previewWideTable()
│   │       │   ├── rules.ts          # 規則覆蓋讀寫
│   │       │   ├── settings.ts       # LLM / DataHub 設定讀寫
│   │       │   └── ddl-import.ts     # DDL 匯入業務邏輯（Zod 驗證 + rule check）
│   │       │
│   │       ├── services/             # 業務邏輯（不直接觸碰 HTTP / fs）
│   │       │   ├── llm.ts            # Anthropic / OpenAI 呼叫封裝（支援 SSE）
│   │       │   ├── skills.ts         # Skill 載入 / 解析（built-in + user）
│   │       │   ├── ddl-loader.ts     # 啟動時掃描 data/ddl/，mtime 追蹤
│   │       │   └── datahub.ts        # DataHub URN 建構 / 資料映射 / push stub
│   │       │
│   │       ├── db/
│   │       │   ├── fileStore.ts      # 底層 JSON 讀寫 + dataPath() 路徑工具
│   │       │   └── migrate.ts        # 一次性遷移（數字 ID 路徑 → slug 路徑）
│   │       │
│   │       └── middleware/
│   │           └── error.ts          # 統一錯誤回應（JSON envelope）
│   │
│   └── web/                          # Vite + React 18 + TypeScript 前端
│       └── src/
│           ├── main.tsx              # React 掛載點
│           ├── App.tsx               # 頂層佈局：NavBar、Sidebar、頁面路由
│           ├── api.ts                # API 客戶端型別定義（real / mock 切換）
│           ├── store.ts              # Zustand 全域狀態（page、selectedSchemaId、theme、locale）
│           ├── i18n.ts               # 繁中 / 英文字典（useT hook）
│           ├── mock/
│           │   ├── api.ts            # Mock API（VITE_USE_MOCK=true 時使用）
│           │   └── data.ts           # Mock 靜態資料
│           └── pages/
│               ├── SchemaEditorPage.tsx     # 欄位編輯 + DDL 匯入/匯出 + 版本儲存
│               ├── VersionHistoryPage.tsx   # 版本快照列表 + 逐欄位 Diff 展開
│               ├── AnalysisPage.tsx         # 規則 Issues 清單 + AI 整體評估（SSE）
│               ├── NamingDictPage.tsx       # 命名字典 CRUD + AI 建議
│               ├── ErDiagramPage.tsx        # Mermaid ER 圖 + Mermaid 原始碼
│               ├── WideTablePage.tsx        # 跨 Schema 寬表建構器 + JOIN 關聯圖
│               ├── RulesPage.tsx            # 規則設定 / Skills 管理 / LLM 設定（三分頁）
│               └── DataHubPage.tsx          # DataHub 推送 / 連線設定 / 推送記錄（三分頁）
│
├── packages/
│   ├── core/                         # 共用邏輯（純 TS，前後端均可 import）
│   │   └── src/
│   │       ├── types.ts              # 共用型別定義
│   │       ├── naming/
│   │       │   ├── matcher.ts        # 命名相似度比對（exact / alias / fuzzy / unknown）
│   │       │   └── levenshtein.ts    # Levenshtein 距離計算（≤2 視為 fuzzy match）
│   │       └── rules/
│   │           ├── engine.ts         # runRules(tables, config) → ViolationSummary[]
│   │           └── built-in.ts       # 11 條內建規則定義
│   │
│   ├── ddl-parser/                   # SQL DDL 解析器
│   │   └── src/
│   │       ├── index.ts              # parseDDL(sql) → ParsedTable[]
│   │       └── emitter.ts            # emitDDL(table, dialect) → SQL string
│   │
│   └── eslint-config/                # 共用 ESLint 設定（monorepo 共享）
│
├── data/                             # 執行期資料（檔案式資料庫，無需外部 DB）
│   ├── _sys/                         # 系統檔（自動管理）
│   │   ├── counters.json             # 自增 ID 計數器
│   │   ├── index.json                # 反向查找索引（ID → slug）
│   │   └── ddl-manifest.json         # DDL 匯入 mtime 快取
│   ├── ddl/                          # ← .sql 放這裡即自動匯入（納入版控）
│   ├── skills/                       # ← .md 放這裡即新增自訂規則（納入版控）
│   ├── schemas/{slug}/               # Schema 資料（meta.json / tables/ / versions/ / wide-tables/）
│   ├── naming/{stdName}.json         # 命名字典詞條
│   ├── rules/overrides.json          # 規則覆蓋設定
│   └── datahub-push-log.json         # DataHub 推送記錄（最近 100 筆）
│
├── skills/                           # 內建 Skill 知識庫（唯讀，隨版本控制）
│   ├── schema-design/                # 通用 Schema 設計規則
│   ├── naming-dictionary/            # 命名字典輔助規則
│   ├── ddl-parser/                   # DDL 解析輔助
│   └── README.md
│
├── prompts/                          # LLM 提示詞範本（runtime 讀取，可直接編輯）
│   ├── generate-schema.md            # AI 生成 Schema 提示詞
│   └── analyze-schema-system.md     # AI 分析 Schema 提示詞
│
├── docs/
│   ├── SPEC.md                       # 功能規格書
│   ├── DEVELOPER.md                  # 開發者手冊
│   ├── ROADMAP.md                    # 功能路線圖
│   └── PROJECT.md                    # 產品背景與架構決策
│
├── tasks/                            # 開發任務清單
├── Dockerfile                        # 正式環境 Docker 映像（multi-stage build）
├── docker-compose.yml
├── docker-entrypoint.sh              # 容器首次執行初始化腳本
└── CLAUDE.md                         # Claude Code 開發規範（AI 協作指引）
```

### 資料流向

```
瀏覽器（React）
    │  fetch /api/v1/...
    ▼
Express Routes          ← Zod 輸入驗證
    │
    ├── Repositories    ← fileStore.ts JSON 讀寫（data/ 目錄）
    ├── Services        ← LLM 呼叫 / DataHub 推送 / DDL 載入
    └── packages/core  ← Rule Engine / Naming Matcher（純 TS，無 I/O）
```

### 技術選型

| 關切點 | 選擇 | 不用 |
|--------|------|------|
| 前端框架 | React 18 + Vite | Next.js, SvelteKit |
| 狀態管理 | Zustand + TanStack Query | Redux, MobX |
| 樣式 | Tailwind + CSS 變數（自訂主題）| MUI, Ant Design |
| 後端 | Express + TypeScript | Fastify, NestJS |
| **儲存** | **檔案式 JSON（fs/promises）** | **任何 DB 或 ORM** |
| 驗證 | Zod | Joi, Yup |
| 測試 | Vitest（unit）+ Playwright（e2e）| Jest, Cypress |
| 套件管理 | npm workspaces | pnpm, yarn |

> **為何用檔案儲存？** 本專案的主題本身就是「Schema 設計」，引入外部 DB 會造成循環依賴的認知混亂。JSON 檔案透明可讀、可版本控制、零依賴，對小型團隊工具場景完全夠用。

---

## 資料儲存說明

### 路徑結構（slug-based）

```
data/schemas/plm-core/               ← Schema slug（由名稱自動生成）
    meta.json                        ← { id, name, description, domain, createdAt, updatedAt }
    tables/
        parts.json                   ← { id, name, comment, fields: [...] }
        bom_items.json
    versions/
        v1.json                      ← 完整 VersionSnapshot（含 diff）
        v2.json
    wide-tables/
        bom-view.json                ← { id, sources: [...], columns: [...] }

data/naming/
    lot_id.json                      ← { id, concept, stdName, aliases, domain, tags, ... }

data/rules/
    overrides.json                   ← { [ruleId]: { severity?, enabled?, config? } }

data/datahub-push-log.json           ← PushRecord[]（最近 100 筆，append-only）
```

### 自增 ID 與反向索引

- `data/_sys/counters.json`：每個實體類型（schema、table、field、naming、wideTable）獨立計數器
- `data/_sys/index.json`：ID → slug 路徑的反向查找，避免全目錄掃描

### DDL 匯入追蹤

- `data/_sys/ddl-manifest.json`：記錄每個 `.sql` 檔案的 mtime
- 重啟或 Reload 時只處理 mtime 有變更的檔案
- 強制重新匯入：刪除此檔案後重啟

> `data/` 下除 `ddl/` 和 `skills/` 外，其他目錄均在 `.gitignore` 中（執行期資料，不納入版控）。

---

## 規則與 Skills

### 內建規則（11 條）

在「**規則 & Skills**」頁面可即時調整嚴重度或停用。點擊任意規則列可展開完整說明與 Config 參數：

| 分組 | 規則 ID | 預設嚴重度 | 說明 |
|------|---------|-----------|------|
| 命名 | `naming.snake_case` | error | 欄位名必須為 snake_case |
| 命名 | `naming.reserved_words` | error | 不可使用 SQL 保留字 |
| 命名 | `naming.max_length` | warning | 名稱不超過設定長度（預設 64）|
| 命名 | `naming.table_singular` | warning | Table 名建議用單數 |
| 命名 | `naming.fk_convention` | warning | FK 欄位應遵循 `{table}_id` 命名 |
| 語意 | `semantic.field_comment` | warning | 欄位應有 COMMENT |
| 語意 | `semantic.table_comment` | info | Table 應有 COMMENT |
| 語意 | `semantic.blob_needs_comment` | warning | TEXT/BLOB 欄位必須有 COMMENT |
| 結構 | `structure.has_primary_key` | error | Table 必須有 Primary Key |
| 結構 | `structure.timestamp_columns` | warning | 應有 created_at / updated_at |
| 結構 | `structure.no_double_underscore` | warning | 名稱不可含雙底線 |

### 內建 Skills（`skills/` 目錄）

| Skill | 說明 |
|-------|------|
| `schema-design` | 通用 Schema 設計最佳實踐規則 |
| `naming-dictionary` | 命名字典輔助提示 |
| `ddl-parser` | DDL 解析輔助知識 |

### 新增自訂規則

在 `data/skills/` 新增 `.md` 檔案，格式如下：

```markdown
---
name: my-rules
domain: semiconductor
tags: [mes, wip]
---

## Rules

\`\`\`rules
- id: user.my_rule
  description: 規則說明（會顯示在 UI 的展開詳情）
  severity: warning
  requiredFields: [lot_id, equip_id]
  tablePattern: .*process.*
\`\`\`
```

**支援的規則欄位：**

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | string | `user.` 前綴（必填）|
| `description` | string | 規則說明（顯示於 UI）|
| `severity` | `error\|warning\|info` | 預設嚴重度 |
| `requiredFields` | string[] | 這些欄位名稱必須存在 |
| `forbiddenFields` | string[] | 這些欄位名稱不可存在 |
| `fieldPattern` | regex | 欄位名稱必須符合此 pattern |
| `forbiddenFieldPattern` | regex | 欄位名稱不可符合此 pattern |
| `tablePattern` | regex | 只對符合此 pattern 的 Table 套用 |

新增後在 UI「規則 & Skills → Skills」點擊「↺ 重新載入」即生效，**無需重啟伺服器**。

---

## LLM 設定

**方式一：環境變數**（`apps/api/.env.local`）

```bash
# Anthropic Claude（預設）
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...

# OpenRouter（可使用各種開源模型）
LLM_PROVIDER=openai
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_API_KEY=sk-or-...
LLM_MODEL=meta-llama/llama-3.3-70b-instruct

# Ollama 本機
LLM_PROVIDER=openai
LLM_BASE_URL=http://localhost:11434/v1
LLM_API_KEY=ollama
LLM_MODEL=llama3.2
```

**方式二：UI 設定頁**

進入「規則 & Skills → LLM 設定」，填入 Provider / API Key / Base URL / Model，點擊「測試連線」後儲存。設定持久化到 `data/` 目錄，重啟後不需重新輸入。

不設定 LLM 時，Schema 編輯、命名字典、DDL 匯入等核心功能仍可正常使用；AI 分析與自然語言生成將不可用。

---

## DataHub 整合

DataHub 整合框架已就緒，等待 API 端點提供後啟用。

### 功能

- **推送 Schema**：展開各 Schema，勾選要推送的 Tables 或寬表（可混選），點擊「⬆ 推送已選取」
- **連線設定**：設定 DataHub URL、Personal Access Token、資料平台、環境（PROD/STAGING/DEV/TEST）
- **推送記錄**：查看最近 100 筆推送記錄，自動每 5 秒更新

### URN 格式

```
urn:li:dataset:(urn:li:dataPlatform:{platform},{schema_name}.{table_name},{env})

範例：urn:li:dataset:(urn:li:dataPlatform:mariadb,plm_core.parts,PROD)
```

### 啟用真實推送

提供 DataHub REST API 端點後，編輯以下兩個函式：

```
apps/api/src/services/datahub.ts
  - testConnection()  → GET {url}/config
  - pushSchema()      → POST {url}/entities?action=ingest
```

請求格式（DataHub GMS REST API）：
```
POST {url}/entities?action=ingest
Authorization: Bearer {token}
Content-Type: application/json
```

---

## API 端點

### 系統

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/v1/health` | 健康檢查 |
| POST | `/api/v1/reload` | 重新載入 DDL + Skills（無需重啟）|

### Schema

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/v1/schemas` | 列出所有 Schema |
| POST | `/api/v1/schemas` | 建立 Schema |
| GET | `/api/v1/schemas/:id` | 取得 Schema（含 Table / Field）|
| PATCH | `/api/v1/schemas/:id` | 更新 Schema |
| DELETE | `/api/v1/schemas/:id` | 刪除 Schema |
| POST | `/api/v1/schemas/:id/naming-check` | 命名一致性批次檢查 |
| GET | `/api/v1/schemas/:id/ddl` | 匯出 DDL（`?dialect=mariadb\|oracle\|clickhouse`，回傳純文字）|
| POST | `/api/v1/schemas/:id/import-ddl` | 匯入 DDL（`{ sql, dryRun: true\|false }`）|
| POST | `/api/v1/schemas/:id/analyze` | AI 分析（SSE 串流）|

### 版本

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/v1/schemas/:id/versions` | 版本列表 |
| POST | `/api/v1/schemas/:id/versions` | 儲存版本快照（`{ message? }`）|

### Table / Field

| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | `/api/v1/schemas/:schemaId/tables` | 建立 Table |
| PATCH | `/api/v1/tables/:tableId` | 更新 Table |
| DELETE | `/api/v1/tables/:tableId` | 刪除 Table |
| POST | `/api/v1/tables/:tableId/fields` | 建立 Field |
| PATCH | `/api/v1/fields/:fieldId` | 更新 Field |
| DELETE | `/api/v1/fields/:fieldId` | 刪除 Field |

### 寬表

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/v1/schemas/:id/wide-tables` | 寬表列表 |
| POST | `/api/v1/schemas/:id/wide-tables` | 建立寬表 |
| GET | `/api/v1/schemas/:id/wide-tables/:wid` | 取得寬表詳情 |
| DELETE | `/api/v1/schemas/:id/wide-tables/:wid` | 刪除寬表 |
| POST | `/api/v1/schemas/:id/wide-tables/preview` | 預覽 JOIN SQL（`{ tableRefs: [{schemaId, tableId}] }`）|
| GET | `/api/v1/schemas/:id/wide-tables/:wid/ddl` | 匯出寬表 DDL |

### 命名字典

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/v1/naming-dictionary` | 字典列表（`?domain=semiconductor`）|
| POST | `/api/v1/naming-dictionary` | 新增詞條 |
| PATCH | `/api/v1/naming-dictionary/:id` | 更新詞條 |
| DELETE | `/api/v1/naming-dictionary/:id` | 刪除詞條 |
| POST | `/api/v1/naming-dictionary/check` | 批次欄位名稱檢查 |
| POST | `/api/v1/naming-dictionary/:id/suggest` | AI 建議定義與標籤 |

### 規則 & Skills

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/v1/rules` | 規則設定列表（含 Skill 規則）|
| PATCH | `/api/v1/rules/:id` | 更新規則嚴重度 / 啟用狀態 / config |
| GET | `/api/v1/skills` | 已載入 Skill 清單 |

### LLM & 設定

| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | `/api/v1/llm/generate` | AI 自然語言生成 Schema（SSE）|
| GET | `/api/v1/settings/llm` | 取得 LLM 設定（API Key 遮罩）|
| PATCH | `/api/v1/settings/llm` | 更新 LLM 設定 |
| POST | `/api/v1/settings/llm/test` | 測試 LLM 連線 |

### DataHub

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/v1/datahub/settings` | 取得 DataHub 設定（Token 遮罩）|
| PATCH | `/api/v1/datahub/settings` | 更新設定（url / token / platform / env）|
| POST | `/api/v1/datahub/test` | 測試 DataHub 連線 |
| POST | `/api/v1/datahub/push/:schemaId` | 推送 Schema（`{ tableIds?, wideTableIds? }`）|
| GET | `/api/v1/datahub/push-log` | 推送記錄（最近 100 筆）|

---

## API 注意事項

### Request Body 使用 snake_case

API 的 **request body**（POST / PATCH）使用 `snake_case`，但 **response** 回傳 `camelCase`：

```bash
# ✅ 正確：建立欄位
curl -X POST /api/v1/tables/1/fields \
  -H "Content-Type: application/json" \
  -d '{"name":"lot_id","data_type":"VARCHAR(32)","nullable":false,"is_primary_key":true}'

# ✅ 正確：新增命名字典詞條
curl -X POST /api/v1/naming-dictionary \
  -H "Content-Type: application/json" \
  -d '{"concept":"在製品批次","std_name":"wip_lot_id","domain":"semiconductor"}'

# ❌ 錯誤：camelCase 會被 Zod 驗證拒絕 → 400 VALIDATION_ERROR
curl -X POST /api/v1/tables/1/fields \
  -d '{"name":"lot_id","dataType":"VARCHAR(32)"}'
```

完整 snake_case 欄位對照：

| 功能 | snake_case 欄位 |
|------|----------------|
| 建立 / 更新 Field | `data_type`, `default_value`, `is_primary_key`, `is_unique` |
| 建立 / 更新 Naming 詞條 | `std_name`, `ai_description` |

### DDL 端點回傳純文字

`GET /api/v1/schemas/:id/ddl` 回傳 `text/plain`，不是 JSON。

### Analyze 與 LLM Generate 為 SSE 串流

`POST .../analyze` 和 `POST /api/v1/llm/generate` 回傳 `text/event-stream`：

```
data: {"type":"issues", "issues":[...]}

data: {"type":"token", "text":"..."}

data: {"type":"done", "schemaId":1, "schemaName":"...", "tableCount":3}

data: {"type":"error", "message":"..."}
```

---

## 開發指引

```bash
# 修改 packages/core 後必須重新建置
npm run build -w packages/core

# 型別檢查（全 monorepo）
npm run typecheck

# 測試
npm test

# 單一套件測試
npm run test -w packages/core
```

### 命名規範

| 層級 | 慣例 | 範例 |
|------|------|------|
| JSON 鍵（response）| camelCase | `stdName`, `fieldCount` |
| JSON 鍵（request body）| snake_case | `std_name`, `data_type` |
| TypeScript 變數 / 函式 | camelCase | `parseDDL`, `usageCount` |
| TypeScript 型別 / 介面 | PascalCase | `SchemaTable`, `RuleResult` |
| API 路由 | kebab-case 複數 | `/naming-dictionary` |
| 檔名（TS）| kebab-case | `ddl-parser.ts` |
| React 元件 | PascalCase.tsx | `TableCard.tsx` |
| CSS 變數 | `--kebab-case` | `--bg-1`, `--accent` |

規則 ID 命名：內建 `naming.*` / `structure.*` / `semantic.*`；Skill 目錄 `skill.*`；使用者自訂 `user.*`

### Mock 模式（無後端開發）

在 `apps/web/.env.local` 設定 `VITE_USE_MOCK=true`，前端改為使用 `src/mock/api.ts` 的靜態資料，所有 mutation 在記憶體內更新，頁面重整後還原。

---

## Docker 部署

適合離線環境或正式部署。所有資料持久化到 Docker Volume，容器重建後不遺失。

```bash
# 建置並啟動
docker compose up --build

# 背景執行
docker compose up -d --build
```

瀏覽器開啟 [http://localhost:3005](http://localhost:3005)

**環境變數（`docker-compose.yml`）**

```yaml
environment:
  - LLM_PROVIDER=anthropic
  - ANTHROPIC_API_KEY=sk-ant-...   # 選填，不設定則 AI 功能不可用
```

**資料備份**

```bash
# 查看 volume
docker volume inspect db-master_app_data

# 備份整個 data/ 目錄
docker run --rm \
  -v db-master_app_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/data-backup-$(date +%Y%m%d).tar.gz /data

# 還原
docker run --rm \
  -v db-master_app_data:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/data-backup-YYYYMMDD.tar.gz -C /
```

**首次啟動**

容器首次執行時，`docker-entrypoint.sh` 自動將 `data/ddl/` 與 `data/skills/` 的種子檔案複製到 volume，然後啟動 API server。
