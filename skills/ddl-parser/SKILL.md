---
name: ddl-parser
domain: general
tags: [ddl, sql, mariadb, parser]
---

# DDL Parser Knowledge

## 支援的 DDL 語法

### CREATE TABLE 完整格式
```sql
CREATE TABLE `table_name` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL COMMENT '說明',
  `status` VARCHAR(32) DEFAULT 'active',
  `ref_id` BIGINT,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_table_name` (`name`),
  KEY `idx_table_status` (`status`),
  CONSTRAINT `fk_table_ref` FOREIGN KEY (`ref_id`) REFERENCES `other_table` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='表說明';
```

## 解析重點

- 欄位名可能有 backtick（`` ` ``），解析時去除
- `NOT NULL` 和 `NULL` 明確區分；未標示視為 `NULL`
- `DEFAULT` 值可能是字串（`'value'`）、數字、`NULL`、`CURRENT_TIMESTAMP`
- `AUTO_INCREMENT` 表示此欄位是自增主鍵
- 多個 `KEY` / `INDEX` 類型：`PRIMARY KEY`, `UNIQUE KEY`, `KEY`（一般 index）
- `CONSTRAINT ... FOREIGN KEY` 建立 FK 關係

## 常見陷阱

- MariaDB 允許 `TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`（兩個 modifier）
- `TINYINT(1)` 慣例上等同 boolean
- `INT` 和 `INT(11)` 在 MariaDB 中相同（括號只是顯示寬度，已在 MariaDB 10.5+ deprecated）
- `COMMENT` 字串可能包含單引號，需要正確 escape 處理
