/**
 * Graph API routes — Unified Semantic Graph endpoints
 *
 * GET  /api/v1/graph                        Full UnifiedGraph (?kinds= filter)
 * GET  /api/v1/graph/node/:ref              Single node + all its edges
 * GET  /api/v1/graph/neighborhood           Subgraph expanding N hops from ref
 * GET  /api/v1/graph/join-path              Dijkstra join path between two refs
 * POST /api/v1/graph/rebuild                Force full rebuild (admin/suite_owner)
 * GET  /api/v1/graph/stats                  Node/edge statistics
 */

import { Router } from "express";
import { rebuildFor, readUnifiedGraph } from "../services/graph-builder.js";
import { findJoinPath, redactGraphNodes } from "@schema-studio/core";
import type { UnifiedGraph, GraphNodeKind, GraphEdge, GraphNode } from "@schema-studio/core";
import { getRedactPolicy } from "../repositories/settings.js";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getOrRebuild(): Promise<UnifiedGraph> {
  const existing = await readUnifiedGraph();
  if (existing) return existing;
  return rebuildFor();
}

/**
 * Apply redact policy to a list of nodes, then remove edges whose
 * endpoints were excluded (only needed in 'exclude' mode).
 */
async function applyRedact(
  nodes: GraphNode[],
  edges: UnifiedGraph["edges"],
): Promise<{ nodes: GraphNode[]; edges: UnifiedGraph["edges"] }> {
  const policy = await getRedactPolicy();
  const redacted = redactGraphNodes(nodes, policy);
  if (policy.enabled && policy.mode === "exclude") {
    const keep = new Set(redacted.map(n => n.ref));
    return { nodes: redacted, edges: edges.filter(e => keep.has(e.from) && keep.has(e.to)) };
  }
  return { nodes: redacted, edges };
}

function parseKinds(kindsParam: unknown): Set<GraphNodeKind> | null {
  if (!kindsParam || typeof kindsParam !== "string") return null;
  const kinds = kindsParam.split(",").map(k => k.trim()).filter(Boolean);
  if (kinds.length === 0) return null;
  return new Set(kinds as GraphNodeKind[]);
}

// ── GET /api/v1/graph ─────────────────────────────────────────────────────────

router.get("/", async (req, res, next) => {
  try {
    const graph = await getOrRebuild();
    const kinds = parseKinds(req.query["kinds"]);

    let nodes = graph.nodes;
    let edges = graph.edges;

    if (kinds) {
      nodes = nodes.filter(n => kinds.has(n.kind));
      const filteredRefs = new Set(nodes.map(n => n.ref));
      edges = edges.filter(e => filteredRefs.has(e.from) && filteredRefs.has(e.to));
    }

    const redacted = await applyRedact(nodes, edges);

    return res.json({
      ...graph,
      nodes: redacted.nodes,
      edges: redacted.edges,
      stats: {
        nodeCount: redacted.nodes.length,
        edgeCount: redacted.edges.length,
        byKind: graph.stats.byKind,
      },
    });
  } catch (e) { next(e); }
});

// ── GET /api/v1/graph/stats ───────────────────────────────────────────────────

router.get("/stats", async (_req, res, next) => {
  try {
    const graph = await getOrRebuild();

    const brokenCount = graph.edges.filter(
      e => e.kind === "composed_from" && e.meta?.["broken"] === true,
    ).length;

    return res.json({
      ...graph.stats,
      generatedAt: graph.generatedAt,
      brokenCount,
    });
  } catch (e) { next(e); }
});

// ── GET /api/v1/graph/node/:ref ───────────────────────────────────────────────

