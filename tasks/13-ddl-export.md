# Task 13: DDL Export (Multi-dialect)

**Phase**: 3
**Effort**: ~0.5d
**Depends on**: 05
**Branch**: `task/13-ddl-export`

## Goal

完善 DDL 匯出功能，支援多 DB 方言介面，並讓 UI 可以選擇目標資料庫。

## Approach

1. **完整實作 MariaDB emitter**（task 05 已有 stub）：
   - 輸出帶有 `ENGINE=InnoDB`, `DEFAULT CHARSET=utf8mb4`
   - 正確生成 FK CONSTRAINT 語句
   - 帶有欄位 COMMENT

2. **PostgreSQL emitter**（基本實作）：
   - `SERIAL` 代替 `BIGINT AUTO_INCREMENT`
   - `TEXT` 代替 `VARCHAR(65535)`
   - `TIMESTAMPTZ` 代替 `TIMESTAMP`
   - 欄位 comment 用 `COMMENT ON COLUMN` 語句

3. **API**：`GET /api/v1/schemas/:id/ddl?dialect=mariadb|postgresql`

4. **UI**：匯出按鈕改為 dropdown 選擇方言，下載 `.sql` 檔案名包含方言（`schema-name_mariadb.sql`）

## Acceptance Criteria

- [ ] MariaDB DDL 輸出包含 FK、INDEX、COMMENT，可直接在 MariaDB 執行
- [ ] PostgreSQL DDL 輸出語法正確（用 `psql` 可執行）
- [ ] UI 可以選擇方言並下載對應 DDL
- [ ] round-trip 測試：export MariaDB → import → export 結構一致
