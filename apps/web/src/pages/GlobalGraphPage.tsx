/**
 * GlobalGraphPage — Unified Semantic Graph viewer
 *
 * Fetches from GET /api/v1/graph (UnifiedGraph v2)
 * Two view modes:
 *   - "blood"   (血緣視圖): flows_to + composed_from edges
 *   - "semantic" (語意視圖): maps_to_concept + related_to + joins_on edges
 *
 * Default: renders only tbl/gwt/cpt nodes; clicking a node expands fields via /neighborhood
 * Node side panel: meta + edge list with provenance explanation
 * broken composed_from edges: rendered as red dashed lines
 */

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type LineageEdge,
  type LineageTransformType,
  type UnifiedGraph,
  type UnifiedGraphNode,
  type UnifiedGraphEdge,
  type GraphEdgeKind,
} from "../api.js";
import { useStore } from "../store.js";
import { LineageSvgGraph, LineageLegend, nodeKey, type GraphNode } from "./LineageGraph.js";

// ── i18n labels ───────────────────────────────────────────────────────────────

const LABELS = {
  zh: {
    title: "統一語意圖",
    bloodView: "血緣視圖",
    semanticView: "語意視圖",
    bloodViewDesc: "資料流向：flows_to + composed_from",
    semanticViewDesc: "語意關係：maps_to_concept + related_to + joins_on",
    allDomains: "所有 Domain",
    nodeCount: "節點",
    edgeCount: "邊",
    brokenEdges: "斷鏈",
    generatedAt: "更新於",
    noNodeSelected: "點選節點查看詳情",
    metaTitle: "元資料",
    edgesTitle: "關聯邊",
    close: "✕",
    provenanceLabel: "來源",
    addEdge: "+ 新增關係",
    cancelAdd: "取消",
    switchToQuery: "⇝ 切換查詢模式",
    provenanceSources: {
      "governed-column": (gwtSlug: string) => `寬表 ${gwtSlug} 的欄位血緣`,
      "governed-join": (gwtSlug: string) => `寬表 ${gwtSlug} 的 JOIN 定義`,
      "governed-relationship": (gwtSlug: string) => `寬表 ${gwtSlug} 的關係定義`,
      "fk-inference": (schemaSlug: string) => `Schema ${schemaSlug} FK 推導`,
      "lineage-edge": (edgeId: string) => `血緣邊 ${edgeId}`,
      "concept-hint": (conceptId: string) => `概念 #${conceptId} 提示`,
      "structure": () => "結構定義",
    },
    broken: "斷鏈（來源欄位不存在）",
    nodeKinds: {
      concept: "概念",
      domain: "領域",
      suite: "產品線",
      table: "資料表",
      field: "欄位",
      governed: "治理寬表",
      "governed-column": "治理欄位",
    },
    edgeKinds: {
      has_field: "包含欄位",
      fk: "外鍵",
      joins_on: "JOIN 條件",
      composed_from: "欄位血緣",
      flows_to: "資料流向",
      maps_to_concept: "對應概念",
      related_to: "相關聯",
      belongs_to: "所屬",
    },
  },
  en: {
    title: "Unified Semantic Graph",
    bloodView: "Lineage View",
    semanticView: "Semantic View",
    bloodViewDesc: "Data flow: flows_to + composed_from",
    semanticViewDesc: "Semantic: maps_to_concept + related_to + joins_on",
    allDomains: "All Domains",
    nodeCount: "Nodes",
    edgeCount: "Edges",
    brokenEdges: "Broken",
    generatedAt: "Updated",
    noNodeSelected: "Click a node to see details",
    metaTitle: "Metadata",
    edgesTitle: "Edges",
    close: "✕",
    provenanceLabel: "Source",
    addEdge: "+ Add Edge",
    cancelAdd: "Cancel",
    switchToQuery: "⇝ Switch to Query Mode",
    provenanceSources: {
      "governed-column": (gwtSlug: string) => `Field lineage from GWT ${gwtSlug}`,
      "governed-join": (gwtSlug: string) => `JOIN def from GWT ${gwtSlug}`,
      "governed-relationship": (gwtSlug: string) => `Relationship from GWT ${gwtSlug}`,
      "fk-inference": (schemaSlug: string) => `FK inference from Schema ${schemaSlug}`,
      "lineage-edge": (edgeId: string) => `Lineage edge ${edgeId}`,
      "concept-hint": (conceptId: string) => `Concept #${conceptId} hint`,
      "structure": () => "Structural definition",
    },
    broken: "Broken (source field missing)",
    nodeKinds: {
      concept: "Concept",
      domain: "Domain",
      suite: "Suite",
      table: "Table",
      field: "Field",
      governed: "Governed Table",
      "governed-column": "Governed Column",
    },
    edgeKinds: {
      has_field: "Has Field",
      fk: "Foreign Key",
      joins_on: "Joins On",
      composed_from: "Composed From",
      flows_to: "Flows To",
      maps_to_concept: "Maps to Concept",
      related_to: "Related To",
      belongs_to: "Belongs To",
    },
  },
};

