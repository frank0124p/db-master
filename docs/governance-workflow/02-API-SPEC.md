# 02 — API Spec:新增端點

> 慣例沿用現有 repo:
> - request body **snake_case**,response **camelCase**
> - 長任務(LLM)用 **SSE**(`text/event-stream`),事件型別沿用 `{type: "token"|"done"|"error"|...}`
> - 自訂動作用 POST 子路徑(`/:id/approve` 風格)
> - 路由檔放 `apps/api/src/routes/`,薄層 + Zod 驗證;業務邏輯在 services/、I/O 在 repositories/

---

## Step 1 — Knowledge Base(`routes/knowledge.ts`)

| 方法 | 路徑 | 說明 |
|---|---|---|
| POST | `/api/v1/knowledge/sources` | 上傳/貼入文件 `{ title, format, content }` → 建 SourceDoc + 自動 chunk |
| GET | `/api/v1/knowledge/sources` | 文件列表 |
| GET | `/api/v1/knowledge/sources/:id` | 文件詳情(含 chunks) |
| DELETE | `/api/v1/knowledge/sources/:id` | 刪除(若有概念引用則 409) |
| POST | `/api/v1/knowledge/sources/:id/extract` | **SSE**:LLM 抽取 → 串流產生 ConceptCard / BusinessRule 草稿(status=pending) |
| GET | `/api/v1/knowledge/concepts` | 概念列表 `?status=&domain=&q=`(q 比對 name/aliases) |
| POST | `/api/v1/knowledge/concepts` | 手動新增概念(pending) |
| PATCH | `/api/v1/knowledge/concepts/:id` | 更新 |
| POST | `/api/v1/knowledge/concepts/:id/approve` | 核准(權限同字典:admin / suite_owner) |
| POST | `/api/v1/knowledge/concepts/:id/reject` | 拒絕 `{ reason }` |
| POST | `/api/v1/knowledge/concepts/:id/reviewers` | 指派審核人(同字典格式) |
| GET/POST/PATCH + approve/reject | `/api/v1/knowledge/business-rules...` | BusinessRule 同構 CRUD + 簽核 |
| POST | `/api/v1/knowledge/retrieve` | 內部檢索 `{ query, top_k? }` → 命中的 concepts/rules/dict entries(Step 2/3 pipeline 也走這支,方便測試) |

SSE 事件(extract):
```
data: {"type":"chunk-progress","done":3,"total":12}
data: {"type":"concept-draft","concept":{...}}
data: {"type":"rule-draft","rule":{...}}
data: {"type":"done","conceptCount":8,"ruleCount":3}
```

---

## Step 2 — Import & Classification(`routes/import-batches.ts`)

| 方法 | 路徑 | 說明 |
|---|---|---|
| POST | `/api/v1/import-batches` | 建批次 `{ name, ddl_texts: string[] }` 或 `{ name, from_ddl_dir: true }` → 解析 DDL 建 schema/tables(重用 ddl-parser + ddl-import 邏輯),status=imported |
| GET | `/api/v1/import-batches` | 批次列表 |
| GET | `/api/v1/import-batches/:id` | 批次詳情(含 proposals) |
| POST | `/api/v1/import-batches/:id/classify` | **SSE**:跑分類 pipeline,逐表產出 ClassificationProposal |
| POST | `/api/v1/import-batches/:id/proposals/:tableId/accept` | 接受建議 → 寫回 schema meta(suite/domain/layer) |
| POST | `/api/v1/import-batches/:id/proposals/:tableId/override` | 人工改派 `{ suite_id?, domain?, layer_type? }` → 寫回 + 記 override |
| POST | `/api/v1/import-batches/:id/proposals/accept-all` | 批次接受 `{ min_confidence?: number }`(只接受高於門檻者) |

SSE 事件(classify):
```
data: {"type":"table-classified","proposal":{...}}
data: {"type":"done","total":42,"avgConfidence":0.81}
```

---

## Step 3 — Compose(`routes/wt-proposals.ts`)

| 方法 | 路徑 | 說明 |
|---|---|---|
| POST | `/api/v1/wide-table-proposals/compose` | **SSE**:`{ scenario, block_kind?, include_batch_ids?, schema_ids? }` → 跑組裝 pipeline,串流 reasoningTrace 各步 + 最終 proposals |
| GET | `/api/v1/wide-table-proposals` | 提案列表 `?status=` |
| GET | `/api/v1/wide-table-proposals/:id` | 提案詳情(含思路、關聯) |
| POST | `/api/v1/wide-table-proposals/:id/to-draft` | 轉入工作區 → 建 WideTableDraft,提案 status=drafted |
| POST | `/api/v1/wide-table-proposals/:id/discard` | 捨棄 |

SSE 事件(compose):
```
data: {"type":"trace","step":"concept-retrieval","detail":"命中 3 個概念:wip_lot, equipment, yield"}
data: {"type":"trace","step":"candidate-selection","detail":"候選 7 張表(含 batch #3 新匯入 2 張)"}
data: {"type":"token","text":"..."}            // LLM 串流
data: {"type":"proposal","proposal":{...}}      // 可能多個
data: {"type":"done","proposalCount":2}
```

