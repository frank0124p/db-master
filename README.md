# DB Master — Schema Studio

> 半導體製造業 DB Schema 設計與命名規範管理平台

針對 MES / 資料工程小型團隊（2–10 人）設計。核心理念：**讓每位工程師設計出的 Schema 都符合團隊命名慣例，並且第一天就可被同事讀懂。**

---

## 目錄

- [快速啟動](#快速啟動)
- [核心工作流程](#核心工作流程)
- [專案結構](#專案結構)
- [功能總覽](#功能總覽)
- [規則與 Skills](#規則與-skills)
- [資料目錄說明](#資料目錄說明)
- [LLM 設定](#llm-設定)
- [API 端點](#api-端點)
- [API 注意事項](#api-注意事項)
- [開發指引](#開發指引)
- [Docker 部署](#docker-部署)

---

## 快速啟動

```bash
# 1. 安裝依賴
pnpm install

# 2. 建置共用套件
pnpm --filter @schema-studio/core build
pnpm --filter @schema-studio/ddl-parser build

# 3. 設定 API 環境變數（可選，不設定則 AI 功能不可用）
cp apps/api/.env.example apps/api/.env.local

# 4. 啟動（前端 + 後端 同在 port 3005）
pnpm dev
```

瀏覽器開啟 [http://localhost:3005](http://localhost:3005)

> **語言切換**：右上角可切換繁體中文 / English。

---

## 核心工作流程

### 方式一：放入 DDL 檔案（推薦初始匯入）

啟動時自動掃描 `data/ddl/` 目錄，將 `.sql` 匯入為 Schema。

```
data/ddl/
├── plm-core.sql          ← 啟動後自動建立「PLM Core」Schema
├── mes-process.sql       ← 啟動後自動建立「MES Process」Schema
├── mes_equipment.sql     ← 啟動後自動建立「Mes Equipment」Schema
├── test-quality.sql      ← 啟動後自動建立「Test Quality」Schema
├── wip-tracking.sql      ← 啟動後自動建立「Wip Tracking」Schema
└── your-schema.sql       ← 加入你自己的 DDL
```

新增檔案後，按前端側邊欄的 **↺ 重新載入**（或呼叫 `POST /api/v1/reload`）即可套用，無需重啟。

### 方式二：透過 UI 操作

1. **手動建立**：側邊欄「+ 新建 Schema」→ 建立 Table / Field
2. **貼入 DDL**：Schema 編輯器「DDL」頁籤 → 編輯並套用，系統先跑語法 + 命名檢查，確認後再匯入

### 方式三：AI 自然語言生成

在 Schema 列表頁使用 AI 對話框描述需求（中文即可），系統生成符合命名字典的 Schema 草稿。（需設定 LLM API Key）

---

## 專案結構

```
DB Master/
├── apps/
│   ├── api/                     # Express + TypeScript API（port 3005）
│   │   └── src/
│   │       ├── main.ts          # 入口：路由掛載、DDL loader、Skills loader
│   │       ├── routes/          # HTTP 路由處理器
│   │       │   ├── schemas.ts
│   │       │   ├── tables.ts
│   │       │   ├── fields.ts
│   │       │   ├── naming.ts
│   │       │   ├── versions.ts
│   │       │   ├── ddl.ts
│   │       │   ├── analyze.ts        # AI 分析（SSE 串流）
│   │       │   ├── wide-tables.ts
│   │       │   ├── import-ddl.ts
│   │       │   ├── rules.ts
│   │       │   ├── skills.ts
│   │       │   ├── llm.ts            # AI 生成 Schema（SSE 串流）
│   │       │   └── settings.ts       # LLM 連線設定
│   │       ├── repositories/    # 檔案 I/O 層（JSON 讀寫）
│   │       │   ├── schemas.ts
│   │       │   ├── tables.ts
│   │       │   ├── fields.ts
│   │       │   ├── naming.ts
│   │       │   ├── versions.ts
│   │       │   ├── wide-tables.ts
│   │       │   ├── rules.ts
│   │       │   └── settings.ts
│   │       ├── services/        # 業務邏輯
│   │       │   ├── llm.ts            # Anthropic / OpenAI 呼叫封裝
│   │       │   ├── skills.ts         # Skill 載入與格式化
│   │       │   └── ddl-loader.ts     # 啟動時掃描 data/ddl/
│   │       ├── db/
│   │       │   ├── fileStore.ts      # 底層 JSON 讀寫 + slug 路徑工具
│   │       │   └── migrate.ts        # 一次性資料遷移（數字 ID → slug 路徑）
│   │       └── middleware/
│   │           └── error.ts          # 統一錯誤處理
│   │
│   └── web/                     # Vite + React + TypeScript（Dev via proxy）
│       └── src/
│           ├── App.tsx           # 路由 + 側邊欄
│           ├── api.ts            # API 客戶端（real / mock 切換）
│           ├── store.ts          # Zustand 全域狀態（schema、主題、語言）
│           ├── i18n.ts           # 繁中 / 英文字典
│           └── pages/
│               ├── SchemaEditorPage.tsx     # 欄位編輯 + DDL 匯入/匯出 + 版本儲存
│               ├── VersionHistoryPage.tsx   # 版本快照 + 逐欄位 Diff
│               ├── AnalysisPage.tsx         # AI 分析 + 規則檢查
│               ├── NamingDictPage.tsx       # 命名字典管理
│               ├── ErDiagramPage.tsx        # ER 圖（Mermaid）
│               ├── WideTablePage.tsx        # 寬表 JOIN 建構器
│               └── RulesPage.tsx            # 規則設定 + Skills 管理
│
├── packages/
│   ├── core/                    # 共用邏輯（純 TS，前後端均可使用）
│   │   └── src/
│   │       ├── types.ts
│   │       ├── naming/matcher.ts   # 命名相似度比對（Levenshtein ≤2）
│   │       └── rules/
│   │           ├── engine.ts       # runRules()
│   │           └── built-in.ts     # 11 條內建規則
│   ├── ddl-parser/              # SQL DDL 解析器 parseDDL() / emitDDL()
│   └── eslint-config/           # 共用 ESLint 設定
│
├── data/                        # 執行期資料（檔案式資料庫，無需外部 DB）
│   ├── ddl/                     # ← 放入 .sql 即自動匯入（版本控制）
│   └── skills/                  # ← 放入 .md 即新增自訂規則（版本控制）
│
├── skills/                      # 內建 Skill 知識庫（唯讀，隨專案版本控制）
├── prompts/                     # LLM 提示詞範本（runtime 讀取）
├── docs/                        # 文件
│   ├── SPEC.md                  # 功能規格書
│   ├── DEVELOPER.md             # 開發者手冊
│   ├── ROADMAP.md               # 功能路線圖
│   └── PROJECT.md               # 產品背景與架構決策
├── tasks/                       # 開發任務清單（15 項，已完成 14 項）
├── Dockerfile                   # 正式環境 Docker 映像
├── docker-compose.yml           # Docker Compose 配置
├── docker-entrypoint.sh         # 容器啟動腳本（首次執行初始化）
└── CLAUDE.md                    # Claude Code 開發規範
```

---

## 功能總覽

| 功能 | 說明 | 入口 |
|------|------|------|
| **DDL 自動匯入** | 放入 `.sql` → 啟動 / Reload 自動建立 Schema | `data/ddl/` |
| **Schema 編輯** | 手動管理 Table / Field，命名建議即時提示 | Schema 編輯器 |
| **DDL 匯入（手動）** | 貼入 DDL 文字，先 dry-run 語法 + 命名檢查，確認後套用 | 編輯器 > DDL 頁籤 |
| **DDL 匯出** | 匯出 MariaDB / Oracle / ClickHouse 標準語句 | 編輯器 > DDL 頁籤 |
| **方言語法檢查** | 切換目標 DB 方言時自動檢查語法，即時顯示錯誤 / 警告 | 編輯器 > 方言選擇器 |
| **版本管理** | 儲存版本快照，含命名分數確認 + 版本備註 | 編輯器 > 儲存版本 |
| **版本 Diff** | 展開版本比較，逐欄位顯示屬性變更（型別、可空、預設值、備註、PK、唯一索引） | 版本歷史 |
| **AI 分析** | 規則檢查 + 命名比對 + LLM 建議（SSE 串流） | 分析 |
| **命名字典** | 管理標準欄位名 / 別名 / AI 建議定義；批次欄位名稱檢查 | 命名字典 |
| **ER 圖** | 自動生成 Mermaid ER 圖 | ER 圖 |
| **寬表建構** | 多表 JOIN 定義 + SQL VIEW 產生 + JOIN 關聯圖 | 寬表 |
| **規則設定** | 即時啟停規則、調整嚴重度、一鍵還原預設 | 規則 & Skills |
| **Skills 管理** | 查看已載入 Skill、展開說明、一鍵重新載入 | 規則 & Skills |
| **自訂規則** | 放入 `.md` Skill 檔案即可新增規則，無需重啟 | `data/skills/` |
| **語言切換** | 介面支援繁體中文 / English | 右上角 |
| **LLM 設定頁** | 在 UI 設定 Provider / API Key / Model，即時測試連線 | 設定 |
| **外部 LLM** | 支援 OpenRouter / Ollama 等 OpenAI 相容 API | `.env.local` 或 UI |

---

## 規則與 Skills

### 內建規則（11 條）

在「**規則 & Skills**」頁面可即時調整嚴重度或停用：

| 分組 | 規則 ID | 預設嚴重度 | 說明 |
|------|---------|-----------|------|
| 命名 | `naming.snake_case` | error | 欄位名必須為 snake_case |
| 命名 | `naming.reserved_words` | error | 不可使用 SQL 保留字 |
| 命名 | `naming.max_length` | warning | 名稱不超過設定長度（預設 64）|
| 命名 | `naming.table_singular` | warning | Table 名建議用複數 |
| 命名 | `naming.fk_convention` | warning | FK 欄位應遵循 `{table}_id` 命名 |
| 語意 | `semantic.field_comment` | warning | 欄位應有 COMMENT |
| 語意 | `semantic.table_comment` | info | Table 應有 COMMENT |
| 語意 | `semantic.blob_needs_comment` | warning | TEXT/BLOB 欄位必須有 COMMENT |
| 結構 | `structure.has_primary_key` | error | Table 必須有 Primary Key |
| 結構 | `structure.timestamp_columns` | warning | 應有 created_at / updated_at |
| 結構 | `structure.no_double_underscore` | warning | 名稱不可含雙底線 |

### Skill 規則（從 `skills/` 與 `data/skills/` 自動載入）

| Skill | 規則 ID | 說明 |
|-------|---------|------|
| schema-design | `skill.no_generic_name_field` | 禁用 `name`、`type`、`status` 等過於通用的欄位名 |
| Semiconductor Naming Rules | `user.semi.lot_id_in_process_tables` | 製程相關 Table 必須有 `lot_id` |
| Semiconductor Naming Rules | `user.semi.equip_id_required` | 設備相關 Table 必須有 `equip_id` |
| Semiconductor Naming Rules | `user.semi.no_status_field` | 禁用 `status` 欄位（應使用更具體的名稱）|

### 新增自訂規則

在 `data/skills/` 新增 `.md` 檔案：

```markdown
---
name: my-rules
domain: semiconductor
---

## Rules

\`\`\`rules
- id: user.my_rule
  description: 規則說明
  severity: warning
  requiredFields: [lot_id, equip_id]
  tablePattern: .*process.*
\`\`\`
```

支援欄位：`requiredFields`、`forbiddenFields`、`fieldPattern`（regex）、`forbiddenFieldPattern`（regex）、`tablePattern`（套用條件 regex）

新增後在 UI「規則 & Skills > Skills」點擊「↺ 重新載入」即生效，**無需重啟伺服器**。

---

## 資料目錄說明

```
data/
├── _sys/                        # 系統檔案（自動管理，勿手動修改）
│   ├── counters.json            # 自增 ID 計數器
│   ├── index.json               # 反向查找索引（ID → slug 路徑）
│   └── ddl-manifest.json        # DDL 匯入追蹤（mtime 快取）
├── ddl/                         # ← 放入 .sql 即自動匯入（可版本控制）
│   ├── plm-core.sql
│   ├── mes-process.sql
│   ├── mes_equipment.sql
│   ├── test-quality.sql
│   └── wip-tracking.sql
├── schemas/                     # Schema 資料（slug 命名資料夾）
│   └── plm-core/                # Schema slug（由名稱自動生成）
│       ├── meta.json            # Schema 名稱、描述、Domain
│       ├── tables/
│       │   ├── parts.json       # 每個 Table 一個檔案，以 table name 命名
│       │   └── bom_items.json
│       ├── versions/
│       │   ├── v1.json          # 版本快照，以 v{N} 命名
│       │   └── v2.json
│       └── wide-tables/
│           └── bom-view.json
├── naming/                      # 命名字典（以 stdName 命名）
│   ├── lot_id.json
│   └── part.json
├── rules/                       # 規則覆蓋設定（自動生成）
└── skills/                      # ← 放入 .md 即新增自訂規則（可版本控制）
```

### `data/ddl/` — 自動匯入 DDL

放入任何 `.sql` 檔案，啟動（或點擊 **↺ 重新載入**）後自動匯入：

- 檔名轉 Schema 名稱：`wip-tracking.sql` → `Wip Tracking`
- 重複匯入保護：以 mtime 追蹤，未修改的檔案不重複匯入
- 同名 Schema 已存在時更新而非重建
- 強制重新匯入：刪除 `data/_sys/ddl-manifest.json` 後重啟

### `data/skills/` — 自訂規則 Skill

放入 `.md` 後點擊重新載入即生效。詳見[規則與 Skills](#規則與-skills)。

> 除 `data/ddl/` 與 `data/skills/` 之外，`data/` 下的執行期資料（schemas、naming、versions 等）不納入版本控制。

### 資料遷移說明

系統啟動時自動執行一次性遷移（`apps/api/src/db/migrate.ts`），將舊格式（數字 ID 路徑）轉換為新格式（slug 路徑）。若資料目錄已是新格式則 no-op。

---

## LLM 設定

**方式一：環境變數**（`apps/api/.env.local`）

```bash
# Anthropic Claude（預設）
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...

# OpenRouter（使用各種開源模型）
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

進入前端「設定」頁面，填入 Provider / API Key / Base URL / Model，點擊「測試連線」驗證後儲存。設定會持久化到 `data/` 目錄，重啟後不需重新輸入。

不設定 LLM 時，Schema 編輯、命名字典、DDL 匯入等核心功能仍可正常使用；AI 分析與自然語言生成功能將不可用。

---

## API 端點

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/v1/health` | 健康檢查 |
| POST | `/api/v1/reload` | 重新載入 DDL + Skills（無需重啟）|
| GET | `/api/v1/schemas` | 列出所有 Schema |
| POST | `/api/v1/schemas` | 建立 Schema |
| GET | `/api/v1/schemas/:id` | 取得 Schema（含 Table / Field）|
| PATCH | `/api/v1/schemas/:id` | 更新 Schema |
| DELETE | `/api/v1/schemas/:id` | 刪除 Schema |
| POST | `/api/v1/schemas/:id/naming-check` | 命名一致性批次檢查 |
| GET | `/api/v1/schemas/:id/ddl` | 匯出 DDL（`?dialect=mariadb\|oracle\|clickhouse`，回傳純文字）|
| POST | `/api/v1/schemas/:id/import-ddl` | 匯入 DDL（`{ sql, dryRun: true }` 先預覽）|
| POST | `/api/v1/schemas/:id/analyze` | AI 分析（SSE 串流，回傳 `text/event-stream`）|
| GET | `/api/v1/schemas/:id/versions` | 版本列表 |
| POST | `/api/v1/schemas/:id/versions` | 儲存版本快照（`{ message? }`）|
| GET | `/api/v1/schemas/:id/versions/:vno` | 取得指定版本 |
| POST | `/api/v1/schemas/:schemaId/tables` | 建立 Table |
| PATCH | `/api/v1/tables/:tableId` | 更新 Table |
| DELETE | `/api/v1/tables/:tableId` | 刪除 Table |
| POST | `/api/v1/tables/:tableId/fields` | 建立 Field |
| PATCH | `/api/v1/tables/:tableId/fields/:fieldId` | 更新 Field |
| DELETE | `/api/v1/tables/:tableId/fields/:fieldId` | 刪除 Field |
| GET | `/api/v1/schemas/:id/wide-tables` | 寬表列表 |
| POST | `/api/v1/schemas/:id/wide-tables` | 建立寬表 |
| POST | `/api/v1/schemas/:id/wide-tables/preview` | 預覽 JOIN SQL |
| GET | `/api/v1/naming-dictionary` | 命名字典列表（`?domain=semiconductor`）|
| POST | `/api/v1/naming-dictionary` | 新增詞條 |
| PATCH | `/api/v1/naming-dictionary/:id` | 更新詞條 |
| DELETE | `/api/v1/naming-dictionary/:id` | 刪除詞條 |
| POST | `/api/v1/naming-dictionary/:id/suggest` | AI 建議定義與標籤 |
| POST | `/api/v1/naming-dictionary/check` | 批次欄位名稱檢查 |
| GET | `/api/v1/rules` | 規則設定列表（含 Skill 規則）|
| PATCH | `/api/v1/rules/:id` | 更新規則嚴重度 / 啟用狀態 |
| GET | `/api/v1/skills` | 已載入 Skill 清單（含 source 來源標記）|
| POST | `/api/v1/llm/generate` | AI 自然語言生成 Schema（SSE）|
| GET | `/api/v1/settings/llm` | 取得 LLM 設定（API Key 遮罩）|
| PATCH | `/api/v1/settings/llm` | 更新 LLM 設定 |
| POST | `/api/v1/settings/llm/test` | 測試 LLM 連線 |

---

## API 注意事項

### Request Body 使用 snake_case

API 的 **request body**（POST / PATCH）使用 `snake_case`，但 **response** 回傳 `camelCase`。這個設計讓 JSON 鍵與 SQL 欄位命名風格一致。

```bash
# ✅ 正確：建立欄位
curl -X POST /api/v1/tables/1/fields \
  -d '{"name":"lot_id","data_type":"VARCHAR(32)","nullable":false,"is_primary_key":true}'

# ✅ 正確：新增命名字典詞條
curl -X POST /api/v1/naming-dictionary \
  -d '{"concept":"在製品批次","std_name":"wip_lot_id","domain":"semiconductor"}'

# ❌ 錯誤：camelCase 會被 Zod 驗證拒絕
curl -X POST /api/v1/tables/1/fields \
  -d '{"name":"lot_id","dataType":"VARCHAR(32)"}'   # → 400 VALIDATION_ERROR
```

完整 request body 欄位對照：

| 功能 | snake_case 欄位 |
|------|----------------|
| 建立 / 更新 Field | `data_type`, `default_value`, `is_primary_key`, `is_unique` |
| 建立 / 更新 Naming 詞條 | `std_name`, `ai_description` |

### DDL 端點回傳純文字

`GET /api/v1/schemas/:id/ddl` 回傳 `text/plain`，不是 JSON。直接取用字串即可。

### Analyze 與 LLM Generate 為 SSE 串流

`POST /api/v1/schemas/:id/analyze` 和 `POST /api/v1/llm/generate` 回傳 `text/event-stream`。
每個事件格式：`data: {"type":"...", ...}\n\n`

事件類型：
- `issues` — 規則 + 命名問題清單（analyze 第一個事件）
- `token` — LLM 串流文字片段
- `done` — 完成（llm/generate 附帶 `schemaId`）
- `error` — 錯誤（含 LLM API Key 未設定）

---

## 開發指引

```bash
# 修改 packages/core 後必須重新建置
pnpm --filter @schema-studio/core build

# 型別檢查
pnpm typecheck

# 測試
pnpm test

# 單一套件
pnpm --filter @schema-studio/core test
```

**命名規範一覽**

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

---

## Docker 部署

適合離線環境或正式部署。所有操作（UI 互動、schema 修改、版本儲存）均自動持久化到 Docker Volume。

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

**資料持久化**

所有資料存在 named volume `app_data`，容器重建後資料不遺失：

```bash
# 查看 volume
docker volume inspect db-master_app_data

# 備份
docker run --rm -v db-master_app_data:/data -v $(pwd):/backup \
  alpine tar czf /backup/data-backup.tar.gz /data
```

**首次啟動**

容器首次執行時，`docker-entrypoint.sh` 會自動將 `data/ddl/` 與 `data/skills/` 的種子檔案複製到 volume，然後啟動 API server。
