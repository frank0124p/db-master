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
  tempDir = path.join(os.tmpdir(), `db-master-users-${crypto.randomUUID()}`);
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
  return import("../repositories/users.js");
}

// ── listUsers ─────────────────────────────────────────────────────────────────

describe("listUsers", () => {
  it("returns empty array when no users exist", async () => {
    const repo = await importRepo();
    const users = await repo.listUsers();
    expect(users).toHaveLength(0);
  });

  it("returns all created users", async () => {
    const repo = await importRepo();
    await repo.createUser({ name: "Alice", email: "alice@example.com", role: "admin", suiteIds: [] });
    await repo.createUser({ name: "Bob", email: "bob@example.com", role: "viewer", suiteIds: [] });
    const users = await repo.listUsers();
    expect(users).toHaveLength(2);
  });

  it("returns users with all expected fields", async () => {
    const repo = await importRepo();
    await repo.createUser({ name: "Alice", email: "alice@example.com", role: "admin", suiteIds: [] });
    const users = await repo.listUsers();
    const u = users[0]!;
    expect(typeof u.id).toBe("string");
    expect(u.name).toBe("Alice");
    expect(u.email).toBe("alice@example.com");
    expect(u.role).toBe("admin");
    expect(typeof u.createdAt).toBe("string");
  });
});

// ── getUserById ───────────────────────────────────────────────────────────────

