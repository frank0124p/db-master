CREATE TABLE IF NOT EXISTS `tables` (
  `id`          BIGINT NOT NULL AUTO_INCREMENT,
  `schema_id`   BIGINT NOT NULL,
  `name`        VARCHAR(64) NOT NULL,
  `comment`     TEXT NULL,
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at`  TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_tables_schema_id` FOREIGN KEY (`schema_id`) REFERENCES `schemas` (`id`),
  KEY `idx_tables_schema_id` (`schema_id`),
  KEY `idx_tables_deleted_at` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='資料表定義'
