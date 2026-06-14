import { Router } from "express";
import { z } from "zod";
import * as repo from "../repositories/knowledge.js";
import { chunkContent } from "../services/knowledge-chunks.js";
import * as minio from "../services/minio.js";
import type { ConceptCard, BusinessRule } from "@schema-studio/core";

const router = Router();

// ── SourceDoc ──────────────────────────────────────────────────────────────────

const CreateSourceDocInput = z.object({
  title: z.string().min(1).max(255),
  format: z.enum(["markdown", "text"]).default("markdown"),
  content: z.string().min(1),
  domain: z.string().optional(),
  originalFilename: z.string().optional(),
  instance_id: z.number().int().optional(),
});

router.post("/sources", async (req, res, next) => {
  try {
    const body = CreateSourceDocInput.parse(req.body);
    const slug = `src-${Date.now()}-${body.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 40)}`;
    const chunks = chunkContent(body.content);

    // Upload original file to Minio if configured
    const ext = body.format === "markdown" ? "md" : "txt";
    const minioRelPath = `knowledge/docs/${slug}.${ext}`;
    let minioKey: string | undefined;
    if (minio.isMinioReady()) {
      try {
        await minio.uploadRaw(
          minioRelPath,
          body.content,
          body.format === "markdown" ? "text/markdown" : "text/plain",
        );
        minioKey = minioRelPath;
      } catch { /* non-blocking */ }
    }

    const doc = await repo.createSourceDoc(
      {
        title: body.title,
        format: body.format,
        content: body.content,
        chunks,
        uploadedBy: (req as { user?: { name?: string } }).user?.name ?? "system",
        ...(body.domain && { domain: body.domain }),
        ...(minioKey && { minioKey }),
        ...(body.originalFilename && { originalFilename: body.originalFilename }),
      },
      slug,
    );
    res.status(201).json(doc);
  } catch (e) { next(e); }
});

router.get("/sources", async (req, res, next) => {
  try {
    const domain = req.query["domain"] as string | undefined;
    let docs = await repo.listSourceDocs();
    if (domain) docs = docs.filter(d => d.domain === domain);
    res.json(docs.map(d => ({ ...d, content: undefined, chunks: d.chunks.length })));
  } catch (e) { next(e); }
});

router.get("/sources/:id", async (req, res, next) => {
  try {
    const id = Number(req.params["id"]);
    const doc = await repo.getSourceDoc(id);
    if (!doc) return res.status(404).json({ error: { code: "NOT_FOUND", message: "SourceDoc not found" } });
    return res.json(doc);
  } catch (e) { next(e); }
});

router.patch("/sources/:id", async (req, res, next) => {
  try {
    const id = Number(req.params["id"]);
    const { title, content, domain } = req.body as { title?: string; content?: string; domain?: string };
    const patch: Record<string, unknown> = {};
    if (title) patch["title"] = title;
    if (domain !== undefined) patch["domain"] = domain;
    if (content !== undefined) {
      patch["content"] = content;
      patch["chunks"] = chunkContent(content);
    }
    const updated = await repo.updateSourceDoc(id, patch as Parameters<typeof repo.updateSourceDoc>[1]);
    if (!updated) return res.status(404).json({ error: { code: "NOT_FOUND", message: "SourceDoc not found" } });
    return res.json({ ...updated, content: undefined, chunks: (updated.chunks as Array<unknown>).length });
  } catch (e) { next(e); }
});

router.delete("/sources/:id", async (req, res, next) => {
  try {
    const id = Number(req.params["id"]);
    const doc = await repo.getSourceDoc(id);
    if (!doc) return res.status(404).json({ error: { code: "NOT_FOUND", message: "SourceDoc not found" } });
    await repo.deleteSourceDoc(id);
    return res.status(204).send();
  } catch (e) { next(e); }
});

// ── Knowledge Extract (SSE) ────────────────────────────────────────────────────

