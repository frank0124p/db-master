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
- [開發指引](#開發指引)

---

## 快速啟動

```bash
# 1. 安裝依賴
pnpm install

# 2. 建置共用套件
pnpm --filter @schema-studio/core build
pnpm --filter @schema-studio/ddl-parser build

# 3. 設定 API 環境變數
cp apps/api/.env.example apps/api/.env.local
# 編輯 apps/api/.env.local，填入 LLM API Key（可選）

# 4. 啟動 API（port 3005）
cd apps/api && node --import tsx/esm src/main.ts

# 5. 啟動前端（port 5173，另開終端）
cd apps/web && pnpm dev
```

瀏覽器開啟 [http://localhost:5173](http://localhost:5173)

> **Mock 模式**（不需要 API）：在 `apps/web/.env.local` 加入 `VITE_USE_MOCK=true`，可在不啟動後端的狀況下瀏覽 UI。

> **語言切換**：右上角可切換繁體中文 / English。

---

## 核心工作流程

### 方式一：放入 DDL 檔案（推薦初始匯入）

啟動時自動掃描 `data/ddl/` 目錄，將 `.sql` 匯入為 Schema。

```
data/ddl/
├── plm-core.sql          ← 啟動後自動建立「Plm Core」Schema
├── mes-process.sql       ← 啟動後自動建立「Mes Process」Schema
└── your-schema.sql       ← 加入你自己的 DDL
```

新增檔案後，按前端側邊欄的 **↺ 重新載入**（或呼叫 `POST /api/v1/reload`）即可套用，無需重啟。

### 方式二：透過 UI 操作

1. **手動建立**：側邊欄「+ 新建 Schema」→ 建立 Table / Field
2. **貼入 DDL**：Schema 編輯器「DDL」頁籤 → 編輯並套用，系統先跑語法 + 命名檢查，確認後再匯入

### 方式三：AI 自然語言生成

在 Schema 列表頁使用 AI 對話框描述需求（中文即可），系統生成符合命名字典的 Schema 草稿。

---

## 專案結構

```
DB Master/
├── apps/
│   ├── api/                     # Express + TypeScript API（port 3005）
│   │   └── src/
│   │       ├── main.ts          # 入口：路由掛載、DDL loader、Skills loader
│   │       ├── routes/          # HTTP 路由處理器
│   │       ├── repositories/    # 檔案 I/O 層（JSON 讀寫）
│   │       ├── services/        # 業務邏輯（llm、skills、ddl-loader）
│   │       ├── db/fileStore.ts  # 底層 JSON 讀寫 + ID 計數器
│   │       └── middleware/      # 統一錯誤處理
│   │
│   └── web/                     # Vite + React + TypeScript（port 5173）
│       └── src/
│           ├── App.tsx           # 路由 + 側邊欄
│           ├── api.ts            # API 客戶端（real / mock 切換）
│           ├── store.ts          # Zustand 全域狀態（schema、主題、語言）
│           ├── i18n.ts           # 繁中 / 英文字典
│           └── pages/
│               ├── SchemasPage.tsx          # Schema 列表 + AI 生成
│               ├── SchemaEditorPage.tsx     # 欄位編輯 + DDL + 版本儲存
│               ├── VersionHistoryPage.tsx   # 版本快照 + 逐欄位 Diff
│               ├── AnalysisPage.tsx         # AI 分析 + 規則檢查
│               ├── NamingPage.tsx           # 命名字典管理
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
├── scripts/                     # 一次性工具腳本
└── CLAUDE.md                    # Claude Code 開發規範
```

---

## 功能總覽

| 功能 | 說明 | 入口 |
|------|------|------|
| **DDL 自動匯入** | 放入 `.sql` → 啟動 / Reload 自動建立 Schema | `data/ddl/` |
| **Schema 編輯** | 手動管理 Table / Field，命名建議即時提示 | Schema 編輯器 |
| **DDL 編輯套用** | 直接編輯 DDL 文字，先檢查語法 + 命名，確認後匯入 | 編輯器 > DDL 頁籤 |
| **DDL 匯出** | 匯出 MariaDB / Oracle / ClickHouse 標準語句 | 編輯器 > DDL 頁籤 |
| **方言語法檢查** | 切換目標 DB 方言時自動檢查語法，即時顯示錯誤 / 警告 | 編輯器 > 方言選擇器 |
| **版本管理** | 儲存版本快照，含命名分數確認 + 版本備註 | 編輯器 > 儲存版本 |
| **版本 Diff** | 展開版本比較，逐欄位顯示屬性變更（型別、可空、預設值、備註等） | 版本歷史 |
| **AI 分析** | 規則檢查 + 命名比對 + LLM 建議（SSE 串流） | 分析 |
| **命名字典** | 管理標準欄位名 / 別名 / AI 建議定義；批次欄位名稱檢查 | 命名字典 |
| **ER 圖** | 自動生成 Mermaid ER 圖 | ER 圖 |
| **寬表建構** | 多表 JOIN 定義 + SQL VIEW 產生 + JOIN 關聯圖 | 寬表 |
| **規則設定** | 即時啟停規則、調整嚴重度、一鍵還原預設 | 規則 & Skills |
| **Skills 管理** | 查看已載入 Skill、展開說明、一鍵重新載入 | 規則 & Skills |
| **自訂規則** | 放入 `.md` Skill 檔案即可新增規則，無需重啟 | `data/skills/` |
| **語言切換** | 介面支援繁體中文 / English | 右上角 |
| **外部 LLM** | 支援 OpenRouter / Ollama 等 OpenAI 相容 API | `.env.local` |

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

### `data/ddl/` — 自動匯入 DDL

放入任何 `.sql` 檔案，啟動（或點擊 **↺ 重新載入**）後自動匯入：

- 檔名轉 Schema 名稱：`plm-core.sql` → `Plm Core`
- 重複匯入保護：以 mtime 追蹤，未修改的檔案不重複匯入
- 同名 Schema 已存在時更新而非重建
- 強制重新匯入：刪除 `data/_ddl-manifest.json` 後重啟

### `data/skills/` — 自訂規則 Skill

放入 `.md` 後點擊重新載入即生效。詳見[規則與 Skills](#規則與-skills)。

> 除 `data/ddl/` 與 `data/skills/` 之外，`data/` 下的執行期資料（schemas、naming、versions 等）不納入版本控制。

---

## LLM 設定

`apps/api/.env.local`：

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

不設定 LLM 時，Schema 編輯、命名字典、DDL 匯入等核心功能仍可正常使用；AI 分析與自然語言生成功能將不可用。

---

## API 端點

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/v1/schemas` | 列出所有 Schema |
| POST | `/api/v1/schemas` | 建立 Schema |
| GET | `/api/v1/schemas/:id` | 取得 Schema（含 Table / Field）|
| PATCH | `/api/v1/schemas/:id` | 更新 Schema |
| DELETE | `/api/v1/schemas/:id` | 刪除 Schema |
| GET | `/api/v1/schemas/:id/ddl` | 匯出 DDL（`?dialect=mariadb\|oracle\|clickhouse`）|
| POST | `/api/v1/schemas/:id/import-ddl` | 匯入 DDL（`dryRun: true` 先預覽）|
| POST | `/api/v1/schemas/:id/analyze` | AI 分析（SSE 串流）|
| POST | `/api/v1/schemas/:id/naming-check` | 命名一致性批次檢查 |
| GET | `/api/v1/schemas/:id/versions` | 版本列表 |
| POST | `/api/v1/schemas/:id/versions` | 儲存版本快照（`{ message? }`）|
| GET | `/api/v1/schemas/:id/versions/:vno` | 取得指定版本 |
| GET | `/api/v1/schemas/:id/wide-tables` | 寬表列表 |
| POST | `/api/v1/schemas/:id/wide-tables` | 建立寬表 |
| POST | `/api/v1/schemas/:id/wide-tables/preview` | 預覽 JOIN SQL |
| GET | `/api/v1/naming-dictionary` | 命名字典列表 |
| POST | `/api/v1/naming-dictionary` | 新增詞條 |
| PATCH | `/api/v1/naming-dictionary/:id` | 更新詞條 |
| DELETE | `/api/v1/naming-dictionary/:id` | 刪除詞條 |
| POST | `/api/v1/naming-dictionary/:id/suggest` | AI 建議定義與標籤 |
| POST | `/api/v1/naming-dictionary/check` | 批次欄位名稱檢查 |
| GET | `/api/v1/rules` | 規則設定列表（含 Skill 規則）|
| PATCH | `/api/v1/rules/:id` | 更新規則嚴重度 / 啟用狀態 |
| GET | `/api/v1/skills` | 已載入 Skill 清單 |
| POST | `/api/v1/llm/generate` | AI 自然語言生成 Schema（SSE）|
| POST | `/api/v1/reload` | 重新載入 DDL + Skills |

---

## 開發指引

```bash
# 修改 packages/core 後必須重新建置
pnpm --filter @schema-studio/core build

# 型別檢查
cd apps/api && npx tsc --noEmit
cd apps/web && npx tsc --noEmit

# 全專案型別檢查
pnpm typecheck

# 測試
pnpm test
```

**命名規範一覽**

| 層級 | 慣例 | 範例 |
|------|------|------|
| JSON 鍵 | camelCase | `stdName`, `fieldCount` |
| TypeScript 變數 / 函式 | camelCase | `parseDDL`, `usageCount` |
| TypeScript 型別 / 介面 | PascalCase | `SchemaTable`, `RuleResult` |
| API 路由 | kebab-case 複數 | `/naming-dictionary` |
| 檔名（TS）| kebab-case | `ddl-parser.ts` |
| React 元件 | PascalCase.tsx | `TableCard.tsx` |
| CSS 變數 | `--kebab-case` | `--bg-1`, `--accent` |

規則 ID 命名：內建 `naming.*` / `structure.*` / `semantic.*`；Skill 目錄 `skill.*`；使用者自訂 `user.*`
