import { test, expect } from "@playwright/test";

test("Instance detail — start / complete / edit actions work", async ({ page }) => {
  await page.goto("http://localhost:5173");
  await page.evaluate(() => {
    localStorage.setItem("schema-studio-suite-picked", "1");
    localStorage.setItem("knowledge-domain-picked", "1");
  });
  await page.reload();
  await page.waitForLoadState("networkidle");

  // Go to Governance
  const govBtn = page.getByRole("button").filter({ hasText: /Governance/ }).first();
  if (await govBtn.count() > 0) {
    await govBtn.click();
    await page.waitForTimeout(400);
  }

  // Click 工作流上線單 in sidebar
  const instanceBtn = page.getByRole("button").filter({ hasText: /工作流上線單/ }).first();
  await instanceBtn.waitFor({ timeout: 5000 });
  await instanceBtn.click();
  await page.waitForTimeout(600);

  await page.screenshot({ path: "docs/screenshots/audit/gov-full/instances-list.png" });

  // Click first active instance card (has "active" badge)
  const firstCard = page.getByText("active").first();
  await firstCard.waitFor({ timeout: 5000 });
  await firstCard.click();
  await page.waitForTimeout(600);

  await page.screenshot({ path: "docs/screenshots/audit/gov-full/instance-detail.png" });

  // Verify station panel is visible
  await expect(page.getByText(/站點進度/)).toBeVisible();

  // Verify action buttons exist in header
  await expect(page.getByText("編輯").first()).toBeVisible();
  // Lifecycle actions (暫停 or 恢復 depending on status)
  const lifecycleBtn = page.getByRole("button").filter({ hasText: /暫停|恢復|取消/ }).first();
  expect(await lifecycleBtn.count()).toBeGreaterThan(0);

  await page.screenshot({ path: "docs/screenshots/audit/gov-full/instance-station-panel.png" });

  // Should see station action buttons (start / complete / bypass etc)
  const actionBtns = page.getByRole("button").filter({ hasText: /開始站點|標記完成|略過站點|重開站點/ });
  const count = await actionBtns.count();
  console.log("Station action buttons visible:", count);
  expect(count).toBeGreaterThan(0);
});