router.post("/sources/:id/extract", async (req, res, next) => {
  try {
    const id = Number(req.params["id"]);
    const doc = await repo.getSourceDoc(id);
    if (!doc) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "SourceDoc not found" } });
    }

    // Check if LLM is configured
    const apiKey = process.env["LLM_API_KEY"] ?? process.env["ANTHROPIC_API_KEY"] ?? "";
    if (!apiKey) {
      return res.status(503).json({
        error: {
          code: "LLM_NOT_CONFIGURED",
          message: "LLM service is not configured. Set ANTHROPIC_API_KEY to enable knowledge extraction.",
        },
      });
    }
    const llmService = await import("../services/knowledge-extract.js");

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    try {
      // Get context for extraction (existing concepts for dedup)
      const existingConcepts = await repo.listConcepts({ status: "approved" });
      const ctx = { existingConcepts };

      let conceptCount = 0;
      let ruleCount = 0;

      send({ type: "chunk-progress", done: 0, total: doc.chunks.length });

      for await (const event of llmService.extractKnowledge(doc, ctx)) {
        if (event.type === "concept-draft") {
          send(event);
          conceptCount++;
        } else if (event.type === "rule-draft") {
          send(event);
          ruleCount++;
        } else if (event.type === "chunk-progress") {
          send(event);
        } else if (event.type === "error") {
          send(event);
        }
      }

      send({ type: "done", conceptCount, ruleCount });
    } catch (err) {
      send({ type: "error", message: String(err) });
    }

    return res.end();
  } catch (e) { next(e); }
});

// ── ConceptCard ────────────────────────────────────────────────────────────────

const CreateConceptInput = z.object({
  name: z.string().min(1).max(100),
  std_name: z.string().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/),
  definition: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  domain: z.string().optional(),
  related_concepts: z.array(z.number()).default([]),
  table_hints: z.array(z.object({
    schema_id: z.number().optional(),
    table_name: z.string(),
    role: z.enum(["ssot", "replica", "reference"]),
    note: z.string().optional(),
  })).default([]),
  naming_dict_ids: z.array(z.number()).default([]),
  source_refs: z.array(z.object({
    doc_id: z.number(),
    chunk_idx: z.number(),
  })).default([]),
  instance_id: z.number().int().optional(),
});

router.get("/concepts", async (req, res, next) => {
  try {
    const status = req.query["status"] as ConceptCard["status"] | undefined;
    const domain = req.query["domain"] as string | undefined;
    const q = req.query["q"] as string | undefined;
    const concepts = await repo.listConcepts({ status, domain, q });
    res.json(concepts);
  } catch (e) { next(e); }
});

router.post("/concepts", async (req, res, next) => {
  try {
    const body = CreateConceptInput.parse(req.body);
    const slug = body.std_name;
    const card = await repo.createConcept({
      slug,
      name: body.name,
      stdName: body.std_name,
      definition: body.definition,
      aliases: body.aliases,
      domain: body.domain,
      relatedConcepts: body.related_concepts,
      tableHints: body.table_hints.map(h => ({
        schemaId: h.schema_id,
        tableName: h.table_name,
        role: h.role,
        note: h.note,
      })),
      namingDictIds: body.naming_dict_ids,
      sourceRefs: body.source_refs.map(r => ({ docId: r.doc_id, chunkIdx: r.chunk_idx })),
      status: "pending",
      reviewers: [],
    });
    res.status(201).json(card);
  } catch (e) { next(e); }
});

router.patch("/concepts/:id", async (req, res, next) => {
  try {
    const id = Number(req.params["id"]);
    const updated = await repo.updateConcept(id, req.body);
    if (!updated) return res.status(404).json({ error: { code: "NOT_FOUND", message: "ConceptCard not found" } });
    return res.json(updated);
  } catch (e) { next(e); }
});

router.post("/concepts/:id/approve", async (req, res, next) => {
  try {
    const id = Number(req.params["id"]);
    const existing = await repo.getConcept(id);
    if (!existing) return res.status(404).json({ error: { code: "NOT_FOUND", message: "ConceptCard not found" } });
    const user = (req as { user?: { id?: number; name?: string; role?: string } }).user;
    if (!user || !["admin", "suite_owner"].includes(user.role ?? "")) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "Only admin or suite_owner can approve" } });
    }
    const updated = await repo.updateConcept(id, {
      status: "approved",
      reviewers: [
        ...existing.reviewers,
        { userId: user.id ?? 0, name: user.name ?? "unknown", signedAt: new Date().toISOString() },
      ],
    });
    return res.json(updated);
  } catch (e) { next(e); }
});

