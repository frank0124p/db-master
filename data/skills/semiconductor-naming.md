---
name: Semiconductor Naming Rules
domain: semiconductor
tags: [naming, mes, semiconductor]
---

# 半導體命名字典補充規則

此為使用者自訂 Skill 範例。
在 `data/skills/` 放入 `.md` 檔案，系統啟動時會自動載入，整合進 Analysis 規則。

## 使用方式

- 修改此檔案來自訂你的命名規範
- 在 `## Rules` 段落後加入 rules block 來新增自訂規則
- 重新載入（`POST /api/v1/reload` 或 UI 的「重新載入」按鈕）即可生效

## 半導體設備命名規範

- 設備 ID 一律使用 `equip_id`（不接受 `machine_id`、`tool_id`）
- 批次 ID 一律使用 `lot_id`
- 晶圓 ID 一律使用 `wafer_id`
- 量測值用 `meas_value`，量測時間用 `meas_at`

```rules
- id: user.semi.equip_id_required
  group: naming
  severity: info
  description: 設備相關表建議包含 equip_id 欄位（半導體標準）
  tablePattern: equip|machine|tool|chamber
  requiredFields: [equip_id]

- id: user.semi.no_status_field
  group: naming
  severity: info
  description: 狀態欄位建議使用具語意的名稱如 equip_status / lot_status，而非通用 status
  forbiddenFieldPattern: ^status$
```
