import { Router, type Router as ExpressRouter } from "express";
import { z } from "zod";
import { CreateTableInput } from "@schema-studio/core";
import * as repo from "../repositories/tables.js";

const router: ExpressRouter = Router({ mergeParams: true });

router.post("/", async (req, res, next) => {
  try {
    const input = CreateTableInput.parse(req.body);
    const schemaId = Number((req.params as Record<string, string>)["schemaId"]);
    res.status(201).json(await repo.createTable(schemaId, input));
  } catch (e) { next(e); }
});

const UpdateTableBody = z.object({
  name:        z.string().optional(),
  comment:     z.string().nullable().optional(),
  sample_data: z.array(z.record(z.unknown())).optional(),
});

router.patch("/:tableId", async (req, res, next) => {
  try {
    const parsed = UpdateTableBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", detail: parsed.error.format() } });
      return;
    }
    const { name, comment, sample_data } = parsed.data;
    const input: Partial<{ name: string; comment: string | null; sampleData: Record<string, unknown>[] }> = {};
    if (name !== undefined) input.name = name;
    if (comment !== undefined) input.comment = comment;
    if (sample_data !== undefined) input.sampleData = sample_data;
    await repo.updateTable(Number((req.params as Record<string, string>)["tableId"]), input);
    res.status(204).end();
  } catch (e) { next(e); }
});

router.delete("/:tableId", async (req, res, next) => {
  try {
    await repo.deleteTable(Number((req.params as Record<string, string>)["tableId"]));
    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;