router.post("/concepts/:id/reject", async (req, res, next) => {
  try {
    const id = Number(req.params["id"]);
    const existing = await repo.getConcept(id);
    if (!existing) return res.status(404).json({ error: { code: "NOT_FOUND", message: "ConceptCard not found" } });
    const user = (req as { user?: { id?: number; name?: string; role?: string } }).user;
    if (!user || !["admin", "suite_owner"].includes(user.role ?? "")) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "Only admin or suite_owner can reject" } });
    }
    const updated = await repo.updateConcept(id, { status: "rejected" });
    return res.json(updated);
  } catch (e) { next(e); }
});

router.post("/concepts/:id/reviewers", async (req, res, next) => {
  try {
    const id = Number(req.params["id"]);
    const { user_id, name } = req.body as { user_id: number; name: string };
    const existing = await repo.getConcept(id);
    if (!existing) return res.status(404).json({ error: { code: "NOT_FOUND", message: "ConceptCard not found" } });
    const updated = await repo.updateConcept(id, {
      reviewers: [...existing.reviewers, { userId: user_id, name }],
    });
    return res.json(updated);
  } catch (e) { next(e); }
});

// ── BusinessRule ──────────────────────────────────────────────────────────────

const CreateBizRuleInput = z.object({
  title: z.string().min(1).max(200),
  rule_type: z.enum(["ssot", "constraint", "relationship", "process"]),
  statement: z.string().min(1),
  domain: z.string().optional(),
  machine: z.union([
    z.object({
      kind: z.literal("ssot_declaration"),
      concept_id: z.number(),
      ssot_table: z.object({ schema_id: z.number(), table_name: z.string() }),
    }),
    z.object({
      kind: z.literal("field_constraint"),
      field_pattern: z.string(),
      requirement: z.string(),
      check_type: z.enum(["must_have_concept", "must_declare_sensitivity", "must_have_dict_entry", "must_not_exist"]).optional(),
    }),
  ]).optional(),
  source_refs: z.array(z.object({ doc_id: z.number(), chunk_idx: z.number() })).default([]),
  instance_id: z.number().int().optional(),
  /** Studio/governance RuleDefinition IDs that enforce this business rule */
  schema_rule_ids: z.array(z.string()).optional(),
});

router.get("/business-rules", async (req, res, next) => {
  try {
    const status = req.query["status"] as BusinessRule["status"] | undefined;
    const domain = req.query["domain"] as string | undefined;
    let rules = await repo.listBusinessRules({ status });
    if (domain) rules = rules.filter(r => r.domain === domain);
    res.json(rules);
  } catch (e) { next(e); }
});

router.post("/business-rules", async (req, res, next) => {
  try {
    const body = CreateBizRuleInput.parse(req.body);
    const slug = `rule-${Date.now()}-${body.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 40)}`;
    let machine: BusinessRule["machine"];
    if (body.machine?.kind === "ssot_declaration") {
      machine = {
        kind: "ssot_declaration",
        conceptId: body.machine.concept_id,
        ssotTable: {
          schemaId: body.machine.ssot_table.schema_id,
          tableName: body.machine.ssot_table.table_name,
        },
      };
    } else if (body.machine?.kind === "field_constraint") {
      const fc: Extract<BusinessRule["machine"], { kind: "field_constraint" }> = {
        kind: "field_constraint",
        fieldPattern: body.machine.field_pattern,
        requirement: body.machine.requirement,
      };
      if (body.machine.check_type) fc.checkType = body.machine.check_type;
      machine = fc;
    }
    const createInput: Parameters<typeof repo.createBusinessRule>[0] = {
      slug,
      title: body.title,
      ruleType: body.rule_type,
      statement: body.statement,
      machine,
      sourceRefs: body.source_refs.map(r => ({ docId: r.doc_id, chunkIdx: r.chunk_idx })),
      status: "pending",
      reviewers: [],
    };
    if (body.domain) createInput.domain = body.domain;
    if (body.schema_rule_ids?.length) createInput.schemaRuleIds = body.schema_rule_ids;
    const rule = await repo.createBusinessRule(createInput);
    res.status(201).json(rule);
  } catch (e) { next(e); }
});

router.patch("/business-rules/:id", async (req, res, next) => {
  try {
    const id = Number(req.params["id"]);
    const updated = await repo.updateBusinessRule(id, req.body);
    if (!updated) return res.status(404).json({ error: { code: "NOT_FOUND", message: "BusinessRule not found" } });
    return res.json(updated);
  } catch (e) { next(e); }
});

