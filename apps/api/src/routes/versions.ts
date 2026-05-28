import { Router, type Router as ExpressRouter } from "express";
import { z } from "zod";
import * as repo from "../repositories/versions.js";
import { type DdlCheckSummary } from "../repositories/versions.js";
import { getSchemaById } from "../repositories/schemas.js";
import { checkDDL } from "../repositories/ddl-import.js";
import { emitDDL, type Dialect } from "@schema-studio/ddl-parser";

const router: ExpressRouter = Router({ mergeParams: true });

router.get("/", async (req, res, next) => {
  try {
    const id = Number((req.params as Record<string, string>)["schemaId"]);
    res.json(await repo.listVersions(id));
  } catch (e) { next(e); }
});

router.get("/:vno", async (req, res, next) => {
  try {
    const schemaId = Number((req.params as Record<string, string>)["schemaId"]);
    const vno = Number((req.params as Record<string, string>)["vno"]);
    const version = await repo.getVersionByNo(schemaId, vno);
    if (!version) { res.status(404).json({ error: { code: "NOT_FOUND", message: `Version ${vno} not found` } }); return; }
    res.json(version);
  } catch (e) { next(e); }
});

router.post("/", async (req, res, next) => {
  try {
    const id = Number((req.params as Record<string, string>)["schemaId"]);
    const { message } = z.object({ message: z.string().optional() }).parse(req.body);

    let ddlCheck: DdlCheckSummary | null = null;
    const schema = await getSchemaById(id);
    if (schema.targetDb) {
      const dialect = schema.targetDb as Dialect;
      const tables = schema.tables.map(t => ({
        name: t.name,
        comment: t.comment,
        fields: [...t.fields].sort((a, b) => a.position - b.position).map(f => ({
          name: f.name,
          dataType: f.dataType,
          nullable: f.nullable,
          defaultValue: f.defaultValue,
          isPrimaryKey: f.isPrimaryKey,
          isUnique: f.isUnique,
          isAutoIncrement: f.isPrimaryKey,
          comment: f.comment,
          position: f.position,
        })),
      }));
      const sql = emitDDL(tables, dialect, schema.name);
      const checkResult = await checkDDL(sql);
      ddlCheck = {
        errors: checkResult.summary.errors,
        warnings: checkResult.summary.warnings,
        infos: checkResult.summary.infos,
        passed: checkResult.summary.passed,
        dialect: schema.targetDb,
      };
    }

    res.status(201).json(await repo.saveVersion(id, message, ddlCheck));
  } catch (e) { next(e); }
});

export default router;
