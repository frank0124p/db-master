---
name: schema-design
domain: general
tags: [schema, design, sql, mariadb]
---

# Schema Design Principles

## 基本規範

- 表名使用 **snake_case 複數**（`lot_records`，不是 `LotRecord` 或 `lot_record`）
- 欄位名使用 **snake_case**（`equip_id`，不是 `equipId` 或 `EquipID`）
- 所有表必須有 `id BIGINT AUTO_INCREMENT PRIMARY KEY`
- 所有表必須有 `created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`
- 所有表必須有 `updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`
- 需要軟刪除的表加 `deleted_at TIMESTAMP NULL`

## 型別選擇

| 用途 | 型別 |
|---|---|
| 主鍵 / FK | `BIGINT` |
| 短字串（名稱、代碼）| `VARCHAR(64)` 或 `VARCHAR(255)` |
| 長文字 | `TEXT` |
| 布林 | `TINYINT(1)` |
| 精確金額 | `DECIMAL(15,4)` |
| 浮點量測值 | `DOUBLE` |
| 時間戳記 | `TIMESTAMP` |
| 日期 | `DATE` |
| JSON 資料 | `JSON` |
| 狀態欄位 | `VARCHAR(32)`（不用 ENUM，避免 migration 困難）|

## FK 與 Index

- FK 欄位命名：`{referenced_table_singular}_id`，例如 `equip_id` 參照 `equipments.id`
- FK constraint 命名：`fk_{table}_{column}`
- Unique constraint 命名：`uk_{table}_{columns}`
- 高頻查詢欄位加 INDEX（status, created_at 等）

## 設計原則

- 正規化到 3NF，但不要過度正規化影響查詢效能
- 避免在同一個表儲存可從其他表 JOIN 得到的資料（除非有明確的 denormalization 理由）
- 狀態欄位值用有意義的字串（`'running'`, `'idle'`, `'error'`），不用數字代碼
- 日期時間統一用 UTC 存；顯示時在前端轉換時區

## Rules

```rules
- id: skill.semi.lot_id_in_process_tables
  group: semantic
  severity: warning
  description: 半導體製程追蹤表應包含 lot_id 欄位
  tablePattern: lot|wafer|operation|process|run
  requiredFields: [lot_id]

- id: skill.no_generic_name_field
  group: naming
  severity: info
  description: 避免使用過於通用的欄位名稱（data, value, info, misc）
  fieldPattern: ^(data|value|info|misc|temp|tmp)$
```
