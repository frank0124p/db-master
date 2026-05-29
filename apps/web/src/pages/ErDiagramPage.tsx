import { useState, useEffect, useRef, useLayoutEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "../store.js";
import { api, type SchemaDetail, type Table, type Field } from "../api.js";
import { useBreakpoint } from "../hooks/useBreakpoint.js";

// ── Mermaid builder (kept as reference) ───────────────────────────────────────

function buildMermaid(schema: SchemaDetail, visible: Set<number>): string {
  const lines = ["erDiagram"];
  const relations: string[] = [];
  for (const table of schema.tables) {
    if (!visible.has(table.id)) continue;
    lines.push(`  ${table.name} {`);
    for (const f of [...table.fields].sort((a, b) => a.position - b.position)) {
      const pkMark = f.isPrimaryKey ? " PK" : "";
      const safeType = f.dataType.replace(/[()]/g, "_").replace(/,/g, "").replace(/\s/g, "_");
      lines.push(`    ${safeType} ${f.name}${pkMark}`);
    }
    lines.push("  }");
    for (const f of table.fields) {
      if (!f.name.endsWith("_id") || f.isPrimaryKey) continue;
      const refName = f.name.slice(0, -3);
      const ref = schema.tables.find(t => t.name === refName || t.name === `${refName}s` || t.name === `${refName}es`);
      if (ref && visible.has(ref.id)) {
        const rel = f.nullable ? "||--o{" : "||--||";
        relations.push(`  ${ref.name} ${rel} ${table.name} : "${f.name}"`);
      }
    }
  }
  lines.push("");
  for (const r of relations) lines.push(r);
  return lines.join("\n");
}

// ── FK detection ──────────────────────────────────────────────────────────────

interface FkEdge { fromTable: string; fromField: string; toTable: string; nullable: boolean }

function detectFkEdges(tables: Table[], visible: Set<number>): FkEdge[] {
  const edges: FkEdge[] = [];
  const visibleNames = new Set(tables.filter(t => visible.has(t.id)).map(t => t.name));
  for (const table of tables) {
    if (!visible.has(table.id)) continue;
    for (const f of table.fields) {
      if (!f.name.endsWith("_id") || f.isPrimaryKey) continue;
      const refName = f.name.slice(0, -3);
      const ref = tables.find(t => t.name === refName || t.name === `${refName}s` || t.name === `${refName}es`);
      if (ref && visibleNames.has(ref.name)) {
        edges.push({ fromTable: table.name, fromField: f.name, toTable: ref.name, nullable: f.nullable });
      }
    }
  }
  return edges;
}

// ── Table Card ────────────────────────────────────────────────────────────────

function TableCard({ table, isFkTarget, highlighted, cardRef }: {
  table: Table; isFkTarget: boolean; highlighted: boolean; cardRef: (el: HTMLDivElement | null) => void;
}) {
  const fields = [...table.fields].sort((a, b) => a.position - b.position);
  const accentColor = isFkTarget ? "var(--warning)" : "var(--accent)";
  const accentAlpha = isFkTarget ? "rgba(251,191,36," : "rgba(123,140,255,";

  return (
    <div ref={cardRef}
      data-table={table.name}
      style={{
        borderRadius: 10, minWidth: 180, maxWidth: 240, flexShrink: 0,
        border: `2px solid ${highlighted ? accentColor : (isFkTarget ? "rgba(251,191,36,0.4)" : "rgba(123,140,255,0.4)")}`,
        background: highlighted ? `${accentAlpha}0.1)` : `${accentAlpha}0.04)`,
        overflow: "hidden",
        transition: "border-color 0.15s, background 0.15s",
        boxShadow: highlighted ? `0 0 0 2px ${accentColor}44` : "none",
      }}>
      {/* Header */}
      <div style={{ padding: "8px 14px", background: `${accentAlpha}0.1)`, borderBottom: `1px solid ${accentAlpha}0.2)` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {isFkTarget && (
            <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: "rgba(251,191,36,0.2)", color: "var(--warning)", flexShrink: 0 }}>REF</span>
          )}
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{table.name}</span>
        </div>
        {table.comment && (
          <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{table.comment}</div>
        )}
      </div>
      {/* Fields */}
      <div style={{ maxHeight: 240, overflowY: "auto" }}>
        {fields.map(f => <FieldRow key={f.id} field={f} />)}
      </div>
      <div style={{ padding: "4px 14px 8px", fontSize: 10, color: "var(--text-3)", borderTop: "1px solid var(--border)" }}>
        {fields.length} 個欄位
      </div>
    </div>
  );
}

function FieldRow({ field }: { field: Field }) {
  const isFkField = field.name.endsWith("_id") && !field.isPrimaryKey;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 14px" }}>
      {field.isPrimaryKey ? (
        <span style={{ fontSize: 9, fontWeight: 700, color: "var(--warning)", flexShrink: 0, width: 16, textAlign: "center" }}>PK</span>
      ) : isFkField ? (
        <span style={{ fontSize: 9, fontWeight: 700, color: "var(--accent)", flexShrink: 0, width: 16, textAlign: "center" }}>FK</span>
      ) : (
        <span style={{ width: 16, flexShrink: 0 }} />
      )}
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        color: field.isPrimaryKey ? "var(--warning)" : isFkField ? "var(--accent)" : "var(--text-2)",
      }}>{field.name}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)", flexShrink: 0 }}>
        {field.dataType.split("(")[0]}
      </span>
    </div>
  );
}

