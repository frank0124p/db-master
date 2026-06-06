import { Router } from "express";
import * as repo from "../repositories/users.js";
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

export default router;
