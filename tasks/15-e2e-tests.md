# Task 15: E2E Tests

**Phase**: 3
**Effort**: ~1d
**Depends on**: 14
**Branch**: `task/15-e2e-tests`

## Goal

用 Playwright 覆蓋所有核心使用者流程，確保 v1 功能完整可交付。

## 測試流程清單

### Flow 1: 手動建立 Schema
1. 進入 `/schemas`
2. 點「+ 新建 Schema」，輸入名稱「Test Schema」
3. 進入 Schema 詳細頁，新增 table `lot_records`
4. 新增欄位 `equipment_id`（VARCHAR(64)）
5. 驗證命名建議出現（⚠ 建議改為 `equip_id`）
6. 點「採用建議」
7. 驗證欄位名改為 `equip_id`

### Flow 2: DDL 匯入
1. 點「匯入 DDL」，貼上包含 3 個表的 CREATE TABLE SQL
2. 驗證 Schema 正確顯示 3 個表和對應欄位
3. 點「匯出 DDL（MariaDB）」
4. 驗證下載的 SQL 語法正確

### Flow 3: NL → Schema
1. 點「用自然語言描述」
2. 輸入「建立一個批次追蹤系統，記錄批次號、晶圓數、目前狀態、建立時間」
3. 等待生成完成
4. 驗證生成的 schema 含有 `lot_id`、`wafer_count`、`lot_status` 等欄位

### Flow 4: Schema 分析
1. 對一個含有命名問題的 Schema 點「分析 Schema」
2. 驗證分析結果中出現命名問題（severity warning 以上）
3. 驗證「採用」建議後，欄位名更新

### Flow 5: 版本 Diff
1. 修改 Schema 欄位名（e.g. `equipment_id` → `equip_id`）
2. 儲存版本
3. 進入 Versions tab
4. 驗證 diff 顯示命名字典狀態（⚠ → ✓）

### Flow 6: 命名字典管理
1. 進入 `/naming-dictionary`
2. 新增一筆詞彙（concept: `測試概念`, std_name: `test_concept`）
3. 驗證儲存後列表出現新詞彙
4. 刪除該詞彙，驗證消失

## 設定

- Playwright base URL: `http://localhost:5173`
- 測試前執行 `pnpm db:migrate` + `pnpm db:seed`
- 每個 test 獨立清理資料（或用獨立 DB schema）

## Acceptance Criteria

- [ ] 所有 6 個 flow 測試通過
- [ ] `pnpm test:e2e` 指令可執行
- [ ] CI 可以執行（Playwright headless mode）
