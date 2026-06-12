# Data Governance Workflow — 總體規劃

> 基於 `frank0124p/db-master`(Schema Studio)延伸實作。
> 目標:將資料治理拆成五大步驟的工作流,終點是產出一份「LLM 可參照的治理目錄(Governed Catalog)」——
> 每張寬表有清楚的欄位定義、來源 lineage、與其他表的關聯(graph),供未來 chatbot 在 free query 時找到正確的資料參照事實。

---

## 1. 五大步驟工作流(Workflow)

```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ Step 1       │   │ Step 2       │   │ Step 3       │   │ Step 4       │   │ Step 5       │
│ 知識庫建立     │ → │ Schema 批量   │ → │ 情境驅動      │ → │ 人工審核      │ → │ 治理規則檢查   │
│ Knowledge    │   │ 導入 + 分群   │   │ 寬表生成      │   │ 工作區        │   │ + 報告 + 發佈 │
│ Base         │   │ Classify     │   │ Compose      │   │ Review       │   │ Validate     │
└──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘
       │                  │                  │                  │                  │
       ▼                  ▼                  ▼                  ▼                  ▼
 ConceptCard       ClassificationProposal  WideTableProposal   WideTableDraft    ValidationReport
 BusinessRule      ImportBatch            (含思路/lineage)     (workspace)       GovernedWideTable
 ProcessDoc                                                                          │
                                                                                     ▼
                                                                          ┌────────────────────┐
                                                                          │ Governed Catalog    │
                                                                          │ (graph + 欄位定義)   │
                                                                          │ → chatbot 檢索 API  │
                                                                          └────────────────────┘
```

每一步的產物都是「提案(pending)→ 審核 → 正式(approved)」的狀態機,完全沿用現有命名字典簽核的模式。

### 工作流 Instance(資料主題上線單)

每個新的 **data subject(資料主題)** 進入治理時,建立一個 **GovernanceInstance**,沿五大步驟(= 五個 **station 站點**)的 route 前進:

- 任何時刻清楚呈現 instance **目前停在哪個站點**(站點軌道圖 + exitCheck 自動判定)
- 每站可由使用者**自由 bypass**(記 reason + audit),跳過不影響後續站點進行
- 未來透過 **Gate Policy** 卡控:把某站設為 required 後,該站不可 bypass、且 instance 必須過站才能結案
- 各步驟 API 帶選填 `instance_id` 自動掛載 artifacts;不帶則一切照舊(opt-in,不影響單獨使用各功能)

完整設計見 `06-WORKFLOW-INSTANCE.md`。

---

## 2. 各步驟定義

### Step 1 — 知識庫建立(Knowledge Base)
- **輸入**:domain knowledge 自由文字 / Markdown 文件 / 上傳檔案(業務流程說明、術語表、系統文件)。
- **處理**:LLM 抽取 pipeline 將文件整理成三類結構化知識:
  1. **ConceptCard(概念卡)**:業務實體/概念(如「在製品批次」「BOM」),含定義、同義詞、關聯概念、對應 table 候選。
  2. **BusinessRule(業務規則)**:可被 Step 5 引用的治理約束(如「lot_id 的 single source of truth 是 wip-tracking」)。
  3. **SourceDoc(原始文件)**:原文保存,概念卡反向引用 chunk,確保可追溯。
- **審核**:抽取結果進 pending,沿用字典簽核流程(admin/suite_owner 核准)。
- **輸出**:approved 的知識庫,供 Step 2/3/5 的 LLM pipeline 作為 context 注入(RAG-lite:關鍵字 + alias 比對,不引入 vector DB,第二期再評估 embedding)。

### Step 2 — Schema 批量導入 + 自動分群分類
- **輸入**:一批 DDL(沿用 `data/ddl/` 自動匯入 + 新增 UI 批次上傳),各種正規化的資料表。
- **分群基準**(三個來源,優先序由高到低):
  1. 知識庫 ConceptCard 的 table 對應與同義詞
  2. 命名字典(approved 詞條)的欄位語意
  3. **現有 DB Master 內既有 Schema 的 Suite/Domain/Layer 分佈**(作為分群錨點:新表與哪個既有 domain 的欄位重疊度/命名相似度最高)
- **處理**:每張匯入的 table 產生一筆 `ClassificationProposal`:建議的 Suite / Domain / LayerType + confidence(0–1)+ rationale(引用了哪些知識/哪些既有表作為依據)。
- **輸出**:分類提案清單,批次審核 UI(沿用 confidence scoring + batch review 模式),核准後寫回 schema meta。**不自動套用**,一律過人。

### Step 3 — 情境驅動寬表生成(Scenario → Wide Table Compose)
- **輸入**:一段使用情境描述(如「我要分析某產品系列的良率與設備關聯」)。
- **處理 pipeline**:
  1. 情境 → 知識庫檢索(命中哪些 ConceptCard / BusinessRule)
  2. 概念 → 候選表(既有 Schema **與** Step 2 新匯入的表一起納入候選池)
  3. LLM 依「小積木 / 中積木」框架組裝:
     - **小積木(small block)**:單一業務實體的基本+進階欄位整併表
     - **中積木(medium block)**:跨實體 JOIN 的主題寬表,**只能由小積木或正式 table 組成**(此約束本身就是 Step 5 的一條規則)
  4. 輸出 `WideTableProposal`:欄位清單(每欄含 source schema.table.field、定義、命名字典對應)、JOIN graph、**與其他寬表/表的關聯性說明**、完整 reasoning trace(思路)。
- **輸出**:一至多個寬表提案,SSE 串流呈現(沿用 analyze 的 SSE 模式)。

