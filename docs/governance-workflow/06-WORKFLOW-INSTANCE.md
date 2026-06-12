# 06 — Workflow Instance:資料主題上線單與站點追蹤

> 新需求:每當有**新的 data subject(資料主題)**要進入治理流程,系統建立一個 **GovernanceInstance(上線單)**,
> 沿著五大步驟的 **route(途程)** 前進。任何時刻都能清楚看到 instance 停在哪個 **station(站點)**;
> 每個站點可由使用者自由決定 **bypass(跳站)**;未來可透過 **Gate Policy** 卡控哪些站點必過、不可 bypass。
>
> 概念對齊 MES:Instance = WIP/Lot,Route = 途程,Station = 站點,Bypass = 跳站,Gate = 卡控,Hold = 暫停。

---

## 1. 站點定義(Route)

預設 route 為五站,直接對應五大步驟:

| 順序 | stationId | 名稱 | 對應步驟 | 出站條件(exit criteria,系統自動判定) |
|---|---|---|---|---|
| 1 | `knowledge` | 知識庫 | Step 1 | 本 instance 關聯 ≥ 1 張 **approved** ConceptCard |
| 2 | `classify` | 導入分類 | Step 2 | 本 instance 關聯的 ImportBatch 內所有 proposal 皆已 accepted / overridden / rejected |
| 3 | `compose` | 情境組裝 | Step 3 | ≥ 1 個 WideTableProposal 已轉為 draft(status=drafted) |
| 4 | `review` | 審核工作區 | Step 4 | ≥ 1 個 draft 被標記 `ready-for-validation`(工作區按鈕) |
| 5 | `validate` | 檢查與發佈 | Step 5 | ≥ 1 個 draft 取得 passed 報告 **且** 已 publish 為 GovernedWideTable |

設計原則:
- **出站條件 = 系統自動偵測**,不需要手動「完成站點」(也提供手動 complete 作為例外操作,記 audit)。
- **站點狀態由 artifacts 反推**:instance 不另存進度真值,而是在讀取時(或 artifact 事件後)依關聯 artifacts 重新計算,避免狀態與實際資料漂移。bypass / hold / 手動 complete 為例外,持久化於 instance。
- route 第一期固定五站;`routeTemplate` 欄位先預留,未來可定義不同主題用不同途程(例如「只補知識不建寬表」的短 route)。

---

## 2. 資料模型(加入 `packages/core/src/governance/types.ts`)

```ts
export type StationId = 'knowledge' | 'classify' | 'compose' | 'review' | 'validate';

export type StationStatus =
  | 'not-started'      // 尚未進站
  | 'in-progress'      // 已進站(有任一關聯 artifact 或手動 start)
  | 'done'             // 出站條件達成
  | 'bypassed'         // 人工跳站(記 by/at/reason)
  | 'blocked';         // Gate 卡控:required 站點未過,且前方站點嘗試前進 → 顯示阻擋

export interface StationState {
  station: StationId;
  status: StationStatus;
  enteredAt?: string;
  completedAt?: string;
  manualComplete?: { by: string; at: string; reason: string };   // 例外:手動完成
  bypass?: { by: string; at: string; reason: string };           // 跳站紀錄(必填 reason)
  gate: {
    required: boolean;          // 建單時自 Gate Policy 快照(之後政策變更不回溯,除非 re-sync)
    source: 'policy' | 'override';
  };
  exitCheck?: {                  // 最近一次自動判定結果(可解釋)
    met: boolean;
    detail: string;              // 如「2/5 proposals 尚未審核」
    checkedAt: string;
  };
}

export interface GovernanceInstance {
  id: number;
  slug: string;
  subjectName: string;           // 資料主題,如「設備保養資料」「新 EAP 系統」
  description?: string;
  owner: { userId: number; name: string };
  suiteId?: number;              // 歸屬 Suite(權限與篩選用)
  routeTemplate: 'default-5';    // 預留
  stations: StationState[];      // 依 route 順序
  /** 目前站點 = 第一個 status 不是 done/bypassed 的站;全過 = 'completed' */
  currentStation: StationId | 'completed';
  /** 各步驟 artifacts 關聯(自動掛載 + 手動 attach 並存) */
  artifacts: {
    sourceDocIds: number[];
    conceptIds: number[];
    businessRuleIds: number[];
    importBatchIds: number[];
    wtProposalIds: number[];
    draftIds: number[];
    reportIds: number[];
    governedIds: number[];
  };
  status: 'active' | 'on-hold' | 'completed' | 'cancelled';
  holdReason?: string;
  createdAt: string;
  updatedAt: string;
}
```

