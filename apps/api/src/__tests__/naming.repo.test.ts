import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import os from "os";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";

vi.mock("../services/minio.js", () => ({
  uploadFileAsync: vi.fn(),
}));

let tempDir: string;

beforeEach(async () => {
  tempDir = path.join(os.tmpdir(), `db-master-naming-${crypto.randomUUID()}`);
  process.env["DATA_DIR"] = tempDir;
  await fs.mkdir(path.join(tempDir, "_sys"), { recursive: true });
  vi.resetModules();
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  delete process.env["DATA_DIR"];
  vi.resetModules();
});

async function importRepo() {
  vi.mock("../services/minio.js", () => ({ uploadFileAsync: vi.fn() }));
  return import("../repositories/naming.js");
}

// ── listNamingEntries ─────────────────────────────────────────────────────────

describe("listNamingEntries", () => {
  it("returns empty array when no entries exist", async () => {
    const repo = await importRepo();
    const entries = await repo.listNamingEntries();
    expect(entries).toHaveLength(0);
  });

  it("returns only approved entries by default", async () => {
    const repo = await importRepo();
    await repo.createNamingEntry({
      concept: "Lot ID",
      std_name: "lot_id",
      aliases: [],
      domain: "semiconductor",
      tags: [],
      layers: [],
    });
    // Just created → status is pending, so should NOT appear in default list
    const entries = await repo.listNamingEntries();
    expect(entries).toHaveLength(0);
  });

  it("returns pending entries when status filter is pending", async () => {
    const repo = await importRepo();
    await repo.createNamingEntry({
      concept: "Lot ID",
      std_name: "lot_id",
      aliases: [],
      domain: "semiconductor",
      tags: [],
      layers: [],
    });
    const entries = await repo.listNamingEntries(undefined, "pending");
    expect(entries).toHaveLength(1);
    expect(entries[0]!.stdName).toBe("lot_id");
  });

  it("returns approved entries after approval", async () => {
    const repo = await importRepo();
    const created = await repo.createNamingEntry({
      concept: "Wafer ID",
      std_name: "wafer_id",
      aliases: [],
      domain: "semiconductor",
      tags: [],
      layers: [],
    });
    await repo.approveNamingEntry(created.id);
    const entries = await repo.listNamingEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.status).toBe("approved");
  });

  it("filters by domain when domain is specified", async () => {
    const repo = await importRepo();
    const e1 = await repo.createNamingEntry({
      concept: "Lot ID",
      std_name: "lot_id",
      aliases: [],
      domain: "semiconductor",
      tags: [],
      layers: [],
    });
    const e2 = await repo.createNamingEntry({
      concept: "Order ID",
      std_name: "order_id",
      aliases: [],
      domain: "ecommerce",
      tags: [],
      layers: [],
    });
    await repo.approveNamingEntry(e1.id);
    await repo.approveNamingEntry(e2.id);

    const all = await repo.listNamingEntries();
    expect(all).toHaveLength(2);

    const semis = await repo.listNamingEntries("semiconductor");
    expect(semis).toHaveLength(1);
    expect(semis[0]!.domain).toBe("semiconductor");
  });

  it("returns entries sorted by stdName", async () => {
    const repo = await importRepo();
    const e1 = await repo.createNamingEntry({
      concept: "Wafer ID",
      std_name: "wafer_id",
      aliases: [],
      domain: "semiconductor",
      tags: [],
      layers: [],
    });
    const e2 = await repo.createNamingEntry({
      concept: "Lot ID",
      std_name: "lot_id",
      aliases: [],
      domain: "semiconductor",
      tags: [],
      layers: [],
    });
    await repo.approveNamingEntry(e1.id);
    await repo.approveNamingEntry(e2.id);

    const entries = await repo.listNamingEntries();
    expect(entries[0]!.stdName).toBe("lot_id");
    expect(entries[1]!.stdName).toBe("wafer_id");
  });
});

// ── createNamingEntry ─────────────────────────────────────────────────────────

describe("createNamingEntry", () => {
  it("creates an entry with status pending", async () => {
    const repo = await importRepo();
    const entry = await repo.createNamingEntry({
      concept: "Equipment ID",
      std_name: "equip_id",
      aliases: ["equipment_id"],
      domain: "semiconductor",
      tags: [],
      layers: [],
    });
    expect(entry.status).toBe("pending");
  });

  it("creates an entry with the given stdName", async () => {
    const repo = await importRepo();
    const entry = await repo.createNamingEntry({
      concept: "Equipment ID",
      std_name: "equip_id",
      aliases: [],
      domain: "semiconductor",
      tags: [],
      layers: [],
    });
    expect(entry.stdName).toBe("equip_id");
  });

  it("creates an entry with the given aliases", async () => {
    const repo = await importRepo();
    const entry = await repo.createNamingEntry({
      concept: "Equipment ID",
      std_name: "equip_id",
      aliases: ["equipment_id", "equip_no"],
      domain: "semiconductor",
      tags: [],
      layers: [],
    });
    expect(entry.aliases).toContain("equipment_id");
    expect(entry.aliases).toContain("equip_no");
  });

  it("assigns a numeric id", async () => {
    const repo = await importRepo();
    const entry = await repo.createNamingEntry({
      concept: "Lot ID",
      std_name: "lot_id",
      aliases: [],
      domain: "semiconductor",
      tags: [],
      layers: [],
    });
    expect(typeof entry.id).toBe("number");
    expect(entry.id).toBeGreaterThan(0);
  });

  it("assigns sequential IDs to multiple entries", async () => {
    const repo = await importRepo();
    const e1 = await repo.createNamingEntry({ concept: "A", std_name: "aa_id", aliases: [], domain: "d", tags: [], layers: [] });
    const e2 = await repo.createNamingEntry({ concept: "B", std_name: "bb_id", aliases: [], domain: "d", tags: [], layers: [] });
    expect(e2.id).toBe(e1.id + 1);
  });
});

