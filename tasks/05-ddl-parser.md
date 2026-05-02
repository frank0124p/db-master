# Task 05: DDL Parser

**Phase**: 1
**Effort**: ~1.5d
**Depends on**: 03
**Branch**: `task/05-ddl-parser`

## Goal

實作 DDL 的雙向轉換：
- **Import**：SQL DDL 文字 → 內部 Schema 模型（存入 DB）
- **Export**：內部 Schema 模型 → SQL DDL 文字（支援多 DB 方言）

Parser 邏輯在 `packages/ddl-parser`。

## Approach

### Parser（SQL → 內部模型）

`packages/ddl-parser/src/parser.ts`

目標：能解析標準 `CREATE TABLE` 語句，包括：
- 欄位定義（名稱、型別、NOT NULL、DEFAULT、AUTO_INCREMENT）
- PRIMARY KEY（行內 + 表尾）
- UNIQUE KEY / INDEX
- FOREIGN KEY（解析出 FK 關係）
- 表 COMMENT / 欄位 COMMENT

可使用 `node-sql-parser` 套件（支援 MariaDB/MySQL 方言）或自己用 regex 解析簡化版。推薦先用 `node-sql-parser`，若它的型別不足再加自己的 post-processing。

### Emitter（內部模型 → SQL）

`packages/ddl-parser/src/emitters/mariadb.ts`
`packages/ddl-parser/src/emitters/postgresql.ts`（stub，後續實作）

emitter 是一個 interface：
```ts
export interface DdlEmitter {
  emitSchema(schema: SchemaModel): string
  emitTable(table: TableModel): string
}
```

### API 端點

- `POST /api/v1/ddl/import`：接收 DDL 文字，解析後建立新 Schema，回傳 Schema ID
- `GET /api/v1/schemas/:id/ddl?dialect=mariadb`：匯出 DDL

## Acceptance Criteria

- [ ] 能解析包含 FK、INDEX、COMMENT 的 MariaDB `CREATE TABLE`
- [ ] Round-trip 測試：解析 10 個 sample DDL，emit 後再解析，結構相同（`packages/ddl-parser` tests）
- [ ] 10 個 sample DDL 包含至少一個半導體情境的表（如 `lot_records`, `equipment_logs`）
- [ ] `POST /api/v1/ddl/import` 成功將 DDL 存入 DB
- [ ] `GET /api/v1/schemas/:id/ddl` 輸出合法的 MariaDB DDL
- [ ] `pnpm typecheck` + `pnpm test` 通過

## Tips

- MariaDB 的 `CREATE TABLE` syntax 中，COMMENT 語法是欄位後加 `COMMENT '...'`
- PostgreSQL emitter 在這個 task 只需要 stub（介面實作，不需真實輸出）
- round-trip 測試時，允許 whitespace 和大小寫正規化後比對結構，不需要字串完全相同
