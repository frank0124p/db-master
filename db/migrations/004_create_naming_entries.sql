CREATE TABLE IF NOT EXISTS `naming_entries` (
  `id`          BIGINT NOT NULL AUTO_INCREMENT,
  `concept`     VARCHAR(255) NOT NULL COMMENT '中文概念',
  `std_name`    VARCHAR(64) NOT NULL COMMENT '標準英文名',
  `aliases`     JSON NOT NULL COMMENT '常見別名陣列',
  `domain`      VARCHAR(100) NOT NULL DEFAULT 'general',
  `description` TEXT NULL,
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_naming_entries_std_name` (`std_name`),
  KEY `idx_naming_entries_domain` (`domain`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='命名字典'
