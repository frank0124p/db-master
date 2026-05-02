# Schema Studio — Project Document

## Why This Exists

半導體製造業（及其他資料密集產業）的工程團隊，每次新建系統都面臨同一個問題：**DB schema 沒有一致的命名規範**。

十個工程師有十種寫法：`lot_id`、`lotId`、`LotID`、`lot_number`——同一個概念，四種命名。當系統規模擴大，跨表 JOIN 的認知負擔、新人上手成本、資料整合難度，都因此加倍。

Schema Studio 是一個**小型團隊共用的 Schema 設計平台**，核心任務：

1. 讓工程師用自然語言快速描述需求，由 LLM 生成符合規範的 Schema 草稿
2. 建立並維護「命名字典」（Naming Dictionary），作為全團隊的命名真理
3. 匯入現有 DDL，分析並提示命名不一致或設計缺陷
4. 記錄 Schema 的版本歷史與變更差異

---

## 主要使用族群

**目標**：半導體製造業的 MES/資料工程小型團隊（2–10 人）

典型使用者：
- MES 系統架構師：設計新模組的 DB schema
- 資料工程師：整合多個系統的表結構，需要統一命名
- 後端工程師：維護既有 DB，需要看懂歷史決策與命名邏輯

---

## Core Capabilities

### 1. Natural Language → Schema
輸入：「我需要一個設備保養記錄系統，記錄設備、保養類型、執行人員、執行時間與下次預定時間」

輸出：包含 `equipment_maintenance_logs` 等表、欄位齊全、帶有 FK 關係的 Schema 草稿，命名自動對照字典

### 2. Naming Dictionary
- 團隊建立的「標準詞彙庫」，定義每個概念的標準英文命名
- 例：「設備 ID」→ `equip_id`（而非 `equipment_id`、`eqp_id`、`machine_id`）
- 新增欄位時自動比對字典，顯示建議
- 半導體專屬預設詞彙（lot、wafer、recipe、chamber 等）

### 3. DDL Import & Analysis
- 匯入現有 `.sql` 或貼上 DDL 文字
- 解析成內部 Schema 模型
- LLM 分析：命名不一致、缺少 index、FK 缺失、欄位型別問題等

### 4. Schema Versioning & Diff
- 每次儲存自動建立版本快照
- 前後版本的結構化 diff（新增/刪除/修改 欄位/表）
- 對照命名字典顯示前後差異（改了什麼、對不對得上字典）

### 5. DDL Export
- 從內部模型生成目標 DB 的 DDL
- v1 支援 MariaDB；架構上為多 DB 預留介面（PostgreSQL、MySQL）

---

## Architecture Decisions

### 為什麼不用 ORM？
這個產品的核心就是 *關於* Schema 的工具。如果我們用 ORM 管理自己的 DB，就產生了「用 ORM 定義 Schema」和「用工具顯示 Schema」的雙重標準，認知混亂。Raw SQL 讓我們的 migration 完全透明、可審查。

### 為什麼選 MariaDB？
半導體產業的 MES 系統多以 MariaDB / MySQL 為主。v1 鎖定 MariaDB，確保 DDL 生成的方言準確。多 DB 支援預留在 DDL emitter 的介面設計中。

### 為什麼 Rules vs Skills 分開？
- **Rules**（`packages/core`）：程式判斷，零 LLM，快速、確定性，例如「欄位名不得超過 64 字元」
- **Skills**（`skills/*.md`）：LLM 載入的領域知識，提供上下文，例如「半導體命名慣例」

Rules 是護欄，Skills 是教練。

### 為什麼 Naming Dictionary 是核心？
這是產品差異化所在。任何人都能包裝 LLM 生成 SQL。但如果生成的命名跟團隊歷史慣例一致，那才是真正的生產力提升。Naming Dictionary 是讓工具「懂這個團隊」的記憶體。

---

## North Star Metric

> **從一句中文描述到一份可直接 review 的 Schema，花費時間 < 5 分鐘，且命名通過字典比對率 > 90%。**

---

## Out of Scope (v1)

- 多帳號 / 權限管理
- 即時協作（CRDT）
- 視覺化 ER 圖編輯（顯示 Mermaid 即可，不需要拖拉）
- Query builder / SQL IDE / 資料瀏覽器
- Migration 腳本自動生成（版本 diff 有，但不生成 ALTER TABLE）
- NoSQL 支援
- GraphQL Schema 生成
