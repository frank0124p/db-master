import { Router, type Router as RouterType, type Request } from "express";
import { z } from "zod";
import {
  listWideTables, getWideTable, createWideTable, deleteWideTable,
  previewWideTable, buildViewSql, CreateWideTableInput, type PreviewSource,
} from "../repositories/wide-tables.js";
// autoCompose is exposed via the /auto-compose route which calls previewWideTable (same logic)

const router: RouterType = Router({ mergeParams: true });

const sid = (req: Request) => Number((req.params as Record<string, string>)["schemaId"]);

// GET /schemas/:schemaId/wide-tables
router.get("/", async (req, res, next) => {
  try { res.json(await listWideTables(sid(req))); }
  catch (e) { next(e); }
});

// POST /schemas/:schemaId/wide-tables/auto-compose  (must be before /:id)
router.post("/auto-compose", async (req, res, next) => {
  try {
    const { tableIds } = z.object({ tableIds: z.array(z.number()).min(2) }).parse(req.body);
    res.json(await previewWideTable(sid(req), tableIds));
  } catch (e) { next(e); }
});

// POST /schemas/:schemaId/wide-tables/preview  (must be before /:id)
router.post("/preview", async (req, res, next) => {
  try {
    const { tableIds } = z.object({ tableIds: z.array(z.number()).min(1) }).parse(req.body);
    res.json(await previewWideTable(sid(req), tableIds));
  } catch (e) { next(e); }
});

// GET /schemas/:schemaId/wide-tables/:id
router.get("/:id", async (req, res, next) => {
  try {
    const wt = await getWideTable(Number(req.params["id"]));
    if (!wt) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Wide table not found" } });
    res.json(wt);
  } catch (e) { next(e); }
});

// POST /schemas/:schemaId/wide-tables
router.post("/", async (req, res, next) => {
  try {
    const input = CreateWideTableInput.parse(req.body);
    res.status(201).json(await createWideTable(sid(req), input));
  } catch (e) { next(e); }
});

// DELETE /schemas/:schemaId/wide-tables/:id
router.delete("/:id", async (req, res, next) => {
  try {
    await deleteWideTable(Number(req.params["id"]));
    res.status(204).end();
  } catch (e) { next(e); }
});

// GET /schemas/:schemaId/wide-tables/:id/ddl
router.get("/:id/ddl", async (req, res, next) => {
  try {
    const wt = await getWideTable(Number(req.params["id"]));
    if (!wt) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Wide table not found" } });
    const sources: PreviewSource[] = wt.sources.map(s => ({
      tableId: s.tableId, tableName: s.tableName,
      colPrefix: s.colPrefix ?? "",
      joinType: s.joinType, joinCondition: s.joinCondition, position: s.position,
    }));
    const columns = wt.columns.map((c, i) => ({
      sourcePosition: wt.sources.find(s => s.id === c.sourceId)?.position ?? 0,
      tableId: wt.sources.find(s => s.id === c.sourceId)?.tableId ?? 0,
      tableName: c.tableName, fieldId: c.fieldId, fieldName: c.fieldName,
      dataType: c.fieldType, outputName: c.outputName, included: c.included,
      hasConflict: false, position: i,
    }));
    const sql = buildViewSql(wt.name, sources, columns);
    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Content-Disposition", `attachment; filename="${wt.name}.sql"`);
    res.send(sql);
  } catch (e) { next(e); }
});

export default router;
