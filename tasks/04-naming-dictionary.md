# Task 04: Naming Dictionary API

**Phase**: 1
**Effort**: ~1d
**Depends on**: 02
**Branch**: `task/04-naming-dictionary`

## Goal

實作命名字典的 CRUD API，以及核心的「欄位名比對引擎」。比對邏輯在 `packages/core` 中，與 LLM 無關，純程式判斷。

## Approach

1. **比對引擎**（`packages/core/src/naming/matcher.ts`）：
   ```ts
   export function checkFieldName(
     name: string,
     entries: NamingEntry[]
   ): NamingCheckResult
   ```
   回傳：
   - `{ match: 'exact' }` — 已是標準名
   - `{ match: 'alias', stdName: string, concept: string }` — 是別名，建議改為標準名
   - `{ match: 'fuzzy', candidates: NamingEntry[] }` — 模糊相似
   - `{ match: 'unknown' }` — 未登錄

2. **Levenshtein distance** 實作在 `packages/core/src/naming/levenshtein.ts`（自己寫，不引入外部依賴）

3. **`POST /api/v1/naming-dictionary/check`**：
   ```json
   // request
   { "names": ["equipment_id", "lot_no", "recipe_id"] }
   // response
   {
     "results": [
       { "name": "equipment_id", "match": "alias", "stdName": "equip_id", "concept": "設備ID" },
       { "name": "lot_no", "match": "alias", "stdName": "lot_id", "concept": "批次ID" },
       { "name": "recipe_id", "match": "exact" }
     ]
   }
   ```

4. **Bulk check for schema**：`POST /api/v1/schemas/:id/naming-check`
   對整個 schema 的所有 fields 執行比對，回傳有問題的欄位清單。

## Acceptance Criteria

- [ ] CRUD API (`GET/POST/PATCH/DELETE /api/v1/naming-dictionary`) 功能正常
- [ ] `POST /api/v1/naming-dictionary/check` 正確識別 exact / alias / fuzzy / unknown
- [ ] `POST /api/v1/schemas/:id/naming-check` 能掃描整個 schema
- [ ] `packages/core` 的比對引擎有 unit tests，覆蓋率 ≥ 90%
- [ ] Levenshtein 函式有獨立 unit test
- [ ] Seed 的 19 筆半導體詞彙都能正確比對
- [ ] `pnpm typecheck` + `pnpm test` 通過
