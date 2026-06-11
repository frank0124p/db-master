import { Router } from "express";
import { z } from "zod";
import { parseDDL } from "@schema-studio/ddl-parser";
import * as batchRepo from "../repositories/import-batches.js";
import * as schemaRepo from "../repositories/schemas.js";
import { createTable } from "../repositories/tables.js";
import { createField } from "../repositories/fields.js";
import * as knowledgeRepo from "../repositories/knowledge.js";
import * as namingRepo from "../repositories/naming.js";
import { classifyBatch } from "../services/classify-pipeline.js";
import type { ImportBatch } from "@schema-studio/core";

const router = Router();

const CreateBatchInput = z.object({
  name: z.string().min(1).max(255),
  ddl_texts: z.array(z.string()).optional(),
  from_ddl_dir: z.boolean().optional(),
  instance_id: z.number().int().optional(),
});

// ── POST /api/v1/import-batches ────────────────────────────────────────────────

router.post("/", async (req, res, next) => {
  try {
    const body = CreateBatchInput.parse(req.body);
    const ddlTexts = body.ddl_texts ?? [];

    const schemaIds: number[] = [];
    let tableCount = 0;

    for (let i = 0; i < ddlTexts.length; i++) {
      const sql = ddlTexts[i] ?? "";
      const parsed = parseDDL(sql);
      if (parsed.tables.length === 0) continue;

      const schemaName = `${body.name}-${i + 1}`;
      const schema = await schemaRepo.createSchema({
        name: schemaName,
        description: `Imported as part of batch: ${body.name}`,
      });

      for (const table of parsed.tables) {
        const tableEntry = await createTable(schema.id, {
          name: table.name,
          comment: table.comment ?? undefined,
        });

        for (const field of table.fields) {
          await createField(tableEntry.id, {
            name: field.name,
            data_type: field.dataType,
            nullable: field.nullable,
            default_value: field.defaultValue ?? null,
            is_primary_key: field.isPrimaryKey,
            is_unique: field.isUnique,
            comment: field.comment ?? null,
            position: field.position,
          });
        }
        tableCount++;
      }

      schemaIds.push(schema.id);
    }

    const batch = await batchRepo.createImportBatch({
      name: body.name,
      source: "ui-upload",
      schemaIds,
      tableCount,
      status: "imported",
      proposals: [],
    });

    res.status(201).json(batch);
  } catch (e) { next(e); }
});

// ── GET /api/v1/import-batches ─────────────────────────────────────────────────

router.get("/", async (_req, res, next) => {
  try {
    const batches = await batchRepo.listImportBatches();
    res.json(batches);
  } catch (e) { next(e); }
});

// ── GET /api/v1/import-batches/:id ────────────────────────────────────────────

router.get("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params["id"]);
    const batch = await batchRepo.getImportBatch(id);
    if (!batch) return res.status(404).json({ error: { code: "NOT_FOUND", message: "ImportBatch not found" } });
    return res.json(batch);
  } catch (e) { next(e); }
});

// ── POST /api/v1/import-batches/:id/classify (SSE) ────────────────────────────

router.post("/:id/classify", async (req, res, next) => {
  try {
    const id = Number(req.params["id"]);
    const batch = await batchRepo.getImportBatch(id);
    if (!batch) return res.status(404).json({ error: { code: "NOT_FOUND", message: "ImportBatch not found" } });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    // Collect all tables in this batch
    const tableDetails: Array<{ tableId: number; tableName: string; fields: string[] }> = [];
    for (const schemaId of batch.schemaIds) {
      try {
        const schema = await schemaRepo.getSchemaById(schemaId);
        for (const table of schema.tables) {
          tableDetails.push({
            tableId: table.id,
            tableName: table.name,
            fields: table.fields.map(f => f.name),
          });
        }
      } catch {
        // schema may not exist
      }
    }

    // Context for classification
    const [concepts, dictEntries] = await Promise.all([
      knowledgeRepo.listConcepts({ status: "approved" }),
      namingRepo.listNamingEntries(undefined, "approved"),
    ]);

    // Get all existing tables for similarity comparison
    const allSchemas = await schemaRepo.listSchemas();
    const existingTables: Array<{
      schemaId: number; tableName: string; fields: string[];
      domain?: string; layerType?: string | null; suiteId?: number | null;
    }> = [];
    for (const s of allSchemas) {
      if (batch.schemaIds.includes(s.id)) continue; // skip tables from this batch itself
      try {
        const full = await schemaRepo.getSchemaById(s.id);
        for (const t of full.tables) {
          existingTables.push({
            schemaId: s.id,
            tableName: t.name,
            fields: t.fields.map(f => f.name),
            domain: s.domain,
            layerType: s.layerType,
            suiteId: s.suiteId,
          });
        }
      } catch { /* skip */ }
    }

    const availableDomains = [...new Set(existingTables.map(t => t.domain ?? "").filter(Boolean))];

    await batchRepo.updateImportBatch(id, { status: "classifying" });

    const proposals: ImportBatch["proposals"] = [];

    for await (const event of classifyBatch(
      batch,
      tableDetails,
      {
        concepts,
        dictEntries: dictEntries.map(d => ({ id: d.id, stdName: d.stdName, aliases: d.aliases })),
        existingTables,
        availableDomains,
      },
    )) {
      if (event.type === "table-classified") {
        proposals.push(event.proposal);
        send(event);
      } else if (event.type === "done") {
        await batchRepo.updateImportBatch(id, {
          status: "classified",
          proposals,
        });
        send(event);
      } else if (event.type === "error") {
        send(event);
      }
    }

    return res.end();
  } catch (e) { next(e); }
});

