-- MES 設備管理模組
-- 半導體製程設備追蹤、保養記錄、即時狀態監控

CREATE TABLE `equipments` (
  `id`            BIGINT        NOT NULL AUTO_INCREMENT,
  `equip_id`      VARCHAR(64)   NOT NULL COMMENT '設備標準代碼，與 ERP 系統對齊',
  `equip_name`    VARCHAR(255)  NOT NULL COMMENT '設備全名',
  `equip_type`    VARCHAR(64)   NOT NULL COMMENT '設備類型：FURNACE / CVD / CMP / LITHO / ETCH',
  `chamber_id`    VARCHAR(64)       NULL COMMENT '腔體 ID（多腔體設備才填）',
  `location`      VARCHAR(128)      NULL COMMENT '廠區位置：FAB1-BAY3-SLOT2',
  `equip_status`  VARCHAR(32)   NOT NULL DEFAULT 'idle' COMMENT 'idle / running / down / pm',
  `owner_dept`    VARCHAR(64)       NULL COMMENT '負責部門',
  `install_date`  DATE              NULL COMMENT '安裝日期',
  `created_at`    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_equipments_equip_id` (`equip_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='製程設備主檔';

CREATE TABLE `equipment_pm_records` (
  `id`            BIGINT        NOT NULL AUTO_INCREMENT,
  `equip_id`      VARCHAR(64)   NOT NULL COMMENT '對應 equipments.equip_id',
  `maint_type`    VARCHAR(32)   NOT NULL COMMENT 'PM / CM / CALIBRATION',
  `maint_at`      TIMESTAMP     NOT NULL COMMENT '保養執行時間',
  `next_maint_at` TIMESTAMP         NULL COMMENT '下次預定保養時間',
  `operator_id`   VARCHAR(64)   NOT NULL COMMENT '執行保養的操作員 ID',
  `duration_min`  INT               NULL COMMENT '保養耗時（分鐘）',
  `notes`         TEXT              NULL COMMENT '保養備註',
  `created_at`    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='設備保養記錄';

CREATE TABLE `equipment_alarms` (
  `id`            BIGINT        NOT NULL AUTO_INCREMENT,
  `equip_id`      VARCHAR(64)   NOT NULL COMMENT '發生警報的設備',
  `alarm_code`    VARCHAR(64)   NOT NULL COMMENT '警報代碼',
  `alarm_msg`     TEXT              NULL COMMENT '警報訊息內容',
  `severity`      VARCHAR(16)   NOT NULL DEFAULT 'warning' COMMENT 'info / warning / critical',
  `occurred_at`   TIMESTAMP     NOT NULL COMMENT '警報發生時間',
  `resolved_at`   TIMESTAMP         NULL COMMENT '警報解除時間（NULL 表示尚未解除）',
  `created_at`    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='設備警報記錄';
