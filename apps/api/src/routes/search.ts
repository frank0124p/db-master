import { Router, type Router as ExpressRouter } from "express";
import { listSchemas, getSchemaById } from "../repositories/schemas.js";
import { listNamingEntries } from "../repositories/naming.js";

const router: ExpressRouter = Router();

// GET /api/v1/search?q=<query>
router.get("/", async (req, res, next) => {
  try {
    const raw = (req.query["q"] as string | undefined)?.trim() ?? "";
    if (!raw) { res.json({ tables: [], fields: [], naming: [] }); return; }
    if (raw.length > 200) { res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "query too long (max 200 chars)" } }); return; }
    const q = raw.toLowerCase();

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

    const allNaming = await listNamingEntries();
    const namingResults = allNaming
      .filter(e =>
        e.concept.toLowerCase().includes(q) ||
        e.stdName.toLowerCase().includes(q) ||
        e.aliases.some(a => a.toLowerCase().includes(q))
      )
      .slice(0, 30)
      .map(e => ({ id: e.id, concept: e.concept, stdName: e.stdName, domain: e.domain }));

    res.json({ tables: tableResults.slice(0, 50), fields: fieldResults.slice(0, 100), naming: namingResults });
  } catch (e) { next(e); }
});

export default router;