---

## Step 4 — Workspace(`routes/workspace.ts`)

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | `/api/v1/workspace/drafts` | 草稿列表 `?status=` |
| GET | `/api/v1/workspace/drafts/:id` | 草稿詳情(含 editLog、versions、lastReport) |
| PATCH | `/api/v1/workspace/drafts/:id` | 編輯(columns/joins/meta;後端 diff 出 editLog 條目) |
| POST | `/api/v1/workspace/drafts/:id/versions` | 存版本快照 `{ message? }` |
| POST | `/api/v1/workspace/drafts/:id/preview-sql` | 產生 JOIN SQL 預覽(重用 previewWideTable()) |
| DELETE | `/api/v1/workspace/drafts/:id` | 刪除草稿 |

---

## Step 5 — Validation & Catalog(`routes/governance.ts`, `routes/catalog.ts`)

| 方法 | 路徑 | 說明 |
|---|---|---|
| POST | `/api/v1/workspace/drafts/:id/validate` | 跑檢查(同步即可,規則引擎非 LLM)→ 建 ValidationReport,回報告;draft.status 更新 passed/failed |
| GET | `/api/v1/governance/reports/:id` | 報告詳情 |
| GET | `/api/v1/governance/reports?draft_id=` | 某草稿的歷史報告 |
| POST | `/api/v1/workspace/drafts/:id/publish` | 發佈(僅 status=passed 可呼叫)→ 建/更新 GovernedWideTable + 重建 graph + 產出 Markdown;權限 admin/suite_owner |
| GET | `/api/v1/catalog/wide-tables` | 治理目錄列表 |
| GET | `/api/v1/catalog/wide-tables/:slug` | 單張詳情(含欄位定義、lineage、關聯) |
| GET | `/api/v1/catalog/wide-tables/:slug/markdown` | AI-readable Markdown(`text/plain`) |
| GET | `/api/v1/catalog/graph` | 完整 CatalogGraph JSON |
| POST | `/api/v1/catalog/retrieve` | **chatbot 檢索**:`{ query, top_k?, expand_hops? }` → 相關寬表 + 欄位 + graph 鄰居(見下) |
| POST | `/api/v1/catalog/push-datahub` | 推送選定 GovernedWideTable 至 DataHub(重用 datahub service) |

### `POST /api/v1/catalog/retrieve` response 形狀

```jsonc
{
  "query": "查某批次經過哪些設備、良率多少",
  "hits": [
    {
      "wideTable": { "slug": "yield-equipment-analysis", "name": "...", "description": "..." },
      "score": 0.92,
      "matchedConcepts": ["wip_lot", "equipment", "yield"],
      "columns": [ { "name": "lot_id", "definition": "...", "source": "wip-tracking.lots.lot_id" } ],
      "neighbors": [                    // graph 展開 expand_hops 跳
        { "kind": "joins_on", "target": "tbl:mes_equipment.equipments", "on": ["equip_id"] },
        { "kind": "related_to", "target": "gwt:monthly-yield-report", "relation": "upstream_of" }
      ]
    }
  ],
  "suggestedJoinPath": ["wip-tracking.lots", "mes-process.process_records", "test-quality.test_results"]
}
```

> 檢索實作第一期:concept alias / 字典 / 欄位名的關鍵字比對 + 簡單評分(命中概念數加權)。介面先定好,第二期可換 embedding 不動 API。

---

## 權限對照(沿用 4 級角色)

| 動作 | admin | suite_owner | maintainer | viewer |
|---|---|---|---|---|
| 知識抽取 / 新增概念(pending) | ✓ | ✓ | ✓ | — |
| 概念/規則核准 | ✓ | ✓(自己 Suite) | — | — |
| 批次匯入 + 跑分類 | ✓ | ✓ | ✓ | — |
| 接受/改派分類 | ✓ | ✓(自己 Suite) | — | — |
| 情境組裝 + 草稿編輯 | ✓ | ✓ | ✓ | — |
| validate | ✓ | ✓ | ✓ | — |
| **publish** | ✓ | ✓(自己 Suite) | — | — |
| catalog 讀取 / retrieve | ✓ | ✓ | ✓ | ✓ |

---

## Workflow Instance(`routes/instances.ts`)

完整端點表見 `06-WORKFLOW-INSTANCE.md` §5。重點摘要:

- `POST /api/v1/instances` 建上線單(套用 GatePolicy 快照)
- `GET /api/v1/instances/:id` 回傳站點狀態(含 exitCheck 解釋)與 artifacts
- `POST /api/v1/instances/:id/stations/:station/bypass | start | complete | reopen`
- `GET/PATCH /api/v1/settings/gate-policy`(PATCH 限 admin)
- **既有各步驟 API 一律新增選填 `instance_id`**(snake_case body),帶入即自動掛載 artifacts 並重算站點狀態;不帶則行為完全不變

權限補充:bypass 依 `gate-policy.bypassRoles`;required 站 bypass 一律 409 `GATE_REQUIRED`;manual complete 依 `manualCompleteRoles`。
