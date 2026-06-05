import { Router, type Router as ExpressRouter } from "express";
import { z } from "zod";
import { checkFieldNames, checkFieldName } from "@schema-studio/core";
import * as repo from "../repositories/naming.js";
import { suggestNamingDefinition } from "../services/llm.js";

const router: ExpressRouter = Router();

router.get("/", async (req, res, next) => {
  try {
    const q = req.query as Record<string, string | undefined>;
    const domain = q["domain"];
    const status = q["status"] as "pending" | "approved" | "rejected" | undefined;
    res.json(await repo.listNamingEntries(domain, status));
  } catch (e) { next(e); }
});

router.get("/:id", async (req, res, next) => {
  try {
    res.json(await repo.getNamingEntry(Number((req.params as Record<string, string>)["id"])));
  } catch (e) { next(e); }
});

router.post("/", async (req, res, next) => {
  try {
    const input = repo.CreateNamingEntryInput.parse(req.body);
    res.status(201).json(await repo.createNamingEntry(input));
  } catch (e) { next(e); }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const input = repo.CreateNamingEntryInput.partial().strip().parse(req.body);
    res.json(await repo.updateNamingEntry(Number((req.params as Record<string, string>)["id"]), input));
  } catch (e) { next(e); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    await repo.deleteNamingEntry(Number((req.params as Record<string, string>)["id"]));
    res.status(204).end();
  } catch (e) { next(e); }
});

// POST /api/v1/naming-dictionary/:id/approve
router.post("/:id/approve", async (req, res, next) => {
  try {
    res.json(await repo.approveNamingEntry(Number((req.params as Record<string, string>)["id"])));
  } catch (e) { next(e); }
});

// POST /api/v1/naming-dictionary/:id/reject
router.post("/:id/reject", async (req, res, next) => {
  try {
    res.json(await repo.rejectNamingEntry(Number((req.params as Record<string, string>)["id"])));
  } catch (e) { next(e); }
});

// POST /api/v1/naming-dictionary/:id/reviewers — assign reviewers
router.post("/:id/reviewers", async (req, res, next) => {
  try {
    const id = Number((req.params as Record<string, string>)["id"]);
    const body = z.object({
      reviewers: z.array(z.object({ userId: z.string(), name: z.string() })),
    }).parse(req.body);
    res.json(await repo.assignReviewers(id, body.reviewers));
  } catch (e) { next(e); }
});

// POST /api/v1/naming-dictionary/:id/suggest — AI-generate description + tags
router.post("/:id/suggest", async (req, res, next) => {
  try {
    const id = Number((req.params as Record<string, string>)["id"]);
    const entry = await repo.getNamingEntry(id);
    const suggestion = await suggestNamingDefinition({
      concept: entry.concept,
      stdName: entry.stdName,
      aliases: entry.aliases,
      domain: entry.domain,
    });
    const updated = await repo.updateNamingEntry(id, {
      ai_description: suggestion.aiDescription,
      tags: suggestion.tags,
    });
    res.json(updated);
  } catch (e) { next(e); }
});

// POST /api/v1/naming-dictionary/check — check a single or batch of names
router.post("/check", async (req, res, next) => {
  try {
    const body = z.object({
      names: z.array(z.string()).min(1),
      domain: z.string().optional(),
    }).parse(req.body);

    const entries = await repo.listNamingEntries(body.domain);
    const results = checkFieldNames(body.names, entries);
    res.json(results);
  } catch (e) { next(e); }
});

export default router;
