# DB Master MCP Server

> 把 db-master 資料治理目錄暴露為任何 MCP 客戶端（Claude Code、Claude Desktop、自建 chatbot）的 grounding 工具來源。

**設計原則：唯讀、確定性優先** — JOIN 路徑與資產事實由圖演算法提供，讓客戶端的 LLM 自行推理；避免「chatbot LLM 呼叫 db-master 內部 LLM」的雙層不確定性。

---

## 目錄

- [概觀](#概觀)
- [Claude Code 設定（stdio 模式）](#claude-code-設定stdio-模式)
- [HTTP 模式（遠端 / 多客戶端）](#http-模式遠端--多客戶端)
- [建議的客戶端 System Prompt](#建議的客戶端-system-prompt)
- [端到端範例對話](#端到端範例對話)
- [工具參考](#工具參考)
- [安全說明](#安全說明)

---

## 概觀

MCP Server 包含五個工具：

| 工具 | 用途 | 預設啟用 |
|------|------|---------|
| `search_assets` | 搜尋欄位、資料表、寬表、概念 | 是 |
| `get_asset` | 取得單一資產完整詳情（血緣、定義） | 是 |
| `get_join_path` | 計算兩表間可靠 JOIN 路徑 | 是 |
| `list_concepts` | 列出業務概念詞彙表 | 是 |
| `ask` | 自然語言問答（含 SQL 生成） | 否（需 `MCP_ENABLE_ASK=true`） |

---

## Claude Code 設定（stdio 模式）

stdio 模式供本機 Claude Code 使用，無需 Bearer token（本機信任）。

### 方式一：npm workspace 啟動（推薦）

```bash
# 確認 db-master 已安裝依賴
cd /path/to/db-master
npm install

# 在 Claude Code 中加入 MCP server
claude mcp add dbmaster -- npm run mcp --prefix /path/to/db-master
```

### 方式二：直接執行 tsx

```bash
claude mcp add dbmaster -- npx tsx /path/to/db-master/apps/mcp/src/server.ts
```

### 方式三：編譯後執行

```bash
# 先編譯
cd /path/to/db-master/apps/mcp && npm run build

# 加入 Claude Code
claude mcp add dbmaster -- node /path/to/db-master/apps/mcp/dist/server.js
```

### 確認連線

```bash
claude mcp list
# 應顯示 dbmaster 已連線
```

### 環境變數（可選）

```bash
# 指定自訂 API URL（預設 http://localhost:3005）
DBMASTER_API_URL=http://localhost:3005 claude mcp add dbmaster -- npm run mcp --prefix /path/to/db-master

# 啟用 ask 工具（具推理能力的客戶端不建議）
MCP_ENABLE_ASK=true claude mcp add dbmaster -- npm run mcp --prefix /path/to/db-master
```

---

## HTTP 模式（遠端 / 多客戶端）

HTTP 模式支援多個客戶端同時連線，使用 Bearer token 認證 + 速率限制（60 req/min/token）。

### 環境變數

| 變數 | 說明 | 範例 |
|------|------|------|
| `DBMASTER_API_URL` | db-master API 位址 | `http://localhost:3005` |
| `DBMASTER_MCP_TOKEN` | HTTP 模式 Bearer token（必填） | `your-secret-token` |
| `MCP_HTTP_PORT` | HTTP 監聽埠（設定後自動切換 HTTP 模式） | `3006` |
| `MCP_ENABLE_ASK` | 啟用 ask 工具（預設 false） | `true` |

### 啟動指令

```bash
# 使用 npm workspace
DBMASTER_MCP_TOKEN=your-secret-token MCP_HTTP_PORT=3006 npm run mcp:http --prefix /path/to/db-master

# 或直接
cd /path/to/db-master
DBMASTER_API_URL=http://localhost:3005 \
DBMASTER_MCP_TOKEN=your-secret-token \
MCP_HTTP_PORT=3006 \
npm run mcp:http
```

### 客戶端連線設定

```json
{
  "mcpServers": {
    "dbmaster": {
      "url": "http://your-server:3006",
      "headers": {
        "Authorization": "Bearer your-secret-token"
      }
    }
  }
}
```

> **安全提示**：HTTP 模式僅建議在內網使用。不要將 token 暴露在公開網路。

---

## 建議的客戶端 System Prompt

複製以下片段加入您的 LLM 客戶端 system prompt，引導模型正確使用工具：

```
查詢公司資料欄位時：先 search_assets 定位資產 → get_asset 確認定義與血緣 → 跨表時必須以 get_join_path 的 on 條件寫 JOIN。工具回傳 deprecated 警示時改用其 replacedBy。找不到路徑時不要猜，回報缺少的關聯。
```

### 英文版

```
When querying company data fields: first use search_assets to locate assets → get_asset to confirm definition and lineage → for cross-table SQL, JOIN conditions MUST use get_join_path steps.on, not guessed. If a tool returns deprecated warnings, use replacedBy instead. If no path found, report the missing relationship rather than guessing.
```

---

## 端到端範例對話

以下展示「良率查詢」完整流程（3 次工具呼叫 → 正確 SQL）：

---

**用戶：** 我想查批次良率，需要哪些表？請幫我寫查詢 SQL。

---

**Claude：** 讓我先搜尋相關資產。

> **工具呼叫 1：** `search_assets`
> ```json
> { "query": "批次良率", "top_k": 5 }
> ```
> **回傳（部分）：**
> ```
> [1] ref: gwt:quality.lot_yield_wide
>     kind: gwt
>     label: 批次良率寬表
>     definition: 整合批次製程資訊與最終良率指標的治理寬表
>     score: 0.923
>
> [2] ref: fld:lot_results.final_yield
>     kind: fld
>     label: 最終良率
>     definition: 批次完工後的良率百分比（0–100）
>     score: 0.871
>
> [3] ref: tbl:mes.lots
>     kind: tbl
>     label: 批次主表
>     definition: MES 批次基本資訊
>     score: 0.834
> ```

找到治理寬表 `gwt:quality.lot_yield_wide`，這是良率資料的 SSOT。讓我確認欄位詳情。

> **工具呼叫 2：** `get_asset`
> ```json
> { "ref": "gwt:quality.lot_yield_wide" }
> ```
> **回傳（部分）：**
> ```
> 資產：批次良率寬表 (gwt:quality.lot_yield_wide)
> 類型：gwt
> 詳情：
>   definition: 整合批次製程資訊與最終良率指標的治理寬表
>   ownerUserId: quality-team
>   refreshCycle: daily
>
> 上游（來源）：
>   ↑ composed_from: gwt:quality.lot_yield_wide → tbl:mes.lots (composed_from)
>   ↑ composed_from: gwt:quality.lot_yield_wide → tbl:test.lot_results (composed_from)
> ```

寬表由 `tbl:mes.lots` 和 `tbl:test.lot_results` 組成。讓我查 JOIN 路徑。

> **工具呼叫 3：** `get_join_path`
> ```json
> { "from": "tbl:mes.lots", "to": "tbl:test.lot_results" }
> ```
> **回傳：**
> ```
> JOIN 路徑：tbl:mes.lots → tbl:test.lot_results
> 總跳數：1，路徑成本：1.000
>
> 路徑步驟（使用 steps.on 作為 JOIN 條件）：
>   步驟 1：tbl:mes.lots → tbl:test.lot_results
>     JOIN 條件：mes.lots.lot_id = test.lot_results.lot_id
> ```

以下是以治理寬表欄位為準的查詢 SQL：

```sql
-- 批次良率查詢
-- 資料來源：gwt:quality.lot_yield_wide（owner: quality-team，每日更新）
SELECT
    l.lot_id,
    l.product_code,
    l.start_time,
    lr.final_yield,
    lr.defect_count
FROM mes.lots l
JOIN test.lot_results lr ON mes.lots.lot_id = test.lot_results.lot_id  -- 以 get_join_path 的 on 條件為準
WHERE l.start_time >= '2026-01-01'
ORDER BY l.start_time DESC;
```

---

## 工具參考

### `search_assets`

搜尋資料治理目錄中的資產（欄位、資料表、寬表、概念）。

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `query` | string | 是 | 業務問題或關鍵詞（中英皆可） |
| `top_k` | number | 否 | 最多回傳幾筆（預設 10，最大 30） |
| `kinds` | string[] | 否 | 類型過濾：`fld`/`tbl`/`gwt`/`gwc`/`cpt` |

---

### `get_asset`

取得單一資產完整詳情（定義、血緣、關聯）。

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `ref` | string | 是 | 資產 ref，由 `search_assets` 回傳（如 `fld:table.field`） |

---

### `get_join_path`

計算兩表之間可靠 JOIN 路徑（基於圖譜，非推測）。

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `from` | string | 是 | 起點 ref（如 `tbl:mes.lots`） |
| `to` | string | 是 | 終點 ref（如 `tbl:test.results`） |
| `max_hops` | number | 否 | 最大跳數（預設 6） |

> **重要：** JOIN 條件必須使用回傳的 `steps.on`，不可自行推測。
> 若回傳「圖上無已知路徑」，請改用 `search_assets` 找中介概念，或回報缺少的關聯。

---

### `list_concepts`

列出業務概念詞彙表（glossary）。

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `domain` | string | 否 | 按領域篩選（如 `mes`、`quality`） |
| `query` | string | 否 | 關鍵詞搜尋概念 |

---

### `ask`（選用，預設關閉）

自然語言問答，包含欄位、JOIN 路徑與 SQL。需設定 `MCP_ENABLE_ASK=true` 啟用。

> **注意：** 具推理能力的客戶端建議改用 `search_assets` + `get_asset` + `get_join_path` 自行組裝，以避免雙層不確定性（客戶端 LLM + db-master 內部 LLM）。

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `question` | string | 是 | 業務問題（中英皆可） |

---

## 安全說明

1. **唯讀保證**：MCP server 僅映射 GET 請求與兩個唯讀 POST（`/ask/link-only`、`/ask`）。任何 mutation 端點不存在於 server 中，由 lint rule（`no-restricted-syntax`）與單元測試雙重防呆。

2. **敏感性遮蔽**：sensitivity 遮蔽由 API 層（`data/settings/redact-policy.json`）統一執行，MCP 自然繼承。如需啟用遮蔽，管理員應在 API 設定中開啟 redact policy。

3. **Bearer token（HTTP 模式）**：HTTP 模式必須設定 `DBMASTER_MCP_TOKEN`，每個請求需帶 `Authorization: Bearer {token}` header。stdio 模式為本機信任，免 token。

4. **速率限制（HTTP 模式）**：每 token 每分鐘最多 60 次請求，防止 chatbot 迴圈打爆。

5. **Token 保管**：Token 只放在環境變數中，不提交至版本控制（`.env.local` 已在 `.gitignore`）。
