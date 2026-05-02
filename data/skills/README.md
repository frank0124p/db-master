# User Skills Directory

在這個目錄放置 `.md` 技能檔，API 啟動時會自動載入，並整合到規則引擎。

## 技能檔格式

```markdown
---
name: my-custom-skill
domain: semiconductor
tags: [custom, mes]
---

# 自訂說明（可選）

技能說明文字，會注入 LLM prompt。

## Rules

\`\`\`rules
- id: custom.lot_id_required
  group: semantic
  severity: warning
  description: 製程追蹤表應包含 lot_id 欄位
  tablePattern: lot|wafer|operation
  requiredFields: [lot_id]

- id: custom.no_temp_fields
  group: naming
  severity: info
  description: 不應使用暫存欄位名稱
  fieldPattern: ^(temp|tmp|test|debug)
\`\`\`
```

## 規則欄位說明

| 欄位 | 必填 | 說明 |
|---|---|---|
| `id` | ✅ | 規則唯一 ID，建議用 `custom.xxx` 前綴 |
| `group` | ✅ | `naming` / `semantic` / `structure` |
| `severity` | ✅ | `error` / `warning` / `info` |
| `description` | ✅ | 規則說明，會出現在違規訊息中 |
| `tablePattern` | ⬜ | Regex：只對名稱符合的表執行此規則 |
| `requiredFields` | ⬜ | 表層級：這些欄位必須存在 `[field1, field2]` |
| `forbiddenFields` | ⬜ | 表層級：這些欄位不應存在 |
| `fieldPattern` | ⬜ | 欄位層級：名稱符合此 Regex 則違規 |
| `forbiddenFieldPattern` | ⬜ | 欄位層級：名稱符合此 Regex 則違規 |
