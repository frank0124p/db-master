/**
 * Integration tests for all governance workflow API routes.
 *
 * Each test suite gets an isolated tmp directory set via process.env["DATA_DIR"].
 * vi.resetModules() + dynamic import ensures all modules (fileStore, repositories,
 * routers) are loaded fresh with the correct DATA_DIR in each test.
 */

import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import os from "os";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import supertest from "supertest";
import type { Express } from "express";

// Prevent real MinIO from being called in any module in the tree
vi.mock("../services/minio.js", () => ({
  uploadFileAsync: vi.fn(),
  initMinio: vi.fn(),
  setDataDir: vi.fn(),
}));

let tempDir: string;
let app: Express;

beforeEach(async () => {
  tempDir = path.join(os.tmpdir(), `db-master-routes-${crypto.randomUUID()}`);
  process.env["DATA_DIR"] = tempDir;
  await fs.mkdir(path.join(tempDir, "_sys"), { recursive: true });

  // Reset all modules so DATA_DIR is picked up fresh by fileStore (module-level const)
  vi.resetModules();

  // Re-apply mock after resetModules so the fresh module tree still gets it
  vi.mock("../services/minio.js", () => ({
    uploadFileAsync: vi.fn(),
    initMinio: vi.fn(),
    setDataDir: vi.fn(),
  }));

  const { createApp } = await import("../app.js");
  app = createApp();
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  delete process.env["DATA_DIR"];
  vi.resetModules();
});

// ── Knowledge — SourceDocs ────────────────────────────────────────────────────

