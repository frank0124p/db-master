# DB Master — 開發者手冊

> **適用對象**：剛加入本專案的新成員，包含剛畢業的工程師。  
> 本文件說明整個系統的架構、資料流、以及如何在各層新增功能。

---

## 目錄

1. [系統簡介](#1-系統簡介)
2. [本地環境設定](#2-本地環境設定)
3. [目錄結構](#3-目錄結構)
4. [技術選型說明](#4-技術選型說明)
5. [資料庫設計](#5-資料庫設計)
6. [後端架構詳解](#6-後端架構詳解)
7. [前端架構詳解](#7-前端架構詳解)
8. [共用套件說明](#8-共用套件說明)
9. [重要功能模組說明](#9-重要功能模組說明)
10. [實作演練：新增一個完整功能](#10-實作演練新增一個完整功能)
11. [命名規範速查](#11-命名規範速查)
12. [常見問題與排錯](#12-常見問題與排錯)

---

## 1. 系統簡介

DB Master（對外名稱：Schema Studio）是一套**資料庫 Schema 設計與稽核平台**，主要用於半導體產業的 PLM/MES 系統開發。

### 核心功能

| 功能 | 說明 |
|------|------|
| Schema Editor | 視覺化建立和編輯資料表與欄位 |
| DDL 匯入 | 貼入 `CREATE TABLE` SQL，自動解析並匯入 |
| 命名字典 | 維護標準欄位名稱，對非標準命名即時提示 |
| 規則引擎 | 自動檢查 snake_case、保留字、缺少 comment 等問題 |
| Wide Table | 將多張表透過 FK 關係組合成一張寬表（`CREATE VIEW`） |
| 版本管理 | 對 Schema 做快照版本，並比較 diff |
| AI 分析 | 透過 Anthropic Claude 提供語意層分析建議 |

### 系統架構圖

```
瀏覽器
  │
  │  HTTP (port 3005)
  ▼
┌─────────────────────────────────────────┐
│           Express + Vite (apps/api)     │
│                                         │
│  /api/v1/*  ──►  Routes ──►  Repo ──► MariaDB
│                                         │
│  /*  ──►  Vite middleware (dev)         │
│           static files (prod)           │
└─────────────────────────────────────────┘
         ▲
         │ imports
┌────────┴──────────────────┐
│  packages/core            │  型別定義、規則引擎、命名比對
│  packages/ddl-parser      │  SQL 解析器
└───────────────────────────┘
```

**重點：前後端共用同一個 port（3005）。** 在 dev 模式下，Express 把所有非 API 請求轉給 Vite Dev Server 處理。這樣不需要跨域（CORS），也不用 proxy 設定。

---

## 2. 本地環境設定

### 前置需求

- Node.js ≥ 20
- pnpm ≥ 9（`npm install -g pnpm`）
- Docker（用於啟動 MariaDB）

### 步驟一：啟動資料庫

```bash
cd "/Users/xingchen/Claude/DB Master"
docker compose up -d   # 啟動 MariaDB（port 3306）+ Adminer（port 8080）
```

可用 `http://localhost:8080` 開啟 Adminer 查看資料庫內容。

### 步驟二：設定環境變數

```bash
cp apps/api/.env.example apps/api/.env.local
# 依照實際值填寫 DB_HOST、DB_USER、DB_PASS、DB_NAME
```

`.env.local` 已在 `.gitignore` 中，不會被 commit。

### 步驟三：安裝套件與建置

```bash
pnpm install          # 安裝所有 workspace 套件
pnpm --filter @schema-studio/ddl-parser build   # 建置 DDL 解析器
pnpm --filter @schema-studio/core build         # 建置核心套件
```

> **為何要先 build packages？**  
> `apps/api` 和 `apps/web` 都 import 這兩個 packages 的 `dist/` 目錄。在 dev 模式下，`tsx` 可以直接執行 TypeScript 來繞過這個問題，但 TypeScript 型別檢查（`tsc --noEmit`）還是需要 `dist/` 存在。

### 步驟四：執行資料庫 migration

```bash
cd apps/api
node --import tsx/esm src/db/migrate.ts
```

這個指令會讀取 `db/migrations/*.sql`，依序執行還沒跑過的 migration，並記錄在 `schema_migrations` 表中。

### 步驟五：啟動開發伺服器

```bash
node --import tsx/esm src/main.ts
# 或
pnpm dev   # 在 apps/api 目錄下
```

開啟 `http://localhost:3005` 即可看到 UI。

---

## 3. 目錄結構

```
DB Master/
├── apps/
│   ├── api/                     ← Express 後端
│   │   ├── src/
│   │   │   ├── main.ts          ← 程式進入點，route 掛載在這裡
│   │   │   ├── db/
│   │   │   │   ├── pool.ts      ← MariaDB 連線池（singleton）
│   │   │   │   ├── migrate.ts   ← 執行 SQL migration 的腳本
│   │   │   │   └── seed.ts      ← 初始資料
│   │   │   ├── middleware/
│   │   │   │   └── error.ts     ← 統一 error response 格式
│   │   │   ├── routes/          ← HTTP 路由（一檔一資源）
│   │   │   │   ├── schemas.ts
│   │   │   │   ├── tables.ts
│   │   │   │   ├── fields.ts
│   │   │   │   ├── naming.ts
│   │   │   │   ├── versions.ts
│   │   │   │   ├── ddl.ts
│   │   │   │   ├── analyze.ts
│   │   │   │   ├── wide-tables.ts
│   │   │   │   ├── import-ddl.ts
│   │   │   │   └── rules.ts
│   │   │   ├── repositories/    ← 資料存取層（直接寫 SQL）
│   │   │   │   ├── schemas.ts
│   │   │   │   ├── tables.ts
│   │   │   │   ├── fields.ts
│   │   │   │   ├── naming.ts
│   │   │   │   ├── versions.ts
│   │   │   │   ├── rules.ts
│   │   │   │   ├── ddl-import.ts
│   │   │   │   └── wide-tables.ts
│   │   │   └── services/
│   │   │       └── llm.ts       ← 所有 Anthropic API 呼叫集中在此
│   │   └── .env.local           ← ⚠ 不 commit，含 DB 密碼和 API key
│   │
│   └── web/                     ← React 前端
│       └── src/
│           ├── main.tsx         ← React 程式進入點
│           ├── App.tsx          ← 根元件：導覽列 + Sidebar + 頁面切換
│           ├── store.ts         ← 全域 UI 狀態（Zustand）
│           ├── api.ts           ← 所有 fetch 呼叫集中在此
│           └── pages/           ← 每個頁面一個檔案
│               ├── SchemaEditorPage.tsx   ← 最複雜的頁面
│               ├── NamingDictPage.tsx
│               ├── VersionHistoryPage.tsx
│               ├── WideTablePage.tsx
│               ├── AnalysisPage.tsx
│               └── ErDiagramPage.tsx
│
├── packages/
│   ├── core/                    ← 前後端共用的型別與邏輯
│   │   └── src/
│   │       ├── index.ts         ← 統一 re-export
│   │       ├── types.ts         ← Zod schema + TypeScript 型別
│   │       ├── rules/
│   │       │   ├── engine.ts    ← 規則執行引擎
│   │       │   └── built-in.ts  ← 內建規則 9 條
│   │       └── naming/
│   │           ├── matcher.ts   ← 欄位名稱比對（exact/alias/fuzzy）
│   │           └── levenshtein.ts ← 編輯距離演算法
│   │
│   └── ddl-parser/              ← SQL 解析器（純 TS，無相依）
│       └── src/
│           └── index.ts         ← parseDDL() 主函式
│
├── db/
│   ├── migrations/              ← 001~009 個 .sql 檔，按序執行
│   └── seed/                    ← 示範資料腳本
│
├── docker-compose.yml           ← MariaDB + Adminer
└── pnpm-workspace.yaml          ← 定義 workspace 成員
```

---

## 4. 技術選型說明

### 為何不用 ORM？

整個產品的核心是「Schema 設計」，ORM 本身也有一套 schema 定義（model class / decorator），這會造成「用 ORM 管理的 schema 來設計 DB schema」的雙層混淆。因此明確選擇**直接寫 SQL**，讓資料庫操作保持透明可讀。

### 為何前後端用同一個 Port？

開發體驗考量：消除 CORS 設定、不需要在前端 `vite.config.ts` 設 proxy，部署時也只需要管理一個 process。

### 為何用 Zod？

TypeScript 的型別只在編譯期有效，運行期（尤其是 HTTP request body 和資料庫回傳值）完全不受保護。Zod 讓我們在運行期也能驗證資料結構，且型別定義只寫一次（`z.object(...)` 自動推導出 `TypeScript type`）。

---

## 5. 資料庫設計

### 表格關係

```
schemas (1)
  └── tables (N)
        └── fields (N)

schemas (1)
  └── schema_versions (N)   ← 版本快照

schemas (1)
  └── wide_tables (N)
        ├── wide_table_sources (N)   ← 參與 JOIN 的表
        └── wide_table_columns (N)  ← 輸出欄位對應

naming_dictionary (獨立)   ← 不與 schemas 關聯，全局共用

rules (獨立)               ← 規則設定，全局共用
```

### 通用欄位規範

每一張表都必須有：

```sql
`id`         BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY
`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
`updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

軟刪除（soft delete）的表再加：

```sql
`deleted_at` TIMESTAMP NULL DEFAULT NULL
```

查詢時必須加 `WHERE deleted_at IS NULL`。

### Migration 規則

- 每個 migration 是一個獨立的 `.sql` 檔案，名稱格式：`NNN_描述.sql`（如 `009_update_rules.sql`）
- **Migration 一旦 commit，就不能修改**。需要修改就寫新的 migration
- `schema_migrations` 表記錄哪些已執行，下次只跑新的

---

## 6. 後端架構詳解

### 請求流程

```
HTTP Request
    │
    ▼
main.ts (Express)
    │  app.use("/api/v1/schemas", schemasRouter)
    ▼
routes/schemas.ts
    │  const input = CreateSchemaInput.parse(req.body)  ← Zod 驗證
    │  await repo.createSchema(input)                    ← 呼叫 repository
    ▼
repositories/schemas.ts
    │  const pool = getPool()
    │  await pool.query("INSERT INTO schemas ...", [name, ...])
    │  return SchemaRowSchema.parse(result)              ← Zod 驗證回傳值
    ▼
HTTP Response (JSON)
```

### 連線池（`apps/api/src/db/pool.ts`）

```typescript
let _pool: mariadb.Pool | null = null;

export function getPool(): mariadb.Pool {
  if (!_pool) {
    _pool = mariadb.createPool({ ... });  // 只建立一次（singleton）
  }
  return _pool;
}
```

**重要**：`getPool()` 使用 Singleton 模式。連線池在第一次呼叫時建立，之後都回傳同一個 instance。每個 repository function 在函式最頂層呼叫 `getPool()`，不需要（也不應該）自己管理連線的開關。

### 統一錯誤處理（`apps/api/src/middleware/error.ts`）

所有 route handler 都遵循這個模式：

```typescript
router.get("/", async (_req, res, next) => {
  try {
    res.json(await repo.listSchemas());
  } catch (e) {
    next(e);   // 把錯誤丟給 error middleware
  }
});
```

`error.ts` 中間件會依照錯誤類型回傳對應的 HTTP status：

| 錯誤類型 | HTTP Status | 說明 |
|----------|-------------|------|
| `ZodError` | 400 | 請求格式錯誤 |
| `NotFoundError` | 404 | 資源不存在 |
| `ValidationError` | 400 | 業務邏輯驗證失敗 |
| 其他 | 500 | 未預期的伺服器錯誤 |

Response 格式統一為：
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "schemas not found: 99"
  }
}
```

### Repository 層的 BigInt 問題

MariaDB 的 `BIGINT` 欄位在 Node.js 中會回傳 JavaScript 的 `BigInt` 型別（如 `3n`），而非一般的 `number`。這會導致 `Map<number, ...>` 的 key 無法比對。

**解決方案**：所有從 DB 讀出的 id 都用 Zod 的 `z.coerce.number()` 轉換：

```typescript
const TableRow = z.object({
  id: z.coerce.number(),   // ← BigInt → number
  schema_id: z.coerce.number(),
  ...
});
```

或在直接使用時：`const id = Number(result.insertId);`

---

## 7. 前端架構詳解

### 狀態管理分層

| 狀態類型 | 工具 | 說明 |
|----------|------|------|
| **伺服器資料**（schemas、tables、fields...） | TanStack Query | 自動快取、背景重新整理 |
| **UI 狀態**（目前頁面、選中的 schema/table） | Zustand (`store.ts`) | 簡單全域狀態 |
| **元件本地狀態**（input 值、modal 開關） | React `useState` | 只有該元件需要的狀態 |

### TanStack Query 使用模式

```typescript
// 讀取資料：useQuery
const { data: schema } = useQuery({
  queryKey: ["schema", selectedSchemaId],   // ← key 唯一識別這份資料
  queryFn: () => api.schemas.get(selectedSchemaId!),
  enabled: selectedSchemaId !== null,        // ← 條件控制是否執行
});

// 修改後讓快取失效（自動重新 fetch）
const qc = useQueryClient();
function refresh() {
  void qc.invalidateQueries({ queryKey: ["schema", selectedSchemaId] });
}
```

**規則**：修改資料（POST/PATCH/DELETE）後，一律呼叫 `qc.invalidateQueries(...)` 讓對應的 cache 失效，讓 UI 自動更新。

### API Client（`apps/web/src/api.ts`）

所有 HTTP 呼叫集中在 `api.ts`，頁面元件**不應該**直接呼叫 `fetch()`。

```typescript
// api.ts 裡的統一 fetch 函式
async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error?.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// 在元件中使用
const schema = await api.schemas.get(5);
await api.tables.create(schemaId, { name: "parts" });
```

### 全域狀態（`apps/web/src/store.ts`）

```typescript
// 使用方式
const { selectedSchemaId, setSelectedSchemaId, showToast } = useStore();

// Toast 通知（2.5 秒後自動消失）
showToast("✓ 儲存成功");
```

### 樣式系統

本專案使用**純 inline style + CSS variables**，不使用 UI component library 或 CSS-in-JS。

CSS 變數定義在 `apps/web/src/main.tsx` 的 `<style>` tag 中：

```css
:root {
  --bg-1: #0f1117;    /* 最深背景 */
  --bg-2: #1a1d27;    /* 側欄背景 */
  --bg-3: #22263a;    /* 卡片背景 */
  --bg-4: #2a2f45;    /* 輸入框背景 */
  --accent: #6c8ef7;  /* 主色 */
  --text-1: #e8eaf0;  /* 主要文字 */
  --text-2: #9ba3c0;  /* 次要文字 */
  --text-3: #5a6280;  /* 說明文字 */
  --success: #4ade80;
  --warning: #fbbf24;
  --info: #60a5fa;
}
```

常用的 CSS class（定義在 `App.tsx` 內嵌 `<style>`）：

```
.btn           基本按鈕樣式
.btn-primary   強調按鈕（藍色背景）
.btn-ghost     次要按鈕（透明背景）
.icon-btn      小圖示按鈕
.form-input    輸入框
.panel-title   側欄標題文字
```

---

## 8. 共用套件說明

### `packages/core`

存放前後端都需要用的型別、驗證邏輯和演算法。

**重要限制**：此套件**不能**使用 `fetch`、`fs`、`process.env` 等 Node.js 或瀏覽器特有的 API，因為它同時被兩端引用。

**主要輸出**：

```typescript
// 型別（來自 types.ts）
import { SchemaRowSchema, TableRowSchema, FieldRowSchema } from "@schema-studio/core";

// 規則引擎（來自 rules/）
import { runRules, BUILT_IN_RULES } from "@schema-studio/core";

// 命名比對（來自 naming/）
import { checkFieldName, checkFieldNames } from "@schema-studio/core";
```

### `packages/ddl-parser`

純 SQL 解析器，將 `CREATE TABLE` 語法轉成結構化資料。

```typescript
import { parseDDL } from "@schema-studio/ddl-parser";

const result = parseDDL(`
  CREATE TABLE \`parts\` (
    \`id\` BIGINT NOT NULL AUTO_INCREMENT,
    \`part_no\` VARCHAR(32) NOT NULL COMMENT '料號',
    PRIMARY KEY (\`id\`)
  ) COMMENT='零件主表';
`);

// result.tables[0] = {
//   name: "parts",
//   comment: "零件主表",
//   fields: [
//     { name: "id", dataType: "BIGINT", isPrimaryKey: true, ... },
//     { name: "part_no", dataType: "VARCHAR(32)", comment: "料號", ... }
//   ]
// }
// result.errors = []  ← 解析失敗的語句清單
```

**修改套件後記得重新 build**：
```bash
pnpm --filter @schema-studio/ddl-parser build
pnpm --filter @schema-studio/core build
```

---

## 9. 重要功能模組說明

### 9.1 規則引擎（Rule Engine）

規則引擎採用「插件化設計」：每個規則是一個獨立的物件，符合 `RuleDefinition` 介面。

```typescript
// packages/core/src/rules/engine.ts

interface RuleDefinition {
  id: string;                      // 唯一識別，格式：group.name
  group: "naming" | "semantic" | "structure";
  defaultSeverity: "error" | "warning" | "info";
  check(
    table: TableContext,           // 整張表的資訊
    field: FieldContext | null,    // null = 這是「表層級」的檢查
    config: RuleConfig,            // 使用者設定的參數
  ): RuleViolation[];
}
```

**執行流程**：

```
runRules(tables, rules, settingsMap)
  │
  ├── for each table:
  │     ├── for each rule:
  │     │     ├── 查 settingsMap 看是否被停用
  │     │     ├── rule.check(table, null, config)  ← 表層級檢查
  │     │     └── for each field:
  │     │           └── rule.check(table, field, config)  ← 欄位層級檢查
  │     └── ...
  │
  └── 回傳 CheckResult { violations, byGroup, summary }
```

**範例：新增一個規則**

```typescript
// 在 packages/core/src/rules/built-in.ts 中新增

const noLeadingUnderscore: RuleDefinition = {
  id: "naming.no_leading_underscore",
  group: "naming",
  defaultSeverity: "error",
  description: "Names must not start with underscore",
  defaultConfig: {},
  check(table, field) {
    const name = field ? field.name : table.name;
    if (name.startsWith("_")) {
      return [{
        ruleId: "naming.no_leading_underscore",
        severity: "error",
        message: `"${name}" starts with underscore`,
        tableName: table.name,
        ...(field ? { fieldName: field.name } : {}),
      }];
    }
    return [];
  },
};

// 加入 BUILT_IN_RULES 陣列
export const BUILT_IN_RULES: RuleDefinition[] = [
  ...,
  noLeadingUnderscore,   // ← 加在這裡
];
```

然後在 `db/migrations/` 新增一個 migration 把這條規則 INSERT 到 `rules` 表中。

### 9.2 DDL 解析器（DDL Parser）

解析器的核心邏輯分五層：

```
parseDDL(sql)
  │
  ├── 1. 清理：移除 -- 和 /* */ 註解
  │
  ├── 2. splitStatements：以 ; 分割，但跳過字串內的 ;
  │         "SELECT 'a;b'" → 不在 ; 處切
  │
  ├── 3. for each CREATE TABLE statement:
  │     │
  │     ├── 4. parseCreateTable：
  │     │     ├── 取出 table name（支援反引號/雙引號）
  │     │     ├── findMatchingParen：找到對應的 ) 位置
  │     │     ├── splitClauses：依 , 分割欄位定義（跳過括號內的 ,）
  │     │     │     例：DECIMAL(10, 2) 中的逗號不切
  │     │     ├── 第一輪：收集 PRIMARY KEY、UNIQUE KEY constraint
  │     │     └── 第二輪：parseColumnClause 解析每個欄位
  │     │
  │     └── 5. parseColumnClause：
  │           ├── extractDataType → VARCHAR(32)、DECIMAL(10,2)
  │           ├── 檢測 NOT NULL、AUTO_INCREMENT、PRIMARY KEY、UNIQUE
  │           ├── extractDefault → DEFAULT 'value' 或 DEFAULT 0
  │           └── extractComment → COMMENT '...' 或 COMMENT='...'
  │
  └── 回傳 { tables: ParsedTable[], errors: string[] }
```

### 9.3 命名比對（Naming Matcher）

比對分三個層級，依序判斷：

```
checkFieldName("lot_number", entries)
  │
  ├── 1. exact：直接比對 stdName（不分大小寫）
  │     "lot_id" === "lot_id" → { status: "exact" }
  │
  ├── 2. alias：比對 aliases 陣列
  │     "lot_number" in ["lot_number", "lot_no"] → { status: "alias", stdName: "lot_id" }
  │     （提示使用者改為標準名稱）
  │
  └── 3. fuzzy：Levenshtein 編輯距離 ≤ 3
        levenshtein("lt_id", "lot_id") = 1 → { status: "fuzzy", stdName: "lot_id" }
        （提示「可能是...？」）
        
        如果都沒有 → { status: "unknown" }
        （提示「未登錄命名字典」）
```

**Levenshtein 距離**是衡量兩個字串「需要幾次插入/刪除/替換」才能互相轉換。距離 ≤ 3 表示差異不大，很可能是同一個概念的不同拼法。

### 9.4 FK 圖與寬表組合（Wide Table）

當使用者選擇多張表要組成寬表時，系統自動推斷 JOIN 關係：

```
buildFkEdges(tables, fieldsByTable)
  │
  │  對每個欄位名稱 field（例如 bom_id）去掉 _id 後綴得到 stem（bom）
  │  然後找哪張表的名稱可以對應到這個 stem：
  │
  ├── exact：stem === tableName          → confidence 1.0
  │     "lot_id" stem "lot" === "lot"
  │
  ├── plural：stem + "s" === tableName  → confidence 0.95
  │     "part_id" stem "part" + "s" === "parts"
  │
  └── prefix：tableName.startsWith(stem + "_") → confidence 0.7
        "bom_id" stem "bom" → "bom_headers".startsWith("bom_")  ✓
```

找出所有 FK 邊後，用 **BFS（廣度優先搜尋）** 決定 JOIN 順序：

```
autoComposeOrder(tables, fieldsByTable)
  │
  ├── 計算每張表的「入度」（有幾張表的 FK 指向它）
  │     parts: 被 part_revisions、bom_headers、asl 引用 → 入度 3
  │     part_revisions: 沒被任何表引用 → 入度 0
  │
  ├── 選入度最高的表當 BASE（= 第一張被 FROM 的表）
  │
  └── BFS 從 BASE 出發，按 FK 關係擴展：
        BASE (parts)
          ├── INNER JOIN part_revisions ON ...
          ├── LEFT JOIN asl ON ...
          └── LEFT JOIN bom_headers ON ...
```

---

## 10. 實作演練：新增一個完整功能

假設要新增「標籤（Tags）管理」功能，允許對每張 table 加上標籤。

### Step 1：新增 DB Migration

建立 `db/migrations/010_create_table_tags.sql`：

```sql
CREATE TABLE IF NOT EXISTS `table_tags` (
  `id`       BIGINT NOT NULL AUTO_INCREMENT,
  `table_id` BIGINT NOT NULL,
  `tag`      VARCHAR(64) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_table_tags_table_tag` (`table_id`, `tag`),
  CONSTRAINT `fk_table_tags_table` FOREIGN KEY (`table_id`)
    REFERENCES `tables` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
```

執行：`node --import tsx/esm src/db/migrate.ts`

### Step 2：新增 Zod 型別（`packages/core/src/types.ts`）

```typescript
export const TableTagRowSchema = z.object({
  id: z.coerce.number(),
  table_id: z.coerce.number(),
  tag: z.string(),
  created_at: z.coerce.date(),
});
export type TableTagRow = z.infer<typeof TableTagRowSchema>;

export const CreateTagInput = z.object({
  tag: z.string().min(1).max(64),
});
```

執行：`pnpm --filter @schema-studio/core build`

### Step 3：新增 Repository（`apps/api/src/repositories/tags.ts`）

```typescript
import { getPool } from "../db/pool.js";
import { TableTagRowSchema } from "@schema-studio/core";

export async function listTags(tableId: number) {
  const pool = getPool();
  const rows = await pool.query<unknown[]>(
    "SELECT * FROM table_tags WHERE table_id = ? ORDER BY tag", [tableId]
  );
  return rows.map(r => TableTagRowSchema.parse(r));
}

export async function addTag(tableId: number, tag: string) {
  const pool = getPool();
  await pool.query(
    "INSERT IGNORE INTO table_tags (table_id, tag) VALUES (?, ?)",
    [tableId, tag]
  );
}

export async function removeTag(tableId: number, tag: string) {
  const pool = getPool();
  await pool.query(
    "DELETE FROM table_tags WHERE table_id = ? AND tag = ?",
    [tableId, tag]
  );
}
```

### Step 4：新增 Route（`apps/api/src/routes/tags.ts`）

```typescript
import { Router, type Router as RouterType } from "express";
import { z } from "zod";
import * as repo from "../repositories/tags.js";

const router: RouterType = Router({ mergeParams: true });

// GET /api/v1/tables/:tableId/tags
router.get("/", async (req, res, next) => {
  try {
    const tableId = Number((req.params as Record<string, string>)["tableId"]);
    res.json(await repo.listTags(tableId));
  } catch (e) { next(e); }
});

// POST /api/v1/tables/:tableId/tags
router.post("/", async (req, res, next) => {
  try {
    const tableId = Number((req.params as Record<string, string>)["tableId"]);
    const { tag } = z.object({ tag: z.string().min(1).max(64) }).parse(req.body);
    await repo.addTag(tableId, tag);
    res.status(201).json({ tag });
  } catch (e) { next(e); }
});

// DELETE /api/v1/tables/:tableId/tags/:tag
router.delete("/:tag", async (req, res, next) => {
  try {
    const params = req.params as Record<string, string>;
    await repo.removeTag(Number(params["tableId"]!), params["tag"]!);
    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;
```

### Step 5：掛載 Route（`apps/api/src/main.ts`）

```typescript
import tagsRouter from "./routes/tags.js";   // 新增這行

// 在其他 app.use 旁邊加上
app.use("/api/v1/tables/:tableId/tags", tagsRouter);
```

### Step 6：更新前端 API Client（`apps/web/src/api.ts`）

```typescript
// 新增型別
export interface Tag { id: number; tableId: number; tag: string; createdAt: string; }

// 在 api 物件中新增
tables: {
  ...,
  tags: {
    list: (tableId: number) => req<Tag[]>(`/tables/${tableId}/tags`),
    add: (tableId: number, tag: string) =>
      req<{ tag: string }>(`/tables/${tableId}/tags`, { method: "POST", body: JSON.stringify({ tag }) }),
    remove: (tableId: number, tag: string) =>
      req<void>(`/tables/${tableId}/tags/${encodeURIComponent(tag)}`, { method: "DELETE" }),
  },
},
```

### Step 7：在 UI 中使用

在 `SchemaEditorPage.tsx` 的 `FieldEditorPanel` 中（或任何合適的地方）：

```typescript
const { data: tags } = useQuery({
  queryKey: ["tags", table.id],
  queryFn: () => api.tables.tags.list(table.id),
});

async function addTag(tag: string) {
  await api.tables.tags.add(table.id, tag);
  void qc.invalidateQueries({ queryKey: ["tags", table.id] });
}
```

---

## 11. 命名規範速查

| 對象 | 規範 | 範例 |
|------|------|------|
| DB 表名 | `snake_case`，複數 | `schema_fields`, `naming_dictionary` |
| DB 欄位名 | `snake_case` | `schema_id`, `created_at` |
| TS 變數/函式 | `camelCase` | `getPool`, `parseDDL` |
| TS 型別/介面 | `PascalCase` | `SchemaRow`, `ParsedField` |
| TS 常數 | `UPPER_SNAKE_CASE` | `BUILT_IN_RULES`, `FUZZY_THRESHOLD` |
| API 路由 | `kebab-case`，複數 | `/api/v1/naming-dictionary` |
| TS 檔案名 | `kebab-case.ts` | `ddl-import.ts` |
| React 元件 | `PascalCase.tsx` | `SchemaEditorPage.tsx` |
| CSS 變數 | `--kebab-case` | `--bg-1`, `--accent` |

**DB → TS 轉換原則**：DB 用 `snake_case`，TS 用 `camelCase`。轉換**只在 repository 層做一次**，別在元件或 service 層重複轉換。

---

## 12. 常見問題與排錯

### Q: 啟動時出現 `EADDRINUSE: address already in use :::3005`

Port 被佔用，可能是上一個 server process 還沒結束：

```bash
pkill -9 -f "src/main.ts"
# 或找到 PID 後 kill
lsof -i :3005
kill -9 <PID>
```

### Q: 修改了 `packages/core` 的程式碼，但 API 或 Web 沒有吃到新的內容

記得重新 build packages：

```bash
pnpm --filter @schema-studio/core build
```

在 dev 模式下，`apps/api` 使用 `tsx` 直接執行 TypeScript，所以**不需要重啟 server**，但 `packages/core` 的型別定義是從 `dist/` 讀取的，所以 build 是必要的。

### Q: 資料庫查詢回傳的 id 是 `3n`（BigInt）而不是 `3`（number）

這是 MariaDB driver 的特性。使用 `z.coerce.number()` 或 `Number(r.id)` 明確轉換。

### Q: TypeScript 報錯 `Type 'string | undefined' is not assignable to type 'string'`

這是 `exactOptionalPropertyTypes: true` 的限制。optional 的值必須用 conditional spread：

```typescript
// ❌ 錯誤
{ description: someVar }   // someVar 可能是 undefined

// ✅ 正確
{ ...(someVar ? { description: someVar } : {}) }
```

### Q: `router` 型別推斷出錯，提示 `inferred type cannot be named`

加上明確的型別標注：

```typescript
import { type Router as RouterType } from "express";
const router: RouterType = Router({ mergeParams: true });
```

### Q: Migration 執行後報 SQL syntax error

最常見原因是在 `CREATE TABLE` 內部有 `-- 這樣的行內註解`。Migration 腳本以 `;` 分割 statement，但 `--` 後面的分號也會被算進去。

**解法**：移除 `CREATE TABLE` body 內的所有 `--` 行內注解，或移到 statement 外面。

### Q: 如何查看 DB 資料

開啟 `http://localhost:8080`（Adminer），用 `docker-compose.yml` 中的帳號密碼登入。

---

*本文件最後更新：2026-05-02*  
*如有疑問，請在 PR 描述中標記 `docs: need update`*
