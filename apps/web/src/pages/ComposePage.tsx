import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api, type GovWtProposal } from "../api.js";
import { useStore } from "../store.js";
import { useResizable } from "../hooks/useResizable.js";

const S = {
  page: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg-1)" } as const,
  header: { padding: "16px 20px", borderBottom: "1px solid var(--border)", flexShrink: 0 } as const,
  body: { flex: 1, display: "flex", overflow: "hidden" } as const,
  left: { width: 340, flexShrink: 0, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg-1)" } as const,
  right: { flex: 1, overflowY: "auto", padding: 20 } as const,
  card: { background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8, padding: 14, marginBottom: 10 } as const,
};

function ProposalCard({ proposal, onToDraft }: { proposal: GovWtProposal; onToDraft: () => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={S.card}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", marginBottom: 2 }}>{proposal.name}</div>
          <div style={{ fontSize: 11, color: "var(--text-3)" }}>
            <span style={{ background: proposal.blockKind === "small" ? "rgba(52,211,153,0.15)" : "rgba(167,139,250,0.15)", color: proposal.blockKind === "small" ? "#34d399" : "#a78bfa", fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 3, border: `1px solid ${proposal.blockKind === "small" ? "rgba(52,211,153,0.3)" : "rgba(167,139,250,0.3)"}` }}>{proposal.blockKind}</span>
            {" "}{proposal.columns.length} 欄位 · {proposal.joinGraph.length} JOIN
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {proposal.status === "proposed" && (
            <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={onToDraft}>転入工作區</button>
          )}
          <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setExpanded(v => !v)}>
            {expanded ? "▲" : "▼"}
          </button>
        </div>
      </div>

      <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 8 }}>{proposal.description}</div>

      {expanded && (
        <>
          {/* Column table */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 5 }}>欄位定義</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ background: "var(--bg-3)" }}>
                    <th style={{ padding: "5px 8px", textAlign: "left", color: "var(--text-3)", fontWeight: 600 }}>column</th>
                    <th style={{ padding: "5px 8px", textAlign: "left", color: "var(--text-3)", fontWeight: 600 }}>type</th>
                    <th style={{ padding: "5px 8px", textAlign: "left", color: "var(--text-3)", fontWeight: 600 }}>source</th>
                    <th style={{ padding: "5px 8px", textAlign: "left", color: "var(--text-3)", fontWeight: 600 }}>definition</th>
                  </tr>
                </thead>
                <tbody>
                  {proposal.columns.map(col => (
                    <tr key={col.name} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "4px 8px", fontFamily: "var(--font-mono)", color: (col as { _phantom?: boolean })._phantom ? "#f87171" : "var(--text-1)" }}>
                        {col.name}{(col as { _phantom?: boolean })._phantom && " ⚠"}
                      </td>
                      <td style={{ padding: "4px 8px", fontFamily: "var(--font-mono)", color: "var(--text-3)" }}>{col.dataType}</td>
                      <td style={{ padding: "4px 8px", color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>{col.source.tableName}.{col.source.fieldName}</td>
                      <td style={{ padding: "4px 8px", color: "var(--text-2)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{col.definition}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* JOIN graph */}
          {proposal.joinGraph.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 5 }}>JOIN 關係</div>
              {proposal.joinGraph.map((j, i) => (
                <div key={i} style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-2)", marginBottom: 2 }}>
                  {j.leftRef} {j.type.toUpperCase()} JOIN {j.rightRef} ON {j.on.map(o => `${o.leftField}=${o.rightField}`).join(", ")}
                </div>
              ))}
            </div>
          )}

          {/* Reasoning trace */}
          {proposal.reasoningTrace.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 5 }}>推理過程</div>
              {proposal.reasoningTrace.map((t, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, background: "var(--accent-dim)", color: "var(--accent)", padding: "1px 6px", borderRadius: 3, flexShrink: 0, fontWeight: 600 }}>{t.step}</span>
                  <span style={{ fontSize: 11, color: "var(--text-2)" }}>{t.detail}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function ComposePage() {
  const qc = useQueryClient();
  const { showToast } = useStore();
  const [scenario, setScenario] = useState("");
  const { size: leftW, onMouseDown } = useResizable(340, "horizontal", 200, 600);
  const [blockKind, setBlockKind] = useState<string>("auto");
  const [composing, setComposing] = useState(false);
  const [traceLines, setTraceLines] = useState<string[]>([]);
  const [tokenPreview, setTokenPreview] = useState("");

  const { data: proposals = [] } = useQuery({ queryKey: ["gov-proposals"], queryFn: api.wtProposals.list });

  const toDraftMut = useMutation({
    mutationFn: (id: number) => api.wtProposals.toDraft(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["gov-proposals"] });
      showToast("✓ 已轉入工作區");
    },
  });

  async function runCompose() {
    if (!scenario.trim() || composing) return;
    setComposing(true); setTraceLines([]); setTokenPreview("");
    try {
      const composeBody: { scenario: string; blockKind?: string } = { scenario: scenario.trim() };
      if (blockKind !== "auto") composeBody.blockKind = blockKind;
      const res = await api.wtProposals.composeSSE(composeBody);
      const reader = res.body!.getReader();
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
          const ev = JSON.parse(line.slice(6)) as { type: string; step?: string; detail?: string; text?: string; proposalCount?: number; message?: string };
          if (ev.type === "trace") setTraceLines(prev => [...prev, `[${ev.step}] ${ev.detail}`]);
          if (ev.type === "token") setTokenPreview(prev => prev + (ev.text ?? ""));
          if (ev.type === "proposal") {
            await qc.invalidateQueries({ queryKey: ["gov-proposals"] });
            setTraceLines(prev => [...prev, "✓ 提案已建立"]);
          }
          if (ev.type === "done") setTraceLines(prev => [...prev, `✓ 完成 (${ev.proposalCount} 個提案)`]);
          if (ev.type === "error") setTraceLines(prev => [...prev, `✗ ${ev.message}`]);
        }
      }
    } catch { setTraceLines(prev => [...prev, "✗ 連線失敗"]); }
    finally { setComposing(false); }
  }

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>情境組裝寬表</div>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.4px" }}>使用情境</label>
            <textarea value={scenario} onChange={e => setScenario(e.target.value)} disabled={composing}
              style={{ width: "100%", background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--text-1)", padding: "8px 10px", borderRadius: 6, fontSize: 13, outline: "none", fontFamily: "inherit", height: 72, resize: "none", boxSizing: "border-box" } as React.CSSProperties}
              placeholder="描述你想建立的寬表用途，例如：分析在製品批次的完整生命週期，包含工站歷程、設備使用、品質記錄…" />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.4px" }}>種類</label>
            <select value={blockKind} onChange={e => setBlockKind(e.target.value)} disabled={composing}
              style={{ background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--text-1)", padding: "7px 10px", borderRadius: 6, fontSize: 12, outline: "none", fontFamily: "inherit" }}>
              <option value="auto">自動</option>
              <option value="small">Small (單實體)</option>
              <option value="medium">Medium (跨實體 JOIN)</option>
            </select>
          </div>
          <button className="btn btn-primary" style={{ fontSize: 12, padding: "8px 16px" }}
            disabled={!scenario.trim() || composing} onClick={() => void runCompose()}>
            {composing ? "組裝中…" : "✦ 開始組裝"}
          </button>
        </div>
      </div>

      <div style={S.body}>
        <div style={{ ...S.left, width: leftW }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", flexShrink: 0, fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase" }}>
            進行中 / 推理記錄
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>
            {traceLines.map((l, i) => (
              <div key={i} style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-2)", marginBottom: 2, wordBreak: "break-all" }}>{l}</div>
            ))}
            {tokenPreview && (
              <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-3)", marginTop: 4, maxHeight: 200, overflowY: "auto", wordBreak: "break-all" }}>
                {tokenPreview.slice(-500)}
                {composing && <span style={{ display: "inline-block", width: 2, height: 11, background: "var(--accent)", marginLeft: 2, verticalAlign: "text-bottom" }} />}
              </div>
            )}
            {traceLines.length === 0 && !composing && (
              <div style={{ color: "var(--text-3)", fontSize: 11, textAlign: "center", padding: "24px 0" }}>執行組裝後顯示推理記錄</div>
            )}
          </div>
        </div>

        <div
          onMouseDown={onMouseDown}
          style={{
            width: 5,
            flexShrink: 0,
            cursor: "col-resize",
            background: "transparent",
            borderLeft: "1px solid var(--border)",
            position: "relative",
            transition: "background 0.15s",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "rgba(139,92,246,0.35)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
        />

        <div style={S.right}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-3)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.6px" }}>
            寬表提案 ({proposals.length})
          </div>
          {proposals.length === 0 && (
            <div style={{ color: "var(--text-3)", fontSize: 13, textAlign: "center", padding: "48px 0" }}>執行「✦ 開始組裝」生成寬表提案</div>
          )}
          {proposals.map(p => (
            <ProposalCard key={p.id} proposal={p} onToDraft={() => toDraftMut.mutate(p.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}
