# DB Master — Schema Studio

> 半導體製造業 DB Schema 設計與命名規範管理平台

針對 MES / 資料工程小型團隊（2–10 人）設計，核心理念：**讓每位工程師設計出的 Schema 都符合團隊命名慣例，並且第一天就可被同事讀懂。**

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
# 編輯 apps/api/.env.local，填入 LLM API Key

# 4. 啟動 API（port 3005）
cd apps/api
node --import tsx/esm src/main.ts

# 5. 啟動前端（port 5173，另開終端）
cd apps/web
pnpm dev
```

瀏覽器開啟 http://localhost:5173

> **Mock 模式**（不需要 API）：在 `apps/web/.env.local` 加入 `VITE_USE_MOCK=true`

---

## 核心工作流程

### 方式一：放入 DDL 檔案（推薦）

系統啟動時自動掃描 `data/ddl/` 目錄，將 `.sql` 檔案匯入為 Schema。

```
data/ddl/
├── plm-core.sql          ← 啟動後自動建立「Plm Core」Schema
├── mes-process.sql       ← 啟動後自動建立「Mes Process」Schema
└── your-schema.sql       ← 加入你自己的 DDL
```

新增檔案後，按前端側邊欄的 **↺ 重新載入** 按鈕（或呼叫 `POST /api/v1/reload`）。

### 方式二：透過系統 UI 操作

1. 前端「+ 新增 Schema」→ 手動建立 Table / Field
2. 或使用「匯入 DDL」頁面貼入 SQL 文字

### 方式三：AI 自然語言生成

在 Schema 列表頁使用 AI 對話框描述需求，系統自動生成 Schema 結構。

---

## 專案結構

```
DB Master/
├── apps/
│   ├── api/                     # Express + TypeScript API (port 3005)
│   │   ├── src/
│   │   │   ├── main.ts          # 入口：路由掛載、啟動 DDL loader + Skills loader
│   │   │   ├── routes/          # HTTP 路由
│   │   │   │   ├── schemas.ts   # GET/POST/PATCH/DELETE /schemas
│   │   │   │   ├── tables.ts    # /tables/:id
│   │   │   │   ├── fields.ts    # /tables/:id/fields
│   │   │   │   ├── versions.ts  # /schemas/:id/versions
│   │   │   │   ├── analyze.ts   # POST /schemas/:id/analyze (SSE)
│   │   │   │   ├── ddl.ts       # GET /schemas/:id/ddl
│   │   │   │   ├── import-ddl.ts# POST /schemas/:id/import-ddl
│   │   │   │   ├── naming.ts    # /naming-dictionary
│   │   │   │   ├── rules.ts     # GET/PATCH /rules（含 Skill 規則）
│   │   │   │   ├── skills.ts    # GET /skills（Skill 清單與元資料）
│   │   │   │   ├── wide-tables.ts
│   │   │   │   └── llm.ts       # POST /llm/generate (SSE)
│   │   │   ├── repositories/    # 檔案 I/O 層
│   │   │   │   ├── schemas.ts / tables.ts / fields.ts
│   │   │   │   ├── naming.ts / rules.ts
│   │   │   │   ├── versions.ts / wide-tables.ts
│   │   │   │   └── ddl-import.ts
│   │   │   ├── services/
│   │   │   │   ├── llm.ts       # LLM 抽象層（Anthropic / OpenAI 相容）
│   │   │   │   ├── skills.ts    # Skill 載入（內建 + 自訂）+ 規則解析
│   │   │   │   └── ddl-loader.ts# DDL 自動匯入服務
│   │   │   ├── db/
│   │   │   │   └── fileStore.ts # 底層 JSON 檔案讀寫 + ID 計數器
│   │   │   └── middleware/
│   │   │       └── error.ts     # 統一錯誤處理
│   │   └── .env.example
│   │
│   └── web/                     # Vite + React + TypeScript (port 5173)
│       └── src/
│           ├── App.tsx           # 路由 + 側邊欄
│           ├── api.ts            # API 客戶端（real / mock 切換）
│           ├── store.ts          # Zustand 全域狀態
│           ├── pages/
│           │   ├── SchemaEditorPage.tsx  # 欄位編輯器 + DDL 匯入 + 版本儲存
│           │   ├── AnalysisPage.tsx      # AI 分析 + 規則檢查
│           │   ├── NamingDictPage.tsx    # 命名字典管理
│           │   ├── VersionHistoryPage.tsx
│           │   ├── ErDiagramPage.tsx     # ER 圖 (Mermaid)
│           │   ├── WideTablePage.tsx     # 寬表 JOIN 建構器
│           │   └── RulesPage.tsx         # 規則設定 + Skills 管理
│           └── mock/             # Mock API（VITE_USE_MOCK=true）
│
├── packages/
│   ├── core/                    # 共用邏輯（前後端）
│   │   └── src/
│   │       ├── types.ts
│   │       ├── naming/matcher.ts  # 命名相似度比對（Levenshtein ≤2）
│   │       └── rules/
│   │           ├── engine.ts      # runRules()
│   │           └── built-in.ts    # 11 條內建規則
│   ├── ddl-parser/              # SQL DDL 解析器 parseDDL() / emitDDL()
│   └── eslint-config/
│
├── data/                        # 執行期資料（檔案資料庫，無需外部 DB）
│   ├── ddl/                     ← 放入 .sql 即自動匯入
│   │   ├── plm-core.sql
│   │   ├── mes-process.sql
│   │   └── mes_equipment.sql
│   └── skills/                  ← 放入 .md 即新增自訂規則
│       └── semiconductor-naming.md
│
├── skills/                      # 內建 Skill 知識庫（唯讀，隨專案版本控制）
│   ├── ddl-parser/SKILL.md
│   ├── naming-dictionary/SKILL.md
│   └── schema-design/SKILL.md   # 含 2 條內建 Skill 規則
├── prompts/                     # LLM 提示詞範本（runtime 讀取）
├── docs/SPEC.md                 # 功能規格書
└── CLAUDE.md                    # Claude Code 開發規範
```

---

## 功能總覽

| 功能 | 說明 | 入口 |
|------|------|------|
| **DDL 自動匯入** | 放入 `.sql` → 啟動/Reload 自動建立 Schema | `data/ddl/` |
| **Schema 編輯** | 手動管理 Table / Field / 資料型別，命名建議即時提示 | UI > Schema 編輯器 |
| **DDL 匯入** | 貼入 SQL 文字，dry-run 預覽後匯入 | UI > 匯入 DDL |
| **DDL 匯出** | 匯出 MariaDB / Oracle / ClickHouse 標準語句 | UI > DDL 頁籤 |
| **AI 分析** | 規則檢查 + 命名比對 + LLM 建議（SSE 串流） | UI > 分析 |
| **命名字典** | 管理標準欄位名 / 別名 / AI 建議定義 | UI > 命名字典 |
| **版本管理** | 儲存快照 + Diff 比較 | UI > 版本歷史 |
| **ER 圖** | 自動生成 Mermaid ER 圖 | UI > ER 圖 |
| **寬表建構** | 多表 JOIN 定義 + SQL VIEW 產生 + JOIN 關聯圖 | UI > 寬表 |
| **規則設定** | 即時啟用/停用規則、調整嚴重度、一鍵還原預設 | UI > 規則 & Skills |
| **Skills 管理** | 查看已載入 Skill、展開說明、一鍵重新載入 | UI > 規則 & Skills |
| **自訂規則** | 放入 `.md` Skill 檔案即可新增規則，無需重啟 | `data/skills/` |
| **外部 LLM** | 支援 OpenRouter / Ollama 等相容 API | `.env.local` |

---

## 規則與 Skills

### 內建規則（11 條）

規則分三組，可在「**規則 & Skills**」頁面即時調整：

| 分組 | 規則 ID | 預設嚴重度 | 說明 |
|------|---------|-----------|------|
| 命名 | `naming.snake_case` | error | 欄位名必須為 snake_case |
| 命名 | `naming.reserved_words` | error | 不可使用 SQL 保留字 |
| 命名 | `naming.max_length` | warning | 名稱不超過設定長度（預設 64） |
| 命名 | `naming.table_singular` | warning | Table 名建議用複數 |
| 命名 | `naming.fk_convention` | warning | FK 欄位應遵循 `{table}_id` 命名 |
| 語意 | `semantic.field_comment` | warning | 欄位應有 COMMENT |
| 語意 | `semantic.table_comment` | info | Table 應有 COMMENT |
| 語意 | `semantic.blob_needs_comment` | warning | TEXT/BLOB 欄位必須有 COMMENT |
| 結構 | `structure.has_primary_key` | error | Table 必須有 Primary Key |
| 結構 | `structure.timestamp_columns` | warning | 應有 created_at / updated_at |
| 結構 | `structure.no_double_underscore` | warning | 名稱不可含雙底線 |

### Skill 規則（自動從 skills/ 與 data/skills/ 載入）

目前已載入的 Skill 規則（來自 `skills/schema-design/SKILL.md` 與 `data/skills/`）：

| Skill | 規則 ID | 說明 |
|-------|---------|------|
| schema-design | `skill.no_generic_name_field` | 禁用 `name`、`type`、`status` 等通用欄位名 |
| Semiconductor Naming Rules | `user.semi.lot_id_in_process_tables` | 製程相關 Table 必須有 `lot_id` |
| Semiconductor Naming Rules | `user.semi.equip_id_required` | 設備相關 Table 必須有 `equip_id` |
| Semiconductor Naming Rules | `user.semi.no_status_field` | 禁用 `status` 欄位（應用更具體名稱） |

### 新增自訂規則

在 `data/skills/` 新增 `.md` 檔案，格式如下：

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

新增後在 UI「規則 & Skills > Skills」頁點擊「↺ 重新載入」即生效，**無需重啟伺服器**。

---

## 資料目錄說明

### `data/ddl/` — 自動匯入 DDL

放入任何 `.sql` 檔案，下次啟動（或點擊 **↺ 重新載入**）自動匯入：

- 檔名轉 Schema 名稱：`plm-core.sql` → `Plm Core`
- 重複匯入保護：追蹤 mtime，未修改的檔案不重複匯入
- 同名 Schema 已存在時：更新而非重建

### `data/skills/` — 自訂規則 Skill

放入 `.md` 檔案後點擊重新載入即生效。詳見[規則與 Skills](#規則與-skills) 章節。

> `data/` 目錄下的執行期資料（schemas、naming、versions 等）不納入版本控制。

---

## LLM 設定

`apps/api/.env.local`：

```bash
# Anthropic Claude（預設）
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...

