# 03 — Pipeline Design:三條 LLM Pipeline + 治理規則引擎擴充

> LLM 呼叫一律走既有 `services/llm.ts`(Anthropic/OpenAI 封裝,支援 SSE)。
> Prompt 範本放 `prompts/`,runtime 讀取。所有 LLM 輸出強制 JSON(沿用既有 generate-schema 模式),Zod 驗證後落地。
> **沒有設定 LLM 時的降級行為**在每節末尾說明 — 確保核心流程不癱瘓。

---

## Pipeline A — 知識抽取(Step 1)

```
SourceDoc.content
   │ ① chunk 切分(規則式:標題/空行,每 chunk ≤ ~1500 字)
   ▼
逐 chunk(或 3-chunk 滑窗)呼叫 LLM
   │ prompt: prompts/extract-knowledge.md
   │ context 注入:既有 approved ConceptCard 摘要(name/stdName/aliases,避免重複建卡)
   │            + 命名字典 stdName 清單(讓 stdName 對齊字典)
   ▼
LLM 輸出 JSON:{ concepts: [...], business_rules: [...] }
   │ ② 去重合併:stdName 相同 → 合併 aliases/sourceRefs;與既有卡撞名 → 標記為「補充建議」而非新卡
   ▼
落地 status=pending → 簽核流程
```

`prompts/extract-knowledge.md` 重點指示:
- 只抽「可對應到資料的」概念(業務實體、量測指標、流程狀態),不抽組織/人名
- 每個概念必附 sourceRefs(chunk index)— 不可虛構
- 偵測到「X 的來源是 Y 系統/表」「以 Z 為準」這類陳述 → 產出 `ssot_declaration` 型 BusinessRule
- stdName 優先沿用提供的字典清單;沒有對應再造新詞(snake_case,遵守命名規範)

**降級**:無 LLM → 只能手動建概念卡(API/UI 已支援),extract 端點回 503 + 明確訊息。

---

## Pipeline B — 分類分群(Step 2)

兩階段:**規則式打底 → LLM 裁決**,降低 token 成本也讓結果可解釋。

```
ImportBatch 的每張 table
   │
   ① 規則式特徵計算(純 TS,packages/core 新增 governance/classifier-features.ts)
   │   - 概念命中:table 名/欄位名 vs ConceptCard aliases + tableHints(命中 ssot hint 直接高分)
   │   - 字典命中率:欄位名 vs approved 字典(exact/alias/fuzzy — 重用 naming/matcher.ts)
   │   - 既有表相似度:vs 全部既有 table,score = 欄位名 Jaccard + 名稱 Levenshtein 加權
   │       → top-3 similarTables,其 Suite/Domain/Layer 分佈 = 分群錨點
   │
   ② 判定
   │   - 特徵明確(如 top-1 相似表 score > 0.7 且其 domain 與概念命中一致)→ 直接產 proposal,
   │     confidence 由特徵計算,rationale 引用具體證據,**不呼叫 LLM**
   │   - 模糊地帶 → 將特徵摘要 + 候選 domain/suite/layer 丟給 LLM 裁決
   │     prompt: prompts/classify-table.md(輸出 JSON:suggested + confidence + summary)
   ▼
ClassificationProposal(pending)→ 批次審核 UI
```

confidence 計算建議(規則式部分):
```
confidence = 0.5 * conceptHitScore + 0.3 * similarTableScore + 0.2 * dictCoverage
LLM 裁決者:取 LLM 自報 confidence 與規則式分數的較小值(保守)
```

**降級**:無 LLM → 只跑規則式;模糊地帶 confidence 低,留待人工。

---

## Pipeline C — 情境組裝(Step 3)

```
scenario 文字
   │
   ① 知識檢索(POST /knowledge/retrieve 同邏輯)
   │   → 命中 ConceptCard(含 tableHints)、BusinessRule(SSOT 宣告)、字典詞條
   │   → trace: "concept-retrieval"
   │
   ② 候選池組建(純 TS)
   │   - 概念 tableHints 指到的表(SSOT 優先)
   │   - 欄位名命中概念 alias 的表
   │   - 指定的 include_batch_ids 新匯入表
   │   - 候選表帶完整欄位 + comment + PK/FK + sample data 摘要
   │   → trace: "candidate-selection"
   │
   ③ LLM 組裝  prompt: prompts/compose-wide-table.md
   │   context:scenario + 候選表完整 schema + 概念定義 + SSOT 宣告 + 積木規範:
   │     - 小積木 = 單實體 basic+advanced 整併(對應你們 DW 設計的基本/進階拆分)
   │     - 中積木 = 跨實體 JOIN,只能引用小積木或正式 table
   │     - 每欄必填 definition + source(lineage)— 缺一不可
   │     - JOIN 鍵需說明依據(FK / 概念同源)
   │     - 輸出 relationships:與候選池其他表、既有 governed 寬表的關聯
   │   輸出 JSON:WideTableProposal[](1~3 個方案)
   │   → trace: "compose"(LLM 同時輸出每步思路文字)
   │
   ④ 後處理驗證(純 TS)
   │   - 每個 source 真實存在(schemaId.tableName.fieldName 查得到)→ 查不到 = 幻覺,該欄標記並降信心
   │   - JOIN 欄位型別預檢
   │   - 寬表名/欄名過命名 matcher,自動附上字典對應
   ▼
WideTableProposal(proposed)→ Step 4
```

