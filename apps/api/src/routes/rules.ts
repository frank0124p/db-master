import { Router, type Request, type Response } from "express";
import { type Router as RouterType } from "express";
import { z } from "zod";
import { BUILT_IN_RULES } from "@schema-studio/core";
import { listRules, updateRule } from "../repositories/rules.js";

const router: RouterType = Router();

// GET /api/v1/rules — list all rules with their current settings
router.get("/", async (_req: Request, res: Response) => {
  const settings = await listRules();
  const settingsMap = new Map(settings.map(s => [s.ruleId, s]));

  const rules = BUILT_IN_RULES.map(r => {
    const s = settingsMap.get(r.id);
    return {
      id: r.id,
      group: r.group,
      description: r.description,
      defaultSeverity: r.defaultSeverity,
      defaultConfig: r.defaultConfig,
      severity: s?.severity ?? r.defaultSeverity,
      enabled: s?.enabled ?? true,
      config: s?.config ?? r.defaultConfig,
    };
  });

  res.json({ rules });
});

const PatchBody = z.object({
  severity: z.enum(["error", "warning", "info"]).optional(),
  enabled: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
});

// PATCH /api/v1/rules/:ruleId
router.patch("/:ruleId", async (req: Request, res: Response) => {
  const ruleId = (req.params as Record<string, string>)["ruleId"]!;
  const parsed = PatchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", detail: parsed.error.format() } });
    return;
  }

  const rule = BUILT_IN_RULES.find(r => r.id === ruleId);
  if (!rule) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: `Rule ${ruleId} not found` } });
    return;
  }

  const updated = await updateRule(ruleId, parsed.data);
  res.json({ rule: updated });
});

export default router;
