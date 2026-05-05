import fs from "fs/promises";
import { Router, type Request, type Response } from "express";
import type { Router as RouterType } from "express";
import { z } from "zod";
import { getAllSkills, getUserSkillFilePath, loadSkills } from "../services/skills.js";
import { uploadRaw } from "../services/minio.js";
import { DATA_DIR } from "../db/fileStore.js";
import path from "path";

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
    ...(s.source === "user" && { filePath: s.filePath }),
  }));
  res.json({ skills });
});

const PutBody = z.object({ content: z.string() });

// PUT /api/v1/skills/:name — update a user skill's content and reload
router.put("/:name", async (req: Request, res: Response) => {
  const name = decodeURIComponent((req.params as Record<string, string>)["name"] ?? "");
  const parsed = PutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", detail: parsed.error.format() } });
    return;
  }

  const filePath = getUserSkillFilePath(name);
  if (!filePath) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: `User skill "${name}" not found or is built-in` } });
    return;
  }

  await fs.writeFile(filePath, parsed.data.content, "utf-8");
  void uploadRaw(path.relative(DATA_DIR, filePath), parsed.data.content, "text/markdown"); // async MinIO backup
  await loadSkills();
  res.json({ ok: true });
});

export default router;
