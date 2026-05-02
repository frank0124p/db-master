CREATE TABLE IF NOT EXISTS `llm_audit_logs` (
  `id`                BIGINT NOT NULL AUTO_INCREMENT,
  `call_type`         VARCHAR(64) NOT NULL COMMENT 'nl_to_schema | analyze | field_desc',
  `prompt_tokens`     INT NOT NULL DEFAULT 0,
  `completion_tokens` INT NOT NULL DEFAULT 0,
  `latency_ms`        INT NOT NULL DEFAULT 0,
  `cost_usd`          DECIMAL(10,6) NOT NULL DEFAULT 0,
  `request`           JSON NOT NULL,
  `response`          JSON NOT NULL,
  `created_at`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_llm_audit_logs_call_type` (`call_type`),
  KEY `idx_llm_audit_logs_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='LLM 呼叫審計記錄'
