# DB Master — Schema Studio

> 半導體製造業 DB Schema 設計與命名規範管理平台

針對 MES / 資料工程小型團隊（2–10 人）設計，核心理念：**讓每位工程師設計出的 Schema 都符合團隊命名慣例，並且第一天就可被同事讀懂。**

---

## 目錄

- [快速啟動](#快速啟動)
- [核心工作流程](#核心工作流程)
- [專案結構](#專案結構)
- [功能總覽](#功能總覽)
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
│   │   │   │   ├── rules.ts     # /rules
│   │   │   │   ├── wide-tables.ts
│   │   │   │   └── llm.ts       # POST /llm/generate (SSE)
│   │   │   ├── repositories/    # 檔案 I/O 層（取代 ORM）
│   │   │   │   ├── schemas.ts / tables.ts / fields.ts
│   │   │   │   ├── naming.ts / rules.ts
│   │   │   │   ├── versions.ts / wide-tables.ts
│   │   │   │   └── ddl-import.ts
│   │   │   ├── services/
│   │   │   │   ├── llm.ts       # LLM 抽象層（Anthropic / OpenAI 相容）
│   │   │   │   ├── skills.ts    # Skill 檔案載入 + 規則解析
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
│           │   ├── SchemaEditorPage.tsx # 欄位編輯器 + DDL 匯入 + 版本儲存
│           │   ├── AnalysisPage.tsx     # AI 分析 + 規則檢查
│           │   ├── NamingDictPage.tsx   # 命名字典管理
│           │   ├── VersionHistoryPage.tsx
│           │   ├── ErDiagramPage.tsx    # ER 圖 (Mermaid)
│           │   └── WideTablePage.tsx    # 寬表 JOIN 建構器
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
├── data/                        # 執行期資料（檔案資料庫，無需 MariaDB）
│   ├── _counters.json           # 自動遞增 ID 計數器
│   ├── _index.json              # 反向查詢索引
│   ├── _ddl-manifest.json       # DDL 匯入狀態追蹤
│   ├── ddl/                     ← 放入 .sql 即自動匯入
│   │   ├── plm-core.sql
│   │   ├── mes-process.sql
│   │   └── test-quality.sql     ← 測試用（品質管理）
│   ├── schemas/{id}/            # meta.json + tables/ + versions/ + wide-tables/
│   ├── naming/                  # 命名字典條目
│   ├── rules/overrides.json     # 規則嚴重度覆蓋
│   └── skills/                  ← 放入 .md 即新增自訂規則
│       └── semiconductor-naming.md
│
├── skills/                      # 內建 Skill 知識庫（唯讀）
├── prompts/                     # LLM 提示詞範本（runtime 讀取）
├── docs/SPEC.md                 # 功能規格書
└── CLAUDE.md                    # Claude Code 開發規範
```

---

## 功能總覽

| 功能 | 說明 | 入口 |
|------|------|------|
| **DDL 自動匯入** | 放入 `.sql` → 啟動/Reload 自動建立 Schema | `data/ddl/` |
| **Schema 編輯** | 手動管理 Table / Field / 資料型別 | UI > Schema 頁 |
| **DDL 匯入** | 貼入 SQL 文字，dry-run 預覽後匯入 | UI > 匯入 DDL |
| **DDL 匯出** | 匯出標準 CREATE TABLE 語句 | UI > DDL 頁籤 |
| **AI 分析** | 規則檢查 + 命名比對 + LLM 建議（SSE） | UI > 分析頁 |
| **命名字典** | 管理標準欄位名 / 別名 / AI 建議定義 | UI > 命名字典 |
| **命名檢查** | 批次比對 Schema 欄位與字典 | UI > 命名一致性 |
| **版本管理** | 儲存快照 + Diff 比較 | UI > 版本歷史 |
| **ER 圖** | 自動生成 Mermaid ER 圖 | UI > ER 圖 |
| **寬表建構** | 多表 JOIN 定義 + SQL VIEW 產生 | UI > 寬表 |
| **自訂規則** | 放入 `.md` Skill 檔案即可新增規則 | `data/skills/` |
| **外部 LLM** | 支援 OpenRouter / Ollama 等相容 API | `.env.local` |

---

## 資料目錄說明

### `data/ddl/` — 自動匯入 DDL

放入任何 `.sql` 檔案，下次啟動（或點擊 **↺ 重新載入**）自動匯入：

- 檔名轉 Schema 名稱：`plm-core.sql` → `Plm Core`
- 重複匯入保護：追蹤 mtime，未修改的檔案不重複匯入
- 同名 Schema 已存在時：更新而非重建

### `data/skills/` — 自訂規則 Skill

新增 `.md` 檔案定義自訂規則：

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
  appliesTo: 含製程
\`\`\`
```

支援：`requiredFields`、`forbiddenFields`、`fieldPattern`（regex）、`tablePattern`（套用條件）

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
| GET | `/api/v1/rules` | 規則設定列表 |
| PATCH | `/api/v1/rules/:id` | 更新規則嚴重度/啟用 |
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

**規則 ID 命名慣例**：內建 `naming.*` / `structure.*` / `semantic.*`；Skill 內建 `skill.*`；使用者自訂 `user.*`
