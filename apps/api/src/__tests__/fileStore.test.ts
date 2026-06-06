import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import os from "os";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";

// Mock MinIO so fileStore doesn't need a real connection
vi.mock("../services/minio.js", () => ({
  uploadFileAsync: vi.fn(),
}));

// DATA_DIR is resolved at module import time from process.env["DATA_DIR"].
// We set the env var BEFORE importing fileStore, then reset module registry
// between tests via vi.resetModules() so each test gets a fresh module instance
// pointing to the right temp dir.

let tempDir: string;

beforeEach(async () => {
  tempDir = path.join(os.tmpdir(), `db-master-test-${crypto.randomUUID()}`);
  process.env["DATA_DIR"] = tempDir;
  await fs.mkdir(path.join(tempDir, "_sys"), { recursive: true });
  vi.resetModules();
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  delete process.env["DATA_DIR"];
  vi.resetModules();
});

// Helper to re-import fileStore with current DATA_DIR env
async function importStore() {
  // Re-mock after resetModules
  vi.mock("../services/minio.js", () => ({
    uploadFileAsync: vi.fn(),
  }));
  return import("../db/fileStore.js");
}

// ── writeJson / readJson ──────────────────────────────────────────────────────

describe("writeJson / readJson", () => {
  it("writes and reads back a simple object", async () => {
    const store = await importStore();
    const filePath = store.dataPath("test-write.json");
    const data = { hello: "world", count: 42 };
    await store.writeJson(filePath, data);
    const result = await store.readJson<typeof data>(filePath);
    expect(result).toEqual(data);
  });

  it("writes and reads back a nested object", async () => {
    const store = await importStore();
    const filePath = store.dataPath("nested.json");
    const data = { a: { b: { c: [1, 2, 3] } } };
    await store.writeJson(filePath, data);
    const result = await store.readJson<typeof data>(filePath);
    expect(result).toEqual(data);
  });

  it("creates parent directories automatically", async () => {
    const store = await importStore();
    const filePath = store.dataPath("deep", "nested", "dir", "file.json");
    await store.writeJson(filePath, { ok: true });
    const result = await store.readJson<{ ok: boolean }>(filePath);
    expect(result?.ok).toBe(true);
  });
});

// ── readJson — missing file ───────────────────────────────────────────────────

describe("readJson — missing file", () => {
  it("returns null for a file that does not exist", async () => {
    const store = await importStore();
    const filePath = store.dataPath("nonexistent.json");
    const result = await store.readJson(filePath);
    expect(result).toBeNull();
  });

  it("returns null for a file in a nonexistent directory", async () => {
    const store = await importStore();
    const filePath = store.dataPath("no-dir", "missing.json");
    const result = await store.readJson(filePath);
    expect(result).toBeNull();
  });
});

// ── deleteFile ────────────────────────────────────────────────────────────────

describe("deleteFile", () => {
  it("removes a file that exists", async () => {
    const store = await importStore();
    const filePath = store.dataPath("to-delete.json");
    await store.writeJson(filePath, { x: 1 });
    await store.deleteFile(filePath);
    const result = await store.readJson(filePath);
    expect(result).toBeNull();
  });

  it("does not throw when deleting a nonexistent file", async () => {
    const store = await importStore();
    const filePath = store.dataPath("ghost.json");
    await expect(store.deleteFile(filePath)).resolves.toBeUndefined();
  });
});

// ── nextId ────────────────────────────────────────────────────────────────────

describe("nextId", () => {
  it("returns 1 on first call", async () => {
    const store = await importStore();
    const id = await store.nextId("namingEntries");
    expect(id).toBe(1);
  });

  it("increments on successive calls", async () => {
    const store = await importStore();
    const id1 = await store.nextId("schemas");
    const id2 = await store.nextId("schemas");
    expect(id2).toBe(id1 + 1);
  });

  it("returns sequential IDs for multiple calls", async () => {
    const store = await importStore();
    const id1 = await store.nextId("tables");
    const id2 = await store.nextId("tables");
    const id3 = await store.nextId("tables");
    // Sequential calls must produce consecutive IDs
    expect(id2).toBe(id1 + 1);
    expect(id3).toBe(id2 + 1);
  });

  it("persists counter to disk", async () => {
    const store = await importStore();
    await store.nextId("fields");
    // Verify counter file exists
    const counterFile = store.sysPath("counters.json");
    const result = await store.readJson<{ fields: number }>(counterFile);
    expect(result?.fields).toBe(1);
  });

  it("tracks independent counters per key", async () => {
    const store = await importStore();
    const schemaId = await store.nextId("schemas");
    const tableId = await store.nextId("tables");
    // Each key starts from 0 independently
    expect(schemaId).toBe(1);
    expect(tableId).toBe(1);
  });
});