### Step 4 — 人工審核工作區(Review Workspace)
- **輸入**:Step 3 的提案。
- **UI**:左側呈現「系統建議 + 組裝思路(reasoning trace)」,右側為可編輯的寬表草稿(欄位增刪改、JOIN 調整、定義改寫)。所有人工修改記 edit log(沿用 override/audit trail 模式)。
- **輸出**:`WideTableDraft` 存入 **Workspace**(`data/workspace/`),狀態 `draft`。可多次往返編輯,存版本快照。

### Step 5 — 治理規則檢查 + 報告 + 發佈
- **輸入**:Workspace 內的 draft。
- **處理**:跑兩層檢查:
  1. 既有 Rule Engine(11 條內建 + 自訂 skill 規則)對寬表欄位做命名/結構檢查
  2. **新增治理規則組(`gov.*`)**:
     - `gov.single_source_of_truth`:每個業務欄位的來源必須是知識庫宣告的 SSOT 表
     - `gov.lineage_complete`:每欄必須有完整 source 對應(無孤兒欄位)
     - `gov.block_hierarchy`:中積木只能引用小積木/正式 table,不可引用其他中積木(可設定)
     - `gov.join_key_validity`:JOIN 鍵兩端型別一致且至少一端為 PK/UNIQUE
     - `gov.naming_dict_coverage`:欄位需對應到 approved 字典詞條(可設 coverage 門檻)
     - `gov.definition_required`:每欄必須有業務定義
- **輸出**:`ValidationReport`(逐規則 pass/fail,fail 含違反的具體欄位、引用的規則條文、修正建議)。
  - 全 pass(或 error 級全 pass)→ 可「發佈」為 `GovernedWideTable`,進入治理目錄
  - 有 fail → 報告存檔,退回 Step 4 修改

### 終點 — Governed Catalog(LLM 可參照目錄)
- 所有發佈的寬表組成一個 **graph**:
  - 節點:GovernedWideTable、source table、field、ConceptCard
  - 邊:`composed_from`(lineage)、`joins_on`、`maps_to_concept`、`related_to`(寬表間關聯)
- 匯出格式:
  1. `GET /api/v1/catalog/graph` — JSON graph(供程式/chatbot 用)
  2. 每張寬表一份 AI-readable Markdown(欄位定義 + 關聯,YAML front-matter,沿用你既有的 SOP 模板風格)
  3. 選配:推送 DataHub(框架已存在)
- **chatbot 檢索 API**:`POST /api/v1/catalog/retrieve` — 輸入自然語言 query,回傳相關寬表 + 欄位定義 + graph 鄰居(關聯表),作為 LLM free query 時的 grounding context。

---

## 3. 與現有 db-master 的差距分析(Gap Analysis)

| 模組 | 現況 | 需新增 | 重用程度 |
|---|---|---|---|
| 知識庫 | 命名字典 + skills/*.md | `knowledge` 模組(ConceptCard/BusinessRule/SourceDoc + 抽取 pipeline) | 簽核流程、fileStore、pending/approved 模式全重用 |
| 批量分類 | DDL 匯入、手動設 Suite/Domain/Layer | `classification` pipeline + 提案物件 + 批次審核頁 | ddl-loader、Suite/Domain 結構重用 |
| 情境寬表 | 寬表 CRUD + preview + auto-compose | `compose` pipeline(情境解析、積木組裝、思路輸出) | wide-tables repo/route、SSE、prompts/ 重用 |
| 審核工作區 | 版本快照、Diff | Workspace + Draft 物件 + 提案/草稿 UI | versions、diff UI 模式重用 |
| 治理檢查 | Rule Engine + skill 規則 | `gov.*` 規則組(需要跨表/lineage context,engine 需擴充 context 注入) | engine.ts 擴充,不重寫 |
| 治理目錄 | DataHub stub、Mermaid | catalog graph 模型 + 匯出 + retrieve API | datahub service、ER 圖模式重用 |

---

## 4. 設計原則(沿用 repo 既有決策)

1. **儲存維持檔案式 JSON**(`data/` 目錄),不引入外部 DB。graph 也用 JSON 落地,規模到瓶頸再評估。
2. **所有 LLM 產出都是「提案」**,必經人工審核才轉正——與字典簽核一致的狀態機:`pending → approved/rejected`。
3. **LLM prompt 一律放 `prompts/*.md`**,runtime 讀取、可直接編輯。
4. **API 慣例不變**:request body `snake_case`、response `camelCase`、SSE 用於長任務、路由 kebab-case 複數、Google-style custom method(`:approve`、`:publish` 用 POST 子路徑)。
5. **規則 ID 命名空間**:新增 `gov.*` 前綴(內建治理規則),使用者自訂仍走 `user.*` + `data/skills/*.md`。
6. **每步驟可獨立運作**:沒有知識庫也能跑分類(降級為只用字典+既有表);沒有 LLM 也能手動建寬表(現有功能不退化)。

---

## 5. 文件導覽

| 檔案 | 內容 |
|---|---|
| `00-PLAN-OVERVIEW.md` | 本文件:總體規劃 |
| `01-DATA-MODEL.md` | 新實體型別定義 + `data/` 目錄擴充 |
| `02-API-SPEC.md` | 新增 API 端點規格 |
| `03-PIPELINE-DESIGN.md` | 三條 LLM pipeline(抽取/分類/組裝)+ prompt 策略 + 治理規則細節 |
| `04-TASKS.md` | 七個 Phase 的開發任務,每個任務含驗收條件,可直接餵給 Claude Code |
| `05-CLAUDE-CODE-HANDOFF.md` | Claude Code 啟動方式、CLAUDE.md 增補內容、開發順序與風險 |
| `06-WORKFLOW-INSTANCE.md` | 資料主題上線單(Instance)、站點追蹤、bypass 與 Gate Policy 卡控 |
