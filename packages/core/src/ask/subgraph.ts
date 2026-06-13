/**
 * Ask Pipeline — Subgraph Extraction
 *
 * Pure function: no I/O, no LLM.
 *
 * Algorithm:
 * 1. Take top-K hits as seeds (default 12)
 * 2. Expand via: has_field, fk, joins_on, composed_from, maps_to_concept
 * 3. 1 hop default; if seeds span >2 domains → 2 hops (bridge tables)
 * 4. Token budget: estimate tokens as chars/3, if over limit (default 6000)
 *    drop lowest-score nodes + orphan edges
 * 5. Serialize to the markdown format defined in spec §2
 */

import type { UnifiedGraph, GraphNode, GraphEdge, GraphEdgeKind } from "../graph/types.js";
import type { LinkingHit } from "./linking.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_TOP_K = 12;
const DEFAULT_TOKEN_BUDGET = 6000;

const EXPAND_EDGE_KINDS = new Set<GraphEdgeKind>([
  "has_field",
  "fk",
  "joins_on",
  "composed_from",
  "maps_to_concept",
]);

const JOIN_EDGE_KINDS = new Set<GraphEdgeKind>(["fk", "joins_on"]);

// ── Public types ──────────────────────────────────────────────────────────────

export interface ExtractedSubgraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  serialized: string;
}

// ── Helper: build adjacency ───────────────────────────────────────────────────

function buildAdjacency(
  graph: UnifiedGraph,
): Map<string, Array<{ edge: GraphEdge; neighbor: string }>> {
  const adj = new Map<string, Array<{ edge: GraphEdge; neighbor: string }>>();

  function add(from: string, edge: GraphEdge, neighbor: string): void {
    const list = adj.get(from);
    if (list) {
      list.push({ edge, neighbor });
    } else {
      adj.set(from, [{ edge, neighbor }]);
    }
  }

  for (const edge of graph.edges) {
    if (!EXPAND_EDGE_KINDS.has(edge.kind)) continue;
    add(edge.from, edge, edge.to);
    // Undirected expansion for structural/join edges
    if (
      edge.kind === "fk" ||
      edge.kind === "joins_on" ||
      edge.kind === "composed_from" ||
      edge.kind === "has_field"
    ) {
      add(edge.to, edge, edge.from);
    }
  }

  return adj;
}

// ── Helper: get domain of a node ─────────────────────────────────────────────

function getNodeDomain(node: GraphNode): string | undefined {
  return node.meta.domain as string | undefined;
}

// ── BFS expansion ─────────────────────────────────────────────────────────────

function bfsExpand(
  seedRefs: Set<string>,
  nodeIndex: Map<string, GraphNode>,
  adj: Map<string, Array<{ edge: GraphEdge; neighbor: string }>>,
  maxHops: number,
): { nodes: Map<string, GraphNode>; edges: Map<string, GraphEdge> } {
  const visited = new Map<string, GraphNode>();
  const collectedEdges = new Map<string, GraphEdge>();

  const queue: Array<{ ref: string; hop: number }> = [];
  for (const ref of seedRefs) {
    const node = nodeIndex.get(ref);
    if (node) {
      visited.set(ref, node);
      queue.push({ ref, hop: 0 });
    }
  }

  let qi = 0;
  while (qi < queue.length) {
    const { ref, hop } = queue[qi++]!;
    if (hop >= maxHops) continue;

    const neighbors = adj.get(ref) ?? [];
    for (const { edge, neighbor } of neighbors) {
      collectedEdges.set(edge.id, edge);
      if (!visited.has(neighbor)) {
        const neighborNode = nodeIndex.get(neighbor);
        if (neighborNode) {
          visited.set(neighbor, neighborNode);
          queue.push({ ref: neighbor, hop: hop + 1 });
        }
      }
    }
  }

  return { nodes: visited, edges: collectedEdges };
}

// ── Token budget enforcement ──────────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

/**
 * Trim the node set to fit within the token budget.
 * Keeps highest-score nodes; removes orphan edges.
 */
