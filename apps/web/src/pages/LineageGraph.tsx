/**
 * Shared SVG graph components for both GlobalGraphPage and LineagePage.
 */
import { useState, useMemo } from "react";
import type { LineageEdge, LineageNodeKind } from "../api.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GraphNode {
  schemaId: number; schemaName: string; domain: string;
  tableId: number; tableName: string;
  kind: LineageNodeKind;
}

export interface NodePos extends GraphNode {
  x: number; y: number; w: number; h: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const NODE_W = 148;
export const NODE_H = 30;
export const NODE_GAP = 10;
export const COL_GAP = 80;
export const HEADER_H = 32;
export const PAD = 20;

export const TRANSFORM_COLORS: Record<string, string> = {
  direct: "#60a5fa",
  aggregate: "#f59e0b",
  join: "#a78bfa",
  derived: "#34d399",
  filter: "#f87171",
};

export const KIND_COLORS: Record<LineageNodeKind, string> = {
  "table": "var(--bg-3)",
  "wide-table": "rgba(96,165,250,0.1)",
  "governed": "rgba(167,139,250,0.12)",
};

export const KIND_BORDER: Record<LineageNodeKind, string> = {
  "table": "var(--border)",
  "wide-table": "rgba(96,165,250,0.5)",
  "governed": "rgba(167,139,250,0.6)",
};

export const SOURCE_LABELS: Record<string, string> = {
  manual: "手動",
  "wide-table": "寬表",
  governance: "Governance",
  field: "欄位",
};

// ── Layout ────────────────────────────────────────────────────────────────────

export function calcLayout(nodes: GraphNode[]): {
  positioned: NodePos[];
  svgW: number;
  svgH: number;
  domainCols: { domain: string; x: number; colW: number; schemas: { name: string; x: number }[] }[];
} {
  // Special "Governed" domain always goes last
  const domains = [...new Set(nodes.map(n => n.domain))].sort((a, b) => {
    if (a === "Governed") return 1;
    if (b === "Governed") return -1;
    return a.localeCompare(b);
  });

  const positioned: NodePos[] = [];
  const domainCols: { domain: string; x: number; colW: number; schemas: { name: string; x: number }[] }[] = [];
  let curX = PAD;

  for (const domain of domains) {
    const domainNodes = nodes.filter(n => n.domain === domain);
    // Sub-group by schema
    const schemaMap = new Map<string, GraphNode[]>();
    for (const n of domainNodes) {
      const key = `${n.schemaId}:${n.schemaName}`;
      if (!schemaMap.has(key)) schemaMap.set(key, []);
      schemaMap.get(key)!.push(n);
    }

    const domainStartX = curX;
    const schemaInfos: { name: string; x: number }[] = [];

    for (const [, schemaNodes] of schemaMap) {
      const schemaX = curX;
      schemaInfos.push({ name: schemaNodes[0]!.schemaName, x: schemaX });
      let curY = PAD + HEADER_H + NODE_GAP;
      for (const n of schemaNodes) {
        positioned.push({ ...n, x: schemaX, y: curY, w: NODE_W, h: NODE_H });
        curY += NODE_H + NODE_GAP;
      }
      curX += NODE_W + COL_GAP / 2;
    }

    const colW = curX - domainStartX - COL_GAP / 2;
    domainCols.push({ domain, x: domainStartX, colW, schemas: schemaInfos });
    curX += COL_GAP / 2;
  }

  const svgW = Math.max(curX + PAD, 500);
  const maxY = positioned.reduce((m, n) => Math.max(m, n.y + n.h), PAD + HEADER_H + NODE_GAP) + PAD;
  const svgH = Math.max(maxY, 280);
  return { positioned, svgW, svgH, domainCols };
}

export function nodeKey(schemaId: number, tableId: number, kind: LineageNodeKind): string {
  return `${kind}:${schemaId}:${tableId}`;
}

export function edgePath(src: NodePos, tgt: NodePos): string {
  const sx = src.x + src.w;
  const sy = src.y + src.h / 2;
  const tx = tgt.x;
  const ty = tgt.y + tgt.h / 2;
  const cx = (sx + tx) / 2;
  return `M ${sx} ${sy} C ${cx} ${sy} ${cx} ${ty} ${tx} ${ty}`;
}

// ── Legend ────────────────────────────────────────────────────────────────────

export function LineageLegend({ showSource = false }: { showSource?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      {Object.entries(TRANSFORM_COLORS).map(([type, color]) => (
        <div key={type} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 18, height: 2, background: color, borderRadius: 1 }} />
          <span style={{ fontSize: 10, color: "var(--text-3)" }}>{type}</span>
        </div>
      ))}
      {showSource && (
        <>
          <div style={{ width: 1, height: 12, background: "var(--border)" }} />
          {(["table", "wide-table", "governed"] as LineageNodeKind[]).map(k => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 14, height: 10, borderRadius: 2, background: KIND_COLORS[k], border: `1px solid ${KIND_BORDER[k]}` }} />
              <span style={{ fontSize: 10, color: "var(--text-3)" }}>{k}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ── SVG Graph ─────────────────────────────────────────────────────────────────

export function LineageSvgGraph({
  nodes, edges, highlighted = [], selectedNodeKey,
  onSelectNode, onDeleteEdge, compact = false,
}: {
  nodes: GraphNode[];
  edges: LineageEdge[];
  highlighted?: string[];
  selectedNodeKey?: string | null;
  onSelectNode?: (key: string | null) => void;
  onDeleteEdge?: (id: string) => void;
  compact?: boolean;
}) {
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const { positioned, svgW, svgH, domainCols } = useMemo(() => calcLayout(nodes), [nodes]);
  const nodeMap = useMemo(() => {
    const m = new Map<string, NodePos>();
    for (const n of positioned) m.set(nodeKey(n.schemaId, n.tableId, n.kind), n);
    return m;
  }, [positioned]);

  if (positioned.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)", fontSize: 12, padding: 20, textAlign: "center" }}>
        {nodes.length === 0 ? "尚無節點 — 新增血緣關係後圖形會自動出現" : "計算佈局中…"}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflow: "auto", background: "var(--bg-1)" }}>
      <svg width={svgW} height={svgH} style={{ display: "block", minWidth: "100%" }}>
        {/* Domain bands */}
        {domainCols.map(dc => (
          <g key={dc.domain}>
            <rect x={dc.x - 4} y={PAD - 8} width={dc.colW + 8} height={svgH - PAD + 4}
              rx={6} fill={dc.domain === "Governed" ? "rgba(167,139,250,0.06)" : "var(--bg-2)"}
              stroke={dc.domain === "Governed" ? "rgba(167,139,250,0.3)" : "var(--border)"}
              strokeWidth={1} opacity={0.6} />
            <text x={dc.x + dc.colW / 2} y={PAD + 9} textAnchor="middle"
              fontSize={compact ? 9 : 10} fontWeight={700}
              fill={dc.domain === "Governed" ? "#a78bfa" : "var(--text-3)"} letterSpacing="0.6">
              {dc.domain.toUpperCase()}
            </text>
            {!compact && dc.schemas.map(si => (
              <text key={si.name} x={si.x + NODE_W / 2} y={PAD + HEADER_H - 2}
                textAnchor="middle" fontSize={9} fill="var(--text-3)" fontFamily="var(--font-mono)">
                {si.name}
              </text>
            ))}
          </g>
        ))}

        {/* Edges */}
        {edges.map(e => {
          const srcKey = nodeKey(e.fromSchemaId, e.fromTableId, e.fromKind ?? "table");
          const tgtKey = nodeKey(e.toSchemaId, e.toTableId, e.toKind ?? "table");
          const src = nodeMap.get(srcKey);
          const tgt = nodeMap.get(tgtKey);
          if (!src || !tgt) return null;
          const isHighlighted = highlighted.includes(e.id);
          const isHovered = hoverEdge === e.id;
          const color = TRANSFORM_COLORS[e.transformType] ?? "#60a5fa";
          const midX = (src.x + src.w + tgt.x) / 2;
          const midY = (src.y + src.h / 2 + tgt.y + tgt.h / 2) / 2;
          return (
            <g key={e.id}
              onMouseEnter={() => setHoverEdge(e.id)}
              onMouseLeave={() => setHoverEdge(null)}
              style={{ cursor: "pointer" }}>
              <path d={edgePath(src, tgt)} fill="none" stroke="transparent" strokeWidth={12} />
              <path d={edgePath(src, tgt)} fill="none"
                stroke={isHighlighted ? "#fbbf24" : isHovered ? color : "var(--border)"}
                strokeWidth={isHighlighted ? 2.5 : isHovered ? 2 : 1.5}
                strokeDasharray={isHighlighted ? undefined : "4 3"}
                opacity={isHighlighted ? 1 : 0.65} />
              {/* Arrow */}
              {(() => {
                const tx = tgt.x, ty = tgt.y + tgt.h / 2;
                const fill = isHighlighted ? "#fbbf24" : isHovered ? color : "var(--border)";
                return <polygon points={`${tx},${ty} ${tx - 7},${ty - 3.5} ${tx - 7},${ty + 3.5}`} fill={fill} opacity={isHighlighted ? 1 : 0.65} />;
              })()}
              {/* Hover tooltip */}
              {isHovered && !compact && (
                <>
                  <rect x={midX - 26} y={midY - 10} width={52} height={19} rx={9} fill={color} opacity={0.9} />
                  <text x={midX} y={midY + 4} textAnchor="middle" fontSize={9} fill="#fff" fontWeight={700}>{e.transformType}</text>
                  {onDeleteEdge && (
                    <text x={midX + 38} y={midY + 4} textAnchor="middle" fontSize={12} fill="#f87171" fontWeight={700}
                      style={{ cursor: "pointer" }} onClick={() => onDeleteEdge(e.id)}>✕</text>
                  )}
                  {e.description && (
                    <text x={midX} y={midY + 22} textAnchor="middle" fontSize={9} fill="var(--text-2)">
                      {e.description.slice(0, 36)}
                    </text>
                  )}
                  {e.source && e.source !== "manual" && (
                    <text x={midX} y={midY - 16} textAnchor="middle" fontSize={9} fill="var(--text-3)">
                      auto: {e.source}
                    </text>
                  )}
                </>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {positioned.map(n => {
          const key = nodeKey(n.schemaId, n.tableId, n.kind);
          const isSelected = selectedNodeKey === key;
          const isInPath = highlighted.length > 0 && edges.some(e =>
            highlighted.includes(e.id) &&
            ((nodeKey(e.fromSchemaId, e.fromTableId, e.fromKind ?? "table") === key) ||
             (nodeKey(e.toSchemaId, e.toTableId, e.toKind ?? "table") === key))
          );
          const bg = isInPath ? "rgba(251,191,36,0.15)" : isSelected ? "var(--accent-dim)" : KIND_COLORS[n.kind];
          const border = isInPath ? "#fbbf24" : isSelected ? "var(--accent)" : KIND_BORDER[n.kind];
          const kindIcon = n.kind === "wide-table" ? "⊞ " : n.kind === "governed" ? "◆ " : "";
          const displayName = (kindIcon + n.tableName).length > 17
            ? (kindIcon + n.tableName).slice(0, 15) + "…"
            : kindIcon + n.tableName;

          return (
            <g key={key} style={{ cursor: onSelectNode ? "pointer" : "default" }}
              onClick={() => onSelectNode?.(isSelected ? null : key)}>
              <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={5}
                fill={bg} stroke={border} strokeWidth={isInPath || isSelected ? 1.5 : 1} />
              <text x={n.x + 8} y={n.y + 19} fontSize={compact ? 10 : 11}
                fill={isInPath ? "#fbbf24" : n.kind === "governed" ? "#a78bfa" : n.kind === "wide-table" ? "#60a5fa" : "var(--text-1)"}
                fontFamily="var(--font-mono)" fontWeight={isInPath ? 700 : 400}>
                {displayName}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