describe("getUserById", () => {
  it("returns user by id", async () => {
    const repo = await importRepo();
    const created = await repo.createUser({ name: "Alice", email: "alice@example.com", role: "admin", suiteIds: [] });
    const found = await repo.getUserById(created.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
    expect(found!.name).toBe("Alice");
  });

  it("returns null for a nonexistent id", async () => {
    const repo = await importRepo();
    const result = await repo.getUserById("nonexistent-id-xyz");
    expect(result).toBeNull();
  });

  it("returns correct user when multiple users exist", async () => {
    const repo = await importRepo();
    const u1 = await repo.createUser({ name: "Alice", email: "alice@example.com", role: "admin", suiteIds: [] });
    const u2 = await repo.createUser({ name: "Bob", email: "bob@example.com", role: "viewer", suiteIds: [] });
    const found = await repo.getUserById(u2.id);
    expect(found!.name).toBe("Bob");
    expect(found!.id).toBe(u2.id);
    expect(found!.id).not.toBe(u1.id);
  });
});

// ── createUser ────────────────────────────────────────────────────────────────

describe("createUser", () => {
  it("creates user with correct name", async () => {
    const repo = await importRepo();
    const user = await repo.createUser({ name: "Charlie", email: "charlie@example.com", role: "maintainer", suiteIds: [] });
    expect(user.name).toBe("Charlie");
  });

  it("creates user with correct email", async () => {
    const repo = await importRepo();
    const user = await repo.createUser({ name: "Charlie", email: "charlie@example.com", role: "maintainer", suiteIds: [] });
    expect(user.email).toBe("charlie@example.com");
  });

  it("creates user with correct role", async () => {
    const repo = await importRepo();
    const user = await repo.createUser({ name: "Dana", email: "dana@example.com", role: "suite_owner", suiteIds: [] });
    expect(user.role).toBe("suite_owner");
  });

  it("creates user with correct suiteIds", async () => {
    const repo = await importRepo();
    const user = await repo.createUser({ name: "Eve", email: "eve@example.com", role: "viewer", suiteIds: [1, 2, 3] });
    expect(user.suiteIds).toEqual([1, 2, 3]);
  });

  it("generates a string ID", async () => {
    const repo = await importRepo();
    const user = await repo.createUser({ name: "User1", email: "u1@example.com", role: "viewer", suiteIds: [] });
    expect(typeof user.id).toBe("string");
    expect(user.id.length).toBeGreaterThan(0);
  });

  it("sets a createdAt timestamp", async () => {
    const repo = await importRepo();
    const user = await repo.createUser({ name: "Frank", email: "frank@example.com", role: "admin", suiteIds: [] });
    expect(typeof user.createdAt).toBe("string");
    // Must be a valid ISO date
    expect(new Date(user.createdAt).toString()).not.toBe("Invalid Date");
  });

  it("persists user so it appears in listUsers", async () => {
    const repo = await importRepo();
    const created = await repo.createUser({ name: "Grace", email: "grace@example.com", role: "viewer", suiteIds: [] });
    const list = await repo.listUsers();
    expect(list.some((u) => u.id === created.id)).toBe(true);
  });
});

// ── updateUser ────────────────────────────────────────────────────────────────

describe("updateUser", () => {
  it("updates the user name", async () => {
    const repo = await importRepo();
    const created = await repo.createUser({ name: "Old Name", email: "old@example.com", role: "viewer", suiteIds: [] });
    const updated = await repo.updateUser(created.id, { name: "New Name" });
    expect(updated!.name).toBe("New Name");
  });

  it("updates the user email", async () => {
    const repo = await importRepo();
    const created = await repo.createUser({ name: "Alice", email: "old@example.com", role: "viewer", suiteIds: [] });
    const updated = await repo.updateUser(created.id, { email: "new@example.com" });
    expect(updated!.email).toBe("new@example.com");
  });

  it("updates the user role", async () => {
    const repo = await importRepo();
    const created = await repo.createUser({ name: "Alice", email: "alice@example.com", role: "viewer", suiteIds: [] });
    const updated = await repo.updateUser(created.id, { role: "maintainer" });
    expect(updated!.role).toBe("maintainer");
  });

  it("updates suiteIds", async () => {
    const repo = await importRepo();
    const created = await repo.createUser({ name: "Alice", email: "alice@example.com", role: "suite_owner", suiteIds: [1] });
    const updated = await repo.updateUser(created.id, { suiteIds: [1, 2, 3] });
    expect(updated!.suiteIds).toEqual([1, 2, 3]);
  });

  it("preserves unchanged fields when doing a partial update", async () => {
    const repo = await importRepo();
    const created = await repo.createUser({ name: "Alice", email: "alice@example.com", role: "admin", suiteIds: [5] });
    const updated = await repo.updateUser(created.id, { name: "Alice Updated" });
    expect(updated!.email).toBe("alice@example.com");
    expect(updated!.role).toBe("admin");
    expect(updated!.suiteIds).toEqual([5]);
  });

  it("returns null for a nonexistent user id", async () => {
    const repo = await importRepo();
    const result = await repo.updateUser("nonexistent-xyz", { name: "Ghost" });
    expect(result).toBeNull();
  });

  it("persists changes so getUserById returns updated data", async () => {
    const repo = await importRepo();
    const created = await repo.createUser({ name: "Before", email: "b@example.com", role: "viewer", suiteIds: [] });
    await repo.updateUser(created.id, { name: "After" });
    const found = await repo.getUserById(created.id);
    expect(found!.name).toBe("After");
  });
});

// ── deleteUser ────────────────────────────────────────────────────────────────

describe("deleteUser", () => {
  it("deletes an existing user", async () => {
    const repo = await importRepo();
    const created = await repo.createUser({ name: "ToDelete", email: "del@example.com", role: "viewer", suiteIds: [] });
    const result = await repo.deleteUser(created.id);
    expect(result).toBe(true);
  });

  it("user is gone after deletion", async () => {
    const repo = await importRepo();
    const created = await repo.createUser({ name: "ToDelete", email: "del@example.com", role: "viewer", suiteIds: [] });
    await repo.deleteUser(created.id);
    const found = await repo.getUserById(created.id);
    expect(found).toBeNull();
  });

  it("user does not appear in listUsers after deletion", async () => {
    const repo = await importRepo();
    const u1 = await repo.createUser({ name: "Keep", email: "keep@example.com", role: "admin", suiteIds: [] });
    const u2 = await repo.createUser({ name: "Delete", email: "del@example.com", role: "viewer", suiteIds: [] });
    await repo.deleteUser(u2.id);
    const list = await repo.listUsers();
    expect(list.some((u) => u.id === u2.id)).toBe(false);
    expect(list.some((u) => u.id === u1.id)).toBe(true);
  });

  it("returns false when trying to delete a nonexistent user", async () => {
    const repo = await importRepo();
    const result = await repo.deleteUser("no-such-user");
    expect(result).toBe(false);
  });
});
