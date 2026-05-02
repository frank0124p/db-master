import { Router, type Request, type Response } from "express";
import { type Router as RouterType } from "express";
import { z } from "zod";
import { checkDDL, importDDL } from "../repositories/ddl-import.js";

const router: RouterType = Router({ mergeParams: true });

const ImportBody = z.object({
  sql: z.string().min(10),
  dryRun: z.boolean().default(false),
});

// POST /api/v1/schemas/:schemaId/import-ddl
router.post("/", async (req: Request, res: Response) => {
  const schemaId = Number((req.params as Record<string, string>)["schemaId"]);
  const parsed = ImportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", detail: parsed.error.format() } });
    return;
  }

  const { sql, dryRun } = parsed.data;

  try {
    const checkResult = await checkDDL(sql);

    if (dryRun) {
      res.json({ dryRun: true, check: checkResult });
      return;
    }

    const importResult = await importDDL(schemaId, sql);
    res.json({ dryRun: false, check: checkResult, import: importResult });
  } catch (e) {
    res.status(500).json({ error: { code: "IMPORT_ERROR", message: String(e) } });
  }
});

export default router;
