import { Router, type Request, type Response } from "express";
import type { Router as RouterType } from "express";
import { getAllSkills } from "../services/skills.js";

const router: RouterType = Router();

// GET /api/v1/skills
router.get("/", (_req: Request, res: Response) => {
  const skills = getAllSkills().map(s => ({
    name: s.meta.name,
    domain: s.meta.domain,
    tags: s.meta.tags,
    source: s.source,
    ruleCount: s.rules.length,
    rules: s.rules.map(r => ({
      id: r.id,
      group: r.group,
      severity: r.severity,
      description: r.description,
    })),
    content: s.content,
  }));
  res.json({ skills });
});

export default router;
