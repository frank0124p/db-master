import { Router, type Router as ExpressRouter } from "express";
import { listSchemas, getSchemaById } from "../repositories/schemas.js";

const router: ExpressRouter = Router();

// GET /api/v1/search?q=<query>
router.get("/", async (req, res, next) => {
  try {
    const q = (req.query["q"] as string | undefined)?.trim().toLowerCase() ?? "";
    if (!q) {
      res.json({ tables: [], fields: [] });
      return;
    }

    const allSchemas = await listSchemas();

    const tableResults: {
      schemaId: number; schemaName: string;
      tableId: number; tableName: string; tableComment: string | null;
    }[] = [];

    const fieldResults: {
      schemaId: number; schemaName: string;
      tableId: number; tableName: string;
      fieldId: number; fieldName: string; fieldType: string; fieldComment: string | null;
    }[] = [];

    for (const schemaMeta of allSchemas) {
      const schema = await getSchemaById(schemaMeta.id);
      for (const table of schema.tables) {
        if (table.name.toLowerCase().includes(q) || (table.comment ?? "").toLowerCase().includes(q)) {
          tableResults.push({
            schemaId: schema.id, schemaName: schema.name,
            tableId: table.id, tableName: table.name, tableComment: table.comment,
          });
        }
        for (const field of table.fields) {
          if (
            field.name.toLowerCase().includes(q) ||
            (field.comment ?? "").toLowerCase().includes(q) ||
            (field.aliases ?? []).some(a => a.toLowerCase().includes(q))
          ) {
            fieldResults.push({
              schemaId: schema.id, schemaName: schema.name,
              tableId: table.id, tableName: table.name,
              fieldId: field.id, fieldName: field.name,
              fieldType: field.dataType, fieldComment: field.comment,
            });
          }
        }
      }
    }

    res.json({ tables: tableResults.slice(0, 50), fields: fieldResults.slice(0, 100) });
  } catch (e) { next(e); }
});

export default router;
