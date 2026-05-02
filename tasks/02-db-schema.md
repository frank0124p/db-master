# Task 02: DB Schema & Migrations

**Phase**: 1
**Effort**: ~1d
**Depends on**: 01
**Branch**: `task/02-db-schema`

## Goal

建立所有核心表的 migration SQL，並讓 API 能成功連線 MariaDB。完成後，`pnpm db:migrate` 可以在乾淨 DB 上建立完整 schema。

## 需建立的表

依照 `docs/SPEC.md` 的 Domain Model：

1. `schemas` — Schema 專案
2. `tables` — 表定義
3. `fields` — 欄位定義
4. `naming_entries` — 命名字典
5. `schema_versions` — 版本快照
6. `rules` — 規則清單
7. `llm_audit_logs` — LLM 呼叫記錄

## Approach

1. **Migration 檔案命名**：`db/migrations/001_create_schemas.sql`、`002_create_tables.sql`，以此類推。每個 migration 一個檔案，只做一件事。

2. **Migration runner**：在 `apps/api/src/db/migrate.ts` 寫一個簡單的 runner：
   - 建立 `schema_migrations` 表記錄已執行的 migration
   - 掃描 `db/migrations/*.sql`，按順序執行未執行的
   - `pnpm db:migrate` script 呼叫此 runner

3. **Connection pool**：`apps/api/src/db/pool.ts`，從 `.env.local` 讀取連線設定，export `pool` 供其他模組使用。

4. **Seed 資料**：`db/seed/naming-dictionary-semiconductor.sql` 插入 `docs/SPEC.md` 中的半導體預設詞彙（19 筆）。

## 所有表的共同規範

- `id BIGINT AUTO_INCREMENT PRIMARY KEY`
- `created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`
- charset: `utf8mb4`, collation: `utf8mb4_unicode_ci`
- FK 命名：`fk_<table>_<column>`

## Acceptance Criteria

- [ ] `pnpm db:migrate` 在乾淨 DB 上執行成功，建立所有 7 張表 + `schema_migrations`
- [ ] 重複執行 `pnpm db:migrate` 不報錯（idempotent）
- [ ] `pnpm db:seed` 插入半導體命名字典 seed 資料
- [ ] `apps/api/src/db/pool.ts` 可成功連線，`/api/v1/health` 回應加入 `db: "connected"` 欄位
- [ ] TypeScript 可以 import pool 並執行 query

## Out of Scope

- API 路由（task 03）
- 測試資料以外的 seed（task 07 之後再補）
