import { describe, it, expect } from "vitest";
import { normalizeQuery, camelToSnake, fullWidthToHalf } from "../normalize.js";
import { compileSynonyms } from "../synonyms.js";
import { linkQuery } from "../linking.js";
import type { UnifiedGraph, GraphNode, GraphEdge } from "../../graph/types.js";
import type { NamingEntry } from "../../types.js";
import type { ConceptCard } from "../../governance/types.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEntry(
  id: number,
  concept: string,
  stdName: string,
  aliases: string[],
): NamingEntry {
  return {
    id,
    concept,
    stdName,
    aliases,
    domain: "semiconductor",
    tags: [],
    layers: [],
    aiDescription: null,
    description: null,
    updatedAt: "2024-01-01T00:00:00.000Z",
    status: "approved",
    reviewers: [],
  };
}

function makeConceptCard(
  id: number,
  name: string,
  stdName: string,
  aliases: string[],
): ConceptCard {
  return {
    id,
    slug: stdName,
    name,
    stdName,
    definition: `定義：${name}`,
    aliases,
    domain: "semiconductor",
    relatedConcepts: [],
    tableHints: [],
    namingDictIds: [],
    sourceRefs: [],
    status: "approved",
    reviewers: [],
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  };
}

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

function makeFieldNode(ref: string, label: string, definition?: string): GraphNode {
  return {
    ref,
    kind: "field",
    label,
    meta: {
      definition: definition ?? "",
    },
  };
}

function makeGwcNode(ref: string, label: string, sampleValues?: string[]): GraphNode {
  return {
    ref,
    kind: "governed-column",
    label,
    meta: {
      definition: "",
      sampleValues: sampleValues ?? [],
    },
  };
}

function makeConceptNode(ref: string, label: string): GraphNode {
  return { ref, kind: "concept", label, meta: {} };
}

function makeEdge(
  from: string,
  to: string,
  kind: GraphEdge["kind"],
): GraphEdge {
  return {
    id: `${kind}:${from}->${to}`,
    from,
    to,
    kind,
    provenance: { source: "structure" },
  };
}

// ── Normalize tests ───────────────────────────────────────────────────────────

describe("normalizeQuery — camelCase → snake_case", () => {
  it("converts camelCase", () => {
    expect(normalizeQuery("equipmentId")).toBe("equipment_id");
  });

  it("converts PascalCase", () => {
    expect(normalizeQuery("LotId")).toBe("lot_id");
  });

  it("converts complex PascalCase", () => {
    expect(normalizeQuery("YieldRate")).toBe("yield_rate");
  });

  it("leaves snake_case unchanged", () => {
    expect(normalizeQuery("lot_id")).toBe("lot_id");
  });
});

describe("normalizeQuery — full-width to half-width", () => {
  it("converts full-width digits", () => {
    expect(normalizeQuery("批次１２３")).toBe("批次123");
  });

  it("converts full-width letters", () => {
    expect(normalizeQuery("ＬＯＴ")).toBe("lot");
  });

  it("converts full-width space", () => {
    expect(normalizeQuery("設備　保養")).toBe("設備 保養");
  });
});

// ── Synonym multi-to-multi expansion ─────────────────────────────────────────

describe("compileSynonyms — multi-to-multi expansion", () => {
  const dictEntries = [
    makeEntry(1, "批次", "lot_id", ["批次號", "lot_no", "lot_number"]),
    makeEntry(2, "設備", "equip_id", ["equipment_id", "equip_no"]),
  ];
  const concepts: ConceptCard[] = [];

  it("key lot_no maps to lot_id", () => {
    const syn = compileSynonyms(dictEntries, concepts);
    const targets = syn.entries.get("lot_no");
    expect(targets).toBeDefined();
    expect(targets![0]!.stdName).toBe("lot_id");
  });

  it("key 批次 maps to lot_id with weight 0.9", () => {
    const syn = compileSynonyms(dictEntries, concepts);
    const targets = syn.entries.get("批次");
    expect(targets).toBeDefined();
    expect(targets![0]!.weight).toBe(0.9);
  });

  it("stdName itself maps with weight 1.0", () => {
    const syn = compileSynonyms(dictEntries, concepts);
    const targets = syn.entries.get("lot_id");
    expect(targets).toBeDefined();
    expect(targets![0]!.weight).toBe(1.0);
  });

  it("concept card aliases are included", () => {
    const cpt: ConceptCard[] = [
      makeConceptCard(10, "保養記錄", "pm_record", ["保養", "維護保養"]),
    ];
    const syn = compileSynonyms([], cpt);
    const targets = syn.entries.get("保養");
    expect(targets).toBeDefined();
    expect(targets![0]!.stdName).toBe("pm_record");
    expect(targets![0]!.conceptId).toBe(10);
  });
});

