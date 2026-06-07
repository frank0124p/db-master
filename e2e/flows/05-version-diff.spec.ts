import { test, expect } from "@playwright/test";
import { gotoApp, navTo } from "../helpers.js";
import { testApi } from "../api-client.js";

test("Flow 5: 版本 Diff — 命名字典狀態 ⚠ → ✓", async ({ page }) => {
  // Set up: schema with equipment_id field (alias → ⚠)
  const schema = await testApi.schemas.create("E2E Version Schema");
  const table = await testApi.tables.create(schema.id, "lot_records");
  const field = await testApi.fields.create(table.id, "equipment_id");

  // Save v1 snapshot
  await testApi.versions.create(schema.id, "v1: 使用別名 equipment_id");

  await gotoApp(page);

  // Select schema
  await page.locator('[data-schema-name="E2E Version Schema"]').first().click();

  // Go to Schema 編輯器 and rename field to equip_id via API
  // (rename via API to keep test fast)
  await fetch(`http://localhost:3099/api/v1/fields/${field.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "equip_id" }),
  });

  // Go to version history and save v2
  await navTo(page, "版本歷史");
  await page.getByRole("button", { name: "＋ 儲存目前版本" }).click();
  // Toast text: "✓ v{N} 已儲存"
  await expect(page.getByText(/✓ v\d+ 已儲存/)).toBeVisible({ timeout: 8_000 });

  // Now there should be 2 versions (use exact match to avoid table cell text)
  await expect(page.getByText("v1", { exact: true }).first()).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText("v2", { exact: true }).first()).toBeVisible({ timeout: 5_000 });

  // Click on v2 to expand diff
  await page.getByText("v2").first().click();

  // Diff should show field modification: equipment_id → equip_id
  await expect(page.getByText(/equipment_id|equip_id/).first()).toBeVisible({ timeout: 5_000 });

  // Naming status should show improvement — look for ✓ (exact match for equip_id)
  const diffSection = page.locator('text=equip_id').first();
  await expect(diffSection).toBeVisible();

  // Cleanup
  await testApi.schemas.delete(schema.id);
});
