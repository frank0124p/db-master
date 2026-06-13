import { Router } from "express";
import { z } from "zod";
import * as draftRepo from "../repositories/workspace.js";
import type { WideTableDraft, ProposedColumn, ProposedJoin } from "@schema-studio/core";

const router = Router();

// ── GET /api/v1/workspace/drafts ──────────────────────────────────────────────

router.get("/drafts", async (req, res, next) => {
  try {
    const status = req.query["status"] as WideTableDraft["status"] | undefined;
    const drafts = await draftRepo.listDrafts({ status });
    res.json(drafts);
  } catch (e) { next(e); }
});

// ── GET /api/v1/workspace/drafts/:id ─────────────────────────────────────────

router.get("/drafts/:id", async (req, res, next) => {
  try {
    const id = Number(req.params["id"]);
    const draft = await draftRepo.getDraft(id);
    if (!draft) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Draft not found" } });
    return res.json(draft);
  } catch (e) { next(e); }
});

// ── PATCH /api/v1/workspace/drafts/:id ───────────────────────────────────────

const PatchDraftInput = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  columns: z.array(z.unknown()).optional(),
  join_graph: z.array(z.unknown()).optional(),
  edited_by: z.string().default("system"),
  instance_id: z.number().int().optional(),
}).passthrough();

router.patch("/drafts/:id", async (req, res, next) => {
  try {
    const id = Number(req.params["id"]);
    const draft = await draftRepo.getDraft(id);
    if (!draft) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Draft not found" } });

    const body = PatchDraftInput.parse(req.body);
    const now = new Date().toISOString();
    const editLog = [...draft.editLog];

    if (body.name !== undefined && body.name !== draft.name) {
      editLog.push({
        at: now,
        by: body.edited_by,
        action: "edit-meta",
        detail: JSON.stringify({ field: "name", before: draft.name, after: body.name }),
      });
    }
    if (body.description !== undefined && body.description !== draft.description) {
      editLog.push({
        at: now,
        by: body.edited_by,
        action: "edit-meta",
        detail: JSON.stringify({ field: "description", before: draft.description.slice(0, 50), after: body.description.slice(0, 50) }),
      });
    }
    if (body.columns) {
      const before = JSON.stringify(draft.columns);
      const after = JSON.stringify(body.columns);
      if (before !== after) {
        editLog.push({
          at: now,
          by: body.edited_by,
          action: "edit-column",
          detail: JSON.stringify({ before: draft.columns.length, after: (body.columns as unknown[]).length }),
        });
      }
    }
    if (body.join_graph) {
      editLog.push({
        at: now,
        by: body.edited_by,
        action: "edit-join",
        detail: JSON.stringify({ joinCount: (body.join_graph as unknown[]).length }),
      });
    }

    const patch: Partial<WideTableDraft> = { editLog };
    if (body.name !== undefined) patch.name = body.name;
    if (body.description !== undefined) patch.description = body.description;
    if (body.columns) patch.columns = body.columns as ProposedColumn[];
    if (body.join_graph) patch.joinGraph = body.join_graph as ProposedJoin[];

    const updated = await draftRepo.updateDraft(id, patch);
    return res.json(updated);
  } catch (e) { next(e); }
});

// ── POST /api/v1/workspace/drafts/:id/versions ───────────────────────────────

router.post("/drafts/:id/versions", async (req, res, next) => {
  try {
    const id = Number(req.params["id"]);
    const draft = await draftRepo.getDraft(id);
    if (!draft) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Draft not found" } });

    const nextV = (draft.versions[draft.versions.length - 1]?.v ?? 0) + 1;
    const snapshot = {
      name: draft.name,
      description: draft.description,
      columns: draft.columns,
      joinGraph: draft.joinGraph,
    };

    const updated = await draftRepo.updateDraft(id, {
      versions: [
        ...draft.versions,
        { v: nextV, savedAt: new Date().toISOString(), snapshot },
      ],
    });
    return res.json(updated);
  } catch (e) { next(e); }
});