// ── SVG Arrow Overlay ─────────────────────────────────────────────────────────

interface ArrowProps { edges: FkEdge[]; cardEls: Map<string, DOMRect>; containerRect: DOMRect | null }

function ArrowOverlay({ edges, cardEls, containerRect }: ArrowProps) {
  if (!containerRect) return null;

  // Count how many edges exit/enter each (table, side) slot to distribute y positions
  const exitCount  = new Map<string, number>(); // key = "tableName:side"
  const enterCount = new Map<string, number>();
  const exitIdx    = new Map<number, number>(); // edge index → slot index
  const enterIdx   = new Map<number, number>();

  // First pass: determine sides and assign slot indices
  const sideInfo = edges.map((edge, i) => {
    const fromRect = cardEls.get(edge.fromTable);
    const toRect   = cardEls.get(edge.toTable);
    if (!fromRect || !toRect) return null;
    const fx = fromRect.left - containerRect.left + fromRect.width / 2;
    const tx = toRect.left   - containerRect.left + toRect.width  / 2;
    const fromSide = fx <= tx ? "right" : "left";
    const toSide   = fx <= tx ? "left"  : "right";
    const exitKey  = `${edge.fromTable}:${fromSide}`;
    const entKey   = `${edge.toTable}:${toSide}`;
    const ei = exitCount.get(exitKey)  ?? 0; exitCount.set(exitKey,  ei + 1); exitIdx.set(i, ei);
    const en = enterCount.get(entKey)  ?? 0; enterCount.set(entKey, en + 1); enterIdx.set(i, en);
    return { fromSide, toSide, exitKey, entKey };
  });

  return (
    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" }}>
      <defs>
        <marker id="arrow-solid" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="var(--accent)" />
        </marker>
        <marker id="arrow-dashed" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="rgba(123,140,255,0.5)" />
        </marker>
      </defs>
      {edges.map((edge, i) => {
        const fromRect = cardEls.get(edge.fromTable);
        const toRect   = cardEls.get(edge.toTable);
        if (!fromRect || !toRect || !sideInfo[i]) return null;

        const { fromSide, exitKey, entKey } = sideInfo[i]!;
        const totalExit  = exitCount.get(exitKey)  ?? 1;
        const totalEnter = enterCount.get(entKey)  ?? 1;
        const ei = exitIdx.get(i)  ?? 0;
        const en = enterIdx.get(i) ?? 0;

        const HEADER_H = 36; // card header height px
        const GAP = 4;

        // Distribute y within the usable card body (below header)
        const fromBodyH = Math.max(fromRect.height - HEADER_H, 24);
        const toBodyH   = Math.max(toRect.height   - HEADER_H, 24);
        const fromY0 = fromRect.top - containerRect.top + HEADER_H;
        const toY0   = toRect.top   - containerRect.top + HEADER_H;

        const slot = (total: number, idx: number, bodyH: number, y0: number) => {
          const step = Math.max((bodyH - GAP * 2) / (total + 1), 16);
          return y0 + GAP + step * (idx + 1);
        };

        const y1 = slot(totalExit,  ei, fromBodyH, fromY0);
        const y2 = slot(totalEnter, en, toBodyH,   toY0);

        let x1: number, x2: number, cx1: number, cx2: number;

        if (fromSide === "right") {
          x1 = fromRect.right - containerRect.left;
          x2 = toRect.left    - containerRect.left - 8;
          const spread = Math.max(50, Math.abs(x2 - x1) * 0.45);
          cx1 = x1 + spread; cx2 = x2 - spread;
        } else if (fromSide === "left") {
          x1 = fromRect.left  - containerRect.left;
          x2 = toRect.right   - containerRect.left + 8;
          const spread = Math.max(50, Math.abs(x1 - x2) * 0.45);
          cx1 = x1 - spread; cx2 = x2 + spread;
        } else {
          // same horizontal center — route below/above
          x1 = fromRect.left - containerRect.left + fromRect.width / 2;
          x2 = toRect.left   - containerRect.left + toRect.width  / 2;
          const offset = 40 + ei * 20;
          cx1 = x1 - offset; cx2 = x2 - offset;
        }

        const isDashed = edge.nullable;
        const color = isDashed ? "rgba(123,140,255,0.55)" : "var(--accent)";

        return (
          <g key={i}>
            <path
              d={`M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`}
              stroke={color}
              strokeWidth={isDashed ? 1.5 : 2}
              strokeDasharray={isDashed ? "5 3" : "none"}
              fill="none"
              markerEnd={`url(#${isDashed ? "arrow-dashed" : "arrow-solid"})`}
            />
            <text
              x={(x1 + cx1) / 2} y={y1 - 4}
              fontSize={9} fill="var(--text-3)" textAnchor="middle"
              fontFamily="JetBrains Mono, monospace"
            >{edge.fromField}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ErDiagramPage() {
  const { isMobile } = useBreakpoint();
  const { selectedSchemaId, showToast } = useStore();
  const [visible, setVisible] = useState<Set<number>>(new Set());
  const [showMermaid, setShowMermaid] = useState(false);
  const [highlighted, setHighlighted] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const cardElsRef = useRef<Map<string, DOMRect>>(new Map());
  const [, forceUpdate] = useState(0);

  const { data: schema } = useQuery({
    queryKey: ["schema", selectedSchemaId],
    queryFn: () => api.schemas.get(selectedSchemaId!),
    enabled: !!selectedSchemaId,
  });

  useEffect(() => {
    if (schema && visible.size === 0) setVisible(new Set(schema.tables.map(t => t.id)));
  }, [schema]);

  const visibleTables = (schema?.tables ?? []).filter(t => visible.has(t.id));
  const edges = schema ? detectFkEdges(schema.tables, visible) : [];
  const fkTargetNames = new Set(edges.map(e => e.toTable));
  const mermaidCode = schema ? buildMermaid(schema, visible) : "";

  // Measure card positions after layout
  const measureCards = useCallback(() => {
    if (!containerRef.current) return;
    const map = new Map<string, DOMRect>();
    containerRef.current.querySelectorAll<HTMLDivElement>("[data-table]").forEach(el => {
      const name = el.dataset["table"];
      if (name) map.set(name, el.getBoundingClientRect());
    });
    cardElsRef.current = map;
    forceUpdate(n => n + 1);
  }, []);

  useLayoutEffect(() => {
    measureCards();
  }, [visibleTables.length, visible.size]);

  // Re-measure on scroll / resize
  useEffect(() => {
    const el = containerRef.current?.parentElement;
    if (!el) return;
    const obs = new ResizeObserver(measureCards);
    obs.observe(el);
    el.addEventListener("scroll", measureCards);
    return () => { obs.disconnect(); el.removeEventListener("scroll", measureCards); };
  }, [measureCards]);

  function toggleTable(id: number) {
    setVisible(prev => {
      const next = new Set(prev);
      if (next.has(id)) { if (next.size <= 1) return prev; next.delete(id); }
      else next.add(id);
      return next;
    });
  }

  function copyMermaid() {
    navigator.clipboard.writeText(mermaidCode).then(() => showToast("✓ Mermaid 原始碼已複製"));
  }

  if (!selectedSchemaId) {
    return <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)" }}>← 從左側選擇一個 Schema</div>;
  }

  const containerRect = containerRef.current?.getBoundingClientRect() ?? null;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Toolbar */}
      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, background: "var(--bg-2)", flexShrink: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>ER Diagram — {schema?.name}</span>
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>
          {schema ? `${visibleTables.length} 張表 · ${edges.length} 個 FK 關聯` : ""}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setShowMermaid(v => !v)}>
            {showMermaid ? "隱藏 Mermaid" : "Mermaid 語法"}
          </button>
          <button className="btn btn-ghost" onClick={copyMermaid}>複製程式碼</button>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar */}
        {!isMobile && (
          <div style={{ width: 200, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", background: "var(--bg-2)", flexShrink: 0 }}>
            <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.5px" }}>顯示的 Tables</div>
            <div style={{ padding: 8, flex: 1, overflowY: "auto" }}>
              {schema?.tables.map(t => {
                const isTarget = fkTargetNames.has(t.name);
                return (
                  <div key={t.id} onClick={() => toggleTable(t.id)}
                    onMouseEnter={e => { setHighlighted(t.name); (e.currentTarget as HTMLDivElement).style.background = "var(--bg-3)"; }}
                    onMouseLeave={e => { setHighlighted(null); (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 6px", borderRadius: "var(--radius)", cursor: "pointer" }}>
                    <div style={{ width: 14, height: 14, borderRadius: 3, border: `1px solid ${visible.has(t.id) ? "var(--accent)" : "var(--border-light)"}`, background: visible.has(t.id) ? "var(--accent)" : "var(--bg-4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, flexShrink: 0, color: "#fff" }}>
                      {visible.has(t.id) ? "✓" : ""}
                    </div>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-2)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                    {isTarget && <span style={{ fontSize: 9, fontWeight: 700, color: "var(--warning)", flexShrink: 0 }}>REF</span>}
                  </div>
                );
              })}
            </div>
            {/* Legend */}
            <div style={{ padding: "10px 12px", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 2 }}>圖例</div>
              {[
                { label: "PK", color: "var(--warning)", desc: "主鍵" },
                { label: "FK", color: "var(--accent)", desc: "外鍵" },
                { label: "REF", color: "var(--warning)", desc: "被參照" },
              ].map(({ label, color, desc }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--text-3)" }}>
                  <span style={{ fontWeight: 700, color, minWidth: 24 }}>{label}</span>{desc}
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--text-3)" }}>
                <div style={{ width: 24, height: 0, borderTop: "2px solid var(--accent)" }} />實線 FK
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--text-3)" }}>
                <div style={{ width: 24, height: 0, borderTop: "2px dashed rgba(123,140,255,0.5)" }} />虛線可空
              </div>
            </div>
          </div>
        )}

        {/* Main canvas */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Card diagram */}
          <div style={{ flex: 1, overflow: "auto", padding: 32, position: "relative" }}>
            <div ref={containerRef} style={{ display: "flex", flexWrap: "wrap", gap: 32, alignItems: "flex-start", position: "relative", minHeight: 200 }}>
              {visibleTables.map(t => (
                <TableCard
                  key={t.id}
                  table={t}
                  isFkTarget={fkTargetNames.has(t.name)}
                  highlighted={highlighted === t.name}
                  cardRef={el => {
                    if (el) {
                      // track for hover highlight
                    }
                  }}
                />
              ))}
              <ArrowOverlay
                edges={edges}
                cardEls={cardElsRef.current}
                containerRect={containerRect}
              />
            </div>
          </div>

          {/* Mermaid code panel */}
          {showMermaid && (
            <div style={{ borderTop: "1px solid var(--border)", maxHeight: 240, display: "flex", flexDirection: "column", flexShrink: 0 }}>
              <div style={{ padding: "7px 14px", background: "var(--bg-3)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", flexShrink: 0 }}>
                <span>Mermaid 原始碼（參考）</span>
                <button onClick={copyMermaid} style={{ padding: "2px 8px", borderRadius: 3, border: "none", fontSize: 11, cursor: "pointer", background: "var(--bg-4)", color: "var(--text-2)" }}>複製</button>
              </div>
              <pre style={{ padding: 14, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-2)", overflowX: "auto", overflowY: "auto", lineHeight: 1.6, margin: 0, flex: 1 }}>{mermaidCode}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