type Lang = "zh" | "en";

// ── View mode types ───────────────────────────────────────────────────────────

type ViewMode = "blood" | "semantic";

const BLOOD_EDGE_KINDS = new Set<GraphEdgeKind>(["flows_to", "composed_from"]);
const SEMANTIC_EDGE_KINDS = new Set<GraphEdgeKind>(["maps_to_concept", "related_to", "joins_on"]);
const TOP_LEVEL_KINDS = new Set(["table", "governed", "concept"]);

// ── Provenance helper ─────────────────────────────────────────────────────────

function formatProvenance(provenance: Record<string, unknown>, labels: typeof LABELS["zh"]): string {
  const src = provenance["source"] as string;
  if (!src) return "未知";
  const fns = labels.provenanceSources;
  switch (src) {
    case "governed-column": return fns["governed-column"](String(provenance["gwtSlug"] ?? ""));
    case "governed-join": return fns["governed-join"](String(provenance["gwtSlug"] ?? ""));
    case "governed-relationship": return fns["governed-relationship"](String(provenance["gwtSlug"] ?? ""));
    case "fk-inference": return fns["fk-inference"](String(provenance["schemaSlug"] ?? ""));
    case "lineage-edge": return fns["lineage-edge"](String(provenance["lineageEdgeId"] ?? ""));
    case "concept-hint": return fns["concept-hint"](String(provenance["conceptId"] ?? ""));
    case "structure": return fns["structure"]();
    default: return src;
  }
}

// ── Node Side Panel ───────────────────────────────────────────────────────────

