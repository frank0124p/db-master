# Task 03: Schema & Table CRUD API

**Phase**: 1
**Effort**: ~1.5d
**Depends on**: 02
**Branch**: `task/03-api-crud`

## Goal

實作 `schemas`、`tables`、`fields` 的完整 REST CRUD API，包含 Zod 驗證與錯誤處理。

## Approach

1. **Repository pattern**：
   - `apps/api/src/repositories/schemas.ts`
   - `apps/api/src/repositories/tables.ts`
   - `apps/api/src/repositories/fields.ts`
   - 每個 repository 只做 DB query，不含業務邏輯

2. **Zod schemas** 定義在 `packages/core/src/schema.ts`：
   - `SchemaRow`, `TableRow`, `FieldRow`（DB 行的 runtime 驗證）
   - `CreateSchemaInput`, `UpdateSchemaInput` 等（API body 驗證）

3. **Router 掛載**：
   - `apps/api/src/routes/schemas.ts`
   - `apps/api/src/routes/tables.ts`
   - `apps/api/src/routes/fields.ts`

4. **錯誤中介層**：`apps/api/src/middleware/error.ts`
   - ZodError → 400 with detail
   - NotFoundError → 404
   - 其他 → 500

5. **GET /api/v1/schemas/:id** 回傳完整巢狀結構：
   ```json
   {
     "id": 1,
     "name": "MES Core",
     "tables": [
       {
         "id": 10,
         "name": "lot_records",
         "fields": [...]
       }
     ]
   }
   ```

## API 端點（詳見 docs/SPEC.md）

- `GET/POST /api/v1/schemas`
- `GET/PATCH/DELETE /api/v1/schemas/:id`
- `POST /api/v1/schemas/:id/tables`
- `PATCH/DELETE /api/v1/tables/:id`
- `POST /api/v1/tables/:id/fields`
- `PATCH/DELETE /api/v1/fields/:id`

## Acceptance Criteria

- [ ] 所有端點可用 curl/Postman 測試通過
- [ ] 建立 schema → 新增 table → 新增 fields 的完整流程可走通
- [ ] 錯誤情況回傳正確 HTTP code 和 `{ error: { code, message } }` 格式
- [ ] Zod 驗證失敗時回傳 400 + 說明哪個欄位有問題
- [ ] `pnpm typecheck` 通過
- [ ] `apps/api` 有 integration test（real MariaDB）for each route，`pnpm test` 通過
- [ ] 軟刪除：DELETE 不實際刪資料，設 `deleted_at`；GET 列表過濾 `deleted_at IS NULL`
