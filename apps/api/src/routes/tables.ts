import { Router, type Router as ExpressRouter } from "express";
import { z } from "zod";
import { CreateTableInput } from "@schema-studio/core";
import * as repo from "../repositories/tables.js";
import { scheduleRebuild } from "../services/graph-builder.js";

const router: ExpressRouter = Router({ mergeParams: true });

router.post("/", async (req, res, next) => {
  try {
    const input = CreateTableInput.parse(req.body);
    const schemaId = Number((req.params as Record<string, string>)["schemaId"]);
    const result = await repo.createTable(schemaId, input);
    scheduleRebuild();
    res.status(201).json(result);
  } catch (e) { next(e); }
});

const UpdateTableBody = z.object({
  name:        z.string().optional(),
  comment:     z.string().nullable().optional(),
  tags:        z.array(z.string()).optional(),
  environment: z.string().nullable().optional(),
  layer_type:  z.string().nullable().optional(),
  status:      z.enum(["active", "deprecated"]).nullable().optional(),
  sample_data: z.array(z.record(z.unknown())).optional(),
});

router.patch("/:tableId", async (req, res, next) => {
  try {
    const parsed = UpdateTableBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", detail: parsed.error.format() } });
      return;
    }
    const { name, comment, tags, environment, layer_type, status, sample_data } = parsed.data;
    const input: Partial<{ name: string; comment: string | null; tags: string[]; environment: string | null; layerType: string | null; status: "active" | "deprecated" | null; sampleData: Record<string, unknown>[] }> = {};
    if (name !== undefined) input.name = name;
    if (comment !== undefined) input.comment = comment;
    if (tags !== undefined) input.tags = tags;
    if (environment !== undefined) input.environment = environment;
    if (layer_type !== undefined) input.layerType = layer_type;
    if (status !== undefined) input.status = status;
    if (sample_data !== undefined) input.sampleData = sample_data;
    await repo.updateTable(Number(req.params["tableId"]), input);
    scheduleRebuild();
    res.status(204).end();
  } catch (e) { next(e); }
});

router.delete("/:tableId", async (req, res, next) => {
  try {
    await repo.deleteTable(Number(req.params["tableId"]));
    scheduleRebuild();
    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;
