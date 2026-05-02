# Task 11: Schema Versioning

**Phase**: 2
**Effort**: ~1d
**Depends on**: 03
**Branch**: `task/11-versioning`

## Goal

實作 Schema 的版本快照與 diff 功能。每次 Schema 儲存時自動建立快照；UI 可以看版本歷史、查看結構化 diff（新增/刪除/修改了哪些表和欄位）。

## Approach

### 版本建立時機
- 手動按「儲存版本」按鈕
- NL 生成 Schema 完成後自動建立
- DDL 匯入後自動建立

### Snapshot 格式
```json
{
  "version": 1,
  "schema": {
    "id": 1,
    "name": "MES Core",
    "tables": [
      {
        "name": "lot_records",
        "fields": [
          { "name": "id", "type": "BIGINT", "nullable": false, "primaryKey": true },
          ...
        ]
      }
    ]
  }
}
```

### Diff 計算（`packages/core/src/diff.ts`）
```ts
export function computeSchemaDiff(
  before: SchemaSnapshot,
  after: SchemaSnapshot
): SchemaDiff
```
- 比較兩個快照，找出新增/刪除/修改的表和欄位
- 修改定義：欄位的 name、type、nullable、default 任一改變

### 命名字典 Diff 標注
Diff 結果中，對每個修改的欄位附加命名字典比對結果：
- 改前：`equipment_id`（alias → `equip_id`）
- 改後：`equip_id`（exact match ✓）

### UI（在 Schema 詳細頁加入 Versions tab）
- 版本列表（version_no, 建立時間, message）
- 點選任一版本 → 顯示與前一版的 diff
- Diff 顯示格式：類似 git diff，新增綠色、刪除紅色

## Acceptance Criteria

- [ ] 建立版本後，`GET /api/v1/schemas/:id/versions` 回傳正確列表
- [ ] `computeSchemaDiff` 有 unit tests（含新增表、刪除欄位、修改型別等情況）
- [ ] UI 的 diff 顯示新增/刪除/修改欄位，顏色正確
- [ ] 命名字典對 diff 中修改欄位的標注正確（before/after 都有比對結果）
- [ ] `pnpm typecheck` + `pnpm test` 通過
