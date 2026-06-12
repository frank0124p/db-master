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
  tempDir = path.join(os.tmpdir(), `db-master-governance-${crypto.randomUUID()}`);
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
  return import("../repositories/knowledge.js");
}

// ── SourceDoc ──────────────────────────────────────────────────────────────────

describe("createSourceDoc / getSourceDoc", () => {
  it("createSourceDoc with chunks → getSourceDoc by id → verify id/title/chunks", async () => {
    const repo = await importRepo();
    const created = await repo.createSourceDoc(
      {
        title: "Schema Standards Doc",
        format: "markdown",
        content: "# Overview\nThis is a test document.",
        chunks: [
          { idx: 0, text: "Schema Standards Doc" },
          { idx: 1, text: "This is a test document." },
        ],
        uploadedBy: "alice",
      },
      "schema-standards-doc",
    );

    expect(typeof created.id).toBe("number");
    expect(created.id).toBeGreaterThan(0);

    const fetched = await repo.getSourceDoc(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.title).toBe("Schema Standards Doc");
    expect(fetched!.chunks).toHaveLength(2);
    expect(fetched!.chunks[0]!.text).toBe("Schema Standards Doc");
  });
});

describe("listSourceDocs", () => {
  it("listSourceDocs contains the created doc", async () => {
    const repo = await importRepo();
    const created = await repo.createSourceDoc(
      {
        title: "Governance Policy",
        format: "text",
        content: "Policy content here.",
        chunks: [{ idx: 0, text: "Policy content here." }],
        uploadedBy: "bob",
      },
      "governance-policy",
    );

    const docs = await repo.listSourceDocs();
    expect(docs.length).toBeGreaterThanOrEqual(1);
    expect(docs.some((d) => d.id === created.id)).toBe(true);
  });
});

describe("deleteSourceDoc", () => {
  it("deleteSourceDoc → getSourceDoc returns null", async () => {
    const repo = await importRepo();
    const created = await repo.createSourceDoc(
      {
        title: "Temporary Doc",
        format: "text",
        content: "To be deleted.",
        chunks: [{ idx: 0, text: "To be deleted." }],
        uploadedBy: "carol",
      },
      "temporary-doc",
    );

    await repo.deleteSourceDoc(created.id);

    const fetched = await repo.getSourceDoc(created.id);
    expect(fetched).toBeNull();
  });
});

// ── ConceptCard ────────────────────────────────────────────────────────────────

describe("createConcept / listConcepts / getConcept", () => {
  it("createConcept → listConcepts → getConcept", async () => {
    const repo = await importRepo();
    const created = await repo.createConcept({
      slug: "lot-id",
      name: "Lot ID",
      stdName: "lot_id",
      definition: "Unique identifier for a manufacturing lot.",
      aliases: ["lot_no", "lot_number"],
      domain: "semiconductor",
      relatedConcepts: [],
      tableHints: [],
      namingDictIds: [],
      sourceRefs: [],
      status: "pending",
      reviewers: [],
    });

    expect(typeof created.id).toBe("number");
    expect(created.id).toBeGreaterThan(0);

    const list = await repo.listConcepts();
    expect(list.some((c) => c.id === created.id)).toBe(true);

    const fetched = await repo.getConcept(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.name).toBe("Lot ID");
    expect(fetched!.aliases).toContain("lot_no");
  });
});

describe("updateConcept", () => {
  it("updateConcept status to approved → listConcepts({status:'approved'}) includes it", async () => {
    const repo = await importRepo();
    const created = await repo.createConcept({
      slug: "wafer-id",
      name: "Wafer ID",
      stdName: "wafer_id",
      definition: "Unique identifier for a semiconductor wafer.",
      aliases: [],
      domain: "semiconductor",
      relatedConcepts: [],
      tableHints: [],
      namingDictIds: [],
      sourceRefs: [],
      status: "pending",
      reviewers: [],
    });

    // Initially pending — should NOT appear in approved filter
    const pendingList = await repo.listConcepts({ status: "approved" });
    expect(pendingList.some((c) => c.id === created.id)).toBe(false);

    await repo.updateConcept(created.id, { status: "approved" });

    const approvedList = await repo.listConcepts({ status: "approved" });
    expect(approvedList.some((c) => c.id === created.id)).toBe(true);
    expect(approvedList.find((c) => c.id === created.id)!.status).toBe("approved");
  });
});