### Gate Policy(`data/settings/gate-policy.json`)

```ts
export interface GatePolicy {
  stations: Record<StationId, {
    required: boolean;           // true = 不可 bypass、出站條件必須達成才能讓後續站點 done
    note?: string;               // 政策說明(顯示於 UI)
  }>;
  bypassRoles: Array<'admin' | 'suite_owner' | 'maintainer'>;  // 誰可以執行 bypass(非 required 站)
  manualCompleteRoles: Array<'admin' | 'suite_owner'>;          // 誰可以手動 complete
}
```

預設值(= 你現在要的「全部可自由 bypass」):
```json
{
  "stations": {
    "knowledge": { "required": false },
    "classify":  { "required": false },
    "compose":   { "required": false },
    "review":    { "required": false },
    "validate":  { "required": false }
  },
  "bypassRoles": ["admin", "suite_owner", "maintainer"],
  "manualCompleteRoles": ["admin", "suite_owner"]
}
```

未來上卡控只需改 policy(UI 可改,admin only),例如把 `validate.required` 設 true:
- 該站 **bypass 按鈕直接禁用**(API 回 409 `GATE_REQUIRED`)
- instance 要到 `completed`,該站必須以「出站條件達成」結案
- 已存在的 instance 不回溯;UI 提供「re-sync gate」按鈕讓單一 instance 套用新政策(記 audit)

---

## 3. 站點狀態機

```
not-started ──(關聯到任一該站 artifact / 手動 start)──▶ in-progress
in-progress ──(exitCheck.met = true,自動)────────────▶ done
in-progress ──(manual complete,需角色+reason)────────▶ done
not-started / in-progress ──(bypass,需角色+reason;required 站禁止)──▶ bypassed
bypassed ──(reopen)──▶ in-progress        // 跳了之後反悔可回補
done ──(關聯 artifact 變動導致 exitCheck 不再成立,如 draft 被刪)──▶ in-progress(自動降回,記事件)
```

`currentStation` 推導:由前往後找第一個非 done/bypassed 的站。**bypass 不影響後續站點進行**(這就是「自由決定要不要跳」);required 站未過時,後續站可以 in-progress,但 instance 永遠到不了 completed,且 UI 在該站顯示 `blocked` 徽章提示。

---

## 4. Artifacts 自動掛載(instance_id 串接)

各步驟既有/新增 API 一律增加**選填** `instance_id`(request body snake_case):

| API | 掛載行為 |
|---|---|
| `POST /knowledge/sources`、`/sources/:id/extract` | sourceDocIds、產出的 conceptIds/businessRuleIds 掛入 |
| `POST /import-batches`、`:id/classify` | importBatchIds 掛入 |
| `POST /wide-table-proposals/compose` | wtProposalIds 掛入;`candidate scope` 可預設為該 instance 的 batches |
| `POST /wide-table-proposals/:id/to-draft` | draftIds 掛入 |
| `POST /workspace/drafts/:id/validate`、`/publish` | reportIds、governedIds 掛入 |

- 不帶 `instance_id` 一切照舊(instance 機制是 opt-in,不影響現有流程與單獨使用各功能)。
- 另提供手動 attach/detach(把先前已存在的 artifact 補掛進 instance)。
- 任何掛載/移除事件後,後端重算該 instance 全部站點的 exitCheck 並落地(讀取時也會 lazy 重算,雙保險)。

---

## 5. API(`routes/instances.ts`)

