-- Unified Analytics Schema — 生產資料整合分析層
-- 整合 MES + WIP + PLM + Quality 的跨系統分析視角
-- Layer: Unified

CREATE TABLE `prod_daily_summary` (
  `id`              BIGINT        NOT NULL AUTO_INCREMENT,
  `summary_date`    DATE          NOT NULL                    COMMENT '統計日期',
  `equip_id`        VARCHAR(64)   NOT NULL                    COMMENT '設備標準代碼',
  `product_id`      VARCHAR(64)   NOT NULL                    COMMENT '產品料號',
  `process_node`    VARCHAR(32)   NOT NULL                    COMMENT '製程節點',
  `lots_in`         INT           NOT NULL DEFAULT 0          COMMENT '當日投批數',
  `lots_out`        INT           NOT NULL DEFAULT 0          COMMENT '當日完成批數',
  `wafer_qty_in`    INT           NOT NULL DEFAULT 0          COMMENT '投片總數',
  `wafer_qty_out`   INT           NOT NULL DEFAULT 0          COMMENT '完成片數',
  `avg_yield_rate`  DECIMAL(5,2)      NULL                    COMMENT '平均良率(%)',
  `equip_uptime_h`  DECIMAL(6,2)      NULL                    COMMENT '設備稼動時數',
  `defect_count`    INT           NOT NULL DEFAULT 0          COMMENT '缺陷發生次數',
  `created_at`      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_prod_daily_equip_product` (`summary_date`, `equip_id`, `product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='每日生產彙總（整合層）';

CREATE TABLE `yield_trend` (
  `id`              BIGINT        NOT NULL AUTO_INCREMENT,
  `trend_week`      VARCHAR(8)    NOT NULL                    COMMENT '統計週次 YYYY-Www',
  `product_id`      VARCHAR(64)   NOT NULL                    COMMENT '產品料號',
  `process_node`    VARCHAR(32)   NOT NULL                    COMMENT '製程節點',
  `avg_yield`       DECIMAL(5,2)      NULL                    COMMENT '週平均良率(%)',
  `min_yield`       DECIMAL(5,2)      NULL                    COMMENT '週最低良率(%)',
  `max_yield`       DECIMAL(5,2)      NULL                    COMMENT '週最高良率(%)',
  `lot_count`       INT           NOT NULL DEFAULT 0          COMMENT '批次總數',
  `defect_rate`     DECIMAL(5,4)      NULL                    COMMENT '缺陷率',
  `created_at`      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_yield_trend_week_product` (`trend_week`, `product_id`, `process_node`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='良率趨勢週報（整合層）';

CREATE TABLE `equip_oee_summary` (
  `id`              BIGINT        NOT NULL AUTO_INCREMENT,
  `oee_date`        DATE          NOT NULL                    COMMENT '統計日期',
  `equip_id`        VARCHAR(64)   NOT NULL                    COMMENT '設備標準代碼',
  `equip_type`      VARCHAR(64)   NOT NULL                    COMMENT '設備類型',
  `availability`    DECIMAL(5,2)      NULL                    COMMENT '可用率(%)',
  `performance`     DECIMAL(5,2)      NULL                    COMMENT '效能率(%)',
  `quality_rate`    DECIMAL(5,2)      NULL                    COMMENT '品質率(%)',
  `oee`             DECIMAL(5,2)      NULL                    COMMENT 'OEE 綜合效率(%)',
  `down_time_h`     DECIMAL(6,2)  NOT NULL DEFAULT 0          COMMENT '停機時數',
  `pm_time_h`       DECIMAL(6,2)  NOT NULL DEFAULT 0          COMMENT '保養時數',
  `created_at`      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_oee_date_equip` (`oee_date`, `equip_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='設備 OEE 效率彙總（整合層）';

CREATE TABLE `cross_system_kpi` (
  `id`              BIGINT        NOT NULL AUTO_INCREMENT,
  `kpi_date`        DATE          NOT NULL                    COMMENT '統計日期',
  `kpi_type`        VARCHAR(64)   NOT NULL                    COMMENT 'KPI 類型：yield / throughput / quality / cost',
  `kpi_name`        VARCHAR(128)  NOT NULL                    COMMENT 'KPI 名稱',
  `kpi_value`       DECIMAL(12,4)     NULL                    COMMENT 'KPI 值',
  `kpi_target`      DECIMAL(12,4)     NULL                    COMMENT '目標值',
  `kpi_unit`        VARCHAR(32)       NULL                    COMMENT '單位',
  `source_system`   VARCHAR(64)       NULL                    COMMENT '資料來源系統',
  `created_at`      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='跨系統 KPI 整合（整合層）';
