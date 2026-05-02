---
name: naming-dictionary
domain: semiconductor
tags: [naming, semiconductor, mes, convention]
---

# Naming Dictionary — Semiconductor Domain

## 核心原則

命名字典是這個工具的核心。每個欄位名都應能在字典中找到對應的「標準名」。若你生成的欄位名不確定，優先查字典，其次遵循以下規則。

## 半導體產業標準詞彙

這些是已建立的標準名，直接使用，**不要自行縮寫或延伸**：

| 概念 | 標準名 | 禁止使用 |
|---|---|---|
| 設備 ID | `equip_id` | `equipment_id`, `eqp_id`, `machine_id`, `tool_id` |
| 批次 ID | `lot_id` | `lot_no`, `lotid`, `batch_id` |
| 晶圓 ID | `wafer_id` | `wafer_no`, `wfr_id` |
| 片號（slot） | `slot_no` | `slot_id`, `wafer_slot` |
| 製程配方 ID | `recipe_id` | `recipe_no`, `rcp_id` |
| 腔體 ID | `chamber_id` | `chamber_no`, `chmb_id` |
| 製程步驟序號 | `step_seq` | `step_no`, `step_id`, `process_step` |
| 操作員 ID | `operator_id` | `op_id`, `user_id` |
| 量測值 | `meas_value` | `measurement`, `measure_val` |
| 量測時間 | `meas_at` | `measure_time`, `meas_time` |
| 設備狀態 | `equip_status` | `machine_status`, `tool_status` |
| 批次狀態 | `lot_status` | `batch_status`, `lot_state` |
| 良率 | `yield_rate` | `yield`, `yield_pct` |
| 缺陷數 | `defect_count` | `defect_num`, `defect_qty` |
| 保養類型 | `maint_type` | `maintenance_type`, `pm_type` |
| 保養時間 | `maint_at` | `maintenance_time`, `pm_time` |
| 下次保養時間 | `next_maint_at` | `next_pm`, `next_maintenance` |
| 產品 ID | `product_id` | `prod_id`, `part_id` |
| 製程 ID | `process_id` | `proc_id`, `process_no` |

## 常見半導體資料表模式

### 設備記錄（equipment tracking）
```sql
CREATE TABLE equipments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  equip_id VARCHAR(32) NOT NULL,      -- 設備編號（業務 ID）
  equip_name VARCHAR(128),
  equip_status VARCHAR(32) DEFAULT 'idle',
  chamber_count INT DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### 批次追蹤（lot tracking）
```sql
CREATE TABLE lot_records (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  lot_id VARCHAR(32) NOT NULL,
  product_id VARCHAR(32),
  wafer_count INT,
  lot_status VARCHAR(32) DEFAULT 'queued',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### 製程量測（process measurement）
```sql
CREATE TABLE process_measurements (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  lot_id VARCHAR(32) NOT NULL,
  wafer_id VARCHAR(32),
  slot_no INT,
  equip_id VARCHAR(32),
  recipe_id VARCHAR(64),
  step_seq INT,
  meas_value DOUBLE,
  meas_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```
