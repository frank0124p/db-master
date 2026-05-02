ALTER TABLE `rules`
  ADD COLUMN IF NOT EXISTS `config` JSON NULL COMMENT '規則參數 (JSON)' AFTER `enabled`;

INSERT INTO `rules` (`rule_id`, `severity`, `message_tpl`, `enabled`, `config`) VALUES
  ('naming.snake_case',          'error',   '{{message}}', 1, NULL),
  ('naming.reserved_words',      'error',   '{{message}}', 1, NULL),
  ('naming.max_length',          'warning', '{{message}}', 1, '{"maxTableLen":64,"maxFieldLen":64}'),
  ('semantic.field_comment',     'warning', '{{message}}', 1, '{"minLength":4}'),
  ('semantic.table_comment',     'info',    '{{message}}', 1, NULL),
  ('semantic.blob_needs_comment','warning', '{{message}}', 1, NULL),
  ('structure.has_primary_key',  'error',   '{{message}}', 1, NULL),
  ('structure.timestamp_columns','warning', '{{message}}', 1, NULL),
  ('structure.no_double_underscore','warning','{{message}}',1, NULL)
ON DUPLICATE KEY UPDATE
  `severity`    = VALUES(`severity`),
  `enabled`     = VALUES(`enabled`),
  `config`      = VALUES(`config`)
