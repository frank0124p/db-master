# DDL Input Directory

將 `.sql` 檔案放在這個目錄下，API 啟動時會自動掃描並匯入。

## 使用方式

1. 將 DDL 檔案放入此目錄，例如：
   ```
   ddl-input/
   ├── mes_core.sql
   ├── plm_schema.sql
   └── equipment_mgmt.sql
   ```

2. 重啟 API 伺服器（`pnpm dev`）

3. 系統會自動建立對應的 Schema，名稱取自檔案名稱（去掉 `.sql` 後綴）

## 規則

- 每個 `.sql` 檔案對應一個 Schema
- 若 Schema 同名已存在，則更新（upsert）其中的 Tables 與 Fields
- 已匯入的檔案記錄在 `data/_ddl-manifest.json`，檔案內容不變則不重複匯入（以 mtime 判斷）
- 若要強制重新匯入，刪除 `data/_ddl-manifest.json` 後重啟即可
