import { test, expect } from "@playwright/test";
import { gotoApp } from "../helpers.js";

test("Flow 1: 手動建立 Schema → 新增 Table → 新增欄位 → 採用命名建議", async ({ page }) => {
  await gotoApp(page);

  // 1. Open new-schema modal
  await page.locator('[title="新建 Schema"]').click();
  await expect(page.getByText("新建 Schema")).toBeVisible();

  // 2. Fill name and submit
  await page.getByPlaceholder("e.g. MES Core v3").fill("E2E Manual Schema");
  await page.getByRole("button", { name: "建立" }).click();

  // 3. Select the schema in sidebar (appears in both desktop sidebar and possibly mobile drawer)
  await page.locator('[data-schema-name="E2E Manual Schema"]').first().click();

  // 4. Open add-table modal
  await page.locator('[title="新增 Table"]').click();
  await expect(page.getByText("新增 Table")).toBeVisible();

  // 5. Fill table name and create
  await page.getByPlaceholder("e.g. lot_records").fill("lot_records");
  await page.getByRole("button", { name: "建立" }).click();

  // 6. Click on the table to open field editor
  await page.getByText("lot_records").first().click();

  // 7. Add a new field (creates "new_field")
  await page.getByText("＋ 新增欄位").click();

  // 8. Click the newly created field name input and change to equipment_id
  const fieldInput = page.locator('input[value="new_field"]').first();
  await fieldInput.waitFor({ timeout: 8_000 });
  await fieldInput.click({ clickCount: 3 });
  await fieldInput.type("equipment_id");

  // 9. Naming hint should appear — equipment_id is an alias for equip_id
  const adoptBtn = page.getByRole("button", { name: "採用建議" }).first();
  await expect(adoptBtn).toBeVisible({ timeout: 5_000 });

  // 10. Adopt the suggestion
  await adoptBtn.click();

  // 11. Field name should now be equip_id
  await expect(page.locator('input[value="equip_id"]').first()).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText("✓ 已採用建議：equip_id")).toBeVisible({ timeout: 5_000 });
});