// ── getIndex / writeIndex ─────────────────────────────────────────────────────

describe("getIndex / writeIndex", () => {
  it("returns a default index when no index file exists", async () => {
    const store = await importStore();
    const idx = await store.getIndex();
    expect(idx.tableSchema).toEqual({});
    expect(idx.fieldTable).toEqual({});
    expect(idx.schemaIdToSlug).toEqual({});
  });

  it("round-trips an index through writeIndex/getIndex", async () => {
    const store = await importStore();
    const idx = await store.getIndex();
    idx.tableSchema["42"] = 7;
    idx.schemaIdToSlug["7"] = "my-schema";
    await store.writeIndex(idx);

    // Re-import to bypass in-memory cache
    vi.resetModules();
    vi.mock("../services/minio.js", () => ({ uploadFileAsync: vi.fn() }));
    const store2 = await import("../db/fileStore.js");
    const idx2 = await store2.getIndex();
    expect(idx2.tableSchema["42"]).toBe(7);
    expect(idx2.schemaIdToSlug["7"]).toBe("my-schema");
  });
});

// ── indexSet / indexGet ───────────────────────────────────────────────────────

describe("indexSet / indexGet", () => {
  it("sets and gets a numeric value", async () => {
    const store = await importStore();
    await store.indexSet("tableSchema", 10, 5);
    const val = await store.indexGet("tableSchema", 10);
    expect(val).toBe(5);
  });

  it("returns null for a key that was never set", async () => {
    const store = await importStore();
    const val = await store.indexGet("tableSchema", 9999);
    expect(val).toBeNull();
  });

  it("overwrites an existing value", async () => {
    const store = await importStore();
    await store.indexSet("fieldTable", 1, 100);
    await store.indexSet("fieldTable", 1, 200);
    const val = await store.indexGet("fieldTable", 1);
    expect(val).toBe(200);
  });
});

// ── indexSetStr / indexGetStr ─────────────────────────────────────────────────

describe("indexSetStr / indexGetStr", () => {
  it("sets and gets a string value", async () => {
    const store = await importStore();
    await store.indexSetStr("schemaIdToSlug", 3, "my-schema-slug");
    const val = await store.indexGetStr("schemaIdToSlug", 3);
    expect(val).toBe("my-schema-slug");
  });

  it("returns null for a key that was never set", async () => {
    const store = await importStore();
    const val = await store.indexGetStr("namingIdToStdName", 8888);
    expect(val).toBeNull();
  });

  it("sets and gets a namingIdToStdName value", async () => {
    const store = await importStore();
    await store.indexSetStr("namingIdToStdName", 7, "lot_id");
    const val = await store.indexGetStr("namingIdToStdName", 7);
    expect(val).toBe("lot_id");
  });

  it("sets and gets a tableIdToName value", async () => {
    const store = await importStore();
    await store.indexSetStr("tableIdToName", 12, "user_accounts");
    const val = await store.indexGetStr("tableIdToName", 12);
    expect(val).toBe("user_accounts");
  });
});

// ── indexDelete ───────────────────────────────────────────────────────────────

describe("indexDelete", () => {
  it("removes a numeric index entry", async () => {
    const store = await importStore();
    await store.indexSet("tableSchema", 20, 1);
    await store.indexDelete("tableSchema", 20);
    const val = await store.indexGet("tableSchema", 20);
    expect(val).toBeNull();
  });

  it("removes a string index entry", async () => {
    const store = await importStore();
    await store.indexSetStr("namingIdToStdName", 99, "equip_id");
    await store.indexDelete("namingIdToStdName", 99);
    const val = await store.indexGetStr("namingIdToStdName", 99);
    expect(val).toBeNull();
  });

  it("does not throw when deleting a non-existent index entry", async () => {
    const store = await importStore();
    await expect(store.indexDelete("tableSchema", 77777)).resolves.toBeUndefined();
  });
});

// ── dataPath / sysPath ────────────────────────────────────────────────────────

describe("dataPath / sysPath", () => {
  it("dataPath returns a path inside tempDir", async () => {
    const store = await importStore();
    const p = store.dataPath("naming", "lot_id.json");
    expect(p).toContain(tempDir);
    expect(p).toContain("naming");
    expect(p).toContain("lot_id.json");
  });

  it("sysPath returns a path inside tempDir/_sys", async () => {
    const store = await importStore();
    const p = store.sysPath("counters.json");
    expect(p).toContain(tempDir);
    expect(p).toContain("_sys");
    expect(p).toContain("counters.json");
  });
});
