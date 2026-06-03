import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "../store.js";
import { api, type Table } from "../api.js";
import { useBreakpoint } from "../hooks/useBreakpoint.js";

// ── Layout constants ──────────────────────────────────────────────────────────
const CARD_W = 224;
const COL_GAP = 96;        // horizontal gap between columns — arrows pass through here
const COL_STRIDE = CARD_W + COL_GAP;
const ROW_GAP = 28;
const HEADER_H = 48;
const FIELD_H = 22;
const FOOTER_H = 24;
const PAD = 40;

function cardH(table: Table, expanded: boolean): number {
  return expanded ? HEADER_H + table.fields.length * FIELD_H + FOOTER_H : HEADER_H;
}

// ── Edge types ────────────────────────────────────────────────────────────────
interface GraphEdge {
  fromTable: string; fromField: string;
  toTable: string;   toField: string;
  type: "fk" | "source";
  nullable: boolean;
}

function detectEdges(tables: Table[], visible: Set<number>): GraphEdge[] {
  const edges: GraphEdge[] = [];
  const vis = new Set(tables.filter(t => visible.has(t.id)).map(t => t.name));
  for (const table of tables) {
    if (!visible.has(table.id)) continue;
    for (const f of table.fields) {
      // FK by naming convention
      if (f.name.endsWith("_id") && !f.isPrimaryKey) {
        const stem = f.name.slice(0, -3);
        const ref = tables.find(t => t.name === stem || t.name === `${stem}s` || t.name === `${stem}es`);
        if (ref && vis.has(ref.name)) {
          edges.push({ fromTable: table.name, fromField: f.name, toTable: ref.name, toField: "id", type: "fk", nullable: f.nullable });
        }
      }
      // Source field annotation
      if (f.sourceTable && vis.has(f.sourceTable)) {
        // Deduplicate: only one edge per (fromTable, toTable, type=source)
        const dup = edges.find(e => e.type === "source" && e.fromTable === table.name && e.toTable === f.sourceTable);
        if (!dup) {
          edges.push({ fromTable: table.name, fromField: f.name, toTable: f.sourceTable, toField: f.sourceField ?? "", type: "source", nullable: false });
        }
      }
    }
  }
  return edges;
}

// ── Graph layout ──────────────────────────────────────────────────────────────
interface NodePos { id: number; name: string; x: number; y: number; w: number; h: number; }

function computeLayout(tables: Table[], visible: Set<number>, expanded: Set<number>, edges: GraphEdge[]): Map<number, NodePos> {
  const vis = tables.filter(t => visible.has(t.id));
  if (vis.length === 0) return new Map();

  const nameToId = new Map(vis.map(t => [t.name, t.id]));
  const outN = new Map<number, Set<number>>(vis.map(t => [t.id, new Set()]));
  const inN  = new Map<number, Set<number>>(vis.map(t => [t.id, new Set()]));

  for (const e of edges) {
    const fromId = nameToId.get(e.fromTable);
    const toId   = nameToId.get(e.toTable);
    if (fromId == null || toId == null || fromId === toId) continue;
    // toTable is parent/source → place on LEFT (lower layer)
    // fromTable is child/derived → place on RIGHT (higher layer)
    outN.get(toId)?.add(fromId);
    inN.get(fromId)?.add(toId);
  }

  // Longest-path layer assignment
  const layer = new Map<number, number>(vis.map(t => [t.id, 0]));
  const roots = vis.filter(t => inN.get(t.id)!.size === 0);
  const start = roots.length > 0 ? roots : vis;
  const queue = [...start.map(t => t.id)];
  const done  = new Set<number>();

  while (queue.length) {
    const id = queue.shift()!;
    if (done.has(id)) continue;
    done.add(id);
    const myL = layer.get(id) ?? 0;
    for (const n of outN.get(id) ?? []) {
      layer.set(n, Math.max(layer.get(n) ?? 0, myL + 1));
      queue.push(n);
    }
  }
  const maxL = Math.max(0, ...[...layer.values()]);
  for (const t of vis) if (!done.has(t.id)) layer.set(t.id, maxL + 1);

  // Group by layer, sort alphabetically within each layer
  const byLayer = new Map<number, Table[]>();
  for (const t of vis) {
    const l = layer.get(t.id) ?? 0;
    if (!byLayer.has(l)) byLayer.set(l, []);
    byLayer.get(l)!.push(t);
  }
  for (const ts of byLayer.values()) ts.sort((a, b) => a.name.localeCompare(b.name));

  const pos = new Map<number, NodePos>();
  for (const [l, ts] of [...byLayer].sort(([a], [b]) => a - b)) {
    let y = PAD;
    const x = PAD + l * COL_STRIDE;
    for (const t of ts) {
      const h = cardH(t, expanded.has(t.id));
      pos.set(t.id, { id: t.id, name: t.name, x, y, w: CARD_W, h });
      y += h + ROW_GAP;
    }
  }
  return pos;
}

