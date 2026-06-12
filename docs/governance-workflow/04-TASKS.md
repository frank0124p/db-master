# 04 — Tasks:分階段開發任務(供 Claude Code 執行)

> 每個 Phase 是一個可獨立交付、可驗收的里程碑。建議一個 Phase 一個 branch(或 git worktree 並行不相依的 Phase)。
> 每個任務含:範圍、涉及檔案、驗收條件(AC)。**驗收條件全部可用 `npm run typecheck` + `npm test` + curl 驗證。**
> 開始任何 Phase 前先讀:`CLAUDE.md`、`docs/SPEC.md`、本計劃的 00–03。

---

## Phase 0 — 腳手架與型別(0.5 天)

### T0.1 新增 governance 型別與儲存腳手架
- `packages/core/src/governance/types.ts`:01-DATA-MODEL.md 的全部 interface,從 `packages/core/src/index.ts` re-export
- `apps/api/src/repositories/` 新增空殼:`knowledge.ts`、`import-batches.ts`、`wt-proposals.ts`、`workspace.ts`、`governance.ts`(先只有 list/get/save 泛型操作,基於 fileStore)
- `data/_sys/counters.json` 邏輯支援新計數器 key(knowledge/concept/bizRule/importBatch/wtProposal/wtDraft/valReport/governedWt)
- `.gitignore` 調整:`data/governance/catalog/` 納入版控
- **AC**:`npm run build -w packages/core && npm run typecheck` 全綠;新 repository 各有最小單元測試(寫入→讀回 roundtrip)

### T0.2 路由骨架與權限中介
- `apps/api/src/routes/` 新增六個路由檔(02-API-SPEC.md + 06 §5 全部端點,先回 501 Not Implemented),掛載至 main.ts
- 權限檢查中介(沿用現有 users/roles 讀取方式),套用 02 文末權限表
- **AC**:`curl` 各端點回 501(而非 404);無權限角色回 403

### T0.3 Instance 型別與 gate-policy 種子
- `GovernanceInstance` / `StationState` / `GatePolicy` 型別(06 §2)入 governance/types.ts
- `data/settings/gate-policy.json` 預設值(全站 required=false)+ repositories/instances.ts 腳手架
- **每個步驟 API 的 Zod schema 從第一天就含選填 `instance_id`**(實作掛載邏輯在 Phase 7,但欄位先收、先存)
- **AC**:roundtrip 測試;gate-policy GET 回預設值

---

## Phase 1 — Step 1 知識庫(2–3 天)

### T1.1 SourceDoc CRUD + chunk 切分
- repository + route 實作;chunk 規則:Markdown 標題/連續空行切分,單 chunk ≤ 1500 字,過長強制再切
- **AC**:POST 一份 3000 字 markdown → chunks ≥ 2;GET 回傳含 chunks

### T1.2 知識抽取 pipeline(SSE)
- `services/knowledge-extract.ts`:依 03 §Pipeline A;prompt 檔 `prompts/extract-knowledge.md`
- 去重合併邏輯獨立函式 + 單元測試(stdName 撞名合併 aliases)
- **AC**:用 repo 內 `data/ddl/` 對應的一段手寫業務說明測試,extract 產出 ≥ 1 張 pending 概念卡,且每張 sourceRefs 非空;無 LLM 設定時回 503 + 訊息

### T1.3 概念卡 / 業務規則 CRUD + 簽核
- 完整沿用字典簽核行為(pending/approved/rejected、reviewers、signedAt 保留邏輯)
- **AC**:approve 後 GET `?status=approved` 可見;maintainer 呼叫 approve 回 403

### T1.4 `POST /knowledge/retrieve` 檢索
- 純 TS:query 斷詞(空白+常見分隔)後比對 concept name/aliases/stdName、字典 stdName/aliases、BusinessRule title;命中計分排序
- **AC**:單元測試:查「批次」命中 alias 含「批次」的概念;top_k 生效

### T1.5 前端:知識庫頁
- `apps/web/src/pages/KnowledgePage.tsx`:三分頁(文件 / 概念卡 / 業務規則);文件詳情 + 「✦ 抽取」按鈕(SSE 進度);概念卡待審核區(沿用字典待審 UI 模式);i18n 繁中/英
- **AC**:e2e(Playwright):上傳文件 → 手動建一張概念卡 → admin 核准 → 列表可見

---

## Phase 2 — Step 2 批量導入分類(2–3 天)

### T2.1 ImportBatch 建立(重用 ddl-parser)
- `ddl_texts[]` 逐一 parseDDL → 建 schema(命名規則:批次名-序號 或 DDL 內 schema 名)→ 記 schemaIds
- **AC**:POST 兩段 DDL → 批次含 2 schema,tableCount 正確

### T2.2 規則式特徵計算
- `packages/core/src/governance/classifier-features.ts`:概念命中 / 字典覆蓋(重用 naming/matcher)/ 既有表相似度(欄位 Jaccard + 名稱 Levenshtein)
- **AC**:單元測試:與既有表欄位高度重疊的新表,similarTables top-1 score > 0.7

