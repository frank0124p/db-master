import { Router, type Router as ExpressRouter } from "express";
import { z } from "zod";
import { CreateFieldInput } from "@schema-studio/core";
import * as repo from "../repositories/fields.js";
import * as schemaRepo from "../repositories/schemas.js";
import { suggestFieldComment } from "../services/llm.js";

const router: ExpressRouter = Router({ mergeParams: true });

router.post("/", async (req, res, next) => {
  try {
    const input = CreateFieldInput.parse(req.body);
    const tableId = Number((req.params as Record<string, string>)["tableId"]);
    res.status(201).json(await repo.createField(tableId, input));
  } catch (e) { next(e); }
});

router.patch("/:fieldId", async (req, res, next) => {
  try {
    const input = CreateFieldInput.partial().strip().parse(req.body);
    await repo.updateField(Number((req.params as Record<string, string>)["fieldId"]), input);
    res.status(204).end();
  } catch (e) { next(e); }
});

// POST /suggest-comment — AI-generate a field description
const SuggestCommentBody = z.object({
  fieldName: z.string(),
  dataType: z.string(),
  tableName: z.string(),
  tableComment: z.string().nullable().optional(),
  domain: z.string().default("semiconductor"),
});

router.post("/suggest-comment", async (req, res, next) => {
  try {
    const parsed = SuggestCommentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", detail: parsed.error.format() } });
      return;
    }
    const result = await suggestFieldComment(parsed.data);
    res.json(result);
  } catch (e) { next(e); }
});

router.delete("/:fieldId", async (req, res, next) => {
  try {
    await repo.deleteField(Number((req.params as Record<string, string>)["fieldId"]));
    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;
