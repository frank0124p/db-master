import { useState, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type LineageEdge, type LineageQueryResult, type LineageTransformType } from "../api.js";
import { useStore } from "../store.js";
import { useResizable } from "../hooks/useResizable.js";

// ── Types ─────────────────────────────────────────────────────────────────────

interface NodePos {
  schemaId: number; schemaName: string; domain: string;
  tableId: number; tableName: string;
  x: number; y: number; w: number; h: number;
}

// ── Layout constants ──────────────────────────────────────────────────────────

const NODE_W = 148;
const NODE_H = 30;
const NODE_GAP = 10;
const COL_GAP = 80;
const HEADER_H = 28;
const PAD = 20;
const TRANSFORM_COLORS: Record<LineageTransformType, string> = {
  direct: "#60a5fa",
  aggregate: "#f59e0b",
  join: "#a78bfa",
  derived: "#34d399",
  filter: "#f87171",
};

// ── Graph layout calculation ──────────────────────────────────────────────────

function calcLayout(schemas: { id: number; name: string; domain: string; tables: { id: number; name: string }[] }[]): {
  nodes: NodePos[];
  svgW: number;
  svgH: number;
  domainCols: { domain: string; x: number; colW: number; schemas: { name: string; x: number }[] }[];
} {
  // Group by domain
  const domainMap = new Map<string, typeof schemas>();
  for (const s of schemas) {
    const d = s.domain || "未分類";
    if (!domainMap.has(d)) domainMap.set(d, []);
    domainMap.get(d)!.push(s);
  }
  const domains = Array.from(domainMap.keys()).sort();

  const nodes: NodePos[] = [];
  const domainCols: { domain: string; x: number; colW: number; schemas: { name: string; x: number }[] }[] = [];
  let curX = PAD;

  for (const domain of domains) {
    const schemasInDomain = domainMap.get(domain)!;
    const domainStartX = curX;
    const schemaInfos: { name: string; x: number }[] = [];

    for (const schema of schemasInDomain) {
      const schemaX = curX;
      schemaInfos.push({ name: schema.name, x: schemaX });
      let curY = PAD + HEADER_H + NODE_GAP;
      for (const table of schema.tables) {
        nodes.push({
          schemaId: schema.id, schemaName: schema.name, domain,
          tableId: table.id, tableName: table.name,
          x: schemaX, y: curY, w: NODE_W, h: NODE_H,
        });
        curY += NODE_H + NODE_GAP;
      }
      curX += NODE_W + COL_GAP / 2;
    }
    const colW = curX - domainStartX - COL_GAP / 2;
    domainCols.push({ domain, x: domainStartX, colW, schemas: schemaInfos });
    curX += COL_GAP / 2;
  }

  const svgW = Math.max(curX + PAD, 400);
  const maxY = nodes.reduce((m, n) => Math.max(m, n.y + n.h), PAD + HEADER_H + NODE_GAP) + PAD;
  const svgH = Math.max(maxY, 240);
  return { nodes, svgW, svgH, domainCols };
}

// ── Edge path ─────────────────────────────────────────────────────────────────

function edgePath(src: NodePos, tgt: NodePos): string {
  const sx = src.x + src.w;
  const sy = src.y + src.h / 2;
  const tx = tgt.x;
  const ty = tgt.y + tgt.h / 2;
  const cx = (sx + tx) / 2;
  return `M ${sx} ${sy} C ${cx} ${sy} ${cx} ${ty} ${tx} ${ty}`;
}

// ── Graph SVG component ───────────────────────────────────────────────────────

