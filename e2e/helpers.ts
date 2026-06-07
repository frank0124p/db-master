import { type Page } from "@playwright/test";

/** Bypass Suite Splash Screen by pre-setting localStorage and navigating to the app. */
export async function gotoApp(page: Page) {
  await page.goto("/");
  // Inject localStorage keys to skip the Suite Splash Screen
  await page.evaluate(() => {
    localStorage.setItem("schema-studio-suite-picked", "1");
    localStorage.removeItem("schema-studio-suite"); // no suite filter → show all
  });
  await page.reload();
  // Wait for the Schema 編輯器 nav item to appear
  await page.getByRole("button", { name: "Schema 編輯器" }).waitFor({ timeout: 10_000 });
}

/** Navigate to a page via sidebar. */
export async function navTo(page: Page, label: string) {
  await page.getByRole("button", { name: label }).first().click();
}
