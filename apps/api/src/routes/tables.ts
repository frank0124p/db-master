import { Router, type Router as ExpressRouter } from "express";
import { z } from "zod";
import { CreateTableInput } from "@schema-studio/core";
import * as repo from "../repositories/tables.js";
import { scheduleRebuild } from "../services/graph-builder.js";

const REFRESH_CYCLES = ["realtime", "hourly", "daily", "weekly", "monthly", "adhoc"] as const;

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
  name:              z.string().optional(),
  comment:           z.string().nullable().optional(),
  tags:              z.array(z.string()).optional(),
  environment:       z.string().nullable().optional(),
  layer_type:        z.string().nullable().optional(),
  status:            z.enum(["active", "deprecated"]).nullable().optional(),
  sample_data:       z.array(z.record(z.unknown())).optional(),
  // Phase 10 stewardship + operational + lifecycle
  owner_user_id:     z.number().int().nullable().optional(),
  steward_user_id:   z.number().int().nullable().optional(),
  refresh_cycle:     z.enum(REFRESH_CYCLES).nullable().optional(),
  data_period:       z.string().nullable().optional(),
  source_system:     z.string().nullable().optional(),
  deprecated:        z.boolean().nullable().optional(),
  deprecated_at:     z.string().nullable().optional(),
  deprecation_note:  z.string().nullable().optional(),
  replaced_by_ref:   z.string().nullable().optional(),
});

router.patch("/:tableId", async (req, res, next) => {
  try {
    const parsed = UpdateTableBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", detail: parsed.error.format() } });
      return;
    }
    const {
      name, comment, tags, environment, layer_type, status, sample_data,
      owner_user_id, steward_user_id, refresh_cycle, data_period, source_system,
      deprecated, deprecated_at, deprecation_note, replaced_by_ref,
    } = parsed.data;
    const input: Parameters<typeof repo.updateTable>[1] = {};
    if (name !== undefined) input.name = name;
    if (comment !== undefined) input.comment = comment;
    if (tags !== undefined) input.tags = tags;
    if (environment !== undefined) input.environment = environment;
    if (layer_type !== undefined) input.layerType = layer_type;
    if (status !== undefined) input.status = status;
    if (sample_data !== undefined) input.sampleData = sample_data;
    if (owner_user_id !== undefined) input.ownerUserId = owner_user_id;
    if (steward_user_id !== undefined) input.stewardUserId = steward_user_id;
    if (refresh_cycle !== undefined) input.refreshCycle = refresh_cycle;
    if (data_period !== undefined) input.dataPeriod = data_period;
    if (source_system !== undefined) input.sourceSystem = source_system;
    if (deprecated !== undefined) input.deprecated = deprecated;
    if (deprecated_at !== undefined) input.deprecatedAt = deprecated_at;
    if (deprecation_note !== undefined) input.deprecationNote = deprecation_note;
    if (replaced_by_ref !== undefined) input.replacedByRef = replaced_by_ref;
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
