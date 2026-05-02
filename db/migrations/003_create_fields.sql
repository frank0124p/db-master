CREATE TABLE IF NOT EXISTS `fields` (
  `id`             BIGINT NOT NULL AUTO_INCREMENT,
  `table_id`       BIGINT NOT NULL,
  `name`           VARCHAR(64) NOT NULL,
  `data_type`      VARCHAR(64) NOT NULL,
  `nullable`       TINYINT(1) NOT NULL DEFAULT 1,
  `default_value`  TEXT NULL,
  `is_primary_key` TINYINT(1) NOT NULL DEFAULT 0,
  `is_unique`      TINYINT(1) NOT NULL DEFAULT 0,
  `comment`        TEXT NULL,
  `position`       INT NOT NULL DEFAULT 0,
  `created_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_fields_table_id` FOREIGN KEY (`table_id`) REFERENCES `tables` (`id`),
  KEY `idx_fields_table_id` (`table_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='欄位定義'
