-- MES 製程執行模組
-- 批次追蹤、晶圓追蹤、製程步驟、量測數據

CREATE TABLE `lots` (
  `id`            BIGINT        NOT NULL AUTO_INCREMENT,
  `lot_id`        VARCHAR(64)   NOT NULL COMMENT '批次唯一識別碼，格式：LOT-YYYYMMDD-NNNN',
  `product_id`    VARCHAR(64)   NOT NULL COMMENT '產品料號',
  `lot_status`    VARCHAR(32)   NOT NULL DEFAULT 'queued' COMMENT 'queued / processing / hold / completed / scrapped',
  `priority`      TINYINT       NOT NULL DEFAULT 5 COMMENT '生產優先序 1（最高）～10（最低）',
  `qty_in`        INT           NOT NULL COMMENT '投片數量',
  `qty_out`       INT               NULL COMMENT '出片數量（製程完成後填入）',
  `yield_rate`    DECIMAL(5,2)      NULL COMMENT '良率百分比',
  `started_at`    TIMESTAMP         NULL COMMENT '批次開始生產時間',
  `completed_at`  TIMESTAMP         NULL COMMENT '批次完成時間',
  `created_at`    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_lots_lot_id` (`lot_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='生產批次主檔';

CREATE TABLE `wafers` (
  `id`            BIGINT        NOT NULL AUTO_INCREMENT,
  `wafer_id`      VARCHAR(64)   NOT NULL COMMENT '晶圓唯一識別碼',
  `lot_id`        VARCHAR(64)   NOT NULL COMMENT '所屬批次',
  `slot_no`       TINYINT       NOT NULL COMMENT '在批次中的片號（1-25）',
  `wafer_status`  VARCHAR(32)   NOT NULL DEFAULT 'active' COMMENT 'active / hold / scrapped / completed',
  `defect_count`  INT               NULL COMMENT '量測缺陷數',
  `created_at`    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_wafers_wafer_id` (`wafer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='晶圓追蹤';

CREATE TABLE `process_steps` (
  `id`            BIGINT        NOT NULL AUTO_INCREMENT,
  `lot_id`        VARCHAR(64)   NOT NULL COMMENT '批次 ID',
  `step_seq`      SMALLINT      NOT NULL COMMENT '製程步驟序號',
  `step_name`     VARCHAR(128)  NOT NULL COMMENT '步驟名稱',
  `equip_id`      VARCHAR(64)       NULL COMMENT '執行此步驟的設備',
  `recipe_id`     VARCHAR(64)       NULL COMMENT '製程配方 ID',
  `operator_id`   VARCHAR(64)       NULL COMMENT '操作員 ID',
  `started_at`    TIMESTAMP         NULL COMMENT '步驟開始時間',
  `ended_at`      TIMESTAMP         NULL COMMENT '步驟結束時間',
  `step_status`   VARCHAR(32)   NOT NULL DEFAULT 'pending' COMMENT 'pending / running / done / failed',
  `created_at`    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='製程步驟執行記錄';

CREATE TABLE `measurements` (
  `id`            BIGINT        NOT NULL AUTO_INCREMENT,
  `lot_id`        VARCHAR(64)   NOT NULL COMMENT '批次 ID',
  `wafer_id`      VARCHAR(64)       NULL COMMENT '晶圓 ID（可 NULL 代表批次層級量測）',
  `step_seq`      SMALLINT          NULL COMMENT '對應製程步驟序號',
  `param_name`    VARCHAR(128)  NOT NULL COMMENT '量測參數名稱',
  `meas_value`    DOUBLE            NULL COMMENT '量測值',
  `unit`          VARCHAR(32)       NULL COMMENT '單位（nm / Å / Ω/sq 等）',
  `spec_min`      DOUBLE            NULL COMMENT '規格下限',
  `spec_max`      DOUBLE            NULL COMMENT '規格上限',
  `is_ooc`        TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '是否超出規格（Out of Control）',
  `meas_at`       TIMESTAMP     NOT NULL COMMENT '量測時間',
  `equip_id`      VARCHAR(64)       NULL COMMENT '量測設備 ID',
  `created_at`    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='製程量測數據';
