-- PLM Core Schema — 產品生命週期管理核心
-- 放入此目錄的 .sql 檔案會在伺服器啟動時自動匯入

CREATE TABLE `parts` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `part_no` VARCHAR(32) NOT NULL,
  `part_name` VARCHAR(255) NOT NULL,
  `part_type` VARCHAR(32) NOT NULL,
  `lifecycle_state` VARCHAR(32) NOT NULL DEFAULT 'draft',
  `process_node` VARCHAR(32) NULL,
  `description` TEXT NULL COMMENT '零件描述',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_parts_part_no` (`part_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='零件主檔';

CREATE TABLE `part_revisions` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `part_id` BIGINT NOT NULL COMMENT '零件ID FK',
  `revision_no` VARCHAR(8) NOT NULL COMMENT '版本號',
  `revision_state` VARCHAR(32) NOT NULL DEFAULT 'pending' COMMENT '版本狀態',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='零件版本管理';

CREATE TABLE `bom_items` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `parent_id` BIGINT NOT NULL COMMENT '父零件ID FK',
  `child_id` BIGINT NOT NULL COMMENT '子零件ID FK',
  `quantity` DECIMAL(12,4) NOT NULL DEFAULT 1.0000 COMMENT '數量',
  `bom_type` VARCHAR(16) NOT NULL DEFAULT 'engineering' COMMENT 'BOM類型',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='BOM 結構';

CREATE TABLE `engineering_changes` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `eco_no` VARCHAR(32) NOT NULL COMMENT 'ECO編號',
  `title` VARCHAR(255) NOT NULL COMMENT '標題',
  `status` VARCHAR(32) NOT NULL DEFAULT 'draft' COMMENT '狀態',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_eco_no` (`eco_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='ECO 工程變更單';

CREATE TABLE `suppliers` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `supplier_code` VARCHAR(32) NOT NULL COMMENT '供應商代碼',
  `supplier_name` VARCHAR(255) NOT NULL COMMENT '供應商名稱',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_supplier_code` (`supplier_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='供應商主檔';

CREATE TABLE `part_suppliers` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `part_id` BIGINT NOT NULL COMMENT '零件ID FK',
  `supplier_id` BIGINT NOT NULL COMMENT '供應商ID FK',
  `lead_time_days` INT NULL COMMENT '前置天數',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='零件供應商對應';
