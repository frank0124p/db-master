import { Router } from "express";
import * as govRepo from "../repositories/governance.js";
import * as knowledgeRepo from "../repositories/knowledge.js";

const router = Router();

// ── GET /api/v1/catalog/wide-tables ───────────────────────────────────────────

router.get("/wide-tables", async (_req, res, next) => {
  try {
    const governed = await govRepo.listGoverned();
    res.json(governed);
  } catch (e) { next(e); }
});

// ── GET /api/v1/catalog/wide-tables/:slug ─────────────────────────────────────

router.get("/wide-tables/:slug", async (req, res, next) => {
  try {
    const { slug } = req.params as { slug: string };
    const gwt = await govRepo.getGoverned(slug);
    if (!gwt) return res.status(404).json({ error: { code: "NOT_FOUND", message: "GovernedWideTable not found" } });
    return res.json(gwt);
  } catch (e) { next(e); }
});

// ── GET /api/v1/catalog/wide-tables/:slug/markdown ────────────────────────────

router.get("/wide-tables/:slug/markdown", async (req, res, next) => {
  try {
    const { slug } = req.params as { slug: string };
    const md = await govRepo.getMarkdownExport(slug);
    if (!md) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Markdown export not found" } });
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.send(md);
  } catch (e) { next(e); }
});

// ── GET /api/v1/catalog/graph ─────────────────────────────────────────────────

router.get("/graph", async (_req, res, next) => {
  try {
    const graph = await govRepo.getCatalogGraph();
    res.json(graph ?? { generatedAt: null, nodes: [], edges: [] });
  } catch (e) { next(e); }
});

// ── POST /api/v1/catalog/retrieve ────────────────────────────────────────────

router.post("/retrieve", async (req, res, next) => {
  try {
    const { query, top_k = 5, expand_hops = 1 } = req.body as {
      query: string;
      top_k?: number;
      expand_hops?: number;
    };
    if (!query) return res.status(400).json({ error: { code: "BAD_REQUEST", message: "query is required" } });

    const tokens = query
      .split(/[\s,，、。；;]+/)
      .map((t: string) => t.toLowerCase())
      .filter((t: string) => t.length > 0);

    const [governed, concepts, graph] = await Promise.all([
      govRepo.listGoverned(),
      knowledgeRepo.listConcepts({ status: "approved" }),
      govRepo.getCatalogGraph(),
    ]);

    // Score each governed wide table
    const scored = governed.map(gwt => {
      let score = 0;

      // Match against description
      const desc = gwt.description.toLowerCase();
      for (const token of tokens) {
        if (desc.includes(token)) score += 0.5;
      }

      // Match against column definitions + names
      for (const col of gwt.columns) {
        const colText = `${col.name} ${col.definition}`.toLowerCase();
        for (const token of tokens) {
          if (colText.includes(token)) score += 0.3;
        }
      }

      // Match against concept aliases
      const matchedConcepts: string[] = [];
      for (const concept of concepts) {
        const names = [concept.name.toLowerCase(), concept.stdName.toLowerCase(), ...concept.aliases.map(a => a.toLowerCase())];
        if (tokens.some(t => names.some(n => n.includes(t)))) {
          // Check if this concept is used in the gwt
          const used = gwt.columns.some(c => c.conceptId === concept.id);
          if (used) {
            score += 1;
            matchedConcepts.push(concept.stdName);
          }
        }
      }

      // Build graph neighbors
      const neighbors: Array<{ kind: string; target: string; relation?: string; on?: unknown }> = [];
      if (graph && expand_hops > 0) {
        const gwtId = `gwt:${gwt.slug}`;
        for (const edge of graph.edges) {
          if (edge.from === gwtId || edge.to === gwtId) {
            const targetId = edge.from === gwtId ? edge.to : edge.from;
            neighbors.push({
              kind: edge.kind,
              target: targetId,
              ...(edge.meta ?? {}),
            });
          }
        }
      }

      return { gwt, score, matchedConcepts, neighbors };
    });

    const hits = scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, top_k)
      .map(s => ({
        wideTable: {
          slug: s.gwt.slug,
          name: s.gwt.name,
          description: s.gwt.description,
        },
        score: s.score,
        matchedConcepts: s.matchedConcepts,
        columns: s.gwt.columns.map(c => ({
          name: c.name,
          definition: c.definition,
          source: `${c.source.tableName}.${c.source.fieldName}`,
        })),
        neighbors: s.neighbors,
      }));

    return res.json({ query, hits });
  } catch (e) { next(e); }
});

// ── Governance Reports ────────────────────────────────────────────────────────

router.get("/governance/reports/:id", async (req, res, next) => {
  try {
    const id = Number(req.params["id"]);
    const report = await govRepo.getReport(id);
    if (!report) return res.status(404).json({ error: { code: "NOT_FOUND", message: "ValidationReport not found" } });
    return res.json(report);
  } catch (e) { next(e); }
});

router.get("/governance/reports", async (req, res, next) => {
  try {
    const draftId = req.query["draft_id"] ? Number(req.query["draft_id"]) : undefined;
    const reports = await govRepo.listReports({ draftId });
    res.json(reports);
  } catch (e) { next(e); }
});

// ── DataHub push (optional) ───────────────────────────────────────────────────

router.post("/push-datahub", async (req, res, next) => {
  try {
    const { slugs } = req.body as { slugs: string[] };
    const results: unknown[] = [];
    for (const slug of slugs ?? []) {
      const gwt = await govRepo.getGoverned(slug);
      if (!gwt) continue;
      // Reuse existing datahub service
      try {
        // DataHub push is optional — governed wide tables are pushed as schema metadata
        results.push({ slug, result: "DataHub push for governed tables not yet integrated" });
      } catch (e) {
        results.push({ slug, error: String(e) });
      }
    }
    return res.json({ results });
  } catch (e) { next(e); }
});

export default router;
