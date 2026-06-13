/**
 * AskPage — NL → Correct Fields pipeline UI
 *
 * Layout:
 *   1. Question input (large textarea)
 *   2. Linking chips (hit nodes with scores + reasons)
 *   3. Subgraph stats
 *   4. LLM streaming thinking text
 *   5. Answer card:
 *      - answerFields list (ref, why, deprecated warning)
 *      - join path steps
 *      - SQL code block (copy button)
 *      - confidence badge
 *      - warnings list
 *      - abstain: missing + quick action links
 */

import { useState, useRef } from "react";
import { useStore } from "../store.js";

// ── i18n labels ───────────────────────────────────────────────────────────────

const labels = {
  zh: {
    title: "自然語言查詢",
    subtitle: "輸入問題，系統將自動找到正確欄位、join 路徑與 SQL",
    placeholder: "例如：查某批次經過哪些設備、良率多少",
    btnAsk: "查詢",
    btnLinkOnly: "快速預覽（不含 AI）",
    asking: "查詢中…",
    linking: "命中節點",
    subgraph: "子圖",
    nodes: "個節點",
    edges: "條邊",
    thinking: "AI 思考中",
    answerFields: "答案欄位",
    joinPath: "Join 路徑",
    sql: "SQL",
    confidence: "信心度",
    warnings: "警告",
    abstain: "無法回答",
    missing: "缺少的概念或關聯",
    createConceptCard: "建一張概念卡 →",
    addLineageEdge: "補一條 Lineage 邊 →",
    copy: "複製",
    copied: "已複製",
    deprecated: "已廢棄",
    reasons: "原因",
    score: "分數",
    navigateToLineage: "返回血緣圖 →",
  },
  en: {
    title: "Natural Language Query",
    subtitle: "Ask a question — system finds the right fields, join path and SQL",
    placeholder: "e.g. Which equipment did lot X pass through and what was the yield?",
    btnAsk: "Ask",
    btnLinkOnly: "Quick Preview (no AI)",
    asking: "Querying…",
    linking: "Linked Nodes",
    subgraph: "Subgraph",
    nodes: " nodes",
    edges: " edges",
    thinking: "AI Thinking",
    answerFields: "Answer Fields",
    joinPath: "Join Path",
    sql: "SQL",
    confidence: "Confidence",
    warnings: "Warnings",
    abstain: "Cannot Answer",
    missing: "Missing concepts or relationships",
    createConceptCard: "Create a Concept Card →",
    addLineageEdge: "Add a Lineage Edge →",
    copy: "Copy",
    copied: "Copied",
    deprecated: "Deprecated",
    reasons: "Reasons",
    score: "Score",
    navigateToLineage: "Back to Lineage →",
  },
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface LinkingHit {
  ref: string;
  score: number;
  reasons: string[];
}

interface AnswerField {
  ref: string;
  why: string;
}

interface JoinStep {
  from: string;
  to: string;
  via: string;
  on: Array<{ left: string; right: string }>;
}

interface AskResult {
  abstain: boolean;
  answerFields: AnswerField[];
  joinPath: JoinStep[];
  sql: string;
  explanation: string;
  confidence: number;
  missing: string[];
  warnings: string[];
  reason?: string;
}

interface LinkOnlyResult {
  hits: LinkingHit[];
  matchedConcepts: string[];
  matchedValues: Array<{ token: string; ref: string }>;
  subgraph: {
    nodeCount: number;
    edgeCount: number;
    serialized: string;
  };
}

// ── Helper: confidence badge ──────────────────────────────────────────────────

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    value >= 0.85 ? "#4ade80" : value >= 0.6 ? "#fbbf24" : "#f87171";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 4,
        border: `1px solid ${color}55`,
        background: `${color}18`,
        color,
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {pct}%
    </span>
  );
}

// ── Helper: ref kind chip ─────────────────────────────────────────────────────

