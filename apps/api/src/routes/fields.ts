import { Router, type Router as ExpressRouter } from "express";
import { z } from "zod";
import { CreateFieldInput, SensitivitySchema } from "@schema-studio/core";
import * as repo from "../repositories/fields.js";
import * as schemaRepo from "../repositories/schemas.js";
import * as store from "../db/fileStore.js";
import { suggestFieldComment } from "../services/llm.js";
import { scheduleRebuild } from "../services/graph-builder.js";
import { analyzeImpact, markImpacted, syncRename } from "../services/impact.js";

const router: ExpressRouter = Router({ mergeParams: true });

router.post("/", async (req, res, next) => {
  try {
    const input = CreateFieldInput.parse(req.body);
    const tableId = Number((req.params as Record<string, string>)["tableId"]);
    res.status(201).json(await repo.createField(tableId, input));
  } catch (e) { next(e); }
});

const PatchFieldBody = CreateFieldInput.partial().extend({
  sensitivity: SensitivitySchema.nullable().optional(),
  // Impact analysis options (T10.3)
  sync_downstream: z.boolean().optional(),
});

// ── Helper: build fld ref for a field ────────────────────────────────────────

async function buildFldRef(fieldId: number): Promise<{ ref: string; fieldName: string } | null> {
  try {
    const idx = await store.getIndex();
    const tableId = idx.fieldTable[String(fieldId)];
    if (tableId === undefined) return null;
    const schemaId = idx.tableSchema[String(tableId)];
    const tableName = idx.tableIdToName[String(tableId)];
    if (schemaId === undefined || !tableName) return null;
    const slug = idx.schemaIdToSlug[String(schemaId)];
    if (!slug) return null;
    // Find field name from table file
    const { promises: fs } = await import("fs");
    const filePath = await schemaRepo.getTableFilePath(schemaId, tableId);
    const tbl = JSON.parse(await fs.readFile(filePath, "utf-8")) as { fields: Array<{ id: number; name: string }> };
    const field = tbl.fields.find(f => f.id === fieldId);
    if (!field) return null;
    return { ref: `fld:${slug}.${tableName}.${field.name}`, fieldName: field.name };
  } catch {
    return null;
  }
}

router.patch("/:fieldId", async (req, res, next) => {
  try {
    const fieldId = Number((req.params as Record<string, string>)["fieldId"]);
    const input = PatchFieldBody.strip().parse(req.body);
    const syncDownstream = (req.body as Record<string, unknown>)["sync_downstream"] === true;

    // ── Impact analysis: field rename ────────────────────────────────────────
    if (input.name !== undefined) {
      const fldInfo = await buildFldRef(fieldId);
      if (fldInfo) {
        const { ref: oldRef, fieldName: oldFieldName } = fldInfo;
        const newFieldName = input.name;
        if (oldFieldName !== newFieldName) {
          const affected = await analyzeImpact(oldRef);
          if (affected.length > 0) {
            if (syncDownstream) {
              // Auto-update downstream governed column.source.fieldName
              await syncRename(oldRef, newFieldName);
              // No impacted mark — sync succeeded
            } else {
              // Mark all affected governed as impacted
              const cause = `fld:${oldFieldName} renamed to ${newFieldName}`;
              for (const a of affected) {
                await markImpacted(a.slug, cause, a.brokenColumns);
              }
            }
          }
        }
      }
    }

    // Remove sync_downstream before passing to repo
    const { sync_downstream: _sync, ...repoInput } = input as typeof input & { sync_downstream?: boolean };
    void _sync; // suppress unused warning
    await repo.updateField(fieldId, repoInput);
    scheduleRebuild();
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
    const fieldId = Number((req.params as Record<string, string>)["fieldId"]);
    const force = req.query["force"] === "true";

    // ── Impact analysis: field delete ────────────────────────────────────────
    const fldInfo = await buildFldRef(fieldId);
    if (fldInfo) {
      const affected = await analyzeImpact(fldInfo.ref);
      if (affected.length > 0 && !force) {
        res.status(409).json({
          error: {
            code: "IMPACT_CONFLICT",
            message: `Deleting this field will break ${affected.length} governed wide-table(s)`,
            affected: affected.map(a => ({ slug: a.slug, brokenColumns: a.brokenColumns })),
          },
        });
        return;
      }
      if (affected.length > 0 && force) {
        const cause = `fld:${fldInfo.fieldName} deleted`;
        for (const a of affected) {
          await markImpacted(a.slug, cause, a.brokenColumns);
        }
      }
    }

    await repo.deleteField(fieldId);
    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;