function NodeSidePanel({
  node,
  edges,
  graphNodes,
  labels,
  onClose,
}: {
  node: UnifiedGraphNode;
  edges: UnifiedGraphEdge[];
  graphNodes: UnifiedGraphNode[];
  labels: typeof LABELS["zh"];
  onClose: () => void;
}) {
  const nodeEdges = edges.filter(e => e.from === node.ref || e.to === node.ref);
  const refToLabel = new Map(graphNodes.map(n => [n.ref, n.label]));

  const inputEdges = nodeEdges.filter(e => e.to === node.ref);
  const outputEdges = nodeEdges.filter(e => e.from === node.ref);

  const metaEntries = Object.entries(node.meta).filter(([, v]) => v !== undefined && v !== null);

  return (
    <div style={{
      width: 280, flexShrink: 0, borderLeft: "1px solid var(--border)",
      background: "var(--bg-2)", overflowY: "auto", display: "flex",
      flexDirection: "column", gap: 0,
    }}>
      {/* Header */}
      <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1)", fontFamily: "var(--font-mono)" }}>{node.label}</div>
          <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2 }}>
            {labels.nodeKinds[node.kind as keyof typeof labels.nodeKinds] ?? node.kind}
            {" · "}<span style={{ fontFamily: "var(--font-mono)", fontSize: 9 }}>{node.ref}</span>
          </div>
        </div>
        <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--text-3)", cursor: "pointer", fontSize: 14, padding: "2px 4px" }}>{labels.close}</button>
      </div>

      {/* Meta */}
      {metaEntries.length > 0 && (
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>{labels.metaTitle}</div>
          {metaEntries.map(([k, v]) => (
            <div key={k} style={{ display: "flex", gap: 6, marginBottom: 4, fontSize: 11 }}>
              <span style={{ color: "var(--text-3)", flexShrink: 0, width: 90, overflow: "hidden", textOverflow: "ellipsis" }}>{k}</span>
              <span style={{ color: "var(--text-2)", fontFamily: typeof v === "string" ? "var(--font-mono)" : "inherit", flex: 1, wordBreak: "break-all" }}>
                {Array.isArray(v) ? (v as string[]).join(", ") : String(v)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Edges */}
      {nodeEdges.length > 0 && (
        <div style={{ padding: "10px 14px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>{labels.edgesTitle} ({nodeEdges.length})</div>

          {inputEdges.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: "var(--accent)", marginBottom: 4 }}>↓ 輸入</div>
              {inputEdges.map(e => {
                const isBroken = e.kind === "composed_from" && e.meta?.["broken"] === true;
                return (
                  <div key={e.id} style={{ marginBottom: 4, padding: "4px 8px", background: isBroken ? "rgba(239,68,68,0.08)" : "var(--bg-3)", borderRadius: 4, borderLeft: `2px solid ${isBroken ? "#ef4444" : "var(--accent)"}` }}>
                    <div style={{ fontSize: 10, color: "var(--text-2)" }}>
                      <span style={{ color: "var(--text-3)", marginRight: 4 }}>{labels.edgeKinds[e.kind] ?? e.kind}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9 }}>{refToLabel.get(e.from) ?? e.from}</span>
                    </div>
                    {isBroken && <div style={{ fontSize: 9, color: "#ef4444", marginTop: 2 }}>{labels.broken}</div>}
                    <div style={{ fontSize: 9, color: "var(--text-3)", marginTop: 2 }}>
                      此關聯來自：{formatProvenance(e.provenance, labels)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {outputEdges.length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: "#34d399", marginBottom: 4 }}>↑ 輸出</div>
              {outputEdges.map(e => {
                const isBroken = e.kind === "composed_from" && e.meta?.["broken"] === true;
                return (
                  <div key={e.id} style={{ marginBottom: 4, padding: "4px 8px", background: isBroken ? "rgba(239,68,68,0.08)" : "var(--bg-3)", borderRadius: 4, borderLeft: `2px solid ${isBroken ? "#ef4444" : "#34d399"}` }}>
                    <div style={{ fontSize: 10, color: "var(--text-2)" }}>
                      <span style={{ color: "var(--text-3)", marginRight: 4 }}>{labels.edgeKinds[e.kind] ?? e.kind}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9 }}>{refToLabel.get(e.to) ?? e.to}</span>
                    </div>
                    {isBroken && <div style={{ fontSize: 9, color: "#ef4444", marginTop: 2 }}>{labels.broken}</div>}
                    <div style={{ fontSize: 9, color: "var(--text-3)", marginTop: 2 }}>
                      此關聯來自：{formatProvenance(e.provenance, labels)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Add Edge Panel (legacy lineage) ───────────────────────────────────────────

function AddEdgePanel({
  schemas,
  onClose,
  onAdd,
}: {
  schemas: { id: number; name: string; domain: string; tables: { id: number; name: string }[] }[];
  onClose: () => void;
  onAdd: (edge: Omit<LineageEdge, "id" | "createdAt">) => void;
}) {
  const [fromSchemaId, setFromSchemaId] = useState<number | "">(schemas[0]?.id ?? "");
  const [fromTableId, setFromTableId] = useState<number | "">("");
  const [toSchemaId, setToSchemaId] = useState<number | "">(schemas[1]?.id ?? schemas[0]?.id ?? "");
  const [toTableId, setToTableId] = useState<number | "">("");
  const [transformType, setTransformType] = useState<LineageTransformType>("direct");
  const [description, setDescription] = useState("");

  const fromSchema = schemas.find(s => s.id === fromSchemaId);
  const toSchema = schemas.find(s => s.id === toSchemaId);

  const sel: React.CSSProperties = {
    background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text-1)",
    padding: "5px 8px", borderRadius: 5, fontSize: 12, fontFamily: "inherit", width: "100%",
  };
  const inp: React.CSSProperties = { ...sel, outline: "none" };
  const lbl: React.CSSProperties = { fontSize: 10, color: "var(--text-3)", display: "block", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.4px" };

  function canSubmit() { return fromSchemaId !== "" && fromTableId !== "" && toSchemaId !== "" && toTableId !== ""; }

  function handleSubmit() {
    if (!canSubmit()) return;
    const fS = schemas.find(s => s.id === fromSchemaId)!;
    const tS = schemas.find(s => s.id === toSchemaId)!;
    const fT = fS.tables.find(t => t.id === fromTableId)!;
    const tT = tS.tables.find(t => t.id === toTableId)!;
    onAdd({
      fromSchemaId: fS.id, fromSchemaName: fS.name, fromDomain: fS.domain || "未分類",
      fromTableId: fT.id, fromTableName: fT.name, fromKind: "table",
      toSchemaId: tS.id, toSchemaName: tS.name, toDomain: tS.domain || "未分類",
      toTableId: tT.id, toTableName: tT.name, toKind: "table",
      transformType, description, source: "manual",
    });
  }

  return (
    <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg-2)", flexShrink: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10, color: "var(--text-1)" }}>新增血緣關係</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
        <div>
          <label style={lbl}>來源 Schema</label>
          <select style={sel} value={fromSchemaId} onChange={e => { setFromSchemaId(Number(e.target.value)); setFromTableId(""); }}>
            {schemas.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>來源 Table</label>
          <select style={sel} value={fromTableId} onChange={e => setFromTableId(Number(e.target.value))}>
            <option value="">— 選擇 —</option>
            {(fromSchema?.tables ?? []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>目標 Schema</label>
          <select style={sel} value={toSchemaId} onChange={e => { setToSchemaId(Number(e.target.value)); setToTableId(""); }}>
            {schemas.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>目標 Table</label>
          <select style={sel} value={toTableId} onChange={e => setToTableId(Number(e.target.value))}>
            <option value="">— 選擇 —</option>
            {(toSchema?.tables ?? []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8, marginBottom: 10 }}>
        <div>
          <label style={lbl}>轉換類型</label>
          <select style={sel} value={transformType} onChange={e => setTransformType(e.target.value as LineageTransformType)}>
            <option value="direct">direct — 直接搬移</option>
            <option value="join">join — JOIN 合併</option>
            <option value="aggregate">aggregate — 聚合計算</option>
            <option value="derived">derived — 衍生欄位</option>
            <option value="filter">filter — 篩選子集</option>
          </select>
        </div>
        <div>
          <label style={lbl}>說明（選填）</label>
          <input style={inp} value={description} onChange={e => setDescription(e.target.value)} placeholder="例：每日 ETL 批次彙整" />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={onClose}>取消</button>
        <button className="btn btn-primary" style={{ fontSize: 11 }} disabled={!canSubmit()} onClick={handleSubmit}>新增</button>
      </div>
    </div>
  );
}

// ── Unified Graph SVG Renderer ────────────────────────────────────────────────

const NODE_W = 160;
const NODE_H = 32;
const COL_GAP = 100;
const ROW_GAP = 12;
const PAD = 30;

type NodePos = { ref: string; x: number; y: number; w: number; h: number };

const EDGE_COLORS: Partial<Record<GraphEdgeKind, string>> = {
  flows_to: "#60a5fa",
  composed_from: "#a78bfa",
  maps_to_concept: "#34d399",
  related_to: "#f59e0b",
  joins_on: "#f87171",
  fk: "var(--accent)",
  has_field: "rgba(123,140,255,0.3)",
  belongs_to: "rgba(123,140,255,0.2)",
};

const NODE_COLORS: Partial<Record<string, string>> = {
  table: "var(--bg-3)",
  governed: "rgba(167,139,250,0.12)",
  concept: "rgba(52,211,153,0.08)",
  domain: "rgba(96,165,250,0.08)",
  suite: "rgba(251,191,36,0.08)",
  field: "var(--bg-3)",
  "governed-column": "rgba(167,139,250,0.08)",
};

const NODE_BORDER: Partial<Record<string, string>> = {
  table: "var(--border)",
  governed: "rgba(167,139,250,0.5)",
  concept: "rgba(52,211,153,0.4)",
  domain: "rgba(96,165,250,0.4)",
  suite: "rgba(251,191,36,0.4)",
  field: "rgba(123,140,255,0.3)",
  "governed-column": "rgba(167,139,250,0.3)",
};

const HEADER_H = 36;
const ROW_START = PAD + HEADER_H + 8;

function schemaSlugFromRef(ref: string): string {
  // tbl:mes-equipment.equipments → mes-equipment
  // gwt:wip-lot-lifecycle-wide → Governed
  // cpt:some-concept → Concept
  if (ref.startsWith("tbl:")) return ref.slice(4).split(".")[0]!;
  if (ref.startsWith("gwt:")) return "Governed";
  return ref.split(":")[0]!;
}

function UnifiedGraphSvg({
  nodes,
  edges,
  selectedRef,
  onSelect,
}: {
  nodes: UnifiedGraphNode[];
  edges: UnifiedGraphEdge[];
  selectedRef: string | null;
  onSelect: (ref: string | null) => void;
}) {
  // Group by schema slug extracted from ref — gives one column per schema
  const grouped = useMemo(() => {
    const groups = new Map<string, UnifiedGraphNode[]>();
    // Sort: governed and concept go last
    const sorted = [...nodes].sort((a, b) => {
      const aG = a.kind === "governed" || a.kind === "concept";
      const bG = b.kind === "governed" || b.kind === "concept";
      if (aG && !bG) return 1;
      if (!aG && bG) return -1;
      return schemaSlugFromRef(a.ref).localeCompare(schemaSlugFromRef(b.ref));
    });
    for (const n of sorted) {
      const key = schemaSlugFromRef(n.ref);
      const list = groups.get(key);
      if (list) list.push(n);
      else groups.set(key, [n]);
    }
    return groups;
  }, [nodes]);

  // Column layout with header labels
  const { positions, colHeaders } = useMemo(() => {
    const pos = new Map<string, NodePos>();
    const headers: { label: string; x: number; colW: number }[] = [];
    let colX = PAD;
    for (const [key, groupNodes] of grouped) {
      let rowY = ROW_START;
      for (const n of groupNodes) {
        pos.set(n.ref, { ref: n.ref, x: colX, y: rowY, w: NODE_W, h: NODE_H });
        rowY += NODE_H + ROW_GAP;
      }
      headers.push({ label: key, x: colX, colW: NODE_W });
      colX += NODE_W + COL_GAP;
    }
    return { positions: pos, colHeaders: headers };
  }, [grouped]);

  const svgW = Math.max(800, PAD * 2 + grouped.size * (NODE_W + COL_GAP));
  const maxRows = Math.max(0, ...[...grouped.values()].map(g => g.length));
  const svgH = Math.max(600, ROW_START + maxRows * (NODE_H + ROW_GAP) + PAD);

  return (
    <div style={{ flex: 1, overflow: "auto", position: "relative", background: "var(--bg-1)" }}>
      <svg width={svgW} height={svgH} style={{ display: "block" }}>
        {/* Column background bands + headers */}
        {colHeaders.map(h => {
          const isGoverned = h.label === "Governed";
          const isConcept = h.label === "concept";
          return (
            <g key={h.label}>
              <rect
                x={h.x - 4} y={PAD - 4} width={h.colW + 8} height={svgH - PAD + 4}
                rx={5}
                fill={isGoverned ? "rgba(167,139,250,0.06)" : isConcept ? "rgba(52,211,153,0.04)" : "var(--bg-2)"}
                stroke={isGoverned ? "rgba(167,139,250,0.25)" : "var(--border)"}
                strokeWidth={1} opacity={0.6}
              />
              <text
                x={h.x + h.colW / 2} y={PAD + 16}
                textAnchor="middle" fontSize={10} fontWeight={700}
                fill={isGoverned ? "#a78bfa" : "var(--text-3)"}
                fontFamily="var(--font-mono)"
                style={{ userSelect: "none" }}
              >
                {h.label.length > 20 ? h.label.slice(0, 19) + "…" : h.label}
              </text>
            </g>
          );
        })}

        {/* Arrow markers */}
        <defs>
          {Object.entries(EDGE_COLORS).map(([kind, color]) => (
            <marker key={kind} id={`arr-${kind}`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L0,6 L6,3 z" fill={color ?? "#888"} />
            </marker>
          ))}
          <marker id="arr-broken" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="#ef4444" />
          </marker>
        </defs>

        {/* Edges (rendered below nodes) */}
        {edges.map(edge => {
          const fromPos = positions.get(edge.from);
          const toPos = positions.get(edge.to);
          if (!fromPos || !toPos) return null;

          const isBroken = edge.kind === "composed_from" && edge.meta?.["broken"] === true;
          const color = isBroken ? "#ef4444" : (EDGE_COLORS[edge.kind] ?? "rgba(123,140,255,0.4)");

          const x1 = fromPos.x + fromPos.w;
          const y1 = fromPos.y + fromPos.h / 2;
          const x2 = toPos.x;
          const y2 = toPos.y + toPos.h / 2;
          const cpOffset = Math.max(40, Math.abs(x2 - x1) * 0.4);

          return (
            <g key={edge.id} opacity={0.7}>
              <path
                d={`M ${x1} ${y1} C ${x1 + cpOffset} ${y1}, ${x2 - cpOffset} ${y2}, ${x2} ${y2}`}
                stroke={color}
                strokeWidth={1.5}
                strokeDasharray={isBroken ? "5 3" : undefined}
                fill="none"
                markerEnd={`url(#arr-${isBroken ? "broken" : edge.kind})`}
              />
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map(node => {
          const pos = positions.get(node.ref);
          if (!pos) return null;
          const isSelected = node.ref === selectedRef;
          const bg = NODE_COLORS[node.kind] ?? "var(--bg-3)";
          const border = NODE_BORDER[node.kind] ?? "var(--border)";

          return (
            <g key={node.ref} onClick={() => onSelect(isSelected ? null : node.ref)} style={{ cursor: "pointer" }}>
              <rect
                x={pos.x} y={pos.y} width={pos.w} height={pos.h}
                rx={5}
                fill={bg}
                stroke={isSelected ? "var(--accent)" : border}
                strokeWidth={isSelected ? 2 : 1}
              />
              <text
                x={pos.x + 8} y={pos.y + pos.h / 2 + 4}
                fontSize={11} fill={node.kind === "governed" ? "#a78bfa" : "var(--text-1)"}
                fontFamily="var(--font-mono)"
                style={{ userSelect: "none" }}
              >
                {node.label.length > 18 ? node.label.slice(0, 17) + "…" : node.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function GlobalGraphPage() {
  const qc = useQueryClient();
  const { showToast, setPage } = useStore();
  const [lang] = useState<Lang>("zh");
  const labels = LABELS[lang];

  const [viewMode, setViewMode] = useState<ViewMode>("blood");
  const [filterDomain, setFilterDomain] = useState("all");
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [expandedRefs, setExpandedRefs] = useState<Set<string>>(new Set());

  // Fetch unified graph
  const { data: graph, isLoading: graphLoading } = useQuery<UnifiedGraph>({
    queryKey: ["unified-graph"],
    queryFn: () => api.graph.get(),
    staleTime: 30_000,
  });

  // Fetch lineage edges (for add-edge panel)
  const { data: lineageEdges = [] } = useQuery({
    queryKey: ["lineage"],
    queryFn: api.lineage.list,
  });

  // Fetch schemas for add-edge panel
  const { data: schemaMetas = [] } = useQuery({ queryKey: ["schemas"], queryFn: () => api.schemas.list() });
  const { data: schemaDetails = [] } = useQuery({
    queryKey: ["schemas-full-lineage"],
    queryFn: async () => Promise.all(schemaMetas.map(m => api.schemas.get(m.id))),
    enabled: schemaMetas.length > 0,
  });

  // Neighborhood expansion query (triggered when user clicks a node)
  const { data: neighborhoodData } = useQuery({
    queryKey: ["graph-neighborhood", selectedRef],
    queryFn: () => selectedRef ? api.graph.neighborhood(selectedRef, 1) : Promise.resolve(null),
    enabled: !!selectedRef,
  });

  const addMut = useMutation({
    mutationFn: (e: Omit<LineageEdge, "id" | "createdAt">) => api.lineage.add(e),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["lineage"] });
      await qc.invalidateQueries({ queryKey: ["unified-graph"] });
      setShowAdd(false);
      showToast("✓ 血緣關係已新增");
    },
  });

  // Compute filtered graph for display
  const { displayNodes, displayEdges } = useMemo(() => {
    if (!graph) return { displayNodes: [], displayEdges: [] };

    const activeEdgeKinds = viewMode === "blood" ? BLOOD_EDGE_KINDS : SEMANTIC_EDGE_KINDS;

    // Start with top-level nodes (tbl/gwt/cpt) + expanded field nodes
    const visibleRefs = new Set<string>();
    for (const node of graph.nodes) {
      if (TOP_LEVEL_KINDS.has(node.kind)) {
        if (filterDomain === "all" || node.meta.domain === filterDomain || !node.meta.domain) {
          visibleRefs.add(node.ref);
        }
      }
    }

    // Add expanded neighborhood nodes
    if (neighborhoodData) {
      for (const n of neighborhoodData.nodes) {
        visibleRefs.add(n.ref);
      }
    }

    const displayNodes = graph.nodes.filter(n => visibleRefs.has(n.ref));
    const displayEdges = graph.edges.filter(
      e => activeEdgeKinds.has(e.kind) && visibleRefs.has(e.from) && visibleRefs.has(e.to),
    );

    return { displayNodes, displayEdges };
  }, [graph, viewMode, filterDomain, neighborhoodData]);

  // Domain filter options
  const domains = useMemo(() => {
    if (!graph) return ["all"];
    const domainSet = new Set<string>();
    for (const node of graph.nodes) {
      if (node.meta.domain) domainSet.add(node.meta.domain);
    }
    return ["all", ...domainSet];
  }, [graph]);

  // Selected node details
  const selectedNode = useMemo(() => {
    if (!selectedRef || !graph) return null;
    return graph.nodes.find(n => n.ref === selectedRef) ?? null;
  }, [selectedRef, graph]);

  const selectedNodeEdges = useMemo(() => {
    if (!selectedRef || !graph) return [];
    return graph.edges.filter(e => e.from === selectedRef || e.to === selectedRef);
  }, [selectedRef, graph]);

  // Graph stats
  const stats = graph?.stats;
  const brokenCount = useMemo(() => {
    if (!graph) return 0;
    return graph.edges.filter(e => e.kind === "composed_from" && e.meta?.["broken"] === true).length;
  }, [graph]);

  const schemaForAdd = schemaDetails.map(s => ({
    id: s.id,
    name: s.name,
    domain: s.domain || "未分類",
    tables: s.tables.map(t => ({ id: t.id, name: t.name })),
  }));

  // Legacy: also build lineage graph nodes for backward-compat rendering
  const legacyNodes = useMemo((): GraphNode[] => {
    const result: GraphNode[] = [];
    const seen = new Set<string>();
    for (const s of schemaDetails) {
      for (const t of s.tables) {
        const k = nodeKey(s.id, t.id, "table");
        if (!seen.has(k)) { seen.add(k); result.push({ schemaId: s.id, schemaName: s.name, domain: s.domain || "未分類", tableId: t.id, tableName: t.name, kind: "table" }); }
      }
    }
    for (const e of lineageEdges) {
      const fromK = nodeKey(e.fromSchemaId, e.fromTableId, e.fromKind ?? "table");
      if (!seen.has(fromK)) { seen.add(fromK); result.push({ schemaId: e.fromSchemaId, schemaName: e.fromSchemaName, domain: e.fromDomain, tableId: e.fromTableId, tableName: e.fromTableName, kind: e.fromKind ?? "table" }); }
      const toK = nodeKey(e.toSchemaId, e.toTableId, e.toKind ?? "table");
      if (!seen.has(toK)) { seen.add(toK); result.push({ schemaId: e.toSchemaId, schemaName: e.toSchemaName, domain: e.toDomain, tableId: e.toTableId, tableName: e.toTableName, kind: e.toKind ?? "table" }); }
    }
    return result;
  }, [schemaDetails, lineageEdges]);

  const legacyVisibleNodes = filterDomain === "all" ? legacyNodes : legacyNodes.filter(n => n.domain === filterDomain);
  const legacyVisibleEdges = filterDomain === "all" ? lineageEdges : lineageEdges.filter(e => e.fromDomain === filterDomain || e.toDomain === filterDomain);

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.lineage.remove(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["lineage"] });
      await qc.invalidateQueries({ queryKey: ["unified-graph"] });
      showToast("✓ 已刪除");
    },
  });

  const [legacySelectedKey, setLegacySelectedKey] = useState<string | null>(null);

  // Use unified graph if available, fallback to legacy for blood view
  const useUnifiedGraph = !!graph && !graphLoading;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", background: "var(--bg-1)" }}>
      {/* Toolbar */}
      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0, display: "flex", alignItems: "center", gap: 10, background: "var(--bg-2)", flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>{labels.title}</span>

        {/* View mode toggle */}
        <div style={{ display: "flex", gap: 2, background: "var(--bg-3)", borderRadius: 6, padding: 2 }}>
          {(["blood", "semantic"] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                padding: "3px 10px", borderRadius: 4, border: "none", cursor: "pointer", fontSize: 11,
                background: viewMode === mode ? "var(--accent)" : "transparent",
                color: viewMode === mode ? "#fff" : "var(--text-2)",
                fontWeight: viewMode === mode ? 700 : 400,
              }}
              title={mode === "blood" ? labels.bloodViewDesc : labels.semanticViewDesc}
            >
              {mode === "blood" ? labels.bloodView : labels.semanticView}
            </button>
          ))}
        </div>

        {/* Domain filter */}
        <select
          style={{ background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text-1)", padding: "4px 8px", borderRadius: 5, fontSize: 11, fontFamily: "inherit" }}
          value={filterDomain} onChange={e => setFilterDomain(e.target.value)}>
          {domains.map(d => <option key={d} value={d}>{d === "all" ? labels.allDomains : d}</option>)}
        </select>

        {/* Stats */}
        {stats && (
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>
            {stats.nodeCount} {labels.nodeCount} · {stats.edgeCount} {labels.edgeCount}
            {brokenCount > 0 && <span style={{ color: "#ef4444", marginLeft: 6 }}>⚠ {brokenCount} {labels.brokenEdges}</span>}
          </span>
        )}

        <div style={{ flex: 1 }} />
        <LineageLegend showSource />
        <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setPage("lineage")}>
          {labels.switchToQuery}
        </button>
        <button className={showAdd ? "btn btn-ghost" : "btn btn-primary"} style={{ fontSize: 12 }}
          onClick={() => setShowAdd(v => !v)}>
          {showAdd ? labels.cancelAdd : labels.addEdge}
        </button>
      </div>

      {showAdd && schemaDetails.length > 0 && (
        <AddEdgePanel
          schemas={schemaForAdd}
          onClose={() => setShowAdd(false)}
          onAdd={e => addMut.mutate(e)}
        />
      )}

      {/* Main content */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {useUnifiedGraph ? (
          <>
            <UnifiedGraphSvg
              nodes={displayNodes}
              edges={displayEdges}
              selectedRef={selectedRef}
              onSelect={setSelectedRef}
            />
            {selectedNode && (
              <NodeSidePanel
                node={selectedNode}
                edges={selectedNodeEdges}
                graphNodes={graph.nodes}
                labels={labels}
                onClose={() => setSelectedRef(null)}
              />
            )}
          </>
        ) : (
          // Fallback: legacy LineageSvgGraph
          <>
            <LineageSvgGraph
              nodes={legacyVisibleNodes}
              edges={legacyVisibleEdges}
              selectedNodeKey={legacySelectedKey}
              onSelectNode={setLegacySelectedKey}
              onDeleteEdge={id => deleteMut.mutate(id)}
            />
          </>
        )}
      </div>
    </div>
  );
}
