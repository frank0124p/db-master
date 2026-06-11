import { Router } from "express";
import { z } from "zod";
import * as proposalRepo from "../repositories/wt-proposals.js";
import * as workspaceRepo from "../repositories/workspace.js";
import * as knowledgeRepo from "../repositories/knowledge.js";
import * as schemaRepo from "../repositories/schemas.js";
import * as batchRepo from "../repositories/import-batches.js";
import type { CandidateTable } from "../services/compose-pipeline.js";

const router = Router();

const ComposeInput = z.object({
  scenario: z.string().min(1),
  block_kind: z.enum(["small", "medium"]).optional(),
  include_batch_ids: z.array(z.number()).optional(),
  schema_ids: z.array(z.number()).optional(),
  instance_id: z.number().int().optional(),
});

// ── POST /api/v1/wide-table-proposals/compose (SSE) ───────────────────────────

router.post("/compose", async (req, res, next) => {
  try {
    const body = ComposeInput.parse(req.body);

    const apiKey = process.env["LLM_API_KEY"] ?? process.env["ANTHROPIC_API_KEY"] ?? "";
    if (!apiKey) {
      return res.status(503).json({
        error: {
          code: "LLM_NOT_CONFIGURED",
          message: "LLM service is not configured. Set ANTHROPIC_API_KEY to use compose.",
        },
      });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    // Build candidate pool
    const candidatePool: CandidateTable[] = [];

    // From specified schema_ids
    const schemaIdSet = new Set(body.schema_ids ?? []);

    // From specified batch_ids — add their schemas
    if (body.include_batch_ids?.length) {
      for (const batchId of body.include_batch_ids) {
        const batch = await batchRepo.getImportBatch(batchId);
        if (batch) {
          for (const sid of batch.schemaIds) schemaIdSet.add(sid);
        }
      }
    }

    // If no specific scope, use all schemas
    const allSchemas = await schemaRepo.listSchemas();
    const schemasToUse = schemaIdSet.size > 0
      ? allSchemas.filter(s => schemaIdSet.has(s.id))
      : allSchemas;

    for (const schema of schemasToUse) {
      try {
        const full = await schemaRepo.getSchemaById(schema.id);
        for (const table of full.tables) {
          candidatePool.push({
            schemaId: schema.id,
            schemaSlug: full.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
            tableName: table.name,
            fields: table.fields.map(f => ({
              name: f.name,
              dataType: f.dataType,
              isPrimaryKey: f.isPrimaryKey,
              isUnique: f.isUnique,
              comment: f.comment,
            })),
          });
        }
      } catch { /* skip */ }
    }

    // Load context
    const [concepts, businessRules, dictEntries] = await Promise.all([
      knowledgeRepo.listConcepts({ status: "approved" }),
      knowledgeRepo.listBusinessRules({ status: "approved" }),
      import("../repositories/naming.js").then(m =>
        m.listNamingEntries(undefined, "approved")
      ),
    ]);

    const { composeWideTable } = await import("../services/compose-pipeline.js");

    for await (const event of composeWideTable(
      body.scenario,
      body.block_kind,
      {
        concepts,
        businessRules,
        dictEntries: dictEntries.map(d => ({ id: d.id, stdName: d.stdName, aliases: d.aliases })),
        candidatePool,
      },
    )) {
      send(event);
    }

    return res.end();
  } catch (e) { next(e); }
});

// ── GET /api/v1/wide-table-proposals ──────────────────────────────────────────

router.get("/", async (req, res, next) => {
  try {
    const status = req.query["status"] as "proposed" | "drafted" | "discarded" | undefined;
    const proposals = await proposalRepo.listWtProposals({ status });
    res.json(proposals);
  } catch (e) { next(e); }
});

// ── GET /api/v1/wide-table-proposals/:id ──────────────────────────────────────

router.get("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params["id"]);
    const proposal = await proposalRepo.getWtProposal(id);
    if (!proposal) return res.status(404).json({ error: { code: "NOT_FOUND", message: "WideTableProposal not found" } });
    return res.json(proposal);
  } catch (e) { next(e); }
});

// ── POST /api/v1/wide-table-proposals/:id/to-draft ────────────────────────────

router.post("/:id/to-draft", async (req, res, next) => {
  try {
    const id = Number(req.params["id"]);
    const proposal = await proposalRepo.getWtProposal(id);
    if (!proposal) return res.status(404).json({ error: { code: "NOT_FOUND", message: "WideTableProposal not found" } });

    const draft = await workspaceRepo.createDraft({
      proposalId: id,
      blockKind: proposal.blockKind,
      name: proposal.name,
      description: proposal.description,
      columns: proposal.columns,
      joinGraph: proposal.joinGraph,
      relationships: proposal.relationships,
      editLog: [],
      versions: [],
      status: "draft",
    });

    // Update proposal status
    await proposalRepo.updateWtProposal(id, { status: "drafted" });

    return res.status(201).json(draft);
  } catch (e) { next(e); }
});

// ── POST /api/v1/wide-table-proposals/:id/discard ─────────────────────────────

router.post("/:id/discard", async (req, res, next) => {
  try {
    const id = Number(req.params["id"]);
    const proposal = await proposalRepo.getWtProposal(id);
    if (!proposal) return res.status(404).json({ error: { code: "NOT_FOUND", message: "WideTableProposal not found" } });
    const updated = await proposalRepo.updateWtProposal(id, { status: "discarded" });
    return res.json(updated);
  } catch (e) { next(e); }
});

export default router;
