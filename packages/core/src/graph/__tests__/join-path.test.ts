import { describe, it, expect } from "vitest";
import { findJoinPath } from "../join-path.js";
import type { UnifiedGraph, GraphNode, GraphEdge } from "../types.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeGraph(nodes: GraphNode[], edges: GraphEdge[]): UnifiedGraph {
  return {
    version: 2,
    generatedAt: new Date().toISOString(),
    nodes,
    edges,
    stats: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      byKind: {},
    },
  };
}

function tblNode(ref: string): GraphNode {
  return { ref, kind: "table", label: ref, meta: {} };
}

function gwtNode(ref: string): GraphNode {
  return { ref, kind: "governed", label: ref, meta: {} };
}

function fldNode(ref: string): GraphNode {
  return { ref, kind: "field", label: ref, meta: {} };
}

function edge(
  id: string,
  from: string,
  to: string,
  kind: GraphEdge["kind"],
  meta?: Record<string, unknown>,
): GraphEdge {
  const e: GraphEdge = {
    id,
    from,
    to,
    kind,
    provenance: { source: "structure" },
  };
  if (meta !== undefined) e.meta = meta;
  return e;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("findJoinPath", () => {
  // Test 1: Direct FK connection
  it("finds a direct FK join path", () => {
    const tblA = "tbl:mes.lots";
    const tblB = "tbl:mes.process_records";
    const fldA = "fld:mes.lots.id";
    const fldB = "fld:mes.process_records.lot_id";

    const graph = makeGraph(
      [tblNode(tblA), tblNode(tblB), fldNode(fldA), fldNode(fldB)],
      [
        edge("fk:fld:mes.process_records.lot_id->fld:mes.lots.id", fldB, fldA, "fk"),
      ],
    );

    const result = findJoinPath(graph, tblA, tblB);
    expect(result).not.toBeNull();
    expect(result!.cost).toBe(1);
    expect(result!.steps).toHaveLength(1);
    expect(result!.steps[0]!.via).toBe("fk");
    expect(result!.caveats).toHaveLength(0);
  });

  // Test 2: Via gwt (joins_on)
  it("finds a path through a governed wide table via joins_on", () => {
    const tblA = "tbl:wip.lots";
    const tblB = "tbl:test.test_results";
    const gwt = "gwt:yield-analysis";

    const graph = makeGraph(
      [tblNode(tblA), tblNode(tblB), gwtNode(gwt)],
      [
        edge("joins_on:tbl:wip.lots->tbl:test.test_results", tblA, tblB, "joins_on", {
          on: [{ leftField: "lot_id", rightField: "lot_id" }],
        }),
      ],
    );

    const result = findJoinPath(graph, tblA, tblB);
    expect(result).not.toBeNull();
    expect(result!.cost).toBe(1);
    expect(result!.steps[0]!.via).toBe("joins_on");
    expect(result!.caveats).toHaveLength(0);
  });

  // Test 3: Via flows_to (weak path with caveats)
  it("finds a path via flows_to and includes caveats", () => {
    const tblA = "tbl:src.raw_data";
    const tblB = "tbl:dst.clean_data";

    const graph = makeGraph(
      [tblNode(tblA), tblNode(tblB)],
      [
        edge("flows_to:tbl:src.raw_data->tbl:dst.clean_data", tblA, tblB, "flows_to"),
      ],
    );

    const result = findJoinPath(graph, tblA, tblB);
    expect(result).not.toBeNull();
    expect(result!.cost).toBe(2);
    expect(result!.steps[0]!.via).toBe("flows_to");
    expect(result!.caveats).toContain("此段為血緣方向，join 條件需人工確認");
  });

  // Test 4: NOT_CONNECTED (null return)
  it("returns null when no path exists", () => {
    const tblA = "tbl:a.table1";
    const tblB = "tbl:b.table2";

    const graph = makeGraph(
      [tblNode(tblA), tblNode(tblB)],
      [], // no edges
    );

    const result = findJoinPath(graph, tblA, tblB);
    expect(result).toBeNull();
  });

  // Test 5: from === to (empty steps, cost 0)
  it("returns empty steps when from equals to", () => {
    const tblA = "tbl:mes.lots";

    const graph = makeGraph(
      [tblNode(tblA)],
      [],
    );

    const result = findJoinPath(graph, tblA, tblA);
    expect(result).not.toBeNull();
    expect(result!.cost).toBe(0);
    expect(result!.steps).toHaveLength(0);
    expect(result!.caveats).toHaveLength(0);
  });

  // Bonus: maxHops limit respected
  it("respects maxHops limit", () => {
    // Chain of 5 tables connected by flows_to
    const tables = Array.from({ length: 5 }, (_, i) => `tbl:s.t${i}`);
    const nodes = tables.map(t => tblNode(t));
    const edges = tables.slice(0, -1).map((t, i) =>
      edge(`flows_to:${t}->${tables[i + 1]}`, t, tables[i + 1]!, "flows_to"),
    );

    const graph = makeGraph(nodes, edges);

    // maxHops=2 should not find path from t0 to t4 (needs 4 hops)
    const limited = findJoinPath(graph, tables[0]!, tables[4]!, 2);
    expect(limited).toBeNull();

    // maxHops=6 (default) should find it
    const found = findJoinPath(graph, tables[0]!, tables[4]!);
    expect(found).not.toBeNull();
  });
});
