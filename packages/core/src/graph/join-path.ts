/**
 * join-path — Dijkstra-based shortest join path finder for the Unified Graph.
 *
 * Only traverses: fk(w=1), joins_on(w=1), composed_from(w=1), flows_to(w=2)
 * Operates at tbl/gwt level (field-level fk edges are folded to their parent tables).
 * Tie-break: prefer paths that pass through gwt nodes.
 */

import type { UnifiedGraph, GraphEdgeKind } from "./types.js";

// ── Public interfaces ─────────────────────────────────────────────────────────

export interface JoinStep {
  from: string;
  to: string;
  via: GraphEdgeKind;
  on: Array<{ left: string; right: string }>;
  throughGwt?: string;
}

export interface JoinPathResult {
  from: string;
  to: string;
  cost: number;
  steps: JoinStep[];
  caveats: string[];
}

// ── Edge weights ──────────────────────────────────────────────────────────────

const EDGE_WEIGHTS: Partial<Record<GraphEdgeKind, number>> = {
  fk: 1,
  joins_on: 1,
  composed_from: 1,
  flows_to: 2,
};

const TRAVERSABLE_EDGE_KINDS = new Set<GraphEdgeKind>([
  "fk",
  "joins_on",
  "composed_from",
  "flows_to",
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTableRef(ref: string): string | null {
  const kind = ref.split(":")[0];
  if (kind === "tbl" || kind === "gwt") return ref;
  return null;
}

function getParentTableRef(fieldRef: string): string | null {
  // "fld:schemaSlug.tableName.fieldName" → "tbl:schemaSlug.tableName"
  if (!fieldRef.startsWith("fld:")) return null;
  const withoutPrefix = fieldRef.slice(4); // remove "fld:"
  const lastDot = withoutPrefix.lastIndexOf(".");
  if (lastDot === -1) return null;
  return `tbl:${withoutPrefix.slice(0, lastDot)}`;
}

// ── Main algorithm ────────────────────────────────────────────────────────────

/**
 * Find the shortest weighted join path between two table/gwt nodes.
 *
 * @param graph - The unified graph
 * @param from - Source node ref (tbl: or gwt:)
 * @param to - Target node ref (tbl: or gwt:)
 * @param maxHops - Maximum number of hops (default 6)
 * @returns JoinPathResult or null if no path exists
 */
export function findJoinPath(
  graph: UnifiedGraph,
  from: string,
  to: string,
  maxHops = 6,
): JoinPathResult | null {
  // Self-path
  if (from === to) {
    return { from, to, cost: 0, steps: [], caveats: [] };
  }

  // Validate inputs are tbl/gwt refs
  if (!getTableRef(from) || !getTableRef(to)) {
    return null;
  }

  // Build adjacency at tbl/gwt level, folding fld-level fk edges
  // adjacency: tableRef → [ { toRef, kind, weight, on, throughGwt? } ]
  interface AdjEntry {
    toRef: string;
    kind: GraphEdgeKind;
    weight: number;
    on: Array<{ left: string; right: string }>;
    throughGwt?: string;
  }
  const adj = new Map<string, AdjEntry[]>();

  function addAdj(from: string, entry: AdjEntry): void {
    const list = adj.get(from);
    if (list) {
      list.push(entry);
    } else {
      adj.set(from, [entry]);
    }
  }

  for (const edge of graph.edges) {
    const kind = edge.kind as GraphEdgeKind;
    if (!TRAVERSABLE_EDGE_KINDS.has(kind)) continue;
    const weight = EDGE_WEIGHTS[kind] ?? 1;

    if (kind === "fk") {
      // fld → fld: fold to parent tbl → parent tbl
      const fromTbl = getParentTableRef(edge.from);
      const toTbl = getParentTableRef(edge.to);
      if (!fromTbl || !toTbl || fromTbl === toTbl) continue;

      // Extract field names from refs
      const fromField = edge.from.split(".").at(-1) ?? edge.from;
      const toField = edge.to.split(".").at(-1) ?? edge.to;

      addAdj(fromTbl, {
        toRef: toTbl,
        kind: "fk",
        weight,
        on: [{ left: fromField, right: toField }],
      });
      // FK is bidirectional for join purposes
      addAdj(toTbl, {
        toRef: fromTbl,
        kind: "fk",
        weight,
        on: [{ left: toField, right: fromField }],
      });
    } else if (kind === "joins_on") {
      const fromTbl = getTableRef(edge.from);
      const toTbl = getTableRef(edge.to);
      if (!fromTbl || !toTbl) continue;

      const onPairs: Array<{ left: string; right: string }> = [];
      const onMeta = edge.meta?.["on"];
      if (Array.isArray(onMeta)) {
        for (const pair of onMeta) {
          if (
            pair &&
            typeof pair === "object" &&
            "leftField" in pair &&
            "rightField" in pair
          ) {
            onPairs.push({
              left: String((pair as Record<string, unknown>)["leftField"]),
              right: String((pair as Record<string, unknown>)["rightField"]),
            });
          }
        }
      }

      addAdj(fromTbl, { toRef: toTbl, kind: "joins_on", weight, on: onPairs });
      addAdj(toTbl, { toRef: fromTbl, kind: "joins_on", weight, on: onPairs.map(p => ({ left: p.right, right: p.left })) });
    } else if (kind === "composed_from") {
      // gwc → fld: fold to gwt → parent tbl
      if (!edge.from.startsWith("gwc:")) continue;
      const toTbl = getParentTableRef(edge.to);
      if (!toTbl) continue;
      const gwtSlug = edge.from.slice(4).split(".")[0]; // "gwc:slug.col" → "slug"
      if (!gwtSlug) continue;
      const gwtRef = `gwt:${gwtSlug}`;

      addAdj(gwtRef, {
        toRef: toTbl,
        kind: "composed_from",
        weight,
        on: [],
        throughGwt: gwtRef,
      });
      addAdj(toTbl, {
        toRef: gwtRef,
        kind: "composed_from",
        weight,
        on: [],
        throughGwt: gwtRef,
      });
    } else if (kind === "flows_to") {
      const fromTbl = getTableRef(edge.from);
      const toTbl = getTableRef(edge.to);
      if (!fromTbl || !toTbl) continue;

      addAdj(fromTbl, { toRef: toTbl, kind: "flows_to", weight, on: [] });
      // flows_to is directional (blood lineage) — only one direction
    }
  }

  // ── Dijkstra ─────────────────────────────────────────────────────────────

  interface State {
    ref: string;
    cost: number;
    hops: number;
    path: JoinStep[];
    hasGwt: boolean; // for tie-breaking (gwt-containing paths preferred)
    hasFlowsTo: boolean;
  }

  // Priority queue — simple sorted array (graph is small)
  const queue: State[] = [
    { ref: from, cost: 0, hops: 0, path: [], hasGwt: from.startsWith("gwt:"), hasFlowsTo: false },
  ];

  // Best cost seen for each node
  const best = new Map<string, number>();
  best.set(from, 0);

  while (queue.length > 0) {
    // Pop minimum cost (sort each time — acceptable for small graphs)
    queue.sort((a, b) => {
      if (a.cost !== b.cost) return a.cost - b.cost;
      // Tie-break: prefer gwt paths
      if (a.hasGwt !== b.hasGwt) return a.hasGwt ? -1 : 1;
      return 0;
    });

    const state = queue.shift()!;

    if (state.ref === to) {
      const caveats: string[] = [];
      if (state.hasFlowsTo) {
        caveats.push("此段為血緣方向，join 條件需人工確認");
      }
      return {
        from,
        to,
        cost: state.cost,
        steps: state.path,
        caveats,
      };
    }

    if (state.hops >= maxHops) continue;

    const neighbors = adj.get(state.ref) ?? [];
    for (const neighbor of neighbors) {
      const newCost = state.cost + neighbor.weight;
      const prevBest = best.get(neighbor.toRef);

      if (prevBest !== undefined && prevBest <= newCost) continue;
      best.set(neighbor.toRef, newCost);

      const step: JoinStep = {
        from: state.ref,
        to: neighbor.toRef,
        via: neighbor.kind,
        on: neighbor.on,
        ...(neighbor.throughGwt ? { throughGwt: neighbor.throughGwt } : {}),
      };

      queue.push({
        ref: neighbor.toRef,
        cost: newCost,
        hops: state.hops + 1,
        path: [...state.path, step],
        hasGwt: state.hasGwt || neighbor.toRef.startsWith("gwt:"),
        hasFlowsTo: state.hasFlowsTo || neighbor.kind === "flows_to",
      });
    }
  }

  return null; // no path found
}