### T2.3 分類 pipeline(SSE)+ proposal 落地
- 依 03 §Pipeline B 兩階段;prompt `prompts/classify-table.md`
- **AC**:對含 5 張表的批次跑 classify → 5 筆 proposal,rationale.similarTables 非空;無 LLM 時仍產出(僅規則式,低信心)

### T2.4 accept / override / accept-all
- accept 寫回 schema meta(suite/domain/layer);override 記錄 by/at
- **AC**:accept 後 GET schema meta 已更新;accept-all `min_confidence=0.8` 只動高信心者

### T2.5 前端:批次審核頁
- `ImportBatchPage.tsx`:批次列表 → 詳情表格(表名 / 建議分類 / confidence 色階 / rationale 展開 / 接受/改派);批次接受 + 門檻輸入
- **AC**:e2e:建批次 → classify → override 一筆 → 側欄該 schema 出現在新 domain 下

---

## Phase 3 — Step 3 情境組裝(3 天)

### T3.1 候選池組建(純 TS)
- `services/compose.ts` 第①②段:知識檢索 → 候選表(含欄位/comment/PK/FK/sample 摘要),SSOT hint 表優先
- **AC**:單元測試:情境含某概念 alias → 該概念 tableHints 的表進候選池且排序在前

### T3.2 LLM 組裝 + 後處理驗證(SSE)
- prompt `prompts/compose-wide-table.md`(03 §Pipeline C 的全部約束);後處理:source 存在性 / JOIN 型別 / 命名 matcher 附掛
- **AC**:對 repo 種子 DDL 跑一個情境 → 產出 ≥1 個 proposal,每欄 source 可在系統中查到;故意讓 LLM 引用不存在表的 mock 測試 → 該欄被標記

### T3.3 proposal CRUD + to-draft
- to-draft:深拷貝為 WideTableDraft,proposalId 回鏈,提案 status=drafted
- **AC**:to-draft 後 workspace 列表出現草稿,draft.proposalId 正確

### T3.4 前端:情境組裝頁
- `ComposePage.tsx`:情境輸入框 + 候選範圍選擇(全部 / 指定 batch / 指定 schema)→ SSE 即時顯示 trace 步驟 → 提案卡片(欄位表 / JOIN 圖(重用寬表關聯圖元件)/ 關聯性 / 思路摺疊區)→「轉入工作區」
- **AC**:e2e:輸入情境 → 看到 ≥3 個 trace 步驟 → 轉入工作區成功

---

## Phase 4 — Step 4 工作區(2 天)

### T4.1 Draft 編輯 + editLog + 版本
- PATCH 時後端 diff(欄位級)產生 editLog;versions 快照(沿用 versions repo 模式)
- **AC**:改一欄 definition → editLog 多一筆 edit-column 且含 before/after;存兩版後 versions.length=2

### T4.2 preview-sql
- 重用 `previewWideTable()`,輸入改為 draft 的 joinGraph/columns
- **AC**:含 2 表 JOIN 的 draft 預覽出合法 SQL(以 ddl-parser emitter 的 dialect 檢查驗證)

### T4.3 前端:工作區頁
- `WorkspacePage.tsx`:左欄「提案原文 + 思路」(唯讀),右欄可編輯草稿(欄位表 inline 編輯 / JOIN 編輯 / 關聯編輯);editLog 時間軸;SQL 預覽抽屜;「存版本」「送檢查」按鈕
- **AC**:e2e:編輯欄位 → 存版本 → editLog 與版本歷史正確呈現

---

## Phase 5 — Step 5 治理檢查 + 發佈(3 天)

### T5.1 gov.* 規則組
- `packages/core/src/rules/governance.ts` + `runGovernanceRules(draft, ctx)`(03 規格的 7 條),每條獨立單元測試(正反例)
- 規則註冊進現有 RulesPage 可見、可調嚴重度/停用(沿用 overrides)
- **AC**:7 條 × 正反例測試全綠;UI 規則頁出現 gov 分組

### T5.2 validate 端點 + ValidationReport
- 組 GovernanceContext(讀全庫表 / approved 知識 / 字典 / governed)→ 跑既有 engine(寬表欄位視為虛擬 table)+ gov 規則 → 報告落地;draft.status 更新
- **AC**:故意建一個違反 SSOT 的 draft → 報告 `gov.single_source_of_truth` fail,violations 含「應為來源」與引用的 BusinessRule;修正後 re-validate → passed

### T5.3 publish + catalog graph + Markdown 匯出
- 依 03 §Catalog Graph 重建邏輯;Markdown 模板照 01 §7;失敗(非 passed)回 409
- **AC**:publish 後 `GET /catalog/graph` 含該寬表節點與 composed_from 邊;`GET .../markdown` 回傳含 YAML front-matter 的文件;draft status=published

### T5.4 catalog retrieve API
- 03 所述關鍵字檢索 + graph 鄰居展開(expand_hops 預設 1)
- **AC**:對已發佈寬表,用情境式 query 檢索 → top-1 命中,neighbors 含 joins_on

