import fs from "fs/promises";
import path from "path";
import { TEST_DATA_DIR, API_PORT } from "../playwright.config.js";

export default async function globalSetup() {
  await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
  await fs.mkdir(path.join(TEST_DATA_DIR, "naming"), { recursive: true });
  await fs.mkdir(path.join(TEST_DATA_DIR, "ddl"), { recursive: true });
  await fs.mkdir(path.join(TEST_DATA_DIR, "_sys"), { recursive: true });

  // Seed naming dict: equipment_id is an alias for equip_id
  await fs.writeFile(
    path.join(TEST_DATA_DIR, "naming", "equip_id.json"),
    JSON.stringify({
      id: 1,
      concept: "設備識別碼",
      stdName: "equip_id",
      aliases: ["equipment_id", "machine_id"],
      domain: "semiconductor",
      tags: ["識別碼", "設備相關"],
      layers: [],
      aiDescription: null,
      description: "設備的唯一識別碼",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "approved",
      reviewers: [],
    }, null, 2),
  );

  // Seed counters
  await fs.writeFile(
    path.join(TEST_DATA_DIR, "_sys", "counters.json"),
    JSON.stringify({
      schemas: 0, tables: 0, fields: 0, namingEntries: 1,
      versions: 0, wideTables: 0, wideSources: 0, wideColumns: 0,
    }, null, 2),
  );

  console.log(`[global-setup] Test data seeded at ${TEST_DATA_DIR}`);
  console.log(`[global-setup] API will run on port ${API_PORT}`);
}