// ── SVG Edge Overlay ──────────────────────────────────────────────────────────
function EdgeOverlay({ edges, pos, focusedSet }: {
  edges: GraphEdge[];
  pos: Map<number, NodePos>;
  focusedSet: Set<string> | null;
}) {
  const np = new Map<string, NodePos>();
  for (const n of pos.values()) np.set(n.name, n);
  if (np.size === 0) return null;

  const W = Math.max(400, ...[...pos.values()].map(p => p.x + p.w + PAD));
  const H = Math.max(300, ...[...pos.values()].map(p => p.y + p.h + PAD));

  return (
    <svg style={{ position: "absolute", left: 0, top: 0, width: W, height: H, pointerEvents: "none", overflow: "visible" }}>
      <defs>
        <marker id="arr-fk"   markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="var(--accent)" /></marker>
        <marker id="arr-fkn"  markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="rgba(123,140,255,0.45)" /></marker>
        <marker id="arr-src"  markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="#34d399" /></marker>
      </defs>
      {edges.map((edge, i) => {
        const from = np.get(edge.fromTable);
        const to   = np.get(edge.toTable);
        if (!from || !to) return null;

        const active = focusedSet === null || focusedSet.has(edge.fromTable) || focusedSet.has(edge.toTable);
        const isSrc  = edge.type === "source";
        const color  = isSrc ? "#34d399" : edge.nullable ? "rgba(123,140,255,0.45)" : "var(--accent)";
        const marker = isSrc ? "arr-src" : edge.nullable ? "arr-fkn" : "arr-fk";

        // from = child (right column), to = parent/source (left column)
        // Edge: child LEFT side → parent RIGHT side
        const fromCY = from.y + from.h * 0.5;
        const toCY   = to.y   + to.h   * 0.5;

        let x1: number, y1: number, x2: number, y2: number, cp1x: number, cp2x: number;

        if (from.x >= to.x + to.w) {
          // Normal: child is to the right
          x1 = from.x;          y1 = fromCY;
          x2 = to.x + to.w + 8; y2 = toCY;
          const sp = Math.max(44, (x1 - x2) * 0.42);
          cp1x = x1 - sp; cp2x = x2 + sp;
        } else if (to.x >= from.x + from.w) {
          // Parent is to the right (reversed — unusual with our layout)
          x1 = from.x + from.w; y1 = fromCY;
          x2 = to.x - 8;        y2 = toCY;
          const sp = Math.max(44, (x2 - x1) * 0.42);
          cp1x = x1 + sp; cp2x = x2 - sp;
        } else {
          // Same column — arc around left side
          x1 = from.x; y1 = fromCY;
          x2 = to.x;   y2 = toCY;
          const offset = -(72 + i * 12);
          cp1x = x1 + offset; cp2x = x2 + offset;
        }

        return (
          <g key={i} opacity={active ? 1 : 0.1} style={{ transition: "opacity 0.15s" }}>
            <path
              d={`M ${x1} ${y1} C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2}`}
              stroke={color} strokeWidth={isSrc ? 1.5 : 2}
              strokeDasharray={!isSrc && edge.nullable ? "5 3" : "none"}
              fill="none" markerEnd={`url(#${marker})`}
            />
            <text x={(x1 + cp1x) / 2} y={y1 - 5} fontSize={8} fill={color}
              textAnchor="middle" fontFamily="JetBrains Mono, monospace" opacity={0.9}>
              {edge.fromField}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Table Card ────────────────────────────────────────────────────────────────
function TableCard({ table, pos, expanded, dimmed, isRef, isSrc, dragging, onClick, onDragStart }: {
  table: Table; pos: NodePos;
  expanded: boolean; dimmed: boolean;
  isRef: boolean; isSrc: boolean;
  dragging: boolean;
  onClick: () => void;
  onDragStart: (e: React.PointerEvent) => void;
}) {
  const fields = [...table.fields].sort((a, b) => a.position - b.position);

  return (
    <div onClick={onClick} style={{
      position: "absolute", left: pos.x, top: pos.y, width: pos.w,
      borderRadius: 10, overflow: "hidden", cursor: dragging ? "grabbing" : "pointer",
      border: `2px solid ${dimmed ? "rgba(123,140,255,0.1)" : "rgba(123,140,255,0.35)"}`,
      background: "var(--bg-2)",
      opacity: dimmed ? 0.25 : 1,
      transition: dragging ? "border-color 0.15s, opacity 0.15s" : "left 0.22s ease, top 0.22s ease, border-color 0.15s, opacity 0.15s",
      boxShadow: dragging ? "0 8px 32px rgba(0,0,0,0.32)" : !dimmed ? "0 2px 12px rgba(0,0,0,0.18)" : "none",
      zIndex: dragging ? 10 : 1,
      userSelect: "none",
    }}
      onMouseEnter={e => { if (!dimmed) (e.currentTarget as HTMLDivElement).style.borderColor = "var(--accent)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = dimmed ? "rgba(123,140,255,0.1)" : "rgba(123,140,255,0.35)"; }}>

      {/* Header — drag handle */}
      <div onPointerDown={e => { e.stopPropagation(); onDragStart(e); }}
        style={{ padding: "8px 12px", background: "rgba(123,140,255,0.06)", borderBottom: expanded ? "1px solid rgba(123,140,255,0.12)" : "none", display: "flex", alignItems: "flex-start", gap: 6, cursor: dragging ? "grabbing" : "grab" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
            {isRef && <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 4px", borderRadius: 2, background: "rgba(251,191,36,0.18)", color: "var(--warning)" }}>REF</span>}
            {isSrc && <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 4px", borderRadius: 2, background: "rgba(52,211,153,0.15)", color: "#34d399" }}>SRC</span>}
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{table.name}</span>
          </div>
          {table.comment && <div style={{ fontSize: 9, color: "var(--text-3)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{table.comment}</div>}
        </div>
        <span style={{ fontSize: 10, color: "var(--text-3)", flexShrink: 0, marginTop: 2 }}>{expanded ? "▲" : "▼"} {fields.length}</span>
      </div>

      {/* Fields */}
      {expanded && (
        <>
          {fields.map(f => {
            const isPK = f.isPrimaryKey;
            const isFK = f.name.endsWith("_id") && !isPK;
            const hasSrc = !!f.sourceTable;
            return (
              <div key={f.id} style={{ display: "flex", alignItems: "flex-start", gap: 4, padding: "3px 12px", borderTop: "1px solid rgba(123,140,255,0.07)" }}>
                <span style={{ fontSize: 8, fontWeight: 700, width: 18, textAlign: "center", flexShrink: 0, lineHeight: "22px",
                  color: isPK ? "var(--warning)" : isFK ? "var(--accent)" : hasSrc ? "#34d399" : "transparent" }}>
                  {isPK ? "PK" : isFK ? "FK" : hasSrc ? "S" : ""}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: isPK ? "var(--warning)" : isFK ? "var(--accent)" : "var(--text-2)" }}>
                    {f.name}
                  </span>
                  {f.sourceTable && (
                    <div style={{ fontSize: 8, color: "rgba(52,211,153,0.7)", fontFamily: "var(--font-mono)", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      ← {f.sourceTable}{f.sourceField ? `.${f.sourceField}` : ""}
                    </div>
                  )}
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-3)", flexShrink: 0, lineHeight: "22px" }}>
                  {f.dataType.split("(")[0]}
                </span>
              </div>
            );
          })}
          <div style={{ padding: "4px 12px 6px", fontSize: 9, color: "var(--text-3)", borderTop: "1px solid rgba(123,140,255,0.07)" }}>
            {fields.length} 欄位
          </div>
        </>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ErDiagramPage() {
  const { isMobile } = useBreakpoint();
  const { selectedSchemaId, showToast } = useStore();
  const [visible,  setVisible]  = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [focused,  setFocused]  = useState<string | null>(null);
  const [showMermaid, setShowMermaid] = useState(false);
  const [manualPos, setManualPos] = useState<Map<number, { x: number; y: number }>>(new Map());
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const dragRef = useRef<{ tableId: number; startMX: number; startMY: number; origX: number; origY: number } | null>(null);
  const panRef  = useRef<{ startX: number; startY: number; scrollX: number; scrollY: number } | null>(null);
  const didMoveRef = useRef(false);
  const canvasScrollRef = useRef<HTMLDivElement>(null);

  const { data: schema } = useQuery({
    queryKey: ["schema", selectedSchemaId],
    queryFn: () => api.schemas.get(selectedSchemaId!),
    enabled: !!selectedSchemaId,
  });

  useEffect(() => {
    if (schema) {
      setVisible(new Set(schema.tables.map(t => t.id)));
      setExpanded(new Set());
      setFocused(null);
      setManualPos(new Map());
    }
  }, [schema?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Center the canvas view after layout is computed for this schema
  useEffect(() => {
    const el = canvasScrollRef.current;
    if (!el || !schema) return;
    requestAnimationFrame(() => {
      const centerX = el.scrollWidth / 2 - el.clientWidth / 2;
      const centerY = el.scrollHeight / 2 - el.clientHeight / 2;
      el.scrollLeft = Math.max(0, centerX);
      el.scrollTop  = Math.max(0, centerY);
    });
  }, [schema?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleTables = (schema?.tables ?? []).filter(t => visible.has(t.id));
  const edges   = schema ? detectEdges(schema.tables, visible) : [];
  const fkEdges = edges.filter(e => e.type === "fk");
  const srcEdges = edges.filter(e => e.type === "source");

  const autoPositions = computeLayout(schema?.tables ?? [], visible, expanded, edges);

  // Merge auto layout with manual overrides
  const positions = new Map<number, NodePos>();
  for (const [id, p] of autoPositions) {
    const m = manualPos.get(id);
    positions.set(id, m ? { ...p, x: m.x, y: m.y } : p);
  }

  // Extra canvas margin so cards are never at the very edge, and there's room to pan
  const CANVAS_MARGIN = 240;
  const canvasW = (p: Map<number, NodePos>) => Math.max(800, ...[...p.values()].map(n => n.x + n.w + CANVAS_MARGIN));
  const canvasH = (p: Map<number, NodePos>) => Math.max(600, ...[...p.values()].map(n => n.y + n.h + CANVAS_MARGIN));

  function handleDragStart(tableId: number, e: React.PointerEvent) {
    const p = positions.get(tableId);
    if (!p) return;
    dragRef.current = { tableId, startMX: e.clientX, startMY: e.clientY, origX: p.x, origY: p.y };
    didMoveRef.current = false;
    setDraggingId(tableId);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handleBgPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    const el = canvasScrollRef.current;
    if (!el) return;
    panRef.current = { startX: e.clientX, startY: e.clientY, scrollX: el.scrollLeft, scrollY: el.scrollTop };
    didMoveRef.current = false;
    setIsPanning(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (dragRef.current) {
      const { tableId, startMX, startMY, origX, origY } = dragRef.current;
      const newX = Math.max(0, origX + e.clientX - startMX);
      const newY = Math.max(0, origY + e.clientY - startMY);
      setManualPos(prev => { const next = new Map(prev); next.set(tableId, { x: newX, y: newY }); return next; });
      didMoveRef.current = true;
      return;
    }
    if (panRef.current && canvasScrollRef.current) {
      const dx = e.clientX - panRef.current.startX;
      const dy = e.clientY - panRef.current.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didMoveRef.current = true;
      canvasScrollRef.current.scrollLeft = panRef.current.scrollX - dx;
      canvasScrollRef.current.scrollTop  = panRef.current.scrollY - dy;
    }
  }

  function handlePointerUp() {
    dragRef.current = null;
    setDraggingId(null);
    panRef.current = null;
    setIsPanning(false);
  }

  function resetLayout() {
    setManualPos(new Map());
    setExpanded(new Set());
    setFocused(null);
  }

  // Focus mode: set of connected table names
  const focusedSet: Set<string> | null = focused
    ? new Set([focused, ...edges.filter(e => e.fromTable === focused || e.toTable === focused).flatMap(e => [e.fromTable, e.toTable])])
    : null;

  function handleCardClick(table: Table) {
    const connectedNames = new Set([
      table.name,
      ...edges
        .filter(e => e.fromTable === table.name || e.toTable === table.name)
        .flatMap(e => [e.fromTable, e.toTable]),
    ]);

    if (focused === table.name) {
      // Second click: collapse all connected cards and clear focus
      setExpanded(prev => {
        const next = new Set(prev);
        for (const t of visibleTables) { if (connectedNames.has(t.name)) next.delete(t.id); }
        return next;
      });
      setFocused(null);
    } else {
      // First click: expand this card + all directly connected cards, set focus
      setExpanded(prev => {
        const next = new Set(prev);
        for (const t of visibleTables) { if (connectedNames.has(t.name)) next.add(t.id); }
        return next;
      });
      setFocused(table.name);
    }
  }

  function toggleVisible(id: number) {
    setVisible(prev => {
      const next = new Set(prev);
      if (next.has(id)) { if (next.size <= 1) return prev; next.delete(id); }
      else next.add(id);
      return next;
    });
  }

  function buildMermaid(): string {
    const lines = ["erDiagram"];
    for (const t of visibleTables) {
      lines.push(`  ${t.name} {`);
      for (const f of [...t.fields].sort((a, b) => a.position - b.position)) {
        const safeType = f.dataType.replace(/[(),\s]/g, "_");
        lines.push(`    ${safeType} ${f.name}${f.isPrimaryKey ? " PK" : ""}`);
      }
      lines.push("  }");
    }
    for (const e of fkEdges) lines.push(`  ${e.toTable} ||--${e.nullable ? "o{" : "||"} ${e.fromTable} : "${e.fromField}"`);
    return lines.join("\n");
  }

  if (!selectedSchemaId) {
    return <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)" }}>← 從左側選擇一個 Schema</div>;
  }

  const cW = canvasW(positions);
  const cH = canvasH(positions);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Toolbar */}
      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10, background: "var(--bg-2)", flexShrink: 0, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>ER Diagram — {schema?.name}</span>
        <span style={{ fontSize: 11, color: "var(--text-3)" }}>
          {schema ? `${visibleTables.length} tables · ${fkEdges.length} FK · ${srcEdges.length} 來源` : ""}
        </span>
        {focused && (
          <button onClick={() => setFocused(null)}
            style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, border: "1px solid var(--accent)", background: "var(--accent-dim)", color: "var(--accent)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
            ✕ {focused}
          </button>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button className="btn btn-ghost" onClick={() => setExpanded(new Set(visibleTables.map(t => t.id)))}>全展開</button>
          <button className="btn btn-ghost" onClick={() => { setExpanded(new Set()); setFocused(null); }}>全收合</button>
          <button className="btn btn-ghost" onClick={resetLayout} title="清除手動拖拉位置，恢復自動排版">整理版面</button>
          <button className="btn btn-ghost" onClick={() => setShowMermaid(v => !v)}>Mermaid</button>
          <button className="btn btn-ghost" onClick={() => navigator.clipboard.writeText(buildMermaid()).then(() => showToast("✓ Mermaid 已複製"))}>複製</button>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar */}
        {!isMobile && (
          <div style={{ width: 176, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", background: "var(--bg-2)", flexShrink: 0 }}>
            <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Tables</div>
            <div style={{ flex: 1, overflowY: "auto", padding: 6 }}>
              {schema?.tables.map(t => {
                const isRefT = fkEdges.some(e => e.toTable === t.name);
                const isSrcT = srcEdges.some(e => e.toTable === t.name);
                return (
                  <div key={t.id} onClick={() => toggleVisible(t.id)}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 6px", borderRadius: 5, cursor: "pointer", marginBottom: 1 }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "var(--bg-3)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}>
                    <div style={{ width: 12, height: 12, borderRadius: 2, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#fff",
                      border: `1px solid ${visible.has(t.id) ? "var(--accent)" : "var(--border-light)"}`,
                      background: visible.has(t.id) ? "var(--accent)" : "transparent" }}>
                      {visible.has(t.id) ? "✓" : ""}
                    </div>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-2)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                    <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                      {isRefT && <span style={{ fontSize: 7, fontWeight: 700, color: "var(--warning)" }}>REF</span>}
                      {isSrcT && <span style={{ fontSize: 7, fontWeight: 700, color: "#34d399" }}>SRC</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Legend */}
            <div style={{ padding: "8px 10px", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 5 }}>
              {[
                { color: "var(--accent)", dash: false, label: "FK（非空）" },
                { color: "rgba(123,140,255,0.5)", dash: true, label: "FK（可空）" },
                { color: "#34d399", dash: false, label: "來源欄位" },
              ].map(({ color, dash, label }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--text-3)" }}>
                  <svg width={24} height={8} style={{ flexShrink: 0 }}>
                    <line x1="0" y1="4" x2="24" y2="4" stroke={color} strokeWidth={1.5} strokeDasharray={dash ? "4 2" : "none"} />
                  </svg>
                  {label}
                </div>
              ))}
              <div style={{ fontSize: 9, color: "var(--text-3)", lineHeight: 1.5, marginTop: 4 }}>
                點擊卡片展開關聯表，再點收合<br />
                拖拉標題移動卡片<br />
                拖拉空白區域平移畫布
              </div>
            </div>
          </div>
        )}

        {/* Canvas */}
        <div ref={canvasScrollRef}
          style={{ flex: 1, overflow: "auto", background: "var(--bg-1)", position: "relative" }}>
          <div style={{ position: "relative", width: cW, height: cH, minWidth: "100%", minHeight: "100%",
            cursor: isPanning ? "grabbing" : draggingId ? "default" : "grab" }}
            onPointerDown={handleBgPointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onClick={e => { if (e.target === e.currentTarget && !didMoveRef.current) setFocused(null); }}>
            <EdgeOverlay edges={edges} pos={positions} focusedSet={focusedSet} />
            {visibleTables.map(t => {
              const p = positions.get(t.id);
              if (!p) return null;
              const dimmed = focusedSet !== null && !focusedSet.has(t.name);
              return (
                <TableCard
                  key={t.id}
                  table={t}
                  pos={p}
                  expanded={expanded.has(t.id)}
                  dimmed={dimmed}
                  isRef={fkEdges.some(e => e.toTable === t.name)}
                  isSrc={srcEdges.some(e => e.toTable === t.name)}
                  dragging={draggingId === t.id}
                  onClick={() => { if (!didMoveRef.current) handleCardClick(t); }}
                  onDragStart={e => handleDragStart(t.id, e)}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Mermaid panel */}
      {showMermaid && (
        <div style={{ borderTop: "1px solid var(--border)", maxHeight: 200, display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ padding: "6px 14px", background: "var(--bg-3)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 10, color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            <span>Mermaid</span>
            <button onClick={() => setShowMermaid(false)} style={{ background: "transparent", border: "none", color: "var(--text-3)", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>
          <pre style={{ padding: 12, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-2)", overflowX: "auto", overflowY: "auto", lineHeight: 1.6, margin: 0, flex: 1 }}>{buildMermaid()}</pre>
        </div>
      )}
    </div>
  );
}
