# 01 — Data Model:新實體與儲存結構

> 所有型別定義加入 `packages/core/src/types.ts`(或拆 `packages/core/src/governance/types.ts` 再 re-export)。
> 儲存沿用 fileStore.ts + slug 路徑 + `_sys/counters.json` 自增 ID + `_sys/index.json` 反向索引。

---

## 1. `data/` 目錄擴充

```
data/
├── knowledge/                        # Step 1 知識庫
│   ├── sources/{slug}.json           # SourceDoc(原始文件 + chunks)
│   ├── concepts/{slug}.json          # ConceptCard
│   └── business-rules/{slug}.json    # BusinessRule
│
├── imports/                          # Step 2 批量導入
│   └── batches/{id}.json             # ImportBatch(含 ClassificationProposal[])
│
├── proposals/                        # Step 3 寬表提案
│   └── wide-tables/{id}.json         # WideTableProposal
│
├── workspace/                        # Step 4 審核工作區
│   └── drafts/{id}.json              # WideTableDraft(含 edit log + 版本)
│
├── governance/                       # Step 5 檢查與發佈
│   ├── reports/{id}.json             # ValidationReport
│   └── catalog/
│       ├── wide-tables/{slug}.json   # GovernedWideTable(發佈後)
│       ├── graph.json                # CatalogGraph(發佈時增量重建)
│       └── exports/{slug}.md         # AI-readable Markdown(YAML front-matter)
│
├── instances/                        # 工作流 Instance(資料主題上線單,詳見 06)
│   └── {id}.json                     # GovernanceInstance(stations / artifacts / events)
│
├── settings/
│   └── gate-policy.json              # 站點卡控政策(required / bypassRoles,詳見 06)
│
└── _sys/counters.json                # 新增計數器:knowledge / concept / bizRule /
                                      #   importBatch / wtProposal / wtDraft / valReport / governedWt / instance
```

> `data/governance/catalog/` 建議納入版控(.gitignore 排除規則調整),因為它是團隊共同的「事實來源」;其餘維持執行期資料不入版控。

---

## 2. Step 1 — 知識庫實體

```ts
/** 原始文件:上傳或貼入的 domain knowledge */
export interface SourceDoc {
  id: number;
  slug: string;
  title: string;
  format: 'markdown' | 'text';
  content: string;                    // 原文全文
  chunks: Array<{ idx: number; text: string }>;  // 段落切分(LLM 抽取的引用單位)
  uploadedBy: string;
  createdAt: string;
}

/** 概念卡:業務實體/概念的結構化知識 */
export interface ConceptCard {
  id: number;
  slug: string;                       // 由 stdName 生成
  name: string;                       // 顯示名(中文),如「在製品批次」
  stdName: string;                    // 標準英文識別,如 wip_lot — 與命名字典 stdName 對齊
  definition: string;                 // 業務定義
  aliases: string[];                  // 同義詞(中英混合,供檢索比對)
  domain?: string;                    // 對應 data/settings/domains.json 的 domain id
  relatedConcepts: number[];          // 其他 ConceptCard id
  tableHints: Array<{                 // 對應 table 候選(分類/組裝的關鍵錨點)
    schemaId?: number;                // 既有 schema(可空 = 尚未對應)
    tableName: string;
    role: 'ssot' | 'replica' | 'reference';  // ssot = single source of truth
    note?: string;
  }>;
  namingDictIds: number[];            // 關聯的命名字典詞條
  sourceRefs: Array<{ docId: number; chunkIdx: number }>;  // 出處(可追溯)
  status: 'pending' | 'approved' | 'rejected';
  reviewers: Array<{ userId: number; name: string; signedAt?: string }>;  // 沿用字典簽核結構
  createdAt: string;
  updatedAt: string;
}

/** 業務規則:Step 5 可引用的治理約束 */
export interface BusinessRule {
  id: number;
  slug: string;
  title: string;
  ruleType: 'ssot' | 'constraint' | 'relationship' | 'process';
  statement: string;                  // 人讀的規則陳述
  /** 機器可判讀部分(選填):有此欄位的規則才會被 gov.* 引擎自動執行 */
  machine?: {
    kind: 'ssot_declaration';
    conceptId: number;                // 哪個概念
    ssotTable: { schemaId: number; tableName: string };   // 它的唯一事實來源
  } | {
    kind: 'field_constraint';
    fieldPattern: string;             // regex
    requirement: string;              // 描述性,搭配 gov 規則 config
  };
  sourceRefs: Array<{ docId: number; chunkIdx: number }>;
  status: 'pending' | 'approved' | 'rejected';
  reviewers: Array<{ userId: number; name: string; signedAt?: string }>;
  createdAt: string;
  updatedAt: string;
}
```

