-- Quality Management Schema — 品質管理系統 (測試用)
-- 此檔案用於示範 DDL 自動匯入 + AI 分析功能
-- 刻意包含部分命名問題以觸發規則分析

CREATE TABLE `wafer_lots` (
  `id`          BIGINT NOT NULL AUTO_INCREMENT,
  `lot_id`      VARCHAR(32) NOT NULL         COMMENT '批次識別碼',
  `wafer_id`    VARCHAR(32) NOT NULL         COMMENT '晶圓識別碼',
  `product_id`  VARCHAR(32) NOT NULL         COMMENT '產品代號',
  `process_node` VARCHAR(16) NOT NULL        COMMENT '製程節點 (e.g. 28nm)',
  `lot_state`   VARCHAR(32) NOT NULL DEFAULT 'active' COMMENT '批次狀態',
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_wafer_lots_lot_id` (`lot_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='晶圓批次主檔';

CREATE TABLE `inspection_records` (
  `id`          BIGINT NOT NULL AUTO_INCREMENT,
  `lot_id`      VARCHAR(32) NOT NULL         COMMENT '批次識別碼 FK',
  `equip_id`    VARCHAR(32) NOT NULL         COMMENT '設備識別碼',
  `recipe_id`   VARCHAR(32) NOT NULL         COMMENT '配方識別碼',
  `step_no`     INT NOT NULL                 COMMENT '製程步驟序號',
  `meas_value`  DECIMAL(18,6) NULL           COMMENT '量測值',
  `upper_limit` DECIMAL(18,6) NULL           COMMENT '規格上限',
  `lower_limit` DECIMAL(18,6) NULL           COMMENT '規格下限',
  `pass_flag`   TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否合格',
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='檢測記錄';

CREATE TABLE `defect_items` (
  `id`          BIGINT NOT NULL AUTO_INCREMENT,
  `record_id`   BIGINT NOT NULL              COMMENT '檢測記錄ID FK',
  `defect_code` VARCHAR(32) NOT NULL         COMMENT '缺陷代碼',
  `defect_type` VARCHAR(64) NOT NULL         COMMENT '缺陷類型',
  `x_coord`     DECIMAL(10,4) NULL           COMMENT 'X 座標',
  `y_coord`     DECIMAL(10,4) NULL           COMMENT 'Y 座標',
  `severity`    VARCHAR(16) NOT NULL DEFAULT 'minor' COMMENT '嚴重程度',
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='缺陷明細';

-- 刻意使用問題命名以觸發 AI 分析警告
CREATE TABLE `yield_info` (
  `id`          BIGINT NOT NULL AUTO_INCREMENT,
  `lot_id`      VARCHAR(32) NOT NULL         COMMENT '批次識別碼 FK',
  `data`        TEXT NULL                    COMMENT '原始資料（故意用 data 觸發命名警告）',
  `ref`         BIGINT NULL                  COMMENT '參考ID（故意用 ref 觸發 FK 命名警告）',
  `good_dies`   INT NOT NULL DEFAULT 0       COMMENT '良品晶粒數',
  `total_dies`  INT NOT NULL DEFAULT 0       COMMENT '晶粒總數',
  `yield_rate`  DECIMAL(6,4) NULL            COMMENT '良率 (0-1)',
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='良率統計';

CREATE TABLE `spc_charts` (
  `id`          BIGINT NOT NULL AUTO_INCREMENT,
  `equip_id`    VARCHAR(32) NOT NULL         COMMENT '設備識別碼',
  `param_name`  VARCHAR(64) NOT NULL         COMMENT '管制參數名稱',
  `ucl`         DECIMAL(18,6) NULL           COMMENT '管制上限 UCL',
  `lcl`         DECIMAL(18,6) NULL           COMMENT '管制下限 LCL',
  `center_line` DECIMAL(18,6) NULL           COMMENT '中心線',
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='SPC 管制圖設定';
