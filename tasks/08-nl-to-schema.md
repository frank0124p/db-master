# Task 08: NL → Schema Pipeline

**Phase**: 2
**Effort**: ~1.5d
**Depends on**: 07
**Branch**: `task/08-nl-to-schema`

## Goal

使用者輸入一段中文描述，系統呼叫 Anthropic API，生成符合命名字典規範的 Schema 草稿，存入 DB 並顯示在 UI。

## Approach

### Backend

1. **LLM service**（`apps/api/src/services/llm.ts`）：
   - `generateSchema(prompt: string, context: LlmContext): Promise<SchemaGenerateResult>`
   - `context` 包含：命名字典快照、Skills 清單
   - 使用 `claude-sonnet-4-5` 模型
   - 每次呼叫後寫 `llm_audit_logs`

2. **Prompt 載入**：從 `prompts/generate-schema.md` 讀取 system prompt（runtime 讀取，不 inline）

3. **JSON 輸出格式**：要求 LLM 回傳結構化 JSON，對應內部 Schema 模型

4. **Post-processing**：
   - 解析 LLM 回傳的 JSON
   - 對每個欄位執行命名字典比對
   - 執行 Rules 驗證
   - 存入 DB

5. **API 端點**：`POST /api/v1/llm/generate`（streaming 在 task 10 加入，此 task 先做非 streaming 版）

### Frontend

- Schema 詳細頁加入「用自然語言描述」入口（floating button 或頂部 toolbar）
- 輸入 modal / panel：textarea + 送出按鈕
- 送出後顯示 loading → 完成後 Schema 自動更新顯示

## Prompt 設計重點

`prompts/generate-schema.md` 的 system prompt 需要：
1. 指定輸出為 JSON（含 tables, fields, FK 關係）
2. 注入命名字典快照（讓 LLM 知道用 `equip_id` 不是 `equipment_id`）
3. 注入半導體 Skills（讓 LLM 知道 lot/wafer/recipe 的語意）
4. 強調 snake_case、複數表名、必要欄位（id, created_at, updated_at）

## Acceptance Criteria

- [ ] 輸入「建立一個設備保養記錄系統」→ 生成含有合理表結構的 Schema
- [ ] 生成的欄位名符合命名字典（不出現 `equipment_id`，應出現 `equip_id`）
- [ ] LLM 呼叫後有 audit log 寫入 DB
- [ ] 每次呼叫都能看到 token 使用量和 cost 估算
- [ ] JSON 解析失敗時有 fallback 錯誤處理，不 crash
- [ ] `pnpm typecheck` 通過
