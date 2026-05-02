ALTER TABLE `naming_entries`
  ADD COLUMN `tags`           JSON    NOT NULL DEFAULT '[]'  AFTER `domain`,
  ADD COLUMN `ai_description` TEXT    NULL                   AFTER `tags`;
