# Roadmap

## Phase 1 — Foundation（Tasks 01–07）
**目標**：無 LLM 的完整可用 App。可以建立 Schema、管理命名字典、匯入 DDL。

| Task | 名稱 | 預估 | 說明 |
|---|---|---|---|
| 01 | Bootstrap Monorepo | 0.5d | pnpm + Docker MariaDB + health API |
| 02 | DB Schema & Migrations | 1d | 所有核心表的 migration SQL |
| 03 | Schema & Table CRUD API | 1.5d | REST API：schemas, tables, fields |
| 04 | Naming Dictionary API | 1d | 詞彙 CRUD + 比對引擎 |
| 05 | DDL Parser | 1.5d | SQL → 內部模型 + 內部模型 → SQL |
| 06 | Frontend Shell | 0.5d | Tailwind + Layout + Routing |
| 07 | Schema Builder UI | 2d | 建表 UI、欄位編輯、字典建議顯示 |

**Phase 1 完成里程碑**：`pnpm dev` 起來，可以建 Schema、管字典、匯入 DDL、看 diff。

---

## Phase 2 — LLM Integration（Tasks 08–12）
**目標**：接上 Anthropic API，實現 NL → Schema 和 Schema 分析。

| Task | 名稱 | 預估 | 說明 |
|---|---|---|---|
| 08 | NL → Schema Pipeline | 1.5d | 自然語言生成 Schema 草稿 |
| 09 | Skills Engine | 1d | 載入 markdown skills，半導體領域知識 |
| 10 | Streaming Responses | 0.5d | SSE 串流 LLM 輸出 |
| 11 | Schema Versioning | 1d | 版本快照 + 結構化 diff |
| 12 | Schema Analysis | 1d | LLM 審查現有 Schema，給建議 |

**Phase 2 完成里程碑**：完整 NL → Schema → 分析 → 修改 的流程可走通。

---

## Phase 3 — Polish（Tasks 13–15）
**目標**：匯出、細節 UX、端到端測試。

| Task | 名稱 | 預估 | 說明 |
|---|---|---|---|
| 13 | DDL Export | 0.5d | 多 DB 方言匯出介面 |
| 14 | Naming Diff UI | 1d | 命名字典前後差異視覺化 |
| 15 | E2E Tests | 1d | Playwright 核心流程測試 |

**Phase 3 完成里程碑**：v1 功能完整，測試覆蓋，可交付使用。

---

## 總預估：~15 個工作天（3 週）
