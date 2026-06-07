import { test, expect } from "@playwright/test";
import { gotoApp } from "../helpers.js";
import { testApi } from "../api-client.js";

const SAMPLE_DDL = `
CREATE TABLE \`lot_records\` (
  \`id\` BIGINT NOT NULL AUTO_INCREMENT,
  \`lot_no\` VARCHAR(32) NOT NULL COMMENT '批次號',
  PRIMARY KEY (\`id\`)
) COMMENT='批次紀錄';

CREATE TABLE \`equipment_logs\` (
  \`id\` BIGINT NOT NULL AUTO_INCREMENT,
  \`equip_id\` VARCHAR(64) NOT NULL COMMENT '設備識別碼',
  \`logged_at\` DATETIME NOT NULL COMMENT '記錄時間',
  PRIMARY KEY (\`id\`)
) COMMENT='設備日誌';

CREATE TABLE \`wafer_maps\` (
  \`id\` BIGINT NOT NULL AUTO_INCREMENT,
  \`lot_no\` VARCHAR(32) NOT NULL,
  \`slot_no\` INT NOT NULL COMMENT '槽位編號',
  PRIMARY KEY (\`id\`)
) COMMENT='晶圓地圖';
`.trim();

test("Flow 2: DDL 匯入 → 顯示 3 個表 → 匯出 DDL", async ({ page }) => {
  // Set up a schema via API
  const schema = await testApi.schemas.create("E2E DDL Schema");

  await gotoApp(page);

  // Select the schema
  await page.locator('[data-schema-name="E2E DDL Schema"]').first().click();

  // Open DDL import modal
  await page.locator('[title="匯入 DDL"]').click();
  await expect(page.getByText("匯入 DDL")).toBeVisible();

  // Paste SQL
  const textarea = page.locator("textarea").first();
  await textarea.fill(SAMPLE_DDL);

  // Accept the confirm() dialog before clicking import
  page.once("dialog", d => d.accept());

  // Import
  await page.getByRole("button", { name: "匯入" }).click();

  // Wait for import to complete — toast appears and modal closes
  await expect(page.getByText(/匯入完成/)).toBeVisible({ timeout: 15_000 });

  // Verify 3 tables appear in the table list panel
  await expect(page.getByText("lot_records").first()).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText("equipment_logs").first()).toBeVisible();
  await expect(page.getByText("wafer_maps").first()).toBeVisible();

  // Click one table to load it (first match = table list item in schema editor)
  await page.getByText("lot_records").first().click();

  // Wait for field editor panel to load
  await page.getByText("↓ 匯出 DDL").waitFor({ timeout: 8_000 });

  // Export DDL — intercept the download
  const downloadPromise = page.waitForEvent("download");
  await page.getByText("↓ 匯出 DDL").click();
  const download = await downloadPromise;

  // Verify file was downloaded and contains SQL
  expect(download.suggestedFilename()).toMatch(/\.sql$/);
  const content = await download.path().then(p => {
    if (!p) throw new Error("No download path");
    return import("fs/promises").then(fs => fs.readFile(p, "utf-8"));
  });
  expect(content).toContain("CREATE TABLE");
  expect(content).toContain("lot_records");

  // Cleanup
  await testApi.schemas.delete(schema.id);
});
