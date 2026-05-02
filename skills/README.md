# Skills

Skills 是 LLM 在呼叫時載入的領域知識文件。每個 skill 是一個 `SKILL.md` 檔案，包含 frontmatter 和 markdown 內容。

## 結構

```
skills/
├── schema-design/SKILL.md       — 通用 schema 設計原則
├── ddl-parser/SKILL.md          — DDL 語法與解析知識
└── naming-dictionary/SKILL.md   — 命名字典使用規則 + 半導體詞彙
```

## Frontmatter 格式

```yaml
---
name: schema-design
domain: general          # general | semiconductor
tags: [schema, design]
---
```

## 載入規則

- Server 啟動時全部載入
- 根據 Schema 的 `domain` 欄位選擇對應 skills
- `domain: semiconductor` → 全部載入
- `domain: general` → 只載入 `schema-design` 和 `ddl-parser`
