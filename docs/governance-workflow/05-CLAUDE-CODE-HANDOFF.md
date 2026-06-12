# 05 — Claude Code Handoff:啟動方式與開發約定

## 1. 放置位置

把本計劃包整個放進 repo:

```
db-master/
└── docs/
    └── governance-workflow/
        ├── 00-PLAN-OVERVIEW.md
        ├── 01-DATA-MODEL.md
        ├── 02-API-SPEC.md
        ├── 03-PIPELINE-DESIGN.md
        ├── 04-TASKS.md
        └── 05-CLAUDE-CODE-HANDOFF.md
```

## 2. CLAUDE.md 增補(append 至 repo 既有 CLAUDE.md)

```markdown
## Governance Workflow(進行中的大型功能)

正在實作五步驟資料治理工作流,完整規格在 `docs/governance-workflow/`。
開發任何相關任務前,必讀順序:
1. docs/governance-workflow/00-PLAN-OVERVIEW.md(整體)
2. 01-DATA-MODEL.md(型別與儲存 — 型別是合約,不可擅改欄位名)
3. 該任務對應的 02/03 章節
4. 04-TASKS.md 中該任務的驗收條件(AC)

### 硬性約定
- 儲存只用 fileStore.ts(檔案式 JSON),禁止引入任何 DB/ORM
- request body snake_case、response camelCase(Zod schema 兩側都要)
- 所有 LLM 產出必為 pending 狀態,人工核准才轉正;LLM 未設定時必須優雅降級(503 + 訊息,核心功能不癱)
- LLM prompt 一律放 prompts/*.md,程式內不可硬編 prompt 內文
- gov.* 規則必須是確定性純函式(不可呼叫 LLM),每條附正反例單元測試
- Instance 站點狀態以 artifacts 反推(recomputeStations 純函式),bypass/hold/manual complete 才持久化;
  各步驟 API 的 instance_id 一律選填,不帶時行為必須與沒有 instance 機制時完全一致
- required 站點的 bypass 必須回 409 GATE_REQUIRED,不可用前端隱藏按鈕代替後端卡控
- 改 packages/core 後必跑 npm run build -w packages/core
- 每個任務完成的定義 = 該任務 AC 全數通過(typecheck + test + 指定 curl/e2e)
- 新 UI 文案必須同時加 i18n 繁中與英文(apps/web/src/i18n.ts)
```

## 3. Kick-off prompt 範本(每個 Phase 開頭餵給 Claude Code)

```
請實作 docs/governance-workflow/04-TASKS.md 的 Phase {N}(任務 T{N}.1 ~ T{N}.x)。

步驟:
1. 先讀 docs/governance-workflow/ 的 00、01、02、03 與 04 的 Phase {N} 段落,以及 CLAUDE.md
2. 列出你的實作計劃(檔案清單 + 順序)讓我確認後再動工
3. 逐任務實作,每完成一個任務:跑 typecheck + 相關測試,貼出 AC 驗證結果
4. 全部完成後跑 npm test 全套,整理 commit(一個任務一個 commit,訊息格式:feat(gov): T{N}.x 描述)

限制:不要改動 docs/governance-workflow/ 內的規格;若實作中發現規格矛盾,停下來列出問題等我裁決。
```

## 4. 開發順序與依賴

```
Phase 0 ──→ Phase 1(知識庫)──┬──→ Phase 3(組裝)──→ Phase 4(工作區)──→ Phase 5 ──→ Phase 6
            Phase 2(分類)────┘                        Phase 5 的 T5.1(gov 規則)可提前並行
            Phase 7 T7.1/T7.2(Instance 狀態引擎+Gate,純 core)可緊接 Phase 0 並行
            Phase 7 T7.3/T7.4(掛載串接+UI)──→ 排在對應步驟完成後,最終整合於 Phase 5/6 之後
```

git worktree 並行建議:
- worktree A:Phase 1(`feature/gov-knowledge`)
- worktree B:Phase 2 的 T2.1/T2.2(`feature/gov-import`,不依賴知識庫的部分)
- worktree C:T5.1(`feature/gov-rules`,純 packages/core)
- worktree D:T7.1/T7.2(`feature/gov-instance`,狀態引擎 + Gate Policy,純 core + 獨立路由)

## 5. 風險與裁決點(先想好,避免開發中卡住)

| 風險 | 對策 |
|---|---|
| LLM 組裝幻覺(引用不存在的表/欄) | Pipeline C 後處理強制 source 存在性驗證已入規格(T3.2);違者標記降信心,不靜默修正 |
| 知識抽取品質不穩 | 一律 pending + 人工簽核;prompt 放檔案可迭代調整,不用改程式 |
| graph.json 隨規模膨脹 | 第一期全量重建可接受(估 <100 寬表);超過再做增量,API 介面不變 |
| `gov.single_source_of_truth` 在沒有任何 SSOT 宣告時形同虛設 | 規則設計:無宣告 → 該欄回 info 級「未宣告 SSOT」,提醒補知識庫,而非 pass 靜默 |
| retrieve 第一期關鍵字檢索召回不足 | API 介面已預留(top_k/expand_hops);第二期換 embedding 只動 service 內部 |
| 分類提案 confidence 過度自信 | 取 LLM 自報與規則式分數的較小值(03 已定);批次接受永遠有門檻參數 |
| Instance 站點狀態與實際資料漂移 | 狀態以 artifacts 反推(讀取時 lazy 重算 + 事件觸發重算雙保險),不存第二份真值 |
| Gate Policy 變更對進行中 instance 的影響不明確 | 建單時快照、不回溯;提供 resync-gate 顯式套用並記 audit,避免「政策一改、舊單突然全卡住」 |
| bypass 被濫用、流程形同虛設 | reason 必填 + events audit + 列表可篩「含 bypass 的 instance」;真正要硬性管控時上 required,卡控在後端 |

## 6. 第二期候選(本期明確不做)

- embedding 檢索(知識庫 + catalog retrieve)
- 寬表實體化(目前只產 VIEW SQL / 定義,不負責跑 ETL)— 你的 watermark+overlap upsert 模式屆時可接
- chatbot 本體(本期只做 retrieve API 作為 grounding 端點)
- DataHub lineage aspect 推送(本期只推 schema metadata)
- 多人同時編輯 draft 的鎖機制(檔案式儲存 last-write-wins,團隊 2–10 人先接受)