function applyTokenBudget(
  nodes: Map<string, GraphNode>,
  edges: Map<string, GraphEdge>,
  scoreMap: Map<string, number>,
  serializer: (ns: Map<string, GraphNode>, es: Map<string, GraphEdge>) => string,
  maxBudget: number,
): { nodes: Map<string, GraphNode>; edges: Map<string, GraphEdge>; serialized: string } {
  let serialized = serializer(nodes, edges);
  if (estimateTokens(serialized) <= maxBudget) {
    return { nodes, edges, serialized };
  }

  // Sort nodes by score descending; seeds (score > 0) first
  const sortedRefs = Array.from(nodes.keys()).sort((a, b) => {
    const sa = scoreMap.get(a) ?? 0;
    const sb = scoreMap.get(b) ?? 0;
    return sb - sa;
  });

  // Progressively remove lowest-score nodes
  const trimmedNodes = new Map<string, GraphNode>(nodes);
  const trimmedEdges = new Map<string, GraphEdge>(edges);

  for (let i = sortedRefs.length - 1; i >= 0; i--) {
    const ref = sortedRefs[i]!;
    // Never remove top 3 nodes
    if (i < 3) break;

    trimmedNodes.delete(ref);

    // Remove edges that reference removed nodes (orphan edges)
    for (const [eid, edge] of trimmedEdges) {
      if (!trimmedNodes.has(edge.from) || !trimmedNodes.has(edge.to)) {
        trimmedEdges.delete(eid);
      }
    }

    serialized = serializer(trimmedNodes, trimmedEdges);
    if (estimateTokens(serialized) <= maxBudget) break;
  }

  return { nodes: trimmedNodes, edges: trimmedEdges, serialized };
}

// ── Serialization ─────────────────────────────────────────────────────────────

