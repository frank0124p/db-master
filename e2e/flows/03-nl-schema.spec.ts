import { test, expect } from "@playwright/test";
import { gotoApp, navTo } from "../helpers.js";

test.skip(!process.env["ANTHROPIC_API_KEY"], "Requires ANTHROPIC_API_KEY");

test("Flow 3: NL → Schema 生成", async ({ page }) => {
  await gotoApp(page);

  // Open AI generate modal via ✦ AI button in sidebar
  await page.locator('[title="AI 生成"]').click();

  // Fill in NL description
  const textarea = page.locator("textarea").filter({ hasText: "" }).first();
  await textarea.fill("建立一個批次追蹤系統，記錄批次號、晶圓數、目前狀態、建立時間");

  // Submit (look for generate/建立 button in the modal)
  const generateBtn = page.getByRole("button", { name: /生成|建立|確認/ }).last();
  await generateBtn.click();

  // Wait for generation — can take up to 60s
  // The schema should appear in sidebar after generation
  await page.locator('[data-testid="schema-item"]').first().waitFor({ timeout: 90_000 });

  // Click the newly generated schema
  const schemaItems = page.locator('[data-testid="schema-item"]');
  await schemaItems.last().click();

  // Navigate to editor page
  await navTo(page, "Schema 編輯器");

  // Verify generated schema contains expected fields (check table list and field names)
  // Look for field names related to lot tracking
  const pageContent = await page.content();
  const hasLotField = /lot_id|lot_no|batch_id/.test(pageContent);
  const hasWaferField = /wafer_count|wafer_no/.test(pageContent);
  const hasStatusField = /lot_status|status/.test(pageContent);

  expect(hasLotField || hasWaferField || hasStatusField).toBeTruthy();
});
