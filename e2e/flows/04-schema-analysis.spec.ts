import { test, expect } from "@playwright/test";
import { gotoApp, navTo } from "../helpers.js";
import { testApi } from "../api-client.js";

test.skip(!process.env["ANTHROPIC_API_KEY"], "Requires ANTHROPIC_API_KEY");

test("Flow 4: Schema 分析 → 命名問題 → 採用建議", async ({ page }) => {
  // Set up schema with a badly-named field via API
  const schema = await testApi.schemas.create("E2E Analysis Schema");
  const table = await testApi.tables.create(schema.id, "machine_data");
  await testApi.fields.create(table.id, "equipment_id"); // alias for equip_id → should get warning

  await gotoApp(page);

  // Select schema
  await page.locator('[data-schema-name="E2E Analysis Schema"]').click();

  // Go to analysis page
  await navTo(page, "分析");

  // Trigger analysis
  const analyseBtn = page.getByRole("button", { name: /分析|分析 Schema|開始分析/ });
  await analyseBtn.first().click();

  // Wait for results — LLM call can take time
  await expect(page.getByText(/命名|naming|⚠|alias/).first()).toBeVisible({ timeout: 60_000 });

  // Adopt a suggestion if available
  const adoptBtn = page.getByRole("button", { name: "採用" }).first();
  if (await adoptBtn.isVisible()) {
    await adoptBtn.click();
    // Field name should update
    await expect(page.getByText("equip_id")).toBeVisible({ timeout: 8_000 });
  }

  // Cleanup
  await testApi.schemas.delete(schema.id);
});
