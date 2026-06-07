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

const CreateSkillBody = z.object({
  name: z.string().min(1).max(80),
  domain: z.string().max(40).default("general"),
  tags: z.array(z.string().max(30)).max(20).default([]),
  description: z.string().max(500).default(""),
});

// POST /api/v1/skills — create a new user skill file
router.post("/", async (req: Request, res: Response) => {
  const parsed = CreateSkillBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", detail: parsed.error.format() } });
    return;
  }
  const { name, domain, tags, description } = parsed.data;

  // Slugify name to create a safe filename
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!slug) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid skill name" } });
    return;
  }

  const userSkillsDir = path.join(DATA_DIR, "skills");
  await fs.mkdir(userSkillsDir, { recursive: true });
  const filePath = path.join(userSkillsDir, `${slug}.md`);

  // Check not already exists
  try { await fs.access(filePath); res.status(409).json({ error: { code: "CONFLICT", message: `Skill file ${slug}.md already exists` } }); return; } catch { /* ok */ }

  const tagsYaml = tags.length > 0 ? `[${tags.join(", ")}]` : "[]";
  const content = [
    `---`,
    `name: ${name}`,
    `domain: ${domain}`,
    `tags: ${tagsYaml}`,
    `---`,
    ``,
    description ? `${description}\n` : ``,
    `## Rules`,
    ``,
    `\`\`\`rules`,
    `# Add custom rules here. Example:`,
    `# - id: custom.${slug}.example`,
    `#   group: naming`,
    `#   severity: warning`,
    `#   description: 規則描述`,
    `\`\`\``,
    ``,
  ].join("\n");

  await fs.writeFile(filePath, content, "utf-8");
  void uploadRaw(path.relative(path.resolve(DATA_DIR, ".."), filePath), content, "text/markdown"); // async MinIO backup
  await loadSkills();
  res.status(201).json({ ok: true, filePath: `data/skills/${slug}.md` });
});

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

// DELETE /api/v1/skills/:name — delete a user skill file
router.delete("/:name", async (req: Request, res: Response) => {
  const name = decodeURIComponent((req.params as Record<string, string>)["name"] ?? "");
  const filePath = getUserSkillFilePath(name);
  if (!filePath) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: `User skill "${name}" not found or is built-in` } });
    return;
  }
  await fs.unlink(filePath);
  await loadSkills();
  res.json({ ok: true });
});

export default router;