# OpenRouter
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

---

## API 端點

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/v1/schemas` | 列出所有 Schema |
| POST | `/api/v1/schemas` | 建立 Schema |
| GET | `/api/v1/schemas/:id` | 取得 Schema（含 Table/Field） |
| PATCH | `/api/v1/schemas/:id` | 更新 Schema |
| DELETE | `/api/v1/schemas/:id` | 刪除 Schema |
| GET | `/api/v1/schemas/:id/ddl` | 匯出 DDL |
| POST | `/api/v1/schemas/:id/import-ddl` | 匯入 DDL（`dryRun: true/false`） |
| POST | `/api/v1/schemas/:id/analyze` | AI 分析（SSE） |
| POST | `/api/v1/schemas/:id/naming-check` | 命名一致性批次檢查 |
| GET | `/api/v1/schemas/:id/versions` | 版本列表 |
| POST | `/api/v1/schemas/:id/versions` | 儲存版本快照 |
| GET | `/api/v1/schemas/:id/versions/:vno` | 取得指定版本 |
| GET | `/api/v1/schemas/:id/wide-tables` | 寬表列表 |
| POST | `/api/v1/schemas/:id/wide-tables` | 建立寬表 |
| POST | `/api/v1/schemas/:id/wide-tables/preview` | 預覽 JOIN |
| GET | `/api/v1/naming-dictionary` | 命名字典列表 |
| POST | `/api/v1/naming-dictionary` | 新增詞條 |
| PATCH | `/api/v1/naming-dictionary/:id` | 更新詞條 |
| DELETE | `/api/v1/naming-dictionary/:id` | 刪除詞條 |
| POST | `/api/v1/naming-dictionary/:id/suggest` | AI 建議定義與標籤 |
| POST | `/api/v1/naming-dictionary/check` | 批次欄位名稱檢查 |
| GET | `/api/v1/rules` | 規則設定列表（含 Skill 規則與 source 欄位） |
| PATCH | `/api/v1/rules/:id` | 更新規則嚴重度/啟用（支援 Skill 規則） |
| GET | `/api/v1/skills` | 已載入 Skill 清單（含 source: built-in/user） |
| POST | `/api/v1/llm/generate` | AI 自然語言生成 Schema（SSE） |
| POST | `/api/v1/reload` | 重新載入 DDL + Skills |

---

## 開發指引

```bash
# 修改 packages/core 後必須重新建置
pnpm --filter @schema-studio/core build

# 型別檢查
pnpm --filter @schema-studio/api typecheck
pnpm --filter @schema-studio/web typecheck
```

**規則 ID 命名慣例**：內建 `naming.*` / `structure.*` / `semantic.*`；Skills 目錄 `skill.*`；使用者自訂 `user.*`
