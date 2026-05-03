import { Router, type Request, type Response } from "express";
import type { Router as RouterType } from "express";
import { getLlmSettings, updateLlmSettings } from "../repositories/settings.js";
import { resetLlmConfig } from "../services/llm.js";

const router: RouterType = Router();

// GET /api/v1/settings/llm
router.get("/llm", async (_req: Request, res: Response, next) => {
  try {
    const settings = await getLlmSettings();
    // Mask key: return only last 4 chars
    const masked = settings.apiKey
      ? `${"*".repeat(Math.max(0, settings.apiKey.length - 4))}${settings.apiKey.slice(-4)}`
      : "";
    res.json({ settings: { ...settings, apiKey: masked } });
  } catch (e) { next(e); }
});

// PATCH /api/v1/settings/llm
router.patch("/llm", async (req: Request, res: Response, next) => {
  try {
    const { provider, apiKey, baseUrl, model } = req.body as Partial<{
      provider: "anthropic" | "openai";
      apiKey: string;
      baseUrl: string;
      model: string;
    }>;
    const patch: Parameters<typeof updateLlmSettings>[0] = {};
    if (provider !== undefined) patch.provider = provider;
    if (apiKey !== undefined) patch.apiKey = apiKey;
    if (baseUrl !== undefined) patch.baseUrl = baseUrl;
    if (model !== undefined) patch.model = model;
    const updated = await updateLlmSettings(patch);
    resetLlmConfig();
    const masked = updated.apiKey
      ? `${"*".repeat(Math.max(0, updated.apiKey.length - 4))}${updated.apiKey.slice(-4)}`
      : "";
    res.json({ settings: { ...updated, apiKey: masked } });
  } catch (e) { next(e); }
});

// POST /api/v1/settings/llm/test
router.post("/llm/test", async (_req: Request, res: Response, next) => {
  try {
    const { testLlmConnection } = await import("../services/llm.js");
    const result = await testLlmConnection();
    res.json(result);
  } catch (e) { next(e); }
});

export default router;
