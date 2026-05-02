CREATE TABLE IF NOT EXISTS `schema_versions` (
  `id`          BIGINT NOT NULL AUTO_INCREMENT,
  `schema_id`   BIGINT NOT NULL,
  `version_no`  INT NOT NULL,
  `snapshot`    JSON NOT NULL COMMENT '完整 Schema 結構快照',
  `diff`        JSON NULL COMMENT '與前一版的結構化 diff',
  `message`     TEXT NULL COMMENT '版本說明',
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_schema_versions_schema_version` (`schema_id`, `version_no`),
  CONSTRAINT `fk_schema_versions_schema_id` FOREIGN KEY (`schema_id`) REFERENCES `schemas` (`id`),
  KEY `idx_schema_versions_schema_id` (`schema_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='版本快照'