---

## 3. Step 2 — 批量導入與分類

```ts
export interface ImportBatch {
  id: number;
  name: string;                       // 如「2026-06 MES 新系統匯入」
  source: 'ddl-files' | 'ui-upload' | 'paste';
  schemaIds: number[];                // 此批建立/更新的 schema
  tableCount: number;
  status: 'imported' | 'classifying' | 'classified' | 'review-done';
  proposals: ClassificationProposal[];
  createdAt: string;
  updatedAt: string;
}

export interface ClassificationProposal {
  tableId: number;
  schemaId: number;
  tableName: string;
  suggested: {
    suiteId?: number;
    domain?: string;
    layerType?: string;               // transaction / r2u / unified / general(尊重 layers.json 自訂)
  };
  confidence: number;                 // 0–1
  rationale: {
    matchedConcepts: number[];        // 命中的 ConceptCard
    matchedDictEntries: number[];     // 命中的字典詞條
    similarTables: Array<{            // 與既有表的相似度(分群錨點)
      schemaId: number; tableName: string; score: number; reason: string;
    }>;
    summary: string;                  // LLM 一句話說明依據
  };
  status: 'pending' | 'accepted' | 'overridden' | 'rejected';
  override?: { suiteId?: number; domain?: string; layerType?: string; by: string; at: string };
}
```

---

## 4. Step 3 — 寬表提案

```ts
export type BlockKind = 'small' | 'medium';   // 小積木 / 中積木

export interface WideTableProposal {
  id: number;
  scenario: string;                   // 使用者輸入的情境原文
  blockKind: BlockKind;
  name: string;                       // 建議寬表名(過命名字典)
  description: string;
  columns: ProposedColumn[];
  joinGraph: ProposedJoin[];
  /** 與其他表/寬表的關聯性說明(審核重點) */
  relationships: Array<{
    targetKind: 'table' | 'wide-table' | 'governed-wide-table';
    targetRef: string;                // schemaSlug.tableName 或 governed slug
    relation: 'shares_key' | 'upstream_of' | 'subset_of' | 'joins_with';
    onFields: string[];
    note: string;
  }>;
  /** 組裝思路:Step 4 UI 原樣呈現 */
  reasoningTrace: Array<{
    step: string;                     // 如 "concept-retrieval" / "candidate-selection" / "compose"
    detail: string;                   // LLM 對該步的說明
    refs?: { conceptIds?: number[]; dictIds?: number[]; tableRefs?: string[] };
  }>;
  candidatePool: Array<{ schemaId: number; tableName: string; fromBatchId?: number }>; // 納入考慮的表
  status: 'proposed' | 'drafted' | 'discarded';   // drafted = 已轉入工作區
  createdAt: string;
}

export interface ProposedColumn {
  name: string;                       // 寬表欄名(snake_case,過字典)
  dataType: string;
  definition: string;                 // 業務定義(必填 — gov.definition_required)
  source: { schemaId: number; tableName: string; fieldName: string };  // lineage(必填)
  namingDictId?: number;
  conceptId?: number;
  transform?: string;                 // 如 'COALESCE(a,b)' / 'SUM(...) GROUP BY ...'
}

export interface ProposedJoin {
  leftRef: string;                    // schemaSlug.tableName
  rightRef: string;
  type: 'inner' | 'left';
  on: Array<{ leftField: string; rightField: string }>;
}
```

---

## 5. Step 4 — 工作區草稿