function serializeSubgraph(
  nodes: Map<string, GraphNode>,
  edges: Map<string, GraphEdge>,
): string {
  const lines: string[] = [];

  // ── § Concepts section ───────────────────────────────────────────────────
  const conceptNodes = Array.from(nodes.values()).filter(n => n.kind === "concept");
  if (conceptNodes.length > 0) {
    lines.push("## 相關概念");
    for (const n of conceptNodes) {
      const def = n.meta.definition ?? n.meta.description ?? "";
      // Find SSOT hint from maps_to_concept edges (reverse)
      const ssotEdges = Array.from(edges.values()).filter(
        e => e.kind === "maps_to_concept" && e.to === n.ref,
      );
      const ssotSources = ssotEdges.map(e => e.from.replace(/^[^:]+:/, "")).join(", ");
      lines.push(`- ${n.label}${def ? `（${def}）` : ""}${ssotSources ? `（SSOT: ${ssotSources}）` : ""}`);
    }
    lines.push("");
  }

  // ── § Candidate assets ────────────────────────────────────────────────────
  const gwtNodes = Array.from(nodes.values()).filter(n => n.kind === "governed");
  const tblNodes = Array.from(nodes.values()).filter(n => n.kind === "table");

  if (gwtNodes.length > 0 || tblNodes.length > 0) {
    lines.push("## 候選資產");
  }

  // Governed wide tables
  for (const gwt of gwtNodes) {
    const desc = gwt.meta.description ?? "";
    const version = gwt.meta.version !== undefined ? `v${gwt.meta.version}` : "";
    const blockKind = gwt.meta.blockKind ?? "";
    lines.push(`### ${gwt.ref} — ${gwt.label}${desc ? ` — ${desc}` : ""}${version ? ` (${blockKind}, ${version})` : ""}`);
    lines.push("| column | type | definition | source |");
    lines.push("|---|---|---|---|");

    // Find gwc columns
    const gwcCols = Array.from(nodes.values()).filter(
      n => n.kind === "governed-column" && n.ref.startsWith(gwt.ref.replace("gwt:", "gwc:")),
    );
    for (const col of gwcCols) {
      const dataType = col.meta.dataType ?? "";
      const def = col.meta.definition ?? "";
      // Find source via composed_from edge
      const sourceEdge = Array.from(edges.values()).find(
        e => e.kind === "composed_from" && e.from === col.ref,
      );
      const source = sourceEdge ? sourceEdge.to.replace(/^fld:/, "") : "";
      const colName = col.ref.split(".").at(-1) ?? col.label;
      lines.push(`| ${colName} | ${dataType} | ${def} | ${source} |`);
    }
    lines.push("");
  }

  // Raw tables
  for (const tbl of tblNodes) {
    const desc = tbl.meta.description ?? "";
    lines.push(`### ${tbl.ref}${desc ? ` — ${desc}` : ""}`);
    lines.push("| field | type | comment | PK | sample |");
    lines.push("|---|---|---|---|---|");

    // Find fields
    const fieldNodes = Array.from(nodes.values()).filter(n => {
      if (n.kind !== "field") return false;
      // Check has_field edge from tbl to this field
      return Array.from(edges.values()).some(
        e => e.kind === "has_field" && e.from === tbl.ref && e.to === n.ref,
      );
    });
    for (const fld of fieldNodes) {
      const dataType = fld.meta.dataType ?? "";
      const def = fld.meta.definition ?? "";
      const pk = fld.meta.isPrimaryKey ? "✓" : "";
      const samples = (fld.meta.sampleValues as string[] | undefined)?.slice(0, 2).join(", ") ?? "";
      const fldName = fld.ref.split(".").at(-1) ?? fld.label;
      lines.push(`| ${fldName} | ${dataType} | ${def} | ${pk} | ${samples} |`);
    }
    lines.push("");
  }

  // ── § Join facts ─────────────────────────────────────────────────────────
  const joinEdges = Array.from(edges.values()).filter(e => JOIN_EDGE_KINDS.has(e.kind));
  if (joinEdges.length > 0) {
    lines.push("## 關聯事實（join 一律以此為準）");
    for (const edge of joinEdges) {
      if (edge.kind === "fk") {
        const fromField = edge.from.split(".").at(-1) ?? edge.from;
        const toField = edge.to.split(".").at(-1) ?? edge.to;
        const fromTbl = edge.from.replace(/\.[^.]+$/, "");
        const toTbl = edge.to.replace(/\.[^.]+$/, "");
        lines.push(`- fk: ${fromTbl}.${fromField} → ${toTbl}.${toField}`);
      } else if (edge.kind === "joins_on") {
        const onPairs = edge.meta?.["on"];
        let onStr = "";
        if (Array.isArray(onPairs) && onPairs.length > 0) {
          onStr = " ON " + onPairs
            .map((p: unknown) => {
              if (p && typeof p === "object" && "leftField" in p && "rightField" in p) {
                const pair = p as Record<string, string>;
                return `${pair["leftField"]} = ${pair["rightField"]}`;
              }
              return "";
            })
            .filter(Boolean)
            .join(" AND ");
        }
        lines.push(`- joins_on(${edge.from}): ${edge.from} ⋈ ${edge.to}${onStr}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ── Main entry ────────────────────────────────────────────────────────────────

/**
 * Extract a subgraph from the unified graph centred on the top linking hits.
 *
 * @param hits          Linking hits from linkQuery (sorted by score)
 * @param graph         Unified semantic graph
 * @param maxTokenBudget Maximum serialized token estimate (default 6000)
 * @param topK          Number of seed hits to use (default 12)
 */
export function extractSubgraph(
  hits: LinkingHit[],
  graph: UnifiedGraph,
  maxTokenBudget = DEFAULT_TOKEN_BUDGET,
  topK = DEFAULT_TOP_K,
): ExtractedSubgraph {
  // Build node index for fast lookups
  const nodeIndex = new Map<string, GraphNode>(
    graph.nodes.map(n => [n.ref, n]),
  );

  // Build adjacency
  const adj = buildAdjacency(graph);

  // Select seed nodes (top-K hits that exist in graph)
  const seeds = hits
    .slice(0, topK)
    .filter(h => nodeIndex.has(h.ref));

  const seedRefs = new Set(seeds.map(s => s.ref));

  // Build score map from hits
  const scoreMap = new Map<string, number>();
  for (const hit of hits) {
    scoreMap.set(hit.ref, hit.score);
  }

  // Determine hop count: 1 hop default; if seeds span >2 domains → 2 hops
  const seedDomains = new Set<string>();
  for (const ref of seedRefs) {
    const node = nodeIndex.get(ref);
    if (node) {
      const domain = getNodeDomain(node);
      if (domain) seedDomains.add(domain);
    }
  }
  const maxHops = seedDomains.size > 2 ? 2 : 1;

  // BFS expansion
  const { nodes, edges } = bfsExpand(seedRefs, nodeIndex, adj, maxHops);

  // Apply token budget
  const result = applyTokenBudget(
    nodes,
    edges,
    scoreMap,
    serializeSubgraph,
    maxTokenBudget,
  );

  return {
    nodes: Array.from(result.nodes.values()),
    edges: Array.from(result.edges.values()),
    serialized: result.serialized,
  };
}
