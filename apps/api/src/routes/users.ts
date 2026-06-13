import { Router } from "express";
import * as repo from "../repositories/users.js";
import * as govRepo from "../repositories/governance.js";
import * as schemasRepo from "../repositories/schemas.js";
import { ROLES } from "@schema-studio/core";

const router = Router();

router.get("/", async (_req, res, next) => {
  try { res.json(await repo.listUsers()); } catch (e) { next(e); }
});

router.get("/roles", (_req, res) => {
  res.json(ROLES);
});

router.post("/", async (req, res, next) => {
  try {
    const input = repo.CreateUserInput.parse(req.body);
    res.status(201).json(await repo.createUser(input));
  } catch (e) { next(e); }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const id = (req.params as Record<string, string>)["id"]!;
    const patch = repo.CreateUserInput.partial().parse(req.body);
    const updated = await repo.updateUser(id, patch);
    if (!updated) return res.status(404).json({ error: { code: "NOT_FOUND", message: "User not found" } });
    res.json(updated);
  } catch (e) { next(e); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = (req.params as Record<string, string>)["id"]!;
    const deleted = await repo.deleteUser(id);
    if (!deleted) return res.status(404).json({ error: { code: "NOT_FOUND", message: "User not found" } });
    res.status(204).end();
  } catch (e) { next(e); }
});

// ── GET /api/v1/users/:id/assets ─────────────────────────────────────────────
// List assets owned or stewarded by a user (governed wide tables + tables)

router.get("/:id/assets", async (req, res, next) => {
  try {
    const userId = (req.params as Record<string, string>)["id"]!;
    const numericId = Number(userId);

    // Collect governed wide tables where user is owner or steward
    const governed = await govRepo.listGoverned();
    const governedAssets = governed
      .filter(g => g.ownerUserId === numericId || g.stewardUserId === numericId)
      .map(g => ({
        kind: "governed-wide-table" as const,
        ref: `gwt:${g.slug}`,
        slug: g.slug,
        name: g.name,
        role: g.ownerUserId === numericId ? ("owner" as const) : ("steward" as const),
      }));

    // Collect tables where user is owner or steward
    const schemaMetas = await schemasRepo.listSchemas();
    const tableAssets: Array<{ kind: "table"; ref: string; tableId: number; name: string; role: "owner" | "steward" }> = [];
    for (const meta of schemaMetas) {
      try {
        const schema = await schemasRepo.getSchemaById(meta.id);
        for (const t of schema.tables) {
          const tf = t as import("../repositories/schemas.js").TableFile;
          if (tf.ownerUserId === numericId || tf.stewardUserId === numericId) {
            tableAssets.push({
              kind: "table",
              ref: `tbl:${t.name}`,
              tableId: t.id,
              name: t.name,
              role: tf.ownerUserId === numericId ? "owner" : "steward",
            });
          }
        }
      } catch {
        // Skip schemas that fail to load
      }
    }

    return res.json({ userId, assets: [...governedAssets, ...tableAssets] });
  } catch (e) { next(e); }
});

export default router;
