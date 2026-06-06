import { Router, type Router as ExpressRouter } from "express";
import { z } from "zod";
import { CreateSchemaInput, checkFieldNames, BUILT_IN_RULES } from "@schema-studio/core";
import * as repo from "../repositories/schemas.js";
import * as namingRepo from "../repositories/naming.js";
import { getSkillRules } from "../services/skills.js";
import { resolveSchemaRuleIds } from "./schemaRules.js";
import { suggestSchemaStream } from "../services/llm.js";

const router: ExpressRouter = Router();

router.get("/", async (_req, res, next) => {
  try {
    res.json(await repo.listSchemas());
  } catch (e) { next(e); }
});

router.post("/", async (req, res, next) => {
  try {
    const input = CreateSchemaInput.parse(req.body);
    res.status(201).json(await repo.createSchema(input));
  } catch (e) { next(e); }
});

router.get("/:id", async (req, res, next) => {
  try {
    res.json(await repo.getSchemaById(Number(req.params["id"])));
  } catch (e) { next(e); }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const input = CreateSchemaInput.partial().strip().parse(req.body);
    res.json(await repo.updateSchema(Number(req.params["id"]), input));
  } catch (e) { next(e); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    await repo.deleteSchema(Number(req.params["id"]));
    res.status(204).end();
  } catch (e) { next(e); }
});

// GET /api/v1/schemas/:id/rules — get resolved rule IDs for this schema
router.get("/:id/rules", async (req, res, next) => {
  try {
    const schema = await repo.getSchemaById(Number(req.params["id"]));
    const allRules = [...BUILT_IN_RULES, ...getSkillRules()];
    const selectedIds = resolveSchemaRuleIds(schema, allRules);
    res.json({ selectedRuleIds: [...selectedIds] });
  } catch (e) { next(e); }
});

const SchemaRulesBody = z.object({
  selectedRuleIds: z.array(z.string()).nullable(),
});

// PATCH /api/v1/schemas/:id/rules — set selected rule IDs for this schema
router.patch("/:id/rules", async (req, res, next) => {
  try {
    const parsed = SchemaRulesBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", detail: parsed.error.format() } });
      return;
    }
    const updated = await repo.updateSchema(Number(req.params["id"]), {
      selectedRuleIds: parsed.data.selectedRuleIds,
    });
    const allRules = [...BUILT_IN_RULES, ...getSkillRules()];
    const selectedIds = resolveSchemaRuleIds(updated, allRules);
    res.json({ selectedRuleIds: [...selectedIds] });
  } catch (e) { next(e); }
});

// POST /api/v1/schemas/:id/suggest — AI suggestions for schema design (SSE)
router.post("/:id/suggest", async (req, res, next) => {
  try {
    const schemaId = Number(req.params["id"]);
    const schema = await repo.getSchemaById(schemaId);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    const schemaJson = JSON.stringify({
      name: schema.name,
      description: schema.description,
      domain: schema.domain,
      tables: schema.tables.map(t => ({
        name: t.name,
        comment: t.comment,
        fields: t.fields.map(f => ({
          name: f.name, dataType: f.dataType,
          isPrimaryKey: f.isPrimaryKey, isUnique: f.isUnique,
          nullable: f.nullable, comment: f.comment,
        })),
      })),
    }, null, 2);

    for await (const event of suggestSchemaStream(schemaJson)) {
      if (event.type === "error") { send({ type: "error", message: event.message }); res.end(); return; }
      send(event);
    }
    res.end();
  } catch (e) { next(e); }
});

// GET /api/v1/schemas/:id/export — export full schema data as JSON
router.get("/:id/export", async (req, res, next) => {
  try {
    const schemaId = Number(req.params["id"]);
    const schema = await repo.getSchemaById(schemaId);
    res.setHeader("Content-Disposition", `attachment; filename="${schema.name}.json"`);
    res.json({
      exportVersion: 1,
      exportedAt: new Date().toISOString(),
      schema: {
        name: schema.name,
        description: schema.description,
        domain: schema.domain,
        layerType: schema.layerType,
        tags: schema.tags,
        environment: schema.environment,
        targetDb: schema.targetDb,
        tables: schema.tables.map(t => ({
          name: t.name,
          comment: t.comment,
          sampleData: (t as typeof t & { sampleData?: Record<string, unknown>[] }).sampleData ?? [],
          fields: t.fields.map(f => ({
            name: f.name, dataType: f.dataType, nullable: f.nullable,
            defaultValue: f.defaultValue, isPrimaryKey: f.isPrimaryKey,
            isUnique: f.isUnique, comment: f.comment, position: f.position,
          })),
        })),
      },
    });
  } catch (e) { next(e); }
});

