import { describe, it, expect } from "vitest";
import { extractSubgraph } from "../subgraph.js";
import type { UnifiedGraph, GraphNode, GraphEdge } from "../../graph/types.js";
import type { LinkingHit } from "../linking.js";

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

function fld(ref: string, label: string): GraphNode {
  return { ref, kind: "field", label, meta: { dataType: "VARCHAR(32)", definition: label } };
}

function tbl(ref: string, label: string, domain?: string): GraphNode {
  const meta: GraphNode["meta"] = { description: label };
  if (domain !== undefined) meta.domain = domain;
  return { ref, kind: "table", label, meta };
}

function gwt(ref: string, label: string): GraphNode {
  return { ref, kind: "governed", label, meta: { description: label } };
}

function gwc(ref: string, label: string): GraphNode {
  return { ref, kind: "governed-column", label, meta: { dataType: "VARCHAR(32)", definition: label } };
}

function edge(
  from: string,
  to: string,
  kind: GraphEdge["kind"],
  meta?: Record<string, unknown>,
): GraphEdge {
  if (meta !== undefined) {
    return { id: `${kind}:${from}->${to}`, from, to, kind, meta, provenance: { source: "structure" } };
  }
  return { id: `${kind}:${from}->${to}`, from, to, kind, provenance: { source: "structure" } };
}

function hit(ref: string, score: number): LinkingHit {
  return { ref, score, reasons: [] };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("extractSubgraph — over-budget trimming", () => {
  // Build a graph with 20 field nodes, each with a long definition
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const hits: LinkingHit[] = [];

  const tblNode = tbl("tbl:test.lots", "lots");
  nodes.push(tblNode);

  for (let i = 0; i < 20; i++) {
    const ref = `fld:test.lots.field_${i}`;
    const longDef = "X".repeat(500); // each field adds ~500 chars
    nodes.push({ ref, kind: "field", label: `field_${i}`, meta: { definition: longDef } });
    edges.push(edge("tbl:test.lots", ref, "has_field"));
    hits.push(hit(ref, 20 - i)); // field_0 has highest score
  }

  const graph = makeGraph(nodes, edges);

  it("serialized length stays within token budget", () => {
    const budget = 2000; // tight budget → forces trimming
    const result = extractSubgraph(hits, graph, budget, 12);
    const estimatedTokens = Math.ceil(result.serialized.length / 3);
    expect(estimatedTokens).toBeLessThanOrEqual(budget);
  });

  it("keeps highest-score nodes (field_0 must be present)", () => {
    const budget = 2000;
    const result = extractSubgraph(hits, graph, budget, 12);
    const hasTopNode = result.nodes.some(n => n.ref === "fld:test.lots.field_0");
    expect(hasTopNode).toBe(true);
  });

  it("removes lower-score nodes when over budget", () => {
    const budget = 1000; // very tight
    const result = extractSubgraph(hits, graph, budget, 12);
    const nodeCount = result.nodes.length;
    expect(nodeCount).toBeLessThan(15); // should have been trimmed
  });
});

describe("extractSubgraph — serialized contains 關聯事實", () => {
  it("fk edge appears in 關聯事實 section", () => {
    const nodes: GraphNode[] = [
      fld("fld:mes.process_records.equipment_id", "equipment_id"),
      fld("fld:mes.equipments.id", "id"),
      tbl("tbl:mes.process_records", "process_records"),
      tbl("tbl:mes.equipments", "equipments"),
    ];
    const edges: GraphEdge[] = [
      edge("tbl:mes.process_records", "fld:mes.process_records.equipment_id", "has_field"),
      edge("tbl:mes.equipments", "fld:mes.equipments.id", "has_field"),
      edge("fld:mes.process_records.equipment_id", "fld:mes.equipments.id", "fk"),
    ];
    const graph = makeGraph(nodes, edges);
    const hits: LinkingHit[] = [
      hit("fld:mes.process_records.equipment_id", 2.0),
      hit("fld:mes.equipments.id", 1.5),
    ];

    const result = extractSubgraph(hits, graph, 6000, 12);
    expect(result.serialized).toContain("關聯事實");
    expect(result.serialized).toContain("fk:");
  });

  it("joins_on edge appears in 關聯事實 section", () => {
    const nodes: GraphNode[] = [
      gwt("gwt:yield-analysis", "良率分析"),
      tbl("tbl:mes.process_records", "process_records"),
      tbl("tbl:mes.test_results", "test_results"),
    ];
    const edges: GraphEdge[] = [
      edge("tbl:mes.process_records", "tbl:mes.test_results", "joins_on", {
        on: [{ leftField: "lot_id", rightField: "lot_id" }],
      }),
    ];
    const graph = makeGraph(nodes, edges);
    const hits: LinkingHit[] = [
      hit("gwt:yield-analysis", 3.0),
      hit("tbl:mes.process_records", 2.0),
    ];

    const result = extractSubgraph(hits, graph, 6000, 12);
    expect(result.serialized).toContain("關聯事實");
    expect(result.serialized).toContain("joins_on");
  });
});

describe("extractSubgraph — hop count expansion", () => {
  it("expands 1 hop by default", () => {
    const nodes: GraphNode[] = [
      tbl("tbl:a.t1", "t1", "domainA"),
      tbl("tbl:a.t2", "t2", "domainA"),
      tbl("tbl:a.t3", "t3", "domainA"),
    ];
    const edges: GraphEdge[] = [
      edge("tbl:a.t1", "tbl:a.t2", "joins_on"),
      edge("tbl:a.t2", "tbl:a.t3", "joins_on"),
    ];
    const graph = makeGraph(nodes, edges);
    const hits = [hit("tbl:a.t1", 2.0)];

    const result = extractSubgraph(hits, graph, 6000, 12);
    // 1-hop from t1: should include t2 (direct neighbor), not necessarily t3
    const hasTbl2 = result.nodes.some(n => n.ref === "tbl:a.t2");
    expect(hasTbl2).toBe(true);
  });

  it("expands 2 hops when seeds span >2 domains", () => {
    const nodes: GraphNode[] = [
      tbl("tbl:a.t1", "t1", "domainA"),
      tbl("tbl:b.t2", "t2", "domainB"),
      tbl("tbl:c.t3", "t3", "domainC"),
      tbl("tbl:c.t4", "t4", "domainC"),
    ];
    const edges: GraphEdge[] = [
      edge("tbl:a.t1", "tbl:b.t2", "joins_on"),
      edge("tbl:b.t2", "tbl:c.t3", "joins_on"),
      edge("tbl:c.t3", "tbl:c.t4", "joins_on"),
    ];
    const graph = makeGraph(nodes, edges);
    // Seeds from 3 different domains → 2 hops
    const hits = [
      hit("tbl:a.t1", 3.0),
      hit("tbl:b.t2", 2.0),
      hit("tbl:c.t3", 2.0),
    ];

    const result = extractSubgraph(hits, graph, 6000, 12);
    // With 2 hops from t1 → t2 → t3 → t4 should be reachable
    const hasTbl4 = result.nodes.some(n => n.ref === "tbl:c.t4");
    expect(hasTbl4).toBe(true);
  });
});