// ── POST /api/v1/workspace/drafts/:id/preview-sql ────────────────────────────

router.post("/drafts/:id/preview-sql", async (req, res, next) => {
  try {
    const id = Number(req.params["id"]);
    const draft = await draftRepo.getDraft(id);
    if (!draft) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Draft not found" } });

    // Build SQL from draft joinGraph + columns
    const sql = buildPreviewSql(draft);
    return res.json({ sql, draftId: id });
  } catch (e) { next(e); }
});

function buildPreviewSql(draft: WideTableDraft): string {
  const colList = draft.columns
    .map(c => {
      const src = `${c.source.tableName}.${c.source.fieldName}`;
      return c.name !== c.source.fieldName ? `  ${src} AS ${c.name}` : `  ${src}`;
    })
    .join(",\n");

  if (draft.joinGraph.length === 0) {
    const firstSource = draft.columns[0]?.source.tableName ?? "unknown";
    return `-- Preview SQL for ${draft.name}\nSELECT\n${colList}\nFROM ${firstSource};`;
  }

  // Build FROM + JOIN chain
  const firstJoin = draft.joinGraph[0];
  if (!firstJoin) return `SELECT\n${colList}\nFROM unknown;`;

  const fromClause = firstJoin.leftRef;
  const joinClauses = draft.joinGraph
    .map(j => {
      const onClause = j.on.map(o => `${j.leftRef}.${o.leftField} = ${j.rightRef}.${o.rightField}`).join(" AND ");
      return `${j.type.toUpperCase()} JOIN ${j.rightRef} ON ${onClause}`;
    })
    .join("\n");

  return `-- Preview SQL for ${draft.name}\nSELECT\n${colList}\nFROM ${fromClause}\n${joinClauses};`;
}

// ── DELETE /api/v1/workspace/drafts/:id ──────────────────────────────────────

router.delete("/drafts/:id", async (req, res, next) => {
  try {
    const id = Number(req.params["id"]);
    const draft = await draftRepo.getDraft(id);
    if (!draft) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Draft not found" } });
    await draftRepo.deleteDraft(id);
    return res.status(204).send();
  } catch (e) { next(e); }
});

// ── POST /api/v1/workspace/drafts/:id/validate ───────────────────────────────

router.post("/drafts/:id/validate", async (req, res, next) => {
  try {
    const id = Number(req.params["id"]);
    const draft = await draftRepo.getDraft(id);
    if (!draft) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Draft not found" } });

    const { validateDraft } = await import("../services/governance-validate.js");
    const report = await validateDraft(draft);

    await draftRepo.updateDraft(id, {
      status: report.summary.passed ? "passed" : "failed",
      lastReportId: report.id,
    });

    // T10.3: If validation passed, auto-clear impacted mark on the corresponding governed (if any)
    if (report.summary.passed) {
      try {
        const { clearImpacted } = await import("../services/impact.js");
        const slug = draft.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        await clearImpacted(slug);
      } catch {
        // Non-critical; continue
      }
    }

    return res.json(report);
  } catch (e) { next(e); }
});

// ── POST /api/v1/workspace/drafts/:id/publish ────────────────────────────────

router.post("/drafts/:id/publish", async (req, res, next) => {
  try {
    const id = Number(req.params["id"]);
    const draft = await draftRepo.getDraft(id);
    if (!draft) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Draft not found" } });
    if (draft.status !== "passed") {
      return res.status(409).json({
        error: {
          code: "NOT_PASSED",
          message: "Draft must have a passing validation report before publishing",
        },
      });
    }

    const user = (req as { user?: { name?: string } }).user;
    const { publishDraft } = await import("../services/governance-publish.js");
    const governed = await publishDraft(draft, user?.name ?? "system");

    await draftRepo.updateDraft(id, { status: "published" });
    return res.status(201).json(governed);
  } catch (e) { next(e); }
});

export default router;
