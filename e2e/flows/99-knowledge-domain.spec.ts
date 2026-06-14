import { test, expect } from "@playwright/test";

test("Knowledge domain splash + tabs + switch back", async ({ page }) => {
  // Clear domain selection so splash shows
  await page.goto("http://localhost:5173");
  await page.evaluate(() => {
    localStorage.removeItem("knowledge-domain-picked");
    localStorage.removeItem("knowledge-domain");
    localStorage.setItem("schema-studio-suite-picked", "1");
  });
  await page.reload();
  await page.waitForLoadState("networkidle");

  // Navigate to Governance section first
  const govNavBtn = page.getByRole("button").filter({ hasText: /Governance|治理/ }).first();
  if (await govNavBtn.count() > 0) {
    await govNavBtn.click();
    await page.waitForTimeout(400);
  }

  // Click Knowledge (知識庫) in governance sidebar
  const knowledgeBtn = page.getByRole("button").filter({ hasText: /知識庫/ }).first();
  if (await knowledgeBtn.count() > 0) await knowledgeBtn.click();
  await page.waitForTimeout(600);

  await page.screenshot({ path: "docs/screenshots/audit/gov-full/knowledge-domain-splash.png", fullPage: false });

  // Domain splash should be visible
  await expect(page.getByText("選擇知識庫 Domain")).toBeVisible({ timeout: 5000 });

  // Click ALL domain card (contains "ALL" + "顯示全部知識")
  await page.getByRole("button").filter({ hasText: "顯示全部知識" }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: "docs/screenshots/audit/gov-full/knowledge-after-all.png" });

  // Tabs should be visible
  await expect(page.getByText("文件").first()).toBeVisible();
  await expect(page.getByText(/概念卡/).first()).toBeVisible();

  // "ALL" badge + 切換 button in header
  const switchBtn = page.getByRole("button").filter({ hasText: /切換/ });
  await expect(switchBtn.first()).toBeVisible();
  await switchBtn.first().click();
  await page.waitForTimeout(400);

  // Should be back to domain splash
  await expect(page.getByText("選擇知識庫 Domain")).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/audit/gov-full/knowledge-switch-back.png" });
});
