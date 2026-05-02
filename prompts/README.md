# Prompts

LLM prompt templates。所有 prompt 在 runtime 從這裡讀取，不 inline 在 TypeScript 程式碼中。

## 檔案

| 檔案 | 用途 | 呼叫時機 |
|---|---|---|
| `generate-schema.md` | NL → Schema 生成 | `POST /api/v1/llm/generate` |
| `analyze-schema-system.md` | Schema 分析 | `POST /api/v1/llm/analyze` |
| `generate-field-description.md` | 生成欄位中文說明 | 欄位 comment 自動填入 |

## 注入變數格式

Prompt 檔案中用 `{{variable_name}}` 標記需要注入的動態內容：

```
{{naming_dictionary}}   — 命名字典 JSON
{{skills}}              — 已載入的 Skills（XML tags）
{{schema_json}}         — 目標 Schema 的 JSON 結構
{{user_prompt}}         — 使用者輸入的自然語言
```