| 方法 | 路徑 | 說明 |
|---|---|---|
| POST | `/api/v1/instances` | 建上線單 `{ subject_name, description?, suite_id?, owner_user_id }` → 套用當前 GatePolicy 快照建 route |
| GET | `/api/v1/instances` | 列表 `?status=&suite_id=&station=`(station 篩選 = currentStation) |
| GET | `/api/v1/instances/:id` | 詳情:stations(含 exitCheck.detail)、artifacts(展開摘要)、currentStation |
| PATCH | `/api/v1/instances/:id` | 更新 meta(subject_name / description / owner) |
| POST | `/api/v1/instances/:id/stations/:station/start` | 手動進站(status → in-progress) |
| POST | `/api/v1/instances/:id/stations/:station/bypass` | 跳站 `{ reason }`;required 站回 409 `GATE_REQUIRED`;角色不符 403 |
| POST | `/api/v1/instances/:id/stations/:station/reopen` | 取消 bypass / 將 done 重開(記 audit) |
| POST | `/api/v1/instances/:id/stations/:station/complete` | 手動完成 `{ reason }`(manualCompleteRoles) |
| POST | `/api/v1/instances/:id/attach` | `{ kind, ref_id }` 手動掛 artifact(kind = source_doc / concept / import_batch / proposal / draft / report / governed) |
| POST | `/api/v1/instances/:id/detach` | 反向操作 |
| POST | `/api/v1/instances/:id/hold` | 暫停 `{ reason }` |
| POST | `/api/v1/instances/:id/resume` | 恢復 |
| POST | `/api/v1/instances/:id/cancel` | 作廢 |
| POST | `/api/v1/instances/:id/resync-gate` | 套用最新 GatePolicy(記 audit) |
| GET | `/api/v1/settings/gate-policy` | 取得政策 |
| PATCH | `/api/v1/settings/gate-policy` | 更新政策(admin only) |

儲存:`data/instances/{id}.json`;計數器 key `instance`。

事件紀錄:instance 內附 `events: Array<{at, by, type, detail}>`(進站/出站/bypass/hold/attach…),作為單內 audit timeline,UI 直接渲染。

---

## 6. UI — Instance 看板與站點追蹤

### `InstanceListPage.tsx`(上線單列表)
- 卡片/表格列出 active instances:主題名、owner、**站點進度條**(五格,✓ done / ⤳ bypassed / ● current / 🔒 blocked / ○ not-started)、currentStation 名稱、停留天數
- 篩選:狀態 / Suite / 目前站點
- 「+ 新資料主題」建單

### `InstanceDetailPage.tsx`(單一上線單)
- 頂部:**橫向站點軌道圖**(MES route 風格)——五站節點 + 連線,當前站高亮;每站節點 hover 顯示 exitCheck.detail(如「2/5 proposals 尚未審核」)
- 每站展開面板:
  - 該站關聯 artifacts 清單(可點擊跳轉至對應頁:知識庫 / 批次審核 / 提案 / 工作區 / 報告)
  - 該站快速行動按鈕(如 classify 站直接「建批次並匯入」,帶上 instance_id)
  - **「跳過此站」按鈕** + reason 對話框;required 站顯示 🔒 與政策 note,按鈕禁用
  - 手動 complete / reopen(依角色)
- 右側:事件 timeline(events)
- 全站皆 done/bypassed → 頂部顯示「✓ 已完成上線」;有 required 未過 → 顯示阻擋原因清單

### 各步驟頁面的反向整合
- 知識庫 / 批次 / 組裝 / 工作區頁面頂部新增「instance 選擇器」(選填):選定後該頁所有操作自動帶 instance_id,並顯示「目前在替 ○○ 主題作業」context bar。

---

## 7. Gate 卡控的未來擴充(本期只做 required 布林)

第二期可演進的卡控維度(介面已預留 `gate.source` 與 policy 結構,屆時擴 policy schema 即可):
- **條件式 required**:如「blockKind=medium 的主題,validate 必過」
- **站點級門檻**:如 classify 站要求 avgConfidence ≥ 0.7 或人工覆核率 100%
- **簽核型 gate**:站點出站需指定角色簽核(重用 reviewers 結構)
- **SLA 提醒**:停站超過 N 天通知 owner