describe("Knowledge SourceDocs", () => {
  it("GET /api/v1/knowledge/sources returns empty array initially", async () => {
    const res = await supertest(app).get("/api/v1/knowledge/sources");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  it("POST /api/v1/knowledge/sources → 201 with id/title/chunks", async () => {
    const res = await supertest(app)
      .post("/api/v1/knowledge/sources")
      .send({ title: "Schema Standards", content: "This is doc content for testing." });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: expect.any(Number),
      title: "Schema Standards",
    });
    // POST returns the full doc; chunks is an array on the created doc
    expect(Array.isArray(res.body.chunks)).toBe(true);
  });

  it("GET /api/v1/knowledge/sources/:id → 200", async () => {
    const created = await supertest(app)
      .post("/api/v1/knowledge/sources")
      .send({ title: "Policy Doc", content: "Governance policy document." });
    expect(created.status).toBe(201);

    const res = await supertest(app).get(`/api/v1/knowledge/sources/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Policy Doc");
  });

  it("GET /api/v1/knowledge/sources/999 → 404", async () => {
    const res = await supertest(app).get("/api/v1/knowledge/sources/999");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("DELETE /api/v1/knowledge/sources/:id → 204", async () => {
    const created = await supertest(app)
      .post("/api/v1/knowledge/sources")
      .send({ title: "Temp Doc", content: "Temporary content." });
    expect(created.status).toBe(201);

    const del = await supertest(app).delete(`/api/v1/knowledge/sources/${created.body.id}`);
    expect(del.status).toBe(204);

    // Confirm deleted
    const get = await supertest(app).get(`/api/v1/knowledge/sources/${created.body.id}`);
    expect(get.status).toBe(404);
  });
});

// ── Knowledge — Concepts ──────────────────────────────────────────────────────

describe("Knowledge Concepts", () => {
  it("GET /api/v1/knowledge/concepts returns empty array initially", async () => {
    const res = await supertest(app).get("/api/v1/knowledge/concepts");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("POST /api/v1/knowledge/concepts → 201 with name/stdName/aliases", async () => {
    const res = await supertest(app)
      .post("/api/v1/knowledge/concepts")
      .send({
        name: "Lot ID",
        std_name: "lot_id",
        definition: "Unique identifier for a manufacturing lot.",
        aliases: ["lot_no", "lot_number"],
        domain: "semiconductor",
      });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: expect.any(Number),
      name: "Lot ID",
      stdName: "lot_id",
    });
    expect(res.body.aliases).toContain("lot_no");
    expect(res.body.status).toBe("pending");
  });

  it("GET /api/v1/knowledge/concepts → 200 with array", async () => {
    await supertest(app)
      .post("/api/v1/knowledge/concepts")
      .send({ name: "Wafer ID", std_name: "wafer_id", definition: "Wafer identifier." });

    const res = await supertest(app).get("/api/v1/knowledge/concepts");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it("GET /api/v1/knowledge/concepts?status=pending → filtered results", async () => {
    await supertest(app)
      .post("/api/v1/knowledge/concepts")
      .send({ name: "Equip ID", std_name: "equip_id", definition: "Equipment identifier." });

    const res = await supertest(app).get("/api/v1/knowledge/concepts?status=pending");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.every((c: { status: string }) => c.status === "pending")).toBe(true);
  });

  it("PATCH /api/v1/knowledge/concepts/:id → 200", async () => {
    const created = await supertest(app)
      .post("/api/v1/knowledge/concepts")
      .send({ name: "Order ID", std_name: "order_id", definition: "Order identifier." });
    expect(created.status).toBe(201);

    const res = await supertest(app)
      .patch(`/api/v1/knowledge/concepts/${created.body.id}`)
      .send({ definition: "Updated definition for Order ID." });
    expect(res.status).toBe(200);
    expect(res.body.definition).toBe("Updated definition for Order ID.");
  });

  it("POST /api/v1/knowledge/concepts/:id/approve → 403 without admin role", async () => {
    const created = await supertest(app)
      .post("/api/v1/knowledge/concepts")
      .send({ name: "Zone ID", std_name: "zone_id", definition: "Zone identifier." });
    expect(created.status).toBe(201);

    const res = await supertest(app)
      .post(`/api/v1/knowledge/concepts/${created.body.id}/approve`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("POST /api/v1/knowledge/concepts/:id/reject → 403 without admin role", async () => {
    const created = await supertest(app)
      .post("/api/v1/knowledge/concepts")
      .send({ name: "Slot ID", std_name: "slot_id", definition: "Slot identifier." });
    expect(created.status).toBe(201);

    const res = await supertest(app)
      .post(`/api/v1/knowledge/concepts/${created.body.id}/reject`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });
});

// ── Knowledge — Business Rules ────────────────────────────────────────────────

describe("Knowledge Business Rules", () => {
  it("GET /api/v1/knowledge/business-rules → 200 empty array initially", async () => {
    const res = await supertest(app).get("/api/v1/knowledge/business-rules");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("POST /api/v1/knowledge/business-rules → 201", async () => {
    const res = await supertest(app)
      .post("/api/v1/knowledge/business-rules")
      .send({
        title: "SSOT for Lot ID",
        rule_type: "ssot",
        statement: "lot_id must always come from the wafer tracking table.",
      });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: expect.any(Number),
      title: "SSOT for Lot ID",
      ruleType: "ssot",
      status: "pending",
    });
  });

  it("GET /api/v1/knowledge/business-rules → 200 with created rule", async () => {
    await supertest(app)
      .post("/api/v1/knowledge/business-rules")
      .send({ title: "Constraint rule", rule_type: "constraint", statement: "field must be non-null." });

    const res = await supertest(app).get("/api/v1/knowledge/business-rules");
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it("PATCH /api/v1/knowledge/business-rules/:id → 200", async () => {
    const created = await supertest(app)
      .post("/api/v1/knowledge/business-rules")
      .send({ title: "Relationship rule", rule_type: "relationship", statement: "Original statement." });
    expect(created.status).toBe(201);

    const res = await supertest(app)
      .patch(`/api/v1/knowledge/business-rules/${created.body.id}`)
      .send({ statement: "Updated statement." });
    expect(res.status).toBe(200);
    expect(res.body.statement).toBe("Updated statement.");
  });
});

// ── Knowledge — Retrieve ──────────────────────────────────────────────────────

describe("Knowledge Retrieve", () => {
  it("POST /api/v1/knowledge/retrieve → 200 with concepts and businessRules arrays", async () => {
    const res = await supertest(app)
      .post("/api/v1/knowledge/retrieve")
      .send({ query: "lot wafer" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      query: "lot wafer",
      concepts: expect.any(Array),
      businessRules: expect.any(Array),
    });
  });

  it("POST /api/v1/knowledge/retrieve without query → 400", async () => {
    const res = await supertest(app)
      .post("/api/v1/knowledge/retrieve")
      .send({});
    expect(res.status).toBe(400);
  });
});

// ── Import Batches ────────────────────────────────────────────────────────────

describe("Import Batches", () => {
  it("GET /api/v1/import-batches → 200 empty array initially", async () => {
    const res = await supertest(app).get("/api/v1/import-batches");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("POST /api/v1/import-batches → 201 with DDL text", async () => {
    const res = await supertest(app)
      .post("/api/v1/import-batches")
      .send({
        name: "test-batch",
        ddl_texts: ["CREATE TABLE t1 (id INT PRIMARY KEY, name VARCHAR(100) NOT NULL);"],
      });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: expect.any(Number),
      name: "test-batch",
      status: "imported",
    });
    expect(typeof res.body.tableCount).toBe("number");
  });

  it("POST /api/v1/import-batches without ddl_texts → 201 (empty batch)", async () => {
    const res = await supertest(app)
      .post("/api/v1/import-batches")
      .send({ name: "empty-batch" });
    expect(res.status).toBe(201);
    expect(res.body.tableCount).toBe(0);
  });

  it("GET /api/v1/import-batches → 200 with created batches", async () => {
    await supertest(app)
      .post("/api/v1/import-batches")
      .send({ name: "list-test-batch" });

    const res = await supertest(app).get("/api/v1/import-batches");
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it("GET /api/v1/import-batches/:id → 200", async () => {
    const created = await supertest(app)
      .post("/api/v1/import-batches")
      .send({ name: "get-by-id-batch" });
    expect(created.status).toBe(201);

    const res = await supertest(app).get(`/api/v1/import-batches/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
    expect(res.body.name).toBe("get-by-id-batch");
  });

  it("GET /api/v1/import-batches/999 → 404", async () => {
    const res = await supertest(app).get("/api/v1/import-batches/999");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

// ── Wide Table Proposals ──────────────────────────────────────────────────────

describe("Wide Table Proposals", () => {
  it("GET /api/v1/wide-table-proposals → 200 empty array initially", async () => {
    const res = await supertest(app).get("/api/v1/wide-table-proposals");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /api/v1/wide-table-proposals/999 → 404", async () => {
    const res = await supertest(app).get("/api/v1/wide-table-proposals/999");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

// ── Workspace Drafts ──────────────────────────────────────────────────────────

describe("Workspace Drafts", () => {
  it("GET /api/v1/workspace/drafts → 200 empty array initially", async () => {
    const res = await supertest(app).get("/api/v1/workspace/drafts");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /api/v1/workspace/drafts/999 → 404", async () => {
    const res = await supertest(app).get("/api/v1/workspace/drafts/999");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

// ── Catalog ───────────────────────────────────────────────────────────────────

describe("Catalog", () => {
  it("GET /api/v1/catalog/wide-tables → 200 (may be empty)", async () => {
    const res = await supertest(app).get("/api/v1/catalog/wide-tables");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /api/v1/catalog/graph → 200 with nodes and edges arrays", async () => {
    const res = await supertest(app).get("/api/v1/catalog/graph");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      nodes: expect.any(Array),
      edges: expect.any(Array),
    });
  });

  it("POST /api/v1/catalog/retrieve → 200", async () => {
    const res = await supertest(app)
      .post("/api/v1/catalog/retrieve")
      .send({ query: "lot wafer semiconductor" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      query: "lot wafer semiconductor",
      hits: expect.any(Array),
    });
  });

  it("POST /api/v1/catalog/retrieve without query → 400", async () => {
    const res = await supertest(app)
      .post("/api/v1/catalog/retrieve")
      .send({});
    expect(res.status).toBe(400);
  });
});

// ── Instances ─────────────────────────────────────────────────────────────────

describe("Instances", () => {
  it("GET /api/v1/instances → 200 empty array initially", async () => {
    const res = await supertest(app).get("/api/v1/instances");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("POST /api/v1/instances → 201 with subject_name and owner_name", async () => {
    const res = await supertest(app)
      .post("/api/v1/instances")
      .send({ subject_name: "Test Subject", owner_name: "admin" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: expect.any(Number),
      subjectName: "Test Subject",
      status: "active",
    });
    expect(Array.isArray(res.body.stations)).toBe(true);
    expect(res.body.stations).toHaveLength(5); // knowledge, classify, compose, review, validate
  });

  it("GET /api/v1/instances → 200 with created instance", async () => {
    await supertest(app)
      .post("/api/v1/instances")
      .send({ subject_name: "Listed Instance", owner_name: "admin" });

    const res = await supertest(app).get("/api/v1/instances");
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it("GET /api/v1/instances/:id → 200", async () => {
    const created = await supertest(app)
      .post("/api/v1/instances")
      .send({ subject_name: "Get By Id Instance", owner_name: "admin" });
    expect(created.status).toBe(201);

    const res = await supertest(app).get(`/api/v1/instances/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
    expect(res.body.subjectName).toBe("Get By Id Instance");
  });

  it("GET /api/v1/instances/999 → 404", async () => {
    const res = await supertest(app).get("/api/v1/instances/999");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("POST /api/v1/instances/:id/stations/knowledge/start → 200", async () => {
    const created = await supertest(app)
      .post("/api/v1/instances")
      .send({ subject_name: "Station Test Instance", owner_name: "admin" });
    expect(created.status).toBe(201);

    const res = await supertest(app)
      .post(`/api/v1/instances/${created.body.id}/stations/knowledge/start`);
    expect(res.status).toBe(200);
    const knowledgeStation = res.body.stations.find(
      (s: { station: string }) => s.station === "knowledge",
    );
    expect(knowledgeStation?.status).toBe("in-progress");
  });

  it("POST /api/v1/instances/:id/artifacts/attach → 200", async () => {
    const created = await supertest(app)
      .post("/api/v1/instances")
      .send({ subject_name: "Artifact Attach Instance", owner_name: "admin" });
    expect(created.status).toBe(201);

    const res = await supertest(app)
      .post(`/api/v1/instances/${created.body.id}/artifacts/attach`)
      .send({ kind: "concept", artifact_id: 1 });
    expect(res.status).toBe(200);
    expect(res.body.artifacts.conceptIds).toContain(1);
  });

  it("POST /api/v1/instances/:id/artifacts/detach → 200", async () => {
    const created = await supertest(app)
      .post("/api/v1/instances")
      .send({ subject_name: "Artifact Detach Instance", owner_name: "admin" });
    expect(created.status).toBe(201);

    // First attach
    await supertest(app)
      .post(`/api/v1/instances/${created.body.id}/artifacts/attach`)
      .send({ kind: "concept", artifact_id: 1 });

    // Then detach
    const res = await supertest(app)
      .post(`/api/v1/instances/${created.body.id}/artifacts/detach`)
      .send({ kind: "concept", artifact_id: 1 });
    expect(res.status).toBe(200);
    expect(res.body.artifacts.conceptIds).not.toContain(1);
  });

  it("GET /api/v1/instances/settings/gate-policy → 200", async () => {
    const res = await supertest(app).get("/api/v1/instances/settings/gate-policy");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      stations: expect.any(Object),
      bypassRoles: expect.any(Array),
      manualCompleteRoles: expect.any(Array),
    });
  });
});

// ── Governance Reports ────────────────────────────────────────────────────────

describe("Governance Reports", () => {
  it("GET /api/v1/governance/reports → 200 empty array initially", async () => {
    const res = await supertest(app).get("/api/v1/governance/reports");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /api/v1/governance/reports/999 → 404", async () => {
    const res = await supertest(app).get("/api/v1/governance/reports/999");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
