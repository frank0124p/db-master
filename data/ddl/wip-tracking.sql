-- WIP Tracking: 在製品追蹤系統
CREATE TABLE wip_lot (
  lot_id        VARCHAR(32)   NOT NULL PRIMARY KEY COMMENT '批號 ID',
  product_code  VARCHAR(20)   NOT NULL             COMMENT '產品料號',
  qty           INT           NOT NULL DEFAULT 0   COMMENT '數量',
  stage         VARCHAR(20)   NOT NULL             COMMENT '目前製程站',
  on_hold       TINYINT(1)    NOT NULL DEFAULT 0   COMMENT '是否 hold',
  created_at    DATETIME      NOT NULL             COMMENT '建立時間',
  updated_at    DATETIME      NOT NULL             COMMENT '更新時間'
);

CREATE TABLE wip_move (
  move_id       INT           NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '移動紀錄 ID',
  lot_id        VARCHAR(32)   NOT NULL             COMMENT '批號 ID',
  from_stage    VARCHAR(20)            DEFAULT NULL COMMENT '來源站',
  to_stage      VARCHAR(20)   NOT NULL             COMMENT '目的站',
  operator_id   VARCHAR(20)   NOT NULL             COMMENT '操作員 ID',
  moved_at      DATETIME      NOT NULL             COMMENT '移動時間'
);

CREATE TABLE wip_defect (
  defect_id     INT           NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '缺陷 ID',
  lot_id        VARCHAR(32)   NOT NULL             COMMENT '批號 ID',
  defect_code   VARCHAR(10)   NOT NULL             COMMENT '缺陷碼',
  qty           INT           NOT NULL DEFAULT 1   COMMENT '缺陷數量',
  inspected_at  DATETIME      NOT NULL             COMMENT '檢測時間',
  UNIQUE KEY uk_lot_defect (lot_id, defect_code)
);
