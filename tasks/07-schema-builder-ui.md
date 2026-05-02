# Task 07: Schema Builder UI

**Phase**: 1
**Effort**: ~2d
**Depends on**: 03, 04, 06
**Branch**: `task/07-schema-builder-ui`

## Goal

實作 Schema 建立、編輯、管理的主要 UI。完成後使用者可以：
- 建立 / 瀏覽 Schema 列表
- 新增 / 編輯 Table 和 Field
- 在輸入欄位名時，即時看到命名字典建議

## 頁面與元件

### `/schemas` — Schema 列表頁
- 顯示所有 schemas（名稱、domain、table 數量、更新時間）
- 「+ 新建 Schema」按鈕 → modal 輸入名稱/說明
- 點選 schema → 進入詳細頁

### `/schemas/:id` — Schema 詳細頁
- 左欄：Table 列表（可點選展開欄位）
- 右欄：選中 Table 的欄位編輯區
- 「+ 新增 Table」按鈕
- 「匯入 DDL」按鈕（呼叫 task 05 的 import API）
- 「匯出 DDL」按鈕（下載 .sql 檔）

### `FieldEditor` 元件
- 欄位名輸入框：失焦時呼叫 `/api/v1/naming-dictionary/check`
- 若有建議（alias / fuzzy）→ 在輸入框下方顯示 inline 提示：
  ```
  ⚠ "equipment_id" 可能是 "equip_id" 的別名（設備ID）
  [採用建議] [忽略]
  ```
- 型別選擇器（dropdown）：常用型別列表
- nullable toggle、default value、comment 欄位

### `/naming-dictionary` — 命名字典管理頁
- 表格顯示所有詞彙（concept, std_name, aliases, domain）
- filter by domain
- inline 編輯 / 新增 / 刪除

## Acceptance Criteria

- [ ] 可以建立 Schema → 新增 Table → 新增 Fields 完整流程
- [ ] 欄位名輸入後，命名字典比對建議正確顯示
- [ ] 採用建議後，欄位名自動更新
- [ ] DDL 匯入：貼上 SQL → 建立 Schema，成功顯示解析結果
- [ ] DDL 匯出：點選按鈕下載 `.sql` 檔
- [ ] 命名字典 CRUD 在 `/naming-dictionary` 頁面可操作
- [ ] TanStack Query 快取：編輯後列表自動更新（不需手動 refresh）
- [ ] `pnpm typecheck` 通過
