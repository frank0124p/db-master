-- MES Process Schema — 製造執行系統流程
-- 放入此目錄的 .sql 檔案會在伺服器啟動時自動匯入

CREATE TABLE `work_orders` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `wo_no` VARCHAR(32) NOT NULL COMMENT '工單號',
  `part_id` BIGINT NOT NULL COMMENT '零件ID FK',
  `qty_planned` INT NOT NULL DEFAULT 0 COMMENT '計劃數量',
  `status` VARCHAR(32) NOT NULL DEFAULT 'planned' COMMENT '狀態',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_wo_no` (`wo_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工單主檔';

CREATE TABLE `process_steps` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `work_order_id` BIGINT NOT NULL COMMENT '工單ID FK',
  `step_seq` INT NOT NULL COMMENT '製程步驟序號',
  `operation_code` VARCHAR(32) NOT NULL COMMENT '作業代碼',
  `equip_id` BIGINT NULL COMMENT '設備ID FK',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='製程步驟';

CREATE TABLE `machines` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `machine_code` VARCHAR(32) NOT NULL COMMENT '機台代碼',
  `machine_name` VARCHAR(128) NOT NULL COMMENT '機台名稱',
  `equip_status` VARCHAR(16) NOT NULL DEFAULT 'idle' COMMENT '設備狀態',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_machine_code` (`machine_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='機台主檔';

CREATE TABLE `process_logs` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `process_step_id` BIGINT NOT NULL COMMENT '製程步驟ID FK',
  `operator_id` VARCHAR(64) NULL COMMENT '操作員ID',
  `result` VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT '結果',
  `logged_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='製程記錄';
