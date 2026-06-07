import { test, expect } from "@playwright/test";
import { gotoApp, navTo } from "../helpers.js";

test("Flow 6: 命名字典管理 — 新增詞彙 → 審核 → 刪除", async ({ page }) => {
  await gotoApp(page);

  // Go to naming dictionary page
  await navTo(page, "命名字典");

  // Click "＋ 新增詞彙"
  await page.getByRole("button", { name: "＋ 新增詞彙" }).click();
  await expect(page.getByText("新增命名詞彙")).toBeVisible();

  // Fill in concept name and std_name
  await page.getByPlaceholder("e.g. 設備ID").fill("測試概念");
  await page.getByPlaceholder("e.g. equip_id").fill("test_concept");

  // Submit (exact to avoid matching "＋ 新增詞彙" button)
  await page.getByRole("button", { name: "新增", exact: true }).click();

  // Wait for add toast
  await expect(page.getByText("✓ 已新增詞彙：test_concept")).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText("✓ 已新增詞彙：test_concept")).not.toBeVisible({ timeout: 5_000 });

  // New entries are status "pending" — switch to 待審核 tab
  await page.getByRole("button", { name: /待審核/ }).click();
  await expect(page.getByText("test_concept")).toBeVisible({ timeout: 8_000 });

  // Approve the entry (no confirm dialog — direct mutation)
  await page.getByRole("button", { name: "✓ 核准" }).click();
  await expect(page.getByText(/已核准.*test_concept/)).toBeVisible({ timeout: 8_000 });

  // Switch to 正式字典 tab — entry should now be there
  await page.getByRole("button", { name: "正式字典" }).click();
  await expect(page.getByRole("cell", { name: "test_concept" })).toBeVisible({ timeout: 8_000 });

  // Accept the confirm() dialog before clicking Delete
  page.once("dialog", d => d.accept());

  // Click Delete for test_concept
  const row = page.getByRole("row", { name: /test_concept/ });
  await row.getByRole("button", { name: "刪除" }).click();

  // Verify delete toast
  await expect(page.getByText("已刪除詞彙：test_concept")).toBeVisible({ timeout: 5_000 });
  await expect(page.locator("td").filter({ hasText: /^test_concept$/ })).not.toBeVisible({ timeout: 8_000 });
});