// ── Chinese 2/3-gram matching ─────────────────────────────────────────────────

describe("linkQuery — Chinese 2/3-gram matches concept alias", () => {
  const concepts: ConceptCard[] = [
    makeConceptCard(20, "設備保養", "equipment_pm", ["保養", "預防保養"]),
  ];
  const dict = [
    makeEntry(30, "設備", "equip_id", ["設備號"]),
  ];
  const syn = compileSynonyms(dict, concepts);

  const cptNode = makeConceptNode("cpt:equipment_pm", "設備保養");
  const fldNode = makeFieldNode("fld:pm.pm_records.equip_id", "equip_id");
  const edge = makeEdge("fld:pm.pm_records.equip_id", "cpt:equipment_pm", "maps_to_concept");
  const graph = makeGraph([cptNode, fldNode], [edge]);

  it("query 設備保養 hits concept node", () => {
    const result = linkQuery("設備保養", graph, syn);
    const cptHit = result.hits.find(h => h.ref === "cpt:equipment_pm");
    expect(cptHit).toBeDefined();
    expect(cptHit!.score).toBeGreaterThan(0);
  });

  it("query 保養 hits concept because alias matches", () => {
    const result = linkQuery("保養", graph, syn);
    // Should hit the concept node or field via concept propagation
    const hasHit = result.hits.some(h =>
      h.ref === "cpt:equipment_pm" || h.ref === "fld:pm.pm_records.equip_id",
    );
    expect(hasHit).toBe(true);
  });
});

// ── Value-based linking ───────────────────────────────────────────────────────

describe("linkQuery — value token hits sampleValues", () => {
  const syn = compileSynonyms([], []);
  const gwcNode = makeGwcNode(
    "gwc:yield-analysis.equip_id",
    "equip_id",
    ["EQP001", "EQP002", "EQP003"],
  );
  const graph = makeGraph([gwcNode], []);

  it("ALL-CAPS token EQP001 hits node with sampleValues", () => {
    const result = linkQuery("查詢 EQP001 的良率", graph, syn);
    const hit = result.hits.find(h => h.ref === "gwc:yield-analysis.equip_id");
    expect(hit).toBeDefined();
    expect(hit!.score).toBeGreaterThanOrEqual(1.5); // SCORE_VALUE = 1.5
  });

  it("matched value is in matchedValues list", () => {
    const result = linkQuery("查詢 EQP001 的良率", graph, syn);
    const mv = result.matchedValues.find(v => v.token === "EQP001");
    expect(mv).toBeDefined();
  });
});

// ── gwc layer multiplier ──────────────────────────────────────────────────────

describe("linkQuery — gwc layer multiplier applies", () => {
  const dict = [
    makeEntry(1, "批次", "lot_id", ["lot_no"]),
  ];
  const syn = compileSynonyms(dict, []);

  const fldNode = makeFieldNode("fld:tracking.lots.lot_id", "lot_id");
  const gwcNode = makeGwcNode("gwc:yield-analysis.lot_id", "lot_id");
  const graph = makeGraph([fldNode, gwcNode], []);

  it("gwc node scores higher than equivalent fld node", () => {
    const result = linkQuery("lot_id", graph, syn);
    const fldHit = result.hits.find(h => h.ref === "fld:tracking.lots.lot_id");
    const gwcHit = result.hits.find(h => h.ref === "gwc:yield-analysis.lot_id");
    expect(gwcHit).toBeDefined();
    expect(fldHit).toBeDefined();
    expect(gwcHit!.score).toBeGreaterThan(fldHit!.score);
  });
});
