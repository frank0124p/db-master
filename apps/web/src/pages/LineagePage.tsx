import { useState, useRef, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type LineageEdge, type LineageQueryResult, type LineageThinkingStep, type LineageNodeKind } from "../api.js";
import { useStore } from "../store.js";
import { LineageSvgGraph, nodeKey, type GraphNode } from "./LineageGraph.js";

// ── Thinking step component ───────────────────────────────────────────────────

function ThinkingStep({ step, done }: { step: LineageThinkingStep; done: boolean }) {
  return (
    <div style={{
      display: "flex", gap: 10, padding: "8px 12px", marginBottom: 6,
      background: "var(--bg-3)", borderRadius: 6, border: "1px solid var(--border)",
      borderLeft: done ? "3px solid var(--accent)" : "3px solid var(--border)",
      transition: "border-color 0.3s",
    }}>
      <div style={{ flexShrink: 0, marginTop: 1 }}>
        {done
          ? <span style={{ fontSize: 12, color: "var(--accent)" }}>✓</span>
          : <span style={{ fontSize: 12, color: "var(--text-3)", animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span>
        }
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.3px" }}>
          {step.step}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-1)", lineHeight: 1.6 }}>{step.text}</div>
      </div>
    </div>
  );
}

// ── Query result panel ────────────────────────────────────────────────────────

function QueryResultPanel({ result }: { result: LineageQueryResult }) {
  const [showSql, setShowSql] = useState(true);
  return (
    <div style={{ borderTop: "1px solid var(--border)", padding: 14, overflowY: "auto", flex: "0 0 auto", maxHeight: 320 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-1)", marginBottom: 10 }}>查詢結果</div>

      {result.joinPath && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 4 }}>血緣路徑</div>
          <div style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.3)", borderLeft: "3px solid #fbbf24", borderRadius: 6, padding: "7px 10px", fontSize: 11, fontFamily: "var(--font-mono)", color: "#fbbf24", lineHeight: 1.7 }}>
            {result.joinPath}
          </div>
        </div>
      )}

      {result.relevantTables.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 4 }}>涉及的表</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {result.relevantTables.map((t, i) => (
              <span key={i} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.3)", color: "#60a5fa", fontFamily: "var(--font-mono)" }}>
                {t.domain}/{t.schemaName}.{t.tableName}
              </span>
            ))}
          </div>
        </div>
      )}

      {result.sql && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
            <div style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.4px" }}>SQL</div>
            <button style={{ fontSize: 10, padding: "1px 7px", border: "1px solid var(--border)", borderRadius: 4, background: "transparent", color: "var(--text-2)", cursor: "pointer", fontFamily: "inherit" }}
              onClick={() => setShowSql(v => !v)}>{showSql ? "收起" : "展開"}</button>
            <button style={{ fontSize: 10, padding: "1px 7px", border: "1px solid var(--border)", borderRadius: 4, background: "transparent", color: "var(--text-2)", cursor: "pointer", fontFamily: "inherit" }}
              onClick={() => navigator.clipboard.writeText(result.sql)}>複製</button>
          </div>
          {showSql && (
            <pre style={{ background: "#0f1117", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", fontSize: 10, fontFamily: "var(--font-mono)", color: "#e2e8f0", overflowX: "auto", margin: 0, lineHeight: 1.65, maxHeight: 160, overflowY: "auto" }}>
              {result.sql}
            </pre>
          )}
        </div>
      )}

      {result.explanation && (
        <div>
          <div style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 4 }}>AI 說明</div>
          <div style={{ background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", fontSize: 12, color: "var(--text-1)", lineHeight: 1.7 }}>
            {result.explanation}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const EXAMPLES = [
  "列出批次生產完成後的出貨數量",
  "找出所有橫跨兩個以上 Domain 的資料流",
  "生產批次如何對應到出貨訂單",
  "設備停機事件會影響哪些下游資料",
];

export default function LineagePage() {
  const { showToast, setPage } = useStore();
  const [question, setQuestion] = useState("");
  const [steps, setSteps] = useState<{ step: LineageThinkingStep; done: boolean }[]>([]);
  const [result, setResult] = useState<LineageQueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [queryNodes, setQueryNodes] = useState<GraphNode[]>([]);
  const [queryEdgeIds, setQueryEdgeIds] = useState<string[]>([]);
  const thinkingRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { data: allEdges = [] } = useQuery({ queryKey: ["lineage"], queryFn: api.lineage.list });
  const { data: schemaMetas = [] } = useQuery({ queryKey: ["schemas"], queryFn: () => api.schemas.list() });
  const { data: schemaDetails = [] } = useQuery({
    queryKey: ["schemas-full-lineage"],
    queryFn: async () => Promise.all(schemaMetas.map(m => api.schemas.get(m.id))),
    enabled: schemaMetas.length > 0,
  });

  // Auto-scroll thinking area
  useEffect(() => {
    if (thinkingRef.current) {
      thinkingRef.current.scrollTop = thinkingRef.current.scrollHeight;
    }
  }, [steps]);

  async function handleQuery() {
    if (!question.trim() || loading) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setSteps([]);
    setResult(null);
    setQueryNodes([]);
    setQueryEdgeIds([]);

    try {
      const res = await api.lineage.queryStream(question.trim());
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        let currentEvent: string | null = null;
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ") && currentEvent) {
            try {
              const payload = JSON.parse(line.slice(6));
              if (currentEvent === "thinking") {
                const s = payload as LineageThinkingStep;
                // Mark previous step as done
                setSteps(prev => {
                  const updated = prev.map((x, i) => i === prev.length - 1 ? { ...x, done: true } : x);
                  return [...updated, { step: s, done: false }];
                });
              } else if (currentEvent === "done") {
                const r = payload as LineageQueryResult;
                // Mark all steps done
                setSteps(prev => prev.map(x => ({ ...x, done: true })));
                setResult(r);
                setQueryEdgeIds(r.relevantEdgeIds);
                // Build query-specific nodes
                const nodeSet = new Map<string, GraphNode>();
                for (const t of r.relevantTables) {
                  const k = nodeKey(t.schemaId, t.tableId, (t.kind ?? "table") as LineageNodeKind);
                  if (!nodeSet.has(k)) {
                    nodeSet.set(k, { schemaId: t.schemaId, schemaName: t.schemaName, domain: t.domain, tableId: t.tableId, tableName: t.tableName, kind: (t.kind ?? "table") as LineageNodeKind });
                  }
                }
                // Also add nodes from relevant edges
                const relEdges = allEdges.filter(e => r.relevantEdgeIds.includes(e.id));
                for (const e of relEdges) {
                  const fk = nodeKey(e.fromSchemaId, e.fromTableId, e.fromKind ?? "table");
                  if (!nodeSet.has(fk)) nodeSet.set(fk, { schemaId: e.fromSchemaId, schemaName: e.fromSchemaName, domain: e.fromDomain, tableId: e.fromTableId, tableName: e.fromTableName, kind: e.fromKind ?? "table" });
                  const tk = nodeKey(e.toSchemaId, e.toTableId, e.toKind ?? "table");
                  if (!nodeSet.has(tk)) nodeSet.set(tk, { schemaId: e.toSchemaId, schemaName: e.toSchemaName, domain: e.toDomain, tableId: e.toTableId, tableName: e.toTableName, kind: e.toKind ?? "table" });
                }
                setQueryNodes([...nodeSet.values()]);
              }
            } catch { /* skip parse error */ }
            currentEvent = null;
          }
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name !== "AbortError") {
        showToast(`✗ ${e.message}`);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    abortRef.current?.abort();
    setQuestion("");
    setSteps([]);
    setResult(null);
    setQueryNodes([]);
    setQueryEdgeIds([]);
    setLoading(false);
  }

  // The subgraph edges for the query SVG
  const querySubEdges = useMemo(() =>
    allEdges.filter(e => queryEdgeIds.includes(e.id)),
    [allEdges, queryEdgeIds]
  );

  const hasResult = result !== null;
  const hasActivity = steps.length > 0 || loading;

  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden", background: "var(--bg-1)" }}>
      {/* Left column: input + thinking log */}
      <div style={{ width: 400, flexShrink: 0, display: "flex", flexDirection: "column", borderRight: "1px solid var(--border)", overflow: "hidden" }}>
        {/* Input area */}
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0, background: "var(--bg-2)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>⇝ Data Lineage 查詢</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setPage("ask")}>自然語言查詢 →</button>
              <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setPage("lineage-graph")}>全局圖 →</button>
            </div>
          </div>
          <textarea
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleQuery(); }}
            placeholder="用中文描述你想查詢的資料關聯…&#10;例：生產批次如何流向出貨訂單？"
            style={{ width: "100%", height: 80, resize: "none", background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text-1)", borderRadius: 6, padding: "8px 10px", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box", lineHeight: 1.5 }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            <span style={{ fontSize: 10, color: "var(--text-3)" }}>⌘↵ 送出</span>
            <div style={{ display: "flex", gap: 6 }}>
              {hasActivity && (
                <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={handleReset}>清除</button>
              )}
              <button className="btn btn-primary" style={{ fontSize: 12 }}
                disabled={loading || !question.trim()} onClick={handleQuery}>
                {loading ? "分析中…" : "分析關聯"}
              </button>
            </div>
          </div>

          {/* Example questions */}
          {!hasActivity && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 4 }}>範例問題：</div>
              {EXAMPLES.map(ex => (
                <button key={ex} style={{ display: "block", width: "100%", textAlign: "left", fontSize: 11, padding: "3px 0", background: "transparent", border: "none", color: "var(--text-2)", cursor: "pointer", fontFamily: "inherit" }}
                  onClick={() => setQuestion(ex)}>
                  → {ex}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Thinking log */}
        <div ref={thinkingRef} style={{ flex: 1, overflowY: "auto", padding: 14 }}>
          {!hasActivity && (
            <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-3)", fontSize: 12 }}>
              輸入問題後，AI 的思考步驟會出現在這裡
            </div>
          )}
          {steps.map((s, i) => (
            <ThinkingStep key={i} step={s.step} done={s.done} />
          ))}
          {loading && steps.length === 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-3)", fontSize: 12, padding: 8 }}>
              <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span>
              正在連線到 AI…
            </div>
          )}
        </div>
      </div>

      {/* Right column: dynamic SVG + result */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Query subgraph SVG */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {/* SVG header */}
          <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8, background: "var(--bg-2)", flexShrink: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-1)" }}>查詢關聯圖</span>
            {queryNodes.length > 0 && (
              <span style={{ fontSize: 10, color: "var(--text-3)" }}>
                {queryNodes.length} 個節點 · {querySubEdges.length} 條血緣
              </span>
            )}
            {loading && queryNodes.length === 0 && (
              <span style={{ fontSize: 10, color: "var(--text-3)", animation: "pulse 1.5s ease-in-out infinite" }}>等待 AI 發現關聯節點…</span>
            )}
          </div>

          {/* SVG area */}
          {queryNodes.length > 0 ? (
            <LineageSvgGraph
              nodes={queryNodes}
              edges={querySubEdges}
              highlighted={queryEdgeIds}
              compact={false}
            />
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: "var(--text-3)", fontSize: 12 }}>
              {loading ? (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,32px)", gap: 6 }}>
                    {Array.from({ length: 9 }, (_, i) => (
                      <div key={i} style={{ width: 32, height: 18, borderRadius: 3, background: "var(--bg-3)", border: "1px solid var(--border)", animation: `pulse 1.5s ease-in-out ${i * 0.15}s infinite` }} />
                    ))}
                  </div>
                  <div>AI 正在掃描血緣圖…</div>
                </>
              ) : hasResult ? (
                <div>無法從血緣圖中確定關聯節點</div>
              ) : (
                <div>查詢完成後，關聯子圖會在此呈現</div>
              )}
            </div>
          )}
        </div>

        {/* Result panel */}
        {hasResult && <QueryResultPanel result={result!} />}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
      `}</style>
    </div>
  );
}
