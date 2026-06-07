import { defineConfig, devices } from "@playwright/test";
import path from "path";

export const TEST_DATA_DIR = path.resolve("e2e", ".test-data");
export const API_PORT = 3099;
export const WEB_PORT = 5199;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  workers: 1,
  reporter: process.env["CI"] ? "github" : "list",
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  webServer: [
    {
      command: "node_modules/.bin/tsx apps/api/src/main.ts",
      url: `http://localhost:${API_PORT}/api/v1/health`,
      reuseExistingServer: !process.env["CI"],
      timeout: 30_000,
      env: {
        DATA_DIR: TEST_DATA_DIR,
        PORT: String(API_PORT),
        NODE_ENV: "test",
        ALLOWED_ORIGINS: `http://localhost:${WEB_PORT}`,
      },
    },
    {
      command: `node_modules/.bin/vite apps/web --port ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !process.env["CI"],
      timeout: 30_000,
      env: {
        VITE_API_URL: `http://localhost:${API_PORT}`,
      },
    },
  ],
});