router.post("/business-rules/:id/approve", async (req, res, next) => {
  try {
    const id = Number(req.params["id"]);
    const existing = await repo.getBusinessRule(id);
    if (!existing) return res.status(404).json({ error: { code: "NOT_FOUND", message: "BusinessRule not found" } });
    const user = (req as { user?: { id?: number; name?: string; role?: string } }).user;
    if (!user || !["admin", "suite_owner"].includes(user.role ?? "")) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "Only admin or suite_owner can approve" } });
    }
    const updated = await repo.updateBusinessRule(id, {
      status: "approved",
      reviewers: [
        ...existing.reviewers,
        { userId: user.id ?? 0, name: user.name ?? "unknown", signedAt: new Date().toISOString() },
      ],
    });
    return res.json(updated);
  } catch (e) { next(e); }
});

router.post("/business-rules/:id/reject", async (req, res, next) => {
  try {
    const id = Number(req.params["id"]);
    const existing = await repo.getBusinessRule(id);
    if (!existing) return res.status(404).json({ error: { code: "NOT_FOUND", message: "BusinessRule not found" } });
    const user = (req as { user?: { id?: number; name?: string; role?: string } }).user;
    if (!user || !["admin", "suite_owner"].includes(user.role ?? "")) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "Only admin or suite_owner can reject" } });
    }
    const updated = await repo.updateBusinessRule(id, { status: "rejected" });
    return res.json(updated);
  } catch (e) { next(e); }
});

router.post("/business-rules/:id/reviewers", async (req, res, next) => {
  try {
    const id = Number(req.params["id"]);
    const { user_id, name } = req.body as { user_id: number; name: string };
    const existing = await repo.getBusinessRule(id);
    if (!existing) return res.status(404).json({ error: { code: "NOT_FOUND", message: "BusinessRule not found" } });
    const updated = await repo.updateBusinessRule(id, {
      reviewers: [...existing.reviewers, { userId: user_id, name }],
    });
    return res.json(updated);
  } catch (e) { next(e); }
});

// ── Retrieve ──────────────────────────────────────────────────────────────────

router.post("/retrieve", async (req, res, next) => {
  try {
    const { query, top_k = 5 } = req.body as { query: string; top_k?: number };
    if (!query) return res.status(400).json({ error: { code: "BAD_REQUEST", message: "query is required" } });

    // Tokenize: split by whitespace and common separators
    const tokens = query
      .split(/[\s,，、。；;]+/)
      .map((t: string) => t.toLowerCase())
      .filter((t: string) => t.length > 0);

    const [concepts, rules] = await Promise.all([
      repo.listConcepts({ status: "approved" }),
      repo.listBusinessRules({ status: "approved" }),
    ]);

    interface ScoredConcept { score: number; concept: typeof concepts[0] }
    const scored: ScoredConcept[] = concepts.map(c => {
      let score = 0;
      const haystack = [
        c.name.toLowerCase(),
        c.stdName.toLowerCase(),
        ...c.aliases.map((a: string) => a.toLowerCase()),
      ];
      for (const token of tokens) {
        if (haystack.some(h => h.includes(token))) score++;
      }
      return { score, concept: c };
    });

    interface ScoredRule { score: number; rule: typeof rules[0] }
    const scoredRules: ScoredRule[] = rules.map(r => {
      let score = 0;
      const title = r.title.toLowerCase();
      for (const token of tokens) {
        if (title.includes(token) || r.statement.toLowerCase().includes(token)) score++;
      }
      return { score, rule: r };
    });

    const topConcepts = scored
      .filter((s: ScoredConcept) => s.score > 0)
      .sort((a: ScoredConcept, b: ScoredConcept) => b.score - a.score)
      .slice(0, top_k)
      .map((s: ScoredConcept) => s.concept);

    const topRules = scoredRules
      .filter((s: ScoredRule) => s.score > 0)
      .sort((a: ScoredRule, b: ScoredRule) => b.score - a.score)
      .slice(0, top_k)
      .map((s: ScoredRule) => s.rule);

    return res.json({ query, concepts: topConcepts, businessRules: topRules });
  } catch (e) { next(e); }
});

export default router;