function LineageGraph({
  edges, schemas, highlighted, selectedNode,
  onSelectNode, onDeleteEdge,
}: {
  edges: LineageEdge[];
  schemas: { id: number; name: string; domain: string; tables: { id: number; name: string }[] }[];
  highlighted: string[];
  selectedNode: { schemaId: number; tableId: number } | null;
  onSelectNode: (n: { schemaId: number; tableId: number } | null) => void;
  onDeleteEdge: (id: string) => void;
}) {
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const { nodes, svgW, svgH, domainCols } = useMemo(() => calcLayout(schemas), [schemas]);

  function nodeKey(schemaId: number, tableId: number) { return `${schemaId}:${tableId}`; }

  const nodeMap = useMemo(() => {
    const m = new Map<string, NodePos>();
    for (const n of nodes) m.set(nodeKey(n.schemaId, n.tableId), n);
    return m;
  }, [nodes]);

  if (nodes.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)", fontSize: 13 }}>
        尚無 Schema 資料 — 請先在 Studio 建立 Schema 和 Table
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflow: "auto", background: "var(--bg-1)" }}>
      <svg width={svgW} height={svgH} style={{ display: "block", minWidth: "100%" }}>
        {/* Domain background bands */}
        {domainCols.map(dc => (
          <g key={dc.domain}>
            <rect x={dc.x - 4} y={PAD - 8} width={dc.colW + 8} height={svgH - PAD + 4}
              rx={6} fill="var(--bg-2)" stroke="var(--border)" strokeWidth={1} opacity={0.5} />
            <text x={dc.x + dc.colW / 2} y={PAD + 8} textAnchor="middle"
              fontSize={10} fontWeight={700} fill="var(--text-3)" letterSpacing="0.6">
              {dc.domain.toUpperCase()}
            </text>
            {/* Schema name sub-headers */}
            {dc.schemas.map(si => (
              <text key={si.name} x={si.x + NODE_W / 2} y={PAD + HEADER_H}
                textAnchor="middle" fontSize={9} fill="var(--text-3)" fontFamily="var(--font-mono)">
                {si.name}
              </text>
            ))}
          </g>
        ))}

        {/* Lineage edges */}
        {edges.map(e => {
          const src = nodeMap.get(nodeKey(e.fromSchemaId, e.fromTableId));
          const tgt = nodeMap.get(nodeKey(e.toSchemaId, e.toTableId));
          if (!src || !tgt) return null;
          const isHighlighted = highlighted.includes(e.id);
          const isHovered = hoverEdge === e.id;
          const color = TRANSFORM_COLORS[e.transformType] ?? "#60a5fa";
          return (
            <g key={e.id}
              onMouseEnter={() => setHoverEdge(e.id)}
              onMouseLeave={() => setHoverEdge(null)}
              style={{ cursor: "pointer" }}>
              {/* Wider invisible hit area */}
              <path d={edgePath(src, tgt)} fill="none" stroke="transparent" strokeWidth={12} />
              <path
                d={edgePath(src, tgt)}
                fill="none"
                stroke={isHighlighted ? "#fbbf24" : isHovered ? color : "var(--border)"}
                strokeWidth={isHighlighted ? 2.5 : isHovered ? 2 : 1.5}
                strokeDasharray={isHighlighted ? "none" : "4 3"}
                opacity={isHighlighted ? 1 : 0.6}
              />
              {/* Arrow head */}
              {(() => {
                const tgtX = tgt.x;
                const tgtY = tgt.y + tgt.h / 2;
                return (
                  <polygon
                    points={`${tgtX},${tgtY} ${tgtX - 8},${tgtY - 4} ${tgtX - 8},${tgtY + 4}`}
                    fill={isHighlighted ? "#fbbf24" : isHovered ? color : "var(--border)"}
                    opacity={isHighlighted ? 1 : 0.6}
                  />
                );
              })()}
              {/* Transform type badge + delete on hover */}
              {isHovered && (
                <>
                  <rect
                    x={(src.x + src.w + tgt.x) / 2 - 24}
                    y={(src.y + src.h / 2 + tgt.y + tgt.h / 2) / 2 - 9}
                    width={48} height={18} rx={9}
                    fill={color} opacity={0.9}
                  />
                  <text
                    x={(src.x + src.w + tgt.x) / 2}
                    y={(src.y + src.h / 2 + tgt.y + tgt.h / 2) / 2 + 4}
                    textAnchor="middle" fontSize={9} fill="#fff" fontWeight={700}>
                    {e.transformType}
                  </text>
                  <text
                    x={(src.x + src.w + tgt.x) / 2 + 32}
                    y={(src.y + src.h / 2 + tgt.y + tgt.h / 2) / 2 + 4}
                    textAnchor="middle" fontSize={12} fill="#f87171" fontWeight={700}
                    style={{ cursor: "pointer" }}
                    onClick={() => onDeleteEdge(e.id)}>✕</text>
                </>
              )}
              {/* Description tooltip */}
              {isHovered && e.description && (
                <text
                  x={(src.x + src.w + tgt.x) / 2}
                  y={(src.y + src.h / 2 + tgt.y + tgt.h / 2) / 2 + 22}
                  textAnchor="middle" fontSize={9} fill="var(--text-2)">
                  {e.description.slice(0, 40)}
                </text>
              )}
            </g>
          );
        })}

        {/* Table nodes */}
        {nodes.map(n => {
          const key = nodeKey(n.schemaId, n.tableId);
          const isSelected = selectedNode?.schemaId === n.schemaId && selectedNode?.tableId === n.tableId;
          const isInPath = highlighted.length > 0 && edges.some(e =>
            highlighted.includes(e.id) &&
            ((e.fromSchemaId === n.schemaId && e.fromTableId === n.tableId) ||
             (e.toSchemaId === n.schemaId && e.toTableId === n.tableId))
          );
          return (
            <g key={key} style={{ cursor: "pointer" }} onClick={() =>
              onSelectNode(isSelected ? null : { schemaId: n.schemaId, tableId: n.tableId })
            }>
              <rect
                x={n.x} y={n.y} width={n.w} height={n.h} rx={5}
                fill={isInPath ? "rgba(251,191,36,0.15)" : isSelected ? "var(--accent-dim)" : "var(--bg-3)"}
                stroke={isInPath ? "#fbbf24" : isSelected ? "var(--accent)" : "var(--border)"}
                strokeWidth={isInPath || isSelected ? 1.5 : 1}
              />
              <text
                x={n.x + 8} y={n.y + 19}
                fontSize={11} fill={isInPath ? "#fbbf24" : "var(--text-1)"}
                fontFamily="var(--font-mono)" fontWeight={isInPath ? 700 : 400}>
                {n.tableName.length > 16 ? n.tableName.slice(0, 14) + "…" : n.tableName}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Add Edge Form ─────────────────────────────────────────────────────────────

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
  const label: React.CSSProperties = {
    fontSize: 10, color: "var(--text-3)", display: "block", marginBottom: 3,
    textTransform: "uppercase", letterSpacing: "0.4px",
  };

  function canSubmit() {
    return fromSchemaId !== "" && fromTableId !== "" && toSchemaId !== "" && toTableId !== "";
  }

  function handleSubmit() {
    if (!canSubmit()) return;
    const fSchema = schemas.find(s => s.id === fromSchemaId)!;
    const tSchema = schemas.find(s => s.id === toSchemaId)!;
    const fTable = fSchema.tables.find(t => t.id === fromTableId)!;
    const tTable = tSchema.tables.find(t => t.id === toTableId)!;
    onAdd({
      fromSchemaId: fSchema.id, fromSchemaName: fSchema.name, fromDomain: fSchema.domain || "未分類",
      fromTableId: fTable.id, fromTableName: fTable.name,
      toSchemaId: tSchema.id, toSchemaName: tSchema.name, toDomain: tSchema.domain || "未分類",
      toTableId: tTable.id, toTableName: tTable.name,
      transformType, description,
    });
  }

  return (
    <div style={{ padding: 16, borderBottom: "1px solid var(--border)", background: "var(--bg-2)" }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12, color: "var(--text-1)" }}>新增血緣關係</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div>
          <label style={label}>來源 Schema</label>
          <select style={sel} value={fromSchemaId} onChange={e => { setFromSchemaId(Number(e.target.value)); setFromTableId(""); }}>
            {schemas.map(s => <option key={s.id} value={s.id}>{s.name} ({s.domain || "未分類"})</option>)}
          </select>
        </div>
        <div>
          <label style={label}>來源 Table</label>
          <select style={sel} value={fromTableId} onChange={e => setFromTableId(Number(e.target.value))}>
            <option value="">— 選擇 —</option>
            {(fromSchema?.tables ?? []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label style={label}>目標 Schema</label>
          <select style={sel} value={toSchemaId} onChange={e => { setToSchemaId(Number(e.target.value)); setToTableId(""); }}>
            {schemas.map(s => <option key={s.id} value={s.id}>{s.name} ({s.domain || "未分類"})</option>)}
          </select>
        </div>
        <div>
          <label style={label}>目標 Table</label>
          <select style={sel} value={toTableId} onChange={e => setToTableId(Number(e.target.value))}>
            <option value="">— 選擇 —</option>
            {(toSchema?.tables ?? []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label style={label}>轉換類型</label>
          <select style={sel} value={transformType} onChange={e => setTransformType(e.target.value as LineageTransformType)}>
            <option value="direct">direct — 直接複製/搬移</option>
            <option value="join">join — JOIN 合併</option>
            <option value="aggregate">aggregate — 聚合計算</option>
            <option value="derived">derived — 衍生欄位</option>
            <option value="filter">filter — 篩選子集</option>
          </select>
        </div>
        <div>
          <label style={label}>說明（選填）</label>
          <input style={inp} value={description} onChange={e => setDescription(e.target.value)}
            placeholder="例：每日 ETL 彙整批次產量" />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={onClose}>取消</button>
        <button className="btn btn-primary" style={{ fontSize: 11 }} disabled={!canSubmit()} onClick={handleSubmit}>
          新增關係
        </button>
      </div>
    </div>
  );
}

// ── Query result display ──────────────────────────────────────────────────────

function QueryResult({ result }: { result: LineageQueryResult }) {
  const [showSql, setShowSql] = useState(false);

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px" }}>
      {/* Join path */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 6 }}>
          血緣路徑
        </div>
        {result.joinPath ? (
          <div style={{
            background: "var(--bg-3)", border: "1px solid rgba(251,191,36,0.3)", borderLeft: "3px solid #fbbf24",
            borderRadius: 6, padding: "8px 12px", fontSize: 12, fontFamily: "var(--font-mono)",
            color: "#fbbf24", lineHeight: 1.7, wordBreak: "break-all",
          }}>
            {result.joinPath}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "var(--text-3)", padding: "8px 0" }}>— 無法確定路徑</div>
        )}
      </div>

      {/* Relevant tables */}
      {result.relevantTables.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 6 }}>
            涉及的表 ({result.relevantTables.length})
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {result.relevantTables.map((t, i) => (
              <span key={i} style={{
                fontSize: 10, padding: "3px 8px", borderRadius: 4,
                background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.3)",
                color: "#60a5fa", fontFamily: "var(--font-mono)",
              }}>
                {t.domain}/{t.schemaName}.{t.tableName}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* SQL */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.5px", textTransform: "uppercase" }}>
            生成 SQL
          </span>
          {result.sql && (
            <button style={{
              fontSize: 10, padding: "2px 8px", borderRadius: 4, border: "1px solid var(--border)",
              background: "transparent", color: "var(--text-2)", cursor: "pointer", fontFamily: "inherit",
            }} onClick={() => setShowSql(v => !v)}>
              {showSql ? "收起" : "展開"}
            </button>
          )}
          {result.sql && (
            <button style={{
              fontSize: 10, padding: "2px 8px", borderRadius: 4, border: "1px solid var(--border)",
              background: "transparent", color: "var(--text-2)", cursor: "pointer", fontFamily: "inherit",
            }} onClick={() => navigator.clipboard.writeText(result.sql)}>
              複製
            </button>
          )}
        </div>
        {result.sql && showSql && (
          <pre style={{
            background: "#0f1117", border: "1px solid var(--border)", borderRadius: 6,
            padding: "10px 12px", fontSize: 11, fontFamily: "var(--font-mono)",
            color: "#e2e8f0", overflowX: "auto", margin: 0, lineHeight: 1.7,
            maxHeight: 280, overflowY: "auto",
          }}>
            {result.sql}
          </pre>
        )}
        {result.sql && !showSql && (
          <div style={{
            background: "#0f1117", border: "1px solid var(--border)", borderRadius: 6,
            padding: "8px 12px", fontSize: 11, fontFamily: "var(--font-mono)",
            color: "#94a3b8", cursor: "pointer",
          }} onClick={() => setShowSql(true)}>
            {result.sql.split("\n")[0]}…
          </div>
        )}
        {!result.sql && (
          <div style={{ fontSize: 12, color: "var(--text-3)", padding: "4px 0" }}>— 無法生成 SQL（請補充血緣關係）</div>
        )}
      </div>

      {/* Explanation */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 6 }}>
          AI 分析說明
        </div>
        <div style={{
          background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 6,
          padding: "10px 12px", fontSize: 12, color: "var(--text-1)", lineHeight: 1.7,
        }}>
          {result.explanation || "無說明"}
        </div>
      </div>
    </div>
  );
}

// ── Query Panel ───────────────────────────────────────────────────────────────

function QueryPanel({
  onHighlight,
}: {
  onHighlight: (edgeIds: string[]) => void;
}) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<LineageQueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const EXAMPLES = [
    "列出批次生產完成後的出貨狀態",
    "找出所有橫跨 MES 和 WMS 的資料流",
    "生產訂單如何對應到財務發票",
  ];

  async function handleQuery() {
    if (!question.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    onHighlight([]);
    try {
      const r = await api.lineage.query(question.trim());
      setResult(r);
      onHighlight(r.relevantEdgeIds);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "查詢失敗";
      setError(msg);
      showToast(`✗ ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleQuery();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1)", marginBottom: 10 }}>
          跨域自然語言查詢
        </div>
        <textarea
          ref={textareaRef}
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="用中文描述你想查詢的資料…&#10;例：列出所有批次的出貨數量和日期"
          style={{
            width: "100%", height: 72, resize: "none", background: "var(--bg-3)",
            border: "1px solid var(--border)", color: "var(--text-1)", borderRadius: 6,
            padding: "8px 10px", fontSize: 12, fontFamily: "inherit", outline: "none",
            boxSizing: "border-box", lineHeight: 1.5,
          }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
          <span style={{ fontSize: 10, color: "var(--text-3)" }}>⌘↵ 送出</span>
          <button
            className="btn btn-primary"
            style={{ fontSize: 12 }}
            disabled={loading || !question.trim()}
            onClick={handleQuery}
          >
            {loading ? "分析中…" : "分析關聯"}
          </button>
        </div>

        {/* Example questions */}
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 4 }}>範例問題：</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {EXAMPLES.map(ex => (
              <button key={ex}
                style={{
                  textAlign: "left", fontSize: 11, padding: "3px 0", background: "transparent",
                  border: "none", color: "var(--text-2)", cursor: "pointer", fontFamily: "inherit",
                }}
                onClick={() => { setQuestion(ex); textareaRef.current?.focus(); }}>
                → {ex}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Result area */}
      {loading && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 18, animation: "spin 1s linear infinite" }}>⟳</div>
          <div style={{ fontSize: 12, color: "var(--text-3)" }}>AI 正在分析血緣圖…</div>
        </div>
      )}
      {error && !loading && (
        <div style={{ padding: 16, fontSize: 12, color: "#f87171" }}>{error}</div>
      )}
      {result && !loading && <QueryResult result={result} />}
      {!result && !loading && !error && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)", fontSize: 12, padding: 16, textAlign: "center" }}>
          輸入問題後，AI 會沿著血緣路徑找出跨 Domain 的資料關聯，並生成對應的 SQL 查詢
        </div>
      )}
    </div>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      {(Object.entries(TRANSFORM_COLORS) as [LineageTransformType, string][]).map(([type, color]) => (
        <div key={type} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 20, height: 2, background: color, borderRadius: 1 }} />
          <span style={{ fontSize: 10, color: "var(--text-3)" }}>{type}</span>
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <div style={{ width: 20, height: 2, background: "#fbbf24", borderRadius: 1 }} />
        <span style={{ fontSize: 10, color: "var(--text-3)" }}>AI 選中路徑</span>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function LineagePage() {
  const qc = useQueryClient();
  const { showToast } = useStore();
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [highlighted, setHighlighted] = useState<string[]>([]);
  const [selectedNode, setSelectedNode] = useState<{ schemaId: number; tableId: number } | null>(null);
  const { size: rightW, onMouseDown: startRightResize } = useResizable(320, "horizontal", 240, 480);

  const { data: edges = [] } = useQuery({ queryKey: ["lineage"], queryFn: api.lineage.list });

  // Load all schemas with their tables
  const { data: schemaMetas = [] } = useQuery({ queryKey: ["schemas"], queryFn: () => api.schemas.list() });

  // Load full schema details for graph (tables)
  const { data: schemaDetails = [] } = useQuery({
    queryKey: ["schemas-full-lineage"],
    queryFn: async () => {
      const details = await Promise.all(schemaMetas.map(m => api.schemas.get(m.id)));
      return details.map(d => ({
        id: d.id, name: d.name, domain: d.domain ?? "未分類",
        tables: d.tables.map(t => ({ id: t.id, name: t.name })),
      }));
    },
    enabled: schemaMetas.length > 0,
  });

  const addMut = useMutation({
    mutationFn: (edge: Omit<LineageEdge, "id" | "createdAt">) => api.lineage.add(edge),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["lineage"] });
      setShowAddPanel(false);
      showToast("✓ 血緣關係已新增");
    },
    onError: (e) => showToast(`✗ ${e instanceof Error ? e.message : "新增失敗"}`),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.lineage.remove(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["lineage"] });
      setHighlighted([]);
      showToast("✓ 已刪除");
    },
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", background: "var(--bg-1)" }}>
      {/* Toolbar */}
      <div style={{
        padding: "10px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0,
        display: "flex", alignItems: "center", gap: 12, background: "var(--bg-2)",
      }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>Data Lineage</span>
        <span style={{ fontSize: 11, color: "var(--text-3)" }}>{edges.length} 條血緣關係 · {schemaDetails.length} 個 Schema</span>
        <div style={{ flex: 1 }} />
        <Legend />
        <button
          className={showAddPanel ? "btn btn-ghost" : "btn btn-primary"}
          style={{ fontSize: 12 }}
          onClick={() => setShowAddPanel(v => !v)}>
          {showAddPanel ? "取消" : "+ 新增關係"}
        </button>
      </div>

      {/* Add edge panel */}
      {showAddPanel && schemaDetails.length > 0 && (
        <AddEdgePanel
          schemas={schemaDetails}
          onClose={() => setShowAddPanel(false)}
          onAdd={edge => addMut.mutate(edge)}
        />
      )}

      {/* Main body: graph + resize + query panel */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Graph */}
        <LineageGraph
          edges={edges}
          schemas={schemaDetails}
          highlighted={highlighted}
          selectedNode={selectedNode}
          onSelectNode={setSelectedNode}
          onDeleteEdge={id => deleteMut.mutate(id)}
        />

        {/* Resize handle */}
        <div
          onMouseDown={startRightResize}
          style={{ width: 4, flexShrink: 0, cursor: "col-resize", background: "var(--border)", zIndex: 10, transition: "background 0.15s" }}
          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "var(--accent)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "var(--border)"; }}
        />

        {/* Right panel: NL query */}
        <div style={{ width: rightW, flexShrink: 0, borderLeft: "none", background: "var(--bg-2)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <QueryPanel onHighlight={setHighlighted} />
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