```ts
export interface WideTableDraft {
  id: number;
  proposalId?: number;                // 來源提案(可空 = 純手動建立)
  blockKind: BlockKind;
  name: string;
  description: string;
  columns: ProposedColumn[];          // 與提案同構,可被編輯
  joinGraph: ProposedJoin[];
  relationships: WideTableProposal['relationships'];
  editLog: Array<{                    // audit trail
    at: string; by: string;
    action: 'add-column' | 'remove-column' | 'edit-column' | 'edit-join' | 'edit-meta';
    detail: string;                   // 簡述 + before/after JSON(小物件)
  }>;
  versions: Array<{ v: number; savedAt: string; snapshot: unknown }>;  // 輕量快照
  lastReportId?: number;              // 最近一次 Step 5 檢查
  status: 'draft' | 'validating' | 'failed' | 'passed' | 'published';
  createdAt: string;
  updatedAt: string;
}
```

---

## 6. Step 5 — 檢查報告與治理目錄

```ts
export interface ValidationReport {
  id: number;
  draftId: number;
  ranAt: string;
  ruleResults: Array<{
    ruleId: string;                   // naming.* / structure.* / gov.* / user.*
    severity: 'error' | 'warning' | 'info';
    passed: boolean;
    violations: Array<{
      target: string;                 // 欄位名 / join 描述
      message: string;                // 違反了什麼條件(具體)
      evidence?: string;              // 引用:BusinessRule 條文 / 字典詞條 / SSOT 宣告
      suggestion?: string;            // 修正建議
    }>;
  }>;
  summary: { errors: number; warnings: number; infos: number; passed: boolean };
  // passed 判定:error 級全過。warning 不擋發佈但記錄在案。
}

export interface GovernedWideTable {
  id: number;
  slug: string;
  draftId: number;
  reportId: number;                   // 發佈時依據的報告(可追溯)
  blockKind: BlockKind;
  name: string;
  description: string;
  columns: ProposedColumn[];          // 凍結快照
  joinGraph: ProposedJoin[];
  relationships: WideTableProposal['relationships'];
  publishedBy: string;
  publishedAt: string;
  version: number;                    // 重發佈遞增,舊版保留於 versions/
}

/** 治理目錄 graph(發佈時增量重建,整檔落地 graph.json) */
export interface CatalogGraph {
  generatedAt: string;
  nodes: Array<{
    id: string;                       // 'gwt:bom-analysis' / 'tbl:plm-core.parts' / 'fld:...' / 'cpt:wip_lot'
    kind: 'governed-wide-table' | 'table' | 'field' | 'concept';
    label: string;
    meta: Record<string, unknown>;    // 欄位定義 / 概念定義等
  }>;
  edges: Array<{
    from: string; to: string;
    kind: 'composed_from' | 'joins_on' | 'maps_to_concept' | 'related_to' | 'has_field';
    meta?: Record<string, unknown>;   // 如 joins_on 的 on fields
  }>;
}
```

---

## 7. AI-readable Markdown 匯出格式(每張 GovernedWideTable 一份)

沿用你的 SOP 模板習慣:YAML front-matter + 固定四段。供 chatbot 直接以檔案為 grounding,也方便人讀。

```markdown
---
kind: governed-wide-table
slug: yield-equipment-analysis
block: medium
version: 3
published_at: 2026-06-11T10:00:00Z
concepts: [wip_lot, equipment, yield]
sources: [mes-process.process_records, mes_equipment.equipments, test-quality.test_results]
---

## Why(用途)
分析產品系列良率與設備的關聯…(description)

## Columns(欄位定義)
| column | type | definition | source(lineage) | concept |
|---|---|---|---|---|
| lot_id | VARCHAR(32) | 在製品批次唯一識別,SSOT=wip-tracking | wip-tracking.lots.lot_id | wip_lot |
| ... |

## Relationships(關聯)
- joins_with `mes_equipment.equipments` on `equip_id`
- upstream_of `gwt:monthly-yield-report`(subset)

## Verify(治理狀態)
- report #42:11/11 內建規則 pass,gov.* 6/6 pass
- warnings: 0
```

---

## 8. 工作流 Instance 實體

`GovernanceInstance`、`StationState`、`GatePolicy` 的完整型別定義見 `06-WORKFLOW-INSTANCE.md` §2(同樣放入 `packages/core/src/governance/types.ts`)。