**降級**:無 LLM → compose 端點 503;使用者仍可用既有寬表建構器手動建,再經 `POST /workspace/drafts`(手動路徑)進 Step 4/5。

---

## 治理規則引擎擴充(Step 5)

### 現況限制
`packages/core/src/rules/engine.ts` 的 `runRules(tables, config)` 只看單一 schema 的 tables,**沒有跨表/知識庫 context**。

### 擴充方式(不破壞既有呼叫)
新增 `runGovernanceRules(draft, ctx)`:

```ts
export interface GovernanceContext {
  allTables: Array<{ schemaId: number; schemaSlug: string; table: SchemaTable }>;  // 全庫表
  concepts: ConceptCard[];            // approved
  businessRules: BusinessRule[];      // approved,含 machine.ssot_declaration
  namingDict: NamingEntry[];          // approved
  governedWideTables: GovernedWideTable[];  // 已發佈(供 block_hierarchy / related 檢查)
  ruleOverrides: RuleOverrides;       // 沿用 data/rules/overrides.json(gov.* 也可調嚴重度/停用)
}
```

### 內建 gov.* 規則(`packages/core/src/rules/governance.ts`)

| ruleId | 預設嚴重度 | 檢查邏輯 | 違規訊息要素 |
|---|---|---|---|
| `gov.single_source_of_truth` | error | 對每欄:若其 conceptId 有 ssot_declaration,source 表必須 = 宣告的 SSOT 表 | 欄名、實際來源、應為來源、引用的 BusinessRule 條文 |
| `gov.lineage_complete` | error | 每欄 source 必填且指向真實存在的 schema.table.field | 哪欄缺 lineage / 指向不存在 |
| `gov.block_hierarchy` | error | medium 只能引用 table 或 small 積木;small 只能引用單一實體的 tables(config: `allowMediumFromMedium: false`) | 違規引用鏈 |
| `gov.join_key_validity` | warning | JOIN 兩端欄位存在、型別相容、至少一端 PK/UNIQUE | join 描述、型別、缺 PK 的端 |
| `gov.naming_dict_coverage` | warning | 欄名對應 approved 字典比率 ≥ config.threshold(預設 0.8);unknown 欄逐一列出 | coverage 值、未覆蓋欄清單 |
| `gov.definition_required` | error | 每欄 definition 非空且 ≥ config.minLength(預設 10 字) | 缺定義的欄 |
| `gov.no_duplicate_semantics` | warning | 同寬表內兩欄對應同一 conceptId + 同 source → 疑似重複 | 重複欄對 |

全部規則純 TS、確定性、可單元測試 — **Step 5 不用 LLM**(報告要可重現、可稽核)。報告產出後,UI 可選配「✦ AI 解讀報告」(LLM 把違規翻成修正建議),那是加值不是判定。

使用者自訂治理規則:沿用 `data/skills/*.md` 機制,規則欄位擴充 `appliesTo: wide-table`。

---

## Catalog Graph 重建邏輯(publish 時)

```
publish(draft)
  → 建/更新 GovernedWideTable
  → 重建 graph.json(全量重建即可,規模小;node/edge 生成規則:)
      gwt 節點 ← 每張 GovernedWideTable
      tbl/fld 節點 ← 其 columns.source 涉及的表與欄位
      cpt 節點 ← columns.conceptId / relationships 涉及的概念
      composed_from:gwt → tbl(去重)
      has_field + maps_to_concept:逐欄
      joins_on:joinGraph
      related_to:relationships(寬表間)
  → 產出 exports/{slug}.md(模板見 01-DATA-MODEL.md §7)
  → (選配)DataHub push
```

---

## Prompts 清單(新增於 `prompts/`)

| 檔案 | 用途 | 關鍵約束 |
|---|---|---|
| `extract-knowledge.md` | Pipeline A | JSON only、sourceRefs 必填、stdName 對齊字典 |
| `classify-table.md` | Pipeline B 裁決 | JSON only、只能從給定候選 domain/suite/layer 中選、必附 summary |
| `compose-wide-table.md` | Pipeline C | JSON only、lineage 必填、只能引用候選池的表、積木層級規範、輸出思路 |
| `interpret-report.md` | Step 5 加值解讀(選配) | 只解釋不改判定 |