### T5.5 前端:報告頁 + 治理目錄頁
- `ValidationReportView`(嵌入工作區):逐規則 pass/fail、violations 表格(target / message / evidence / suggestion)、「發佈」按鈕(passed 才亮)
- `CatalogPage.tsx`:已發佈寬表列表 → 詳情(欄位定義表 / lineage / graph 局部視圖(重用 ER 卡片佈局)/ Markdown 預覽)
- **AC**:e2e 全流程:建草稿 → validate fail → 修 → pass → publish → catalog 可見

---

## Phase 6 — 整合與打磨(2 天)

### T6.1 全流程 e2e
- Playwright 串五步驟:傳知識文件 → 核准概念 → 匯批次 DDL → 接受分類 → 情境組裝 → 工作區編輯 → validate → publish → retrieve 查到
- **AC**:單一 e2e spec 全綠,CI(.github/workflows)納入

### T6.2 工作流導航 UI
- 側欄新增「治理工作流」分組(5 步驟入口,顯示各步驟待辦數:pending 概念 / 待審分類 / 草稿數 / 未過報告數)
- **AC**:各計數與實際資料一致

### T6.3 DataHub 推送 governed 寬表(選配)
- 重用 datahub service,URN 平台標記 `governed`
- **AC**:推送記錄出現於 push-log

### T6.4 文件
- 更新 README(工作流章節 + 截圖位)、docs/SPEC.md 增補、CLAUDE.md 增補(見 05 文件)
- **AC**:README 的 curl 範例可照打成功

---

## Phase 7 — Workflow Instance:上線單與站點追蹤(2.5–3 天)

> 規格全文:`06-WORKFLOW-INSTANCE.md`。可在 Phase 0 之後與 Phase 1–5 並行開發(只依賴型別與各 API 已收 `instance_id` 欄位);
> 但「自動掛載」的整合測試需等對應步驟完成,故整合段排在 Phase 5 之後。

### T7.1 Instance CRUD + 站點狀態引擎
- repositories/instances.ts 完整實作;`recomputeStations(instance, artifacts)` 純函式入 packages/core(出站條件判定,06 §1 表格五條,各附正反例單元測試)
- 站點狀態機(06 §3):start / bypass / reopen / manual complete / hold / resume / cancel;events 落地
- **AC**:單元測試:某 instance 掛 1 張 approved 概念卡 → knowledge 站自動 done;刪除該關聯 → 降回 in-progress 並記事件

### T7.2 Gate Policy 與卡控
- GET/PATCH gate-policy(PATCH admin only);建單時快照 required 至各站;resync-gate 端點
- bypass 卡控:required 站回 409 `GATE_REQUIRED`;角色不符 403;completed 判定需所有 required 站以出站條件結案
- **AC**:把 validate 設 required → 該站 bypass 回 409;其餘站 bypass 成功且 instance 可繼續前進但無法 completed

### T7.3 instance_id 自動掛載串接
- 為 02/06 表列的各步驟端點補上掛載邏輯(寫入 artifacts.* + 觸發 recompute);attach/detach 手動端點
- **AC**:帶 instance_id 跑 extract → instance.artifacts.sourceDocIds 含該文件;to-draft 後 compose 站 exitCheck.met=true

### T7.4 前端:InstanceListPage + InstanceDetailPage
- 列表(站點進度條五格:✓/⤳/●/🔒/○)+ 詳情(橫向站點軌道圖、每站 artifacts 面板與快速行動、bypass 對話框含 reason 必填、事件 timeline)
- 各步驟頁面頂部「instance 選擇器」context bar(選定後操作自動帶 instance_id)
- gate-policy 設定頁(設定 → 站點卡控,admin only)
- **AC**:e2e:建上線單 → bypass knowledge 站(填 reason)→ 進度條第一格顯示 ⤳ → 在 classify 站建批次(經選擇器)→ 詳情頁 classify 站 in-progress 且列出該批次

### T7.5 全流程 e2e 增補
- 在 T6.1 的全流程 spec 外,加一條「instance 視角」spec:建單 → 五站走完(其中一站 bypass)→ instance completed;再把該站設 required → 新建單 → 驗證卡控
- **AC**:兩條 spec 全綠,CI 納入

---

## 估時總覽

| Phase | 內容 | 估時 |
|---|---|---|
| 0 | 腳手架(含 instance 型別/policy 種子) | 0.5–1 天 |
| 1 | 知識庫 | 2–3 天 |
| 2 | 批量分類 | 2–3 天 |
| 3 | 情境組裝 | 3 天 |
| 4 | 工作區 | 2 天 |
| 5 | 檢查+發佈+目錄 | 3 天 |
| 6 | 整合打磨 | 2 天 |
| 7 | Workflow Instance(站點追蹤 + Gate) | 2.5–3 天 |
| **合計** | | **約 17–20 個 Claude Code 工作天**(可 worktree 並行壓縮) |

並行建議:Phase 1 與 Phase 2 的 T2.1/T2.2(不依賴知識庫)可並行;Phase 4 與 Phase 5 的 T5.1(純 core 規則)可並行;**Phase 7 的 T7.1/T7.2(狀態引擎與卡控,純 core + instances 路由)可在 Phase 0 後即開工**,T7.3/T7.4 等對應步驟就緒後串接。
