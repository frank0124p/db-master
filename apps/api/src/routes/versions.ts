import { Router, type Router as ExpressRouter } from "express";
import { z } from "zod";
import * as repo from "../repositories/versions.js";

const router: ExpressRouter = Router({ mergeParams: true });

router.get("/", async (req, res, next) => {
  try {
    const id = Number((req.params as Record<string, string>)["schemaId"]);
    res.json(await repo.listVersions(id));
  } catch (e) { next(e); }
});

router.get("/:vno", async (req, res, next) => {
  try {
    const schemaId = Number((req.params as Record<string, string>)["schemaId"]);
    const vno = Number((req.params as Record<string, string>)["vno"]);
    const version = await repo.getVersionByNo(schemaId, vno);
    if (!version) { res.status(404).json({ error: { code: "NOT_FOUND", message: `Version ${vno} not found` } }); return; }
    res.json(version);
  } catch (e) { next(e); }
});

router.post("/", async (req, res, next) => {
  try {
    const id = Number((req.params as Record<string, string>)["schemaId"]);
    const { message } = z.object({ message: z.string().optional() }).parse(req.body);
    res.status(201).json(await repo.saveVersion(id, message));
  } catch (e) { next(e); }
});

export default router;