// ── POST /api/v1/import-batches/:id/proposals/:tableId/accept ─────────────────

router.post("/:id/proposals/:tableId/accept", async (req, res, next) => {
  try {
    const batchId = Number(req.params["id"]);
    const tableId = Number(req.params["tableId"]);
    const batch = await batchRepo.getImportBatch(batchId);
    if (!batch) return res.status(404).json({ error: { code: "NOT_FOUND", message: "ImportBatch not found" } });

    const proposal = batch.proposals.find(p => p.tableId === tableId);
    if (!proposal) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Proposal not found" } });

    // Write classification back to schema meta
    if (proposal.suggested.domain || proposal.suggested.layerType) {
      await schemaRepo.updateSchema(proposal.schemaId, {
        domain: proposal.suggested.domain,
        layerType: proposal.suggested.layerType as string | null | undefined,
        suiteId: proposal.suggested.suiteId ?? null,
      });
    }

    const updatedBatch = await batchRepo.updateProposal(batchId, tableId, { status: "accepted" });
    return res.json(updatedBatch);
  } catch (e) { next(e); }
});

// ── POST /api/v1/import-batches/:id/proposals/:tableId/override ───────────────

const OverrideInput = z.object({
  suite_id: z.number().optional(),
  domain: z.string().optional(),
  layer_type: z.string().optional(),
});

router.post("/:id/proposals/:tableId/override", async (req, res, next) => {
  try {
    const batchId = Number(req.params["id"]);
    const tableId = Number(req.params["tableId"]);
    const body = OverrideInput.parse(req.body);
    const user = (req as { user?: { name?: string } }).user;

    const batch = await batchRepo.getImportBatch(batchId);
    if (!batch) return res.status(404).json({ error: { code: "NOT_FOUND", message: "ImportBatch not found" } });

    const proposal = batch.proposals.find(p => p.tableId === tableId);
    if (!proposal) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Proposal not found" } });

    // Write classification back to schema meta
    await schemaRepo.updateSchema(proposal.schemaId, {
      domain: body.domain,
      layerType: body.layer_type as string | null | undefined,
      suiteId: body.suite_id ?? null,
    });

    const updatedBatch = await batchRepo.updateProposal(batchId, tableId, {
      status: "overridden",
      override: {
        suiteId: body.suite_id,
        domain: body.domain,
        layerType: body.layer_type,
        by: user?.name ?? "system",
        at: new Date().toISOString(),
      },
    });
    return res.json(updatedBatch);
  } catch (e) { next(e); }
});

// ── POST /api/v1/import-batches/:id/proposals/accept-all ─────────────────────

const AcceptAllInput = z.object({
  min_confidence: z.number().min(0).max(1).default(0),
});

router.post("/:id/proposals/accept-all", async (req, res, next) => {
  try {
    const batchId = Number(req.params["id"]);
    const { min_confidence } = AcceptAllInput.parse(req.body);

    const batch = await batchRepo.getImportBatch(batchId);
    if (!batch) return res.status(404).json({ error: { code: "NOT_FOUND", message: "ImportBatch not found" } });

    let accepted = 0;
    for (const proposal of batch.proposals) {
      if (proposal.status !== "pending") continue;
      if (proposal.confidence < min_confidence) continue;

      if (proposal.suggested.domain || proposal.suggested.layerType) {
        await schemaRepo.updateSchema(proposal.schemaId, {
          domain: proposal.suggested.domain,
          layerType: proposal.suggested.layerType as string | null | undefined,
          suiteId: proposal.suggested.suiteId ?? null,
        });
      }
      await batchRepo.updateProposal(batchId, proposal.tableId, { status: "accepted" });
      accepted++;
    }

    const updatedBatch = await batchRepo.getImportBatch(batchId);
    return res.json({ accepted, batch: updatedBatch });
  } catch (e) { next(e); }
});

export default router;