// ── approveNamingEntry ────────────────────────────────────────────────────────

describe("approveNamingEntry", () => {
  it("changes status from pending to approved", async () => {
    const repo = await importRepo();
    const created = await repo.createNamingEntry({
      concept: "Lot ID",
      std_name: "lot_id",
      aliases: [],
      domain: "semiconductor",
      tags: [],
      layers: [],
    });
    expect(created.status).toBe("pending");
    const approved = await repo.approveNamingEntry(created.id);
    expect(approved.status).toBe("approved");
  });

  it("approved entry appears in default listNamingEntries", async () => {
    const repo = await importRepo();
    const created = await repo.createNamingEntry({
      concept: "Lot ID",
      std_name: "lot_id",
      aliases: [],
      domain: "semiconductor",
      tags: [],
      layers: [],
    });
    await repo.approveNamingEntry(created.id);
    const list = await repo.listNamingEntries();
    expect(list.some((e) => e.id === created.id)).toBe(true);
  });
});

// ── rejectNamingEntry ─────────────────────────────────────────────────────────

describe("rejectNamingEntry", () => {
  it("changes status from pending to rejected", async () => {
    const repo = await importRepo();
    const created = await repo.createNamingEntry({
      concept: "Bad Entry",
      std_name: "bad_entry",
      aliases: [],
      domain: "semiconductor",
      tags: [],
      layers: [],
    });
    const rejected = await repo.rejectNamingEntry(created.id);
    expect(rejected.status).toBe("rejected");
  });

  it("rejected entry does not appear in approved list", async () => {
    const repo = await importRepo();
    const created = await repo.createNamingEntry({
      concept: "Bad Entry",
      std_name: "bad_entry",
      aliases: [],
      domain: "semiconductor",
      tags: [],
      layers: [],
    });
    await repo.rejectNamingEntry(created.id);
    const list = await repo.listNamingEntries();
    expect(list.some((e) => e.id === created.id)).toBe(false);
  });

  it("rejected entry appears in rejected list", async () => {
    const repo = await importRepo();
    const created = await repo.createNamingEntry({
      concept: "Bad Entry",
      std_name: "bad_entry",
      aliases: [],
      domain: "semiconductor",
      tags: [],
      layers: [],
    });
    await repo.rejectNamingEntry(created.id);
    const list = await repo.listNamingEntries(undefined, "rejected");
    expect(list.some((e) => e.id === created.id)).toBe(true);
  });
});

// ── assignReviewers ───────────────────────────────────────────────────────────

describe("assignReviewers", () => {
  it("sets the reviewer list on an entry", async () => {
    const repo = await importRepo();
    const created = await repo.createNamingEntry({
      concept: "Lot ID",
      std_name: "lot_id",
      aliases: [],
      domain: "semiconductor",
      tags: [],
      layers: [],
    });
    const updated = await repo.assignReviewers(created.id, [
      { userId: "u1", name: "Alice" },
      { userId: "u2", name: "Bob" },
    ]);
    expect(updated.reviewers).toHaveLength(2);
    expect(updated.reviewers[0]!.userId).toBe("u1");
    expect(updated.reviewers[1]!.userId).toBe("u2");
  });

  it("initializes signedAt to null for new reviewers", async () => {
    const repo = await importRepo();
    const created = await repo.createNamingEntry({
      concept: "Lot ID",
      std_name: "lot_id",
      aliases: [],
      domain: "semiconductor",
      tags: [],
      layers: [],
    });
    const updated = await repo.assignReviewers(created.id, [
      { userId: "u1", name: "Alice" },
    ]);
    expect(updated.reviewers[0]!.signedAt).toBeNull();
  });

  it("replaces the reviewer list when called again", async () => {
    const repo = await importRepo();
    const created = await repo.createNamingEntry({
      concept: "Lot ID",
      std_name: "lot_id",
      aliases: [],
      domain: "semiconductor",
      tags: [],
      layers: [],
    });
    await repo.assignReviewers(created.id, [{ userId: "u1", name: "Alice" }]);
    const updated = await repo.assignReviewers(created.id, [{ userId: "u2", name: "Bob" }]);
    expect(updated.reviewers).toHaveLength(1);
    expect(updated.reviewers[0]!.userId).toBe("u2");
  });
});
