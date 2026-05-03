import { Router, type Request, type Response } from "express";
import type { Router as RouterType } from "express";
import { z } from "zod";
import { getDataHubSettings, updateDataHubSettings } from "../repositories/settings.js";
import { testConnection, pushSchema, getPushLog, type PushOpts } from "../services/datahub.js";

const router: RouterType = Router();

// GET /api/v1/datahub/settings
router.get("/settings", async (_req: Request, res: Response, next) => {
  try {
    const s = await getDataHubSettings();
    // Mask token: show only last 4 chars
    const masked = s.token
      ? `${"*".repeat(Math.max(0, s.token.length - 4))}${s.token.slice(-4)}`
      : "";
    res.json({ settings: { ...s, token: masked } });
  } catch (e) { next(e); }
});

// PATCH /api/v1/datahub/settings
router.patch("/settings", async (req: Request, res: Response, next) => {
  try {
    const patch = z.object({
      url: z.string().optional(),
      token: z.string().optional(),
      platform: z.string().optional(),
      env: z.enum(["PROD", "DEV", "STAGING", "TEST"]).optional(),
    }).parse(req.body);
    const updated = await updateDataHubSettings(patch);
    const masked = updated.token
      ? `${"*".repeat(Math.max(0, updated.token.length - 4))}${updated.token.slice(-4)}`
      : "";
    res.json({ settings: { ...updated, token: masked } });
  } catch (e) { next(e); }
});

// POST /api/v1/datahub/test
router.post("/test", async (_req: Request, res: Response, next) => {
  try {
    const settings = await getDataHubSettings();
    const result = await testConnection(settings);
    res.json(result);
  } catch (e) { next(e); }
});

// POST /api/v1/datahub/push/:schemaId
router.post("/push/:schemaId", async (req: Request, res: Response, next) => {
  try {
    const schemaId = Number(req.params["schemaId"]);
    if (isNaN(schemaId)) { res.status(400).json({ error: { message: "Invalid schemaId" } }); return; }
    const opts = z.object({
      tableIds: z.array(z.number()).optional(),
      wideTableIds: z.array(z.number()).optional(),
    }).parse(req.body ?? {}) as PushOpts;
    const settings = await getDataHubSettings();
    const record = await pushSchema(schemaId, settings, opts);
    res.json(record);
  } catch (e) { next(e); }
});

// GET /api/v1/datahub/push-log
router.get("/push-log", async (_req: Request, res: Response, next) => {
  try {
    res.json(await getPushLog());
  } catch (e) { next(e); }
});

export default router;
