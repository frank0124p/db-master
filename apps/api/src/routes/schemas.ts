import { Router, type Router as ExpressRouter } from "express";
import { z } from "zod";
import { CreateSchemaInput, checkFieldNames, BUILT_IN_RULES } from "@schema-studio/core";
import * as repo from "../repositories/schemas.js";
import * as namingRepo from "../repositories/naming.js";
import { getSkillRules } from "../services/skills.js";
import { resolveSchemaRuleIds } from "./schemaRules.js";

const router: ExpressRouter = Router();

router.get("/", async (_req, res, next) => {
  try {
    res.json(await repo.listSchemas());
  } catch (e) { next(e); }
});

router.post("/", async (req, res, next) => {
  try {
    const input = CreateSchemaInput.parse(req.body);
    res.status(201).json(await repo.createSchema(input));
  } catch (e) { next(e); }
});

router.get("/:id", async (req, res, next) => {
  try {
    res.json(await repo.getSchemaById(Number(req.params["id"])));
  } catch (e) { next(e); }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const input = CreateSchemaInput.partial().strip().parse(req.body);
    res.json(await repo.updateSchema(Number(req.params["id"]), input));
  } catch (e) { next(e); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    await repo.deleteSchema(Number(req.params["id"]));
    res.status(204).end();
  } catch (e) { next(e); }
});

// GET /api/v1/schemas/:id/rules — get resolved rule IDs for this schema
router.get("/:id/rules", async (req, res, next) => {
  try {
    const schema = await repo.getSchemaById(Number(req.params["id"]));
    const allRules = [...BUILT_IN_RULES, ...getSkillRules()];
    const selectedIds = resolveSchemaRuleIds(schema, allRules);
    res.json({ selectedRuleIds: [...selectedIds] });
  } catch (e) { next(e); }
});

const SchemaRulesBody = z.object({
  selectedRuleIds: z.array(z.string()).nullable(),
});

// PATCH /api/v1/schemas/:id/rules — set selected rule IDs for this schema
router.patch("/:id/rules", async (req, res, next) => {
  try {
    const parsed = SchemaRulesBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", detail: parsed.error.format() } });
      return;
    }
    const updated = await repo.updateSchema(Number(req.params["id"]), {
      selectedRuleIds: parsed.data.selectedRuleIds,
    });
    const allRules = [...BUILT_IN_RULES, ...getSkillRules()];
    const selectedIds = resolveSchemaRuleIds(updated, allRules);
    res.json({ selectedRuleIds: [...selectedIds] });
  } catch (e) { next(e); }
});

// POST /api/v1/schemas/:id/naming-check — check all field names in schema against dictionary
router.post("/:id/naming-check", async (req, res, next) => {
  try {
    const schema = await repo.getSchemaById(Number(req.params["id"]));
    const entries = await namingRepo.listNamingEntries(schema.domain);
    const results = schema.tables.map((table) => ({
      tableId: table.id,
      tableName: table.name,
      fields: checkFieldNames(
        table.fields.map((f) => f.name),
        entries
      ),
    }));
    res.json(results);
  } catch (e) { next(e); }
});

export default router;
