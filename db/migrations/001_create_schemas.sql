CREATE TABLE IF NOT EXISTS `schemas` (
  `id`          BIGINT NOT NULL AUTO_INCREMENT,
  `name`        VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `domain`      VARCHAR(100) NOT NULL DEFAULT 'semiconductor',
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at`  TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  KEY `idx_schemas_domain` (`domain`),
  KEY `idx_schemas_deleted_at` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Schema 專案'
