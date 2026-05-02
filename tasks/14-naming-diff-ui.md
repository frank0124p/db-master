# Task 14: Naming Diff UI

**Phase**: 3
**Effort**: ~1d
**Depends on**: 11, 07
**Branch**: `task/14-naming-diff-ui`

## Goal

強化版本 diff UI，著重呈現「命名字典前後對照」，讓使用者清楚看到每次修改中命名規範的改善程度。

## 功能細節

### Diff 頁面強化

在版本 diff 中，對每個修改過的欄位附加命名字典狀態對比：

```
欄位名稱    修改前               修改後
---------   -------------------  -------------------
✗ → ✓      equipment_id          equip_id
             (alias: 應為equip_id)  (exact match)

? → ?      production_batch_no   production_batch_no
             (未登錄)              (未登錄)
```

圖示說明：
- `✓` 完全符合標準名
- `⚠` 是別名（alias）
- `~` 模糊相似
- `?` 未登錄字典

### 版本命名規範評分

每個版本顯示一個「命名規範分數」：
```
版本 3  |  命名分數: 78% → 94%（+16%）
         |  12 個欄位全部符合字典
```

計算方式：`exact match 欄位數 / 全部欄位數 * 100`

### Naming Dictionary 變更記錄

若兩個版本之間有字典詞彙被新增/修改，在 diff 頁面顯示「字典同期變更」區塊。

## Acceptance Criteria

- [ ] 版本 diff 正確顯示每個修改欄位的命名字典狀態（before/after）
- [ ] 命名規範分數計算正確
- [ ] UI 清楚區分 ✓ / ⚠ / ~ / ? 四種狀態
- [ ] `pnpm typecheck` 通過
