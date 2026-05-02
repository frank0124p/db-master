# Task 12: Schema Analysis

**Phase**: 2
**Effort**: ~1d
**Depends on**: 09, 10, 11
**Branch**: `task/12-schema-analysis`

## Goal

實作「分析現有 Schema」功能：對任意 Schema（自建或匯入）執行 LLM 分析，找出命名問題、設計缺陷和改善建議。

## Approach

### Analysis Pipeline

1. 取出完整 Schema（tables + fields）
2. 先執行所有 Rules（程式判斷，不走 LLM）
3. 執行 Naming Dictionary 全表掃描
4. 建立分析上下文注入 LLM：
   - Schema 結構（JSON）
   - Rules 發現的問題
   - Naming Dictionary 比對結果
   - 相關 Skills
5. 呼叫 `prompts/analyze-schema-system.md` 的 prompt（SSE streaming）
6. 回傳合併結果：Rules 問題 + Naming 問題 + LLM 建議

### 回傳格式

```ts
interface AnalysisResult {
  issues: {
    source: 'rule' | 'naming' | 'llm'
    severity: 'error' | 'warning' | 'info'
    scope: 'schema' | 'table' | 'field'
    target: string        // table.field or table name
    message: string
    suggestion?: string   // 建議的修正方式
  }[]
  summary: string         // LLM 的整體評語（streaming）
}
```

### UI（`/schemas/:id/analyze` 頁面）
- 「分析 Schema」按鈕
- 分析中顯示 streaming 的 summary 文字
- 問題列表按 severity 排序（error → warning → info）
- 每個問題可以展開看建議
- 若問題是命名建議，顯示「採用」按鈕（直接修改欄位名）

## Acceptance Criteria

- [ ] 分析一個含有命名問題的 Schema，正確列出 alias/unknown 命名問題
- [ ] Rules 問題（如缺少 primary key）出現在結果中
- [ ] LLM summary 以 streaming 顯示
- [ ] 「採用」命名建議後，欄位名更新並自動建立新版本快照
- [ ] audit log 寫入
- [ ] `pnpm typecheck` 通過