function RefKindBadge({ ref }: { ref: string }) {
  const kind = ref.split(":")[0] ?? "";
  const colors: Record<string, string> = {
    gwc: "#a78bfa",
    gwt: "#7c3aed",
    fld: "#60a5fa",
    tbl: "#34d399",
    cpt: "#fbbf24",
  };
  const color = colors[kind] ?? "var(--text-3)";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 5px",
        borderRadius: 3,
        fontSize: 9,
        fontWeight: 700,
        color,
        background: `${color}20`,
        border: `1px solid ${color}44`,
        marginRight: 4,
        letterSpacing: "0.3px",
        fontFamily: "var(--font-mono)",
        flexShrink: 0,
      }}
    >
      {kind.toUpperCase()}
    </span>
  );
}

// ── Linking chips ─────────────────────────────────────────────────────────────

function LinkingChips({
  hits,
  locale,
}: {
  hits: LinkingHit[];
  locale: "zh" | "en";
}) {
  const L = labels[locale];
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {hits.slice(0, 20).map((hit) => {
        const isOpen = expanded === hit.ref;
        const refShort = hit.ref.split(":").slice(1).join(":");
        return (
          <div key={hit.ref} style={{ position: "relative" }}>
            <button
              onClick={() => setExpanded(isOpen ? null : hit.ref)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 8px",
                borderRadius: 5,
                border: "1px solid var(--border-light)",
                background: isOpen ? "var(--accent-dim)" : "var(--bg-3)",
                color: isOpen ? "var(--accent)" : "var(--text-2)",
                cursor: "pointer",
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                transition: "all 0.15s",
              }}
            >
              <RefKindBadge ref={hit.ref} />
              <span style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {refShort}
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: "var(--text-3)",
                  marginLeft: 2,
                  background: "var(--bg-4)",
                  padding: "1px 4px",
                  borderRadius: 3,
                }}
              >
                {hit.score.toFixed(2)}
              </span>
            </button>
            {isOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  zIndex: 50,
                  background: "var(--bg-2)",
                  border: "1px solid var(--border-light)",
                  borderRadius: 6,
                  padding: 10,
                  minWidth: 240,
                  maxWidth: 360,
                  boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
                  marginTop: 4,
                }}
              >
                <div
                  style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.4px" }}
                >
                  {L.score}: {hit.score.toFixed(3)}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.4px" }}>
                  {L.reasons}:
                </div>
                {hit.reasons.slice(0, 8).map((r, i) => (
                  <div
                    key={i}
                    style={{ fontSize: 11, color: "var(--text-2)", fontFamily: "var(--font-mono)", lineHeight: 1.5 }}
                  >
                    • {r}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Join path visualization ───────────────────────────────────────────────────

function JoinPathViz({ steps }: { steps: JoinStep[] }) {
  if (steps.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4, fontSize: 12 }}>
      {steps.map((step, i) => {
        const fromShort = step.from.split(":").slice(1).join(":");
        const toShort = step.to.split(":").slice(1).join(":");
        const onStr =
          step.on.length > 0
            ? step.on.map((p) => `${p.left} = ${p.right}`).join(", ")
            : step.via;
        return (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {i > 0 && <span style={{ color: "var(--text-3)" }}>→</span>}
            <span
              style={{
                padding: "2px 7px",
                borderRadius: 4,
                background: "var(--bg-3)",
                border: "1px solid var(--border)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--text-1)",
              }}
            >
              {fromShort}
            </span>
            <span style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
              ON {onStr}
            </span>
            {i === steps.length - 1 && (
              <>
                <span style={{ color: "var(--text-3)" }}>→</span>
                <span
                  style={{
                    padding: "2px 7px",
                    borderRadius: 4,
                    background: "var(--bg-3)",
                    border: "1px solid var(--border)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--text-1)",
                  }}
                >
                  {toShort}
                </span>
              </>
            )}
          </span>
        );
      })}
    </div>
  );
}

// ── Answer card ───────────────────────────────────────────────────────────────

function AnswerCard({
  result,
  locale,
  onNavigate,
}: {
  result: AskResult;
  locale: "zh" | "en";
  onNavigate: (page: "catalog" | "lineage") => void;
}) {
  const L = labels[locale];
  const [copied, setCopied] = useState(false);

  function copySql() {
    void navigator.clipboard.writeText(result.sql).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (result.abstain) {
    return (
      <div
        style={{
          background: "var(--bg-3)",
          border: "1px solid var(--border-light)",
          borderLeft: "3px solid var(--error)",
          borderRadius: 8,
          padding: 16,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--error)", marginBottom: 8 }}>
          {L.abstain}
          {result.reason && (
            <span
              style={{ fontSize: 10, marginLeft: 8, opacity: 0.7, fontFamily: "var(--font-mono)" }}
            >
              ({result.reason})
            </span>
          )}
        </div>
        {result.missing.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 4 }}>
              {L.missing}
            </div>
            {result.missing.map((m, i) => (
              <div key={i} style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 2 }}>
                • {m}
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <button
            onClick={() => onNavigate("catalog")}
            style={{
              padding: "5px 12px",
              borderRadius: 5,
              border: "1px solid var(--accent)",
              background: "var(--accent-dim)",
              color: "var(--accent)",
              cursor: "pointer",
              fontSize: 12,
              fontFamily: "inherit",
            }}
          >
            {L.createConceptCard}
          </button>
          <button
            onClick={() => onNavigate("lineage")}
            style={{
              padding: "5px 12px",
              borderRadius: 5,
              border: "1px solid var(--border-light)",
              background: "var(--bg-4)",
              color: "var(--text-2)",
              cursor: "pointer",
              fontSize: 12,
              fontFamily: "inherit",
            }}
          >
            {L.addLineageEdge}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        background: "var(--bg-3)",
        border: "1px solid var(--border-light)",
        borderLeft: "3px solid var(--accent)",
        borderRadius: 8,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {/* Confidence */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.4px" }}>
          {L.confidence}
        </div>
        <ConfidenceBadge value={result.confidence} />
      </div>

      {/* Answer fields */}
      {result.answerFields.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>
            {L.answerFields}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {result.answerFields.map((f, i) => {
              const isDeprecated = f.ref.includes("deprecated");
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    padding: "6px 10px",
                    borderRadius: 5,
                    background: "var(--bg-2)",
                    border: `1px solid var(--border)`,
                    opacity: isDeprecated ? 0.6 : 1,
                  }}
                >
                  <RefKindBadge ref={f.ref} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {f.ref}
                      {isDeprecated && (
                        <span
                          style={{ marginLeft: 6, fontSize: 9, color: "#f87171", background: "#f8717120", padding: "1px 4px", borderRadius: 3 }}
                        >
                          {L.deprecated}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>{f.why}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Join path */}
      {result.joinPath.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>
            {L.joinPath}
          </div>
          <JoinPathViz steps={result.joinPath} />
        </div>
      )}

      {/* SQL */}
      {result.sql && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.4px" }}>
              {L.sql}
            </div>
            <button
              onClick={copySql}
              style={{
                padding: "2px 8px",
                borderRadius: 4,
                border: "1px solid var(--border)",
                background: "transparent",
                color: copied ? "var(--success)" : "var(--text-2)",
                cursor: "pointer",
                fontSize: 10,
                fontFamily: "inherit",
              }}
            >
              {copied ? L.copied : L.copy}
            </button>
          </div>
          <pre
            style={{
              margin: 0,
              padding: "10px 12px",
              background: "#0f1117",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              color: "#e2e8f0",
              overflowX: "auto",
              lineHeight: 1.65,
              maxHeight: 200,
              overflowY: "auto",
            }}
          >
            {result.sql}
          </pre>
        </div>
      )}

      {/* Explanation */}
      {result.explanation && (
        <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.6 }}>
          {result.explanation}
        </div>
      )}

      {/* Warnings */}
      {result.warnings && result.warnings.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 4 }}>
            {L.warnings}
          </div>
          {result.warnings.map((w, i) => (
            <div
              key={i}
              style={{ fontSize: 11, color: "#fbbf24", marginBottom: 2, background: "#fbbf2410", padding: "3px 8px", borderRadius: 4 }}
            >
              ⚠ {w}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main AskPage ──────────────────────────────────────────────────────────────

export default function AskPage() {
  const { locale, setPage } = useStore();
  const L = labels[locale];

  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<"idle" | "linking" | "subgraph" | "thinking" | "done" | "error">("idle");

  const [hits, setHits] = useState<LinkingHit[]>([]);
  const [matchedConcepts, setMatchedConcepts] = useState<string[]>([]);
  const [subgraphStats, setSubgraphStats] = useState<{ nodeCount: number; edgeCount: number } | null>(null);
  const [thinkingText, setThinkingText] = useState("");
  const [result, setResult] = useState<AskResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const abortRef = useRef<AbortController | null>(null);

  async function askQuery() {
    if (!question.trim() || status === "linking" || status === "thinking") return;

    // Reset
    setHits([]);
    setMatchedConcepts([]);
    setSubgraphStats(null);
    setThinkingText("");
    setResult(null);
    setErrorMsg("");
    setStatus("linking");

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/v1/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        setErrorMsg(`HTTP ${res.status}`);
        setStatus("error");
        return;
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = JSON.parse(line.slice(6)) as {
            type: string;
            hits?: LinkingHit[];
            matchedConcepts?: string[];
            nodeCount?: number;
            edgeCount?: number;
            text?: string;
            result?: AskResult;
            message?: string;
          };

          if (data.type === "linking") {
            setHits(data.hits ?? []);
            setMatchedConcepts(data.matchedConcepts ?? []);
            setStatus("subgraph");
          } else if (data.type === "subgraph") {
            setSubgraphStats({
              nodeCount: data.nodeCount ?? 0,
              edgeCount: data.edgeCount ?? 0,
            });
            setStatus("thinking");
          } else if (data.type === "token") {
            setThinkingText((t) => t + (data.text ?? ""));
          } else if (data.type === "result") {
            setResult(data.result ?? null);
            setStatus("done");
          } else if (data.type === "error") {
            setErrorMsg(data.message ?? "Unknown error");
            setStatus("error");
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStatus("error");
    } finally {
      if (status !== "done" && status !== "error") setStatus("done");
    }
  }

  async function linkOnlyQuery() {
    if (!question.trim()) return;
    setHits([]);
    setMatchedConcepts([]);
    setSubgraphStats(null);
    setThinkingText("");
    setResult(null);
    setErrorMsg("");
    setStatus("linking");

    try {
      const res = await fetch("/api/v1/ask/link-only", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (!res.ok) {
        setErrorMsg(`HTTP ${res.status}`);
        setStatus("error");
        return;
      }
      const data = (await res.json()) as LinkOnlyResult;
      setHits(data.hits ?? []);
      setMatchedConcepts(data.matchedConcepts ?? []);
      setSubgraphStats({
        nodeCount: data.subgraph.nodeCount,
        edgeCount: data.subgraph.edgeCount,
      });
      setStatus("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  const isRunning = status === "linking" || status === "thinking" || status === "subgraph";

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "var(--bg-1)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 20px 10px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>
            ⊕ {L.title}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{L.subtitle}</div>
        </div>
        <button
          onClick={() => setPage("lineage")}
          style={{
            fontSize: 11,
            color: "var(--text-3)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
            padding: "4px 8px",
          }}
        >
          {L.navigateToLineage}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Question input */}
        <div>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                void askQuery();
              }
            }}
            placeholder={L.placeholder}
            disabled={isRunning}
            rows={3}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--bg-3)",
              color: "var(--text-1)",
              fontSize: 14,
              lineHeight: 1.6,
              resize: "vertical",
              outline: "none",
              fontFamily: "inherit",
              boxSizing: "border-box",
              transition: "border-color 0.15s",
            }}
            onFocus={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = "var(--accent)"; }}
            onBlur={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = "var(--border)"; }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              onClick={() => void askQuery()}
              disabled={!question.trim() || isRunning}
              style={{
                padding: "7px 18px",
                borderRadius: 6,
                border: "none",
                background: "var(--accent)",
                color: "#fff",
                cursor: question.trim() && !isRunning ? "pointer" : "not-allowed",
                fontSize: 13,
                fontWeight: 700,
                fontFamily: "inherit",
                opacity: question.trim() && !isRunning ? 1 : 0.5,
                transition: "opacity 0.15s",
              }}
            >
              {isRunning ? L.asking : L.btnAsk}
            </button>
            <button
              onClick={() => void linkOnlyQuery()}
              disabled={!question.trim() || isRunning}
              style={{
                padding: "7px 14px",
                borderRadius: 6,
                border: "1px solid var(--border-light)",
                background: "var(--bg-3)",
                color: "var(--text-2)",
                cursor: question.trim() && !isRunning ? "pointer" : "not-allowed",
                fontSize: 12,
                fontFamily: "inherit",
                opacity: question.trim() && !isRunning ? 1 : 0.5,
              }}
            >
              {L.btnLinkOnly}
            </button>
          </div>
        </div>

        {/* Error */}
        {status === "error" && errorMsg && (
          <div
            style={{
              padding: "10px 12px",
              background: "var(--error-dim)",
              border: "1px solid var(--error)",
              borderRadius: 6,
              fontSize: 12,
              color: "var(--error)",
            }}
          >
            錯誤：{errorMsg}
          </div>
        )}

        {/* Linking chips */}
        {hits.length > 0 && (
          <div>
            <div
              style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}
            >
              {L.linking}
              {matchedConcepts.length > 0 && (
                <span style={{ fontSize: 10, color: "#fbbf24", background: "#fbbf2415", padding: "1px 6px", borderRadius: 4, border: "1px solid #fbbf2440" }}>
                  {matchedConcepts.join(", ")}
                </span>
              )}
              <span style={{ fontSize: 10, color: "var(--text-3)", marginLeft: "auto" }}>
                {hits.length} hits
              </span>
            </div>
            <LinkingChips hits={hits} locale={locale} />
          </div>
        )}

        {/* Subgraph stats */}
        {subgraphStats && (
          <div
            style={{
              fontSize: 11,
              color: "var(--text-3)",
              display: "flex",
              gap: 12,
              padding: "6px 10px",
              background: "var(--bg-3)",
              borderRadius: 5,
              border: "1px solid var(--border)",
            }}
          >
            <span>⊛ {L.subgraph}:</span>
            <span>
              {subgraphStats.nodeCount}
              {L.nodes}
            </span>
            <span>
              {subgraphStats.edgeCount}
              {L.edges}
            </span>
          </div>
        )}

        {/* Streaming thinking text */}
        {(status === "thinking" || (thinkingText && status === "done")) && (
          <div>
            <div
              style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}
            >
              {L.thinking}
              {status === "thinking" && (
                <span
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "var(--accent)",
                    animation: "pulse 1.2s infinite",
                  }}
                />
              )}
            </div>
            <pre
              style={{
                margin: 0,
                padding: "10px 12px",
                background: "var(--bg-2)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                color: "var(--text-3)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                maxHeight: 200,
                overflowY: "auto",
                lineHeight: 1.6,
              }}
            >
              {thinkingText}
              {status === "thinking" && (
                <span
                  style={{
                    display: "inline-block",
                    width: 2,
                    height: 12,
                    background: "var(--accent)",
                    marginLeft: 2,
                    verticalAlign: "text-bottom",
                    animation: "blink 1s infinite",
                  }}
                />
              )}
            </pre>
          </div>
        )}

        {/* Answer card */}
        {result && (
          <div>
            <div
              style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}
            >
              {result.abstain ? L.abstain : L.answerFields}
            </div>
            <AnswerCard
              result={result}
              locale={locale}
              onNavigate={(page) => setPage(page)}
            />
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
