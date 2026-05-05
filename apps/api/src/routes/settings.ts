import { Router, type Request, type Response } from "express";
import type { Router as RouterType } from "express";
import { z } from "zod";
import { getLlmSettings, updateLlmSettings, getMinioSettings, updateMinioSettings } from "../repositories/settings.js";
import { resetLlmConfig } from "../services/llm.js";
import { initMinio, testConnection, pushAll, restoreAll, isMinioReady } from "../services/minio.js";

const router: RouterType = Router();

// ── LLM ──────────────────────────────────────────────────────────────────────

router.get("/llm", async (_req: Request, res: Response, next) => {
  try {
    const settings = await getLlmSettings();
    const masked = settings.apiKey
      ? `${"*".repeat(Math.max(0, settings.apiKey.length - 4))}${settings.apiKey.slice(-4)}`
      : "";
    res.json({ settings: { ...settings, apiKey: masked } });
  } catch (e) { next(e); }
});

router.patch("/llm", async (req: Request, res: Response, next) => {
  try {
    const { provider, apiKey, baseUrl, model } = req.body as Partial<{
      provider: "anthropic" | "openai";
      apiKey: string; baseUrl: string; model: string;
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

router.post("/llm/test", async (_req: Request, res: Response, next) => {
  try {
    const { testLlmConnection } = await import("../services/llm.js");
    const result = await testLlmConnection();
    res.json(result);
  } catch (e) { next(e); }
});

// ── MinIO ─────────────────────────────────────────────────────────────────────

const MinioBody = z.object({
  endpoint:   z.string().optional(),
  port:       z.number().int().min(1).max(65535).optional(),
  useSSL:     z.boolean().optional(),
  accessKey:  z.string().optional(),
  secretKey:  z.string().optional(),
  bucket:     z.string().optional(),
  pathPrefix: z.string().optional(),
});

router.get("/storage", async (_req: Request, res: Response, next) => {
  try {
    const minio = await getMinioSettings();
    const masked = minio.secretKey
      ? `${"*".repeat(Math.max(0, minio.secretKey.length - 4))}${minio.secretKey.slice(-4)}`
      : "";
    res.json({ minio: { ...minio, secretKey: masked }, ready: isMinioReady() });
  } catch (e) { next(e); }
});

router.patch("/storage", async (req: Request, res: Response, next) => {
  try {
    const parsed = MinioBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", detail: parsed.error.format() } });
      return;
    }
    const updated = await updateMinioSettings(parsed.data);
    initMinio(updated); // re-init client with new config
    const masked = updated.secretKey
      ? `${"*".repeat(Math.max(0, updated.secretKey.length - 4))}${updated.secretKey.slice(-4)}`
      : "";
    res.json({ minio: { ...updated, secretKey: masked }, ready: isMinioReady() });
  } catch (e) { next(e); }
});

router.post("/storage/test", async (_req: Request, res: Response, next) => {
  try {
    const result = await testConnection();
    res.json(result);
  } catch (e) { next(e); }
});

router.post("/storage/push", async (_req: Request, res: Response, next) => {
  try {
    const result = await pushAll();
    res.json(result);
  } catch (e) { next(e); }
});

router.post("/storage/restore", async (_req: Request, res: Response, next) => {
  try {
    const result = await restoreAll();
    res.json(result);
  } catch (e) { next(e); }
});

export default router;
