CREATE TABLE IF NOT EXISTS `rules` (
  `id`          BIGINT NOT NULL AUTO_INCREMENT,
  `rule_id`     VARCHAR(64) NOT NULL,
  `severity`    ENUM('error','warning','info') NOT NULL DEFAULT 'warning',
  `message_tpl` TEXT NOT NULL COMMENT '訊息模板，支援 {{name}} 等佔位符',
  `enabled`     TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rules_rule_id` (`rule_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Schema 規則'
