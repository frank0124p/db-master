import { Router, type Router as RouterType, type Request } from "express";
import { z } from "zod";
import {
  listWideTables, getWideTable, createWideTable, deleteWideTable,
  previewWideTable, buildViewSql, CreateWideTableInput, type PreviewSource, type TableRef,
} from "../repositories/wide-tables.js";
import { recordEdge } from "../repositories/lineage.js";
import { getSchemaById } from "../repositories/schemas.js";
// autoCompose is exposed via the /auto-compose route which calls previewWideTable (same logic)

const router: RouterType = Router({ mergeParams: true });

const sid = (req: Request) => Number((req.params as Record<string, string>)["schemaId"]);

// GET /schemas/:schemaId/wide-tables
router.get("/", async (req, res, next) => {
  try { res.json(await listWideTables(sid(req))); }
  catch (e) { next(e); }
});

const TableRefsBody = z.object({
  tableRefs: z.array(z.object({ schemaId: z.number(), tableId: z.number() })).optional(),
  tableIds: z.array(z.number()).optional(), // backward-compat
});

function resolveTableRefs(body: z.infer<typeof TableRefsBody>, fallbackSchemaId: number): TableRef[] {
  if (body.tableRefs?.length) return body.tableRefs;
  return (body.tableIds ?? []).map(id => ({ schemaId: fallbackSchemaId, tableId: id }));
}

// POST /schemas/:schemaId/wide-tables/auto-compose  (must be before /:id)
router.post("/auto-compose", async (req, res, next) => {
  try {
    const body = TableRefsBody.parse(req.body);
    const refs = resolveTableRefs(body, sid(req));
    if (refs.length < 2) { res.status(400).json({ error: { message: "Need at least 2 tables" } }); return; }
    res.json(await previewWideTable(sid(req), refs));
  } catch (e) { next(e); }
});

// POST /schemas/:schemaId/wide-tables/preview  (must be before /:id)
router.post("/preview", async (req, res, next) => {
  try {
    const body = TableRefsBody.parse(req.body);
    const refs = resolveTableRefs(body, sid(req));
    if (!refs.length) { res.status(400).json({ error: { message: "Need at least 1 table" } }); return; }
    res.json(await previewWideTable(sid(req), refs));
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
    const schemaId = sid(req);
    const input = CreateWideTableInput.parse(req.body);
    const wt = await createWideTable(schemaId, input);
    res.status(201).json(wt);

    // Auto-record lineage: each source table → this wide table
    void (async () => {
      try {
        const destSchema = await getSchemaById(schemaId);
        const uniqueSourceSchemaIds = [...new Set(wt.sources.map(s => s.schemaId))];
        const srcSchemas = new Map(
          await Promise.all(uniqueSourceSchemaIds.map(async id => [id, await getSchemaById(id)] as const))
        );
        for (const src of wt.sources) {
          const srcSchema = srcSchemas.get(src.schemaId);
          if (!srcSchema) continue;
          await recordEdge({
            fromSchemaId: src.schemaId,
            fromSchemaName: srcSchema.name,
            fromDomain: srcSchema.domain || "未分類",
            fromTableId: src.tableId,
            fromTableName: src.tableName,
            fromKind: "table",
            toSchemaId: schemaId,
            toSchemaName: destSchema.name,
            toDomain: destSchema.domain || "未分類",
            toTableId: wt.id,
            toTableName: wt.name,
            toKind: "wide-table",
            transformType: src.joinType === "BASE" ? "direct" : "join",
            description: `寬表 ${wt.name} 自動記錄`,
            source: "wide-table",
          });
        }
      } catch { /* lineage recording is non-critical */ }
    })();
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
      schemaId: s.schemaId ?? wt.schemaId, schemaName: String(s.schemaId ?? wt.schemaId),
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
