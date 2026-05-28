import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import * as repo from "../repositories/suites.js";

const router = Router();

const CreateSuiteBody = z.object({
  name: z.string().min(1).max(128),
  description: z.string().optional(),
  color: z.string().optional(),
});

const UpdateSuiteBody = z.object({
  name: z.string().min(1).max(128).optional(),
  description: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
});

router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await repo.listSuites());
  } catch (e) { next(e); }
});

router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = CreateSuiteBody.parse(req.body);
    res.status(201).json(await repo.createSuite(input));
  } catch (e) { next(e); }
});

router.patch("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number((req.params as Record<string, string>)["id"]);
    const input = UpdateSuiteBody.parse(req.body);
    const result = await repo.updateSuite(id, input);
    if (!result) { res.status(404).json({ error: { code: "NOT_FOUND", message: `Suite ${id} not found` } }); return; }
    res.json(result);
  } catch (e) { next(e); }
});

router.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number((req.params as Record<string, string>)["id"]);
    const deleted = await repo.deleteSuite(id);
    if (!deleted) { res.status(404).json({ error: { code: "NOT_FOUND", message: `Suite ${id} not found` } }); return; }
    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;