const SafeNameSchema = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_\- ]+$/, "Only alphanumeric, underscore, hyphen, or space allowed");

const ImportBodySchema = z.object({
  schema: z.object({
    name: SafeNameSchema,
    description: z.string().max(500).nullable().optional(),
    domain: z.string().max(64).optional(),
    layerType: z.string().max(64).nullable().optional(),
    tags: z.array(z.string().max(64)).optional(),
    environment: z.string().max(32).nullable().optional(),
    targetDb: z.string().max(64).nullable().optional(),
    tables: z.array(z.object({
      name: SafeNameSchema,
      comment: z.string().max(500).nullable().optional(),
      sampleData: z.array(z.record(z.unknown())).optional(),
      fields: z.array(z.object({
        name: SafeNameSchema,
        dataType: z.string().max(128).optional(),
        nullable: z.boolean().optional(),
        defaultValue: z.string().max(256).nullable().optional(),
        isPrimaryKey: z.boolean().optional(),
        isUnique: z.boolean().optional(),
        comment: z.string().max(500).nullable().optional(),
        position: z.number().int().min(0).optional(),
      })).optional(),
    })).optional(),
  }),
});

// POST /api/v1/schemas/import — import schema from JSON export
router.post("/import", async (req, res, next) => {
  try {
    const parsed = ImportBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", detail: parsed.error.format() } });
      return;
    }
    const src = parsed.data.schema;

    // Handle name conflicts by appending "-copy"
    let name = src.name;
    const existing = await repo.getSchemaByName(name);
    if (existing) name = `${name}-copy`;

    const created = await repo.createSchema({
      name,
      description: src.description ?? null,
      domain: src.domain ?? "semiconductor",
      layerType: src.layerType ?? null,
      tags: src.tags ?? [],
      environment: src.environment ?? null,
      targetDb: src.targetDb ?? null,
    });

    // Import tables + fields
    const { createTable } = await import("../repositories/tables.js");
    const { createField } = await import("../repositories/fields.js");

    for (const tbl of src.tables ?? []) {
      if (!tbl.name) continue;
      const newTable = await createTable(created.id, {
        name: tbl.name,
        comment: tbl.comment ?? null,
        sampleData: tbl.sampleData ?? [],
      } as Parameters<typeof createTable>[1] & { sampleData?: Record<string, unknown>[] });
      const fields = tbl.fields ?? [];
      for (let i = 0; i < fields.length; i++) {
        const f = fields[i]!;
        if (!f.name) continue;
        await createField(newTable.id, {
          name: f.name,
          data_type: f.dataType ?? "VARCHAR(64)",
          nullable: f.nullable ?? true,
          default_value: f.defaultValue ?? null,
          is_primary_key: f.isPrimaryKey ?? false,
          is_unique: f.isUnique ?? false,
          comment: f.comment ?? null,
          position: f.position ?? i,
        });
      }
    }

    const result = await repo.getSchemaById(created.id);
    res.status(201).json(result);
  } catch (e) { next(e); }
});

// POST /api/v1/schemas/:id/naming-check — check all field names in schema against dictionary
router.post("/:id/naming-check", async (req, res, next) => {
  try {
    const schema = await repo.getSchemaById(Number(req.params["id"]));
    const entries = await namingRepo.listNamingEntries(schema.domain);
    const results = schema.tables.map((table) => ({
      tableId: table.id,
      tableName: table.name,
      fields: checkFieldNames(
        table.fields.map((f) => f.name),
        entries
      ),
    }));
    res.json(results);
  } catch (e) { next(e); }
});

export default router;
