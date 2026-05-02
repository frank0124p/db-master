# Task 10: Streaming Responses

**Phase**: 2
**Effort**: ~0.5d
**Depends on**: 08
**Branch**: `task/10-streaming`

## Goal

將 LLM API 端點改為 SSE（Server-Sent Events）streaming，前端顯示即時輸出，不需等待完整回應。

## Approach

### Backend
- `POST /api/v1/llm/generate` 和 `POST /api/v1/llm/analyze` 改為 SSE
- 使用 Anthropic SDK 的 `stream()` 方法
- 每個 chunk 以 `data: {...}\n\n` 格式送出
- 事件類型：
  - `data: { type: "chunk", text: "..." }` — 文字片段
  - `data: { type: "done", usage: {...}, cost: ... }` — 完成
  - `data: { type: "error", message: "..." }` — 錯誤

### Frontend
- 使用 `EventSource` 或 `fetch` + ReadableStream 接收
- 顯示「正在生成...」的動態狀態
- 文字逐步出現（不需要 typewriter 動畫，直接 append 即可）
- 完成後 trigger TanStack Query invalidation，重新載入 Schema

## Acceptance Criteria

- [ ] 生成 Schema 時，前端顯示即時 streaming 文字
- [ ] 網路中斷時前端顯示錯誤 toast
- [ ] `done` 事件後，Schema 資料自動重新載入
- [ ] audit log 在 streaming 完成後才寫入（確保 token 數完整）