router.get("/node/:ref", async (req, res, next) => {
  try {
    const ref = decodeURIComponent(req.params["ref"] as string);
    const graph = await getOrRebuild();

    const node = graph.nodes.find(n => n.ref === ref);
    if (!node) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: `Node not found: ${ref}` } });
    }

    const edges = graph.edges.filter(e => e.from === ref || e.to === ref);

    // Apply redact: if excluded, return 404
    const redacted = await applyRedact([node], edges);
    if (redacted.nodes.length === 0) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: `Node not found: ${ref}` } });
    }

    return res.json({ node: redacted.nodes[0], edges: redacted.edges });
  } catch (e) { next(e); }
});

// ── GET /api/v1/graph/neighborhood ───────────────────────────────────────────

router.get("/neighborhood", async (req, res, next) => {
  try {
    const ref = decodeURIComponent(String(req.query["ref"] ?? ""));
    const hops = Math.min(3, Math.max(1, Number(req.query["hops"] ?? 1)));
    const kinds = parseKinds(req.query["kinds"]);

    if (!ref) {
      return res.status(400).json({ error: { code: "BAD_REQUEST", message: "ref is required" } });
    }

    const graph = await getOrRebuild();

    const centerNode = graph.nodes.find(n => n.ref === ref);
    if (!centerNode) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: `Node not found: ${ref}` } });
    }

    // BFS expansion
    const visitedRefs = new Set<string>([ref]);
    const visitedEdges = new Set<string>();
    let frontier = new Set<string>([ref]);

    for (let hop = 0; hop < hops; hop++) {
      const nextFrontier = new Set<string>();
      for (const edge of graph.edges) {
        if (frontier.has(edge.from) && !visitedRefs.has(edge.to)) {
          nextFrontier.add(edge.to);
          visitedRefs.add(edge.to);
          visitedEdges.add(edge.id);
        } else if (frontier.has(edge.to) && !visitedRefs.has(edge.from)) {
          nextFrontier.add(edge.from);
          visitedRefs.add(edge.from);
          visitedEdges.add(edge.id);
        } else if (frontier.has(edge.from) && visitedRefs.has(edge.to)) {
          visitedEdges.add(edge.id);
        } else if (frontier.has(edge.to) && visitedRefs.has(edge.from)) {
          visitedEdges.add(edge.id);
        }
      }
      frontier = nextFrontier;
    }

    let nodes = graph.nodes.filter(n => visitedRefs.has(n.ref));
    const edges = graph.edges.filter(e => visitedEdges.has(e.id));

    if (kinds) {
      nodes = nodes.filter(n => kinds.has(n.kind));
    }

    return res.json({
      center: ref,
      nodes,
      edges,
    });
  } catch (e) { next(e); }
});

// ── GET /api/v1/graph/join-path ───────────────────────────────────────────────

router.get("/join-path", async (req, res, next) => {
  try {
    const from = decodeURIComponent(String(req.query["from"] ?? ""));
    const to = decodeURIComponent(String(req.query["to"] ?? ""));
    const maxHops = req.query["max_hops"] ? Number(req.query["max_hops"]) : 6;

    if (!from || !to) {
      return res.status(400).json({ error: { code: "BAD_REQUEST", message: "from and to are required" } });
    }

    const graph = await getOrRebuild();
    const result = findJoinPath(graph, from, to, maxHops);

    if (!result) {
      return res.status(404).json({ error: { code: "NOT_CONNECTED", message: `No join path found between ${from} and ${to}` } });
    }

    return res.json(result);
  } catch (e) { next(e); }
});

// ── POST /api/v1/graph/rebuild ────────────────────────────────────────────────

router.post("/rebuild", async (req, res, next) => {
  try {
    // Role check: admin or suite_owner
    // Note: user auth is handled at a higher level; we check req.user if available
    const user = (req as unknown as { user?: { role?: string } }).user;
    if (user && user.role && !["admin", "suite_owner"].includes(user.role)) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "Only admin or suite_owner can trigger manual rebuild" } });
    }

    const graph = await rebuildFor();
    return res.json(graph.stats);
  } catch (e) { next(e); }
});

export default router;
