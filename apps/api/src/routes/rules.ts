import { Router, type Request, type Response } from "express";
import { type Router as RouterType } from "express";
import { z } from "zod";
import { listRules, updateRule, getAllRules } from "../repositories/rules.js";

const router: RouterType = Router();

// GET /api/v1/rules — list all rules (built-in + skill) with current settings
router.get("/", async (_req: Request, res: Response) => {
  const rules = await listRules();
  res.json({
    rules: rules.map(r => ({
      id: r.ruleId,
      group: r.group,
      description: r.description,
      defaultSeverity: getAllRules().find(x => x.id === r.ruleId)?.defaultSeverity ?? r.severity,
      defaultConfig: getAllRules().find(x => x.id === r.ruleId)?.defaultConfig ?? {},
      severity: r.severity,
      enabled: r.enabled,
      config: r.config,
      source: r.source,
    })),
  });
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

  const allRules = getAllRules();
  if (!allRules.find(r => r.id === ruleId)) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: `Rule ${ruleId} not found` } });
    return;
  }

  const updated = await updateRule(ruleId, parsed.data);
  res.json({ rule: updated });
});

export default router;
