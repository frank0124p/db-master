import { Router, type Router as ExpressRouter } from "express";
import { z } from "zod";
import { CreateTableInput } from "@schema-studio/core";
import * as repo from "../repositories/tables.js";
import * as schemasRepo from "../repositories/schemas.js";
import * as store from "../db/fileStore.js";
import { scheduleRebuild } from "../services/graph-builder.js";
import { analyzeImpact, markImpacted } from "../services/impact.js";

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
  // Impact analysis options
  sync_downstream:   z.boolean().optional(),
  force:             z.boolean().optional(),
});

// ── Helper: build tbl ref for a table ────────────────────────────────────────

async function buildTblRef(tableId: number): Promise<string | null> {
  try {
    const idx = await store.getIndex();
    const schemaId = idx.tableSchema[String(tableId)];
    const tableName = idx.tableIdToName[String(tableId)];
    if (schemaId === undefined || !tableName) return null;
    const slug = idx.schemaIdToSlug[String(schemaId)];
    if (!slug) return null;
    return `tbl:${slug}.${tableName}`;
  } catch {
    return null;
  }
}

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
      force,
    } = parsed.data;

    const tableId = Number(req.params["tableId"]);

    // ── Impact analysis: table rename ────────────────────────────────────────
    if (name !== undefined) {
      const tblRef = await buildTblRef(tableId);
      if (tblRef) {
        const affected = await analyzeImpact(tblRef);
        if (affected.length > 0 && !force) {
          res.status(409).json({
            error: {
              code: "IMPACT_CONFLICT",
              message: `Table rename will break ${affected.length} governed wide-table(s)`,
              affected: affected.map(a => ({ slug: a.slug, brokenColumns: a.brokenColumns })),
            },
          });
          return;
        }
        if (affected.length > 0 && force) {
          // Mark affected governed as impacted
          const oldName = tblRef.split(".").pop() ?? "";
          const cause = `table:${oldName} renamed`;
          for (const a of affected) {
            await markImpacted(a.slug, cause, a.brokenColumns);
          }
        }
      }
    }

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
    await repo.updateTable(tableId, input);
    scheduleRebuild();
    res.status(204).end();
  } catch (e) { next(e); }
});

router.delete("/:tableId", async (req, res, next) => {
  try {
    const tableId = Number(req.params["tableId"]);
    const force = req.query["force"] === "true";

    // ── Impact analysis: table delete ────────────────────────────────────────
    const tblRef = await buildTblRef(tableId);
    if (tblRef) {
      const affected = await analyzeImpact(tblRef);
      if (affected.length > 0 && !force) {
        res.status(409).json({
          error: {
            code: "IMPACT_CONFLICT",
            message: `Deleting this table will break ${affected.length} governed wide-table(s)`,
            affected: affected.map(a => ({ slug: a.slug, brokenColumns: a.brokenColumns })),
          },
        });
        return;
      }
      if (affected.length > 0 && force) {
        const tblName = tblRef.split(".").pop() ?? "";
        const cause = `table:${tblName} deleted`;
        for (const a of affected) {
          await markImpacted(a.slug, cause, a.brokenColumns);
        }
      }
    }

    await repo.deleteTable(tableId);
    scheduleRebuild();
    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;
