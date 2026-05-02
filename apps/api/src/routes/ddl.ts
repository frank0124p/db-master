import { Router, type Router as ExpressRouter } from "express";
import { getSchemaById } from "../repositories/schemas.js";
import { emitDDL, type Dialect } from "@schema-studio/ddl-parser";

const VALID_DIALECTS = new Set<Dialect>(["mariadb", "oracle", "clickhouse"]);

const router: ExpressRouter = Router({ mergeParams: true });

router.get("/", async (req, res, next) => {
  try {
    const schemaId = Number((req.params as Record<string, string>)["schemaId"]);
    const rawDialect = (req.query as Record<string, string>)["dialect"] ?? "mariadb";
    const dialect: Dialect = VALID_DIALECTS.has(rawDialect as Dialect) ? (rawDialect as Dialect) : "mariadb";

    const schema = await getSchemaById(schemaId);
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
    const filename = `${schema.name.replace(/\s+/g, "_")}_${dialect}.sql`;

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(sql);
  } catch (e) { next(e); }
});

export default router;
