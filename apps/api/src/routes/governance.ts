import { Router } from "express";
import * as governanceRepo from "../repositories/governance.js";
import { analyzeImpact } from "../services/impact.js";

const router = Router();

// ── GET /api/v1/governance/reports/:id ───────────────────────────────────────

router.get("/reports/:id", async (req, res, next) => {
  try {
    const id = Number(req.params["id"]);
    const report = await governanceRepo.getReport(id);
    if (!report) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Report not found" } });
    }
    return res.json(report);
  } catch (e) { next(e); }
});

// ── GET /api/v1/governance/reports?draft_id= ─────────────────────────────────

router.get("/reports", async (req, res, next) => {
  try {
    const draftId = req.query["draft_id"] !== undefined
      ? Number(req.query["draft_id"])
      : undefined;
    const reports = await governanceRepo.listReports(
      draftId !== undefined ? { draftId } : undefined,
    );
    return res.json(reports);
  } catch (e) { next(e); }
});

// ── GET /api/v1/governance/impact?ref= ──────────────────────────────────────

router.get("/impact", async (req, res, next) => {
  try {
    const ref = req.query["ref"];
    if (!ref || typeof ref !== "string") {
      return res.status(400).json({ error: { code: "MISSING_PARAM", message: "ref query param is required" } });
    }
    const affected = await analyzeImpact(ref);
    return res.json({
      ref,
      affectedCount: affected.length,
      affected: affected.map(a => ({
        slug: a.slug,
        brokenColumns: a.brokenColumns,
        name: a.gwt.name,
        impacted: (a.gwt as unknown as Record<string, unknown>)["impacted"] ?? null,
      })),
    });
  } catch (e) { next(e); }
});

export default router;
