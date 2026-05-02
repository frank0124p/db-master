import { Router, type Router as ExpressRouter } from "express";
import { CreateSchemaInput, checkFieldNames } from "@schema-studio/core";
import * as repo from "../repositories/schemas.js";
import * as namingRepo from "../repositories/naming.js";

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
