CREATE TABLE IF NOT EXISTS wide_tables (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  schema_id   BIGINT NOT NULL,
  name        VARCHAR(128) NOT NULL,
  description TEXT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_wide_tables_schema FOREIGN KEY (schema_id) REFERENCES `schemas`(id) ON DELETE CASCADE,
  CONSTRAINT uk_wide_tables_schema_name UNIQUE (schema_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wide_table_sources (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  wide_table_id   BIGINT NOT NULL,
  table_id        BIGINT NOT NULL,
  col_prefix      VARCHAR(32) NULL,
  join_type       ENUM('BASE','INNER','LEFT') NOT NULL DEFAULT 'LEFT',
  join_condition  VARCHAR(512) NULL,
  position        TINYINT NOT NULL DEFAULT 0,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_wts_wide_table FOREIGN KEY (wide_table_id) REFERENCES wide_tables(id) ON DELETE CASCADE,
  CONSTRAINT fk_wts_table      FOREIGN KEY (table_id)      REFERENCES `tables`(id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wide_table_columns (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  wide_table_id BIGINT NOT NULL,
  source_id     BIGINT NOT NULL,
  field_id      BIGINT NOT NULL,
  output_name   VARCHAR(128) NOT NULL,
  included      TINYINT(1) NOT NULL DEFAULT 1,
  position      INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_wtc_wide_table FOREIGN KEY (wide_table_id) REFERENCES wide_tables(id)       ON DELETE CASCADE,
  CONSTRAINT fk_wtc_source     FOREIGN KEY (source_id)     REFERENCES wide_table_sources(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
