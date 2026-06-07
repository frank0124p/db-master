import fs from "fs/promises";
import { TEST_DATA_DIR } from "../playwright.config.js";

export default async function globalTeardown() {
  await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
  console.log("[global-teardown] Test data cleaned up");
}
