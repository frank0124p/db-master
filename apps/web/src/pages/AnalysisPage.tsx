import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "../store.js";
import { api, type RuleLayer } from "../api.js";
import { useBreakpoint } from "../hooks/useBreakpoint.js";
import { MarkdownView } from "../MarkdownView.js";

interface Issue {
  severity: "error" | "warning" | "info";
  source: string;
  target: string;
  message: string;
  suggestion: string | null;
}

const LAYER_LABELS: Record<RuleLayer, string> = {
  general: "通用", transaction: "交易層", r2u: "R2U", unified: "Unified",
};
const LAYER_COLORS: Record<RuleLayer, string> = {
  general: "var(--text-3)", transaction: "#a78bfa", r2u: "#34d399", unified: "#60a5fa",
};

export default function AnalysisPage() {
  const { isMobile, isTablet } = useBreakpoint();
  const { selectedSchemaId, showToast } = useStore();
  const qc = useQueryClient();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [llmText, setLlmText] = useState("點擊「執行分析」開始分析...");
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [activeIssue, setActiveIssue] = useState<number | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [ruleFilterOpen, setRuleFilterOpen] = useState(false);
  const [localSelectedIds, setLocalSelectedIds] = useState<string[] | null>(null);
  const [savingRules, setSavingRules] = useState(false);

  const { data: schema } = useQuery({
    queryKey: ["schema", selectedSchemaId],
    queryFn: () => api.schemas.get(selectedSchemaId!),
    enabled: !!selectedSchemaId,
  });

  const { data: allRulesData } = useQuery({
    queryKey: ["rules"],
    queryFn: () => api.rules.list(),
  });

  const { data: schemaRulesData } = useQuery({
    queryKey: ["schema-rules", selectedSchemaId],
    queryFn: () => api.schemas.getRules(selectedSchemaId!),
    enabled: !!selectedSchemaId,
  });

  useEffect(() => {
    if (schemaRulesData) {
      setLocalSelectedIds(schemaRulesData.selectedRuleIds);
    }
  }, [schemaRulesData]);

  const allRules = allRulesData?.rules ?? [];
  const serverSelectedIds = schemaRulesData?.selectedRuleIds ?? [];
  const effectiveSelectedIds = localSelectedIds ?? serverSelectedIds;

  async function applyDefaultRules() {
    if (!selectedSchemaId) return;
    setSavingRules(true);
    try {
      await api.schemas.setRules(selectedSchemaId, { selectedRuleIds: null });
      await qc.invalidateQueries({ queryKey: ["schema-rules", selectedSchemaId] });
      showToast("✓ 已套用預設 Rule 篩選");
    } catch (e) { showToast(`失敗: ${String(e)}`); }
    finally { setSavingRules(false); }
  }

  async function saveSelectedRules() {
    if (!selectedSchemaId || localSelectedIds === null) return;
    setSavingRules(true);
    try {
      await api.schemas.setRules(selectedSchemaId, { selectedRuleIds: localSelectedIds });
      await qc.invalidateQueries({ queryKey: ["schema-rules", selectedSchemaId] });
      showToast(`✓ 已儲存 ${localSelectedIds.length} 條 Rule 篩選`);
    } catch (e) { showToast(`失敗: ${String(e)}`); }
    finally { setSavingRules(false); }
  }

  function toggleRuleId(id: string) {
    const base = localSelectedIds ?? serverSelectedIds;
    if (base.includes(id)) {
      setLocalSelectedIds(base.filter(x => x !== id));
    } else {
      setLocalSelectedIds([...base, id]);
    }
  }

  async function runAnalysis() {
    if (!selectedSchemaId || running) return;
    setRunning(true);
    const scopeLabel = selectedTableId != null
      ? schema?.tables.find(t => t.id === selectedTableId)?.name ?? "單表"
      : "整個 Schema";
    setStatus(`分析中（${scopeLabel}）...`);
    setLlmText("");
    setIssues([]);

    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort("timeout"), 30_000);

    try {
      const res = await api.schemas.analyze(selectedSchemaId, selectedTableId ?? undefined, abort.signal);
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let gotFirstChunk = false;

      while (true) {
        // Reset timeout on each chunk received
        if (!gotFirstChunk) {
          gotFirstChunk = true;
          clearTimeout(timeout);
        }
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = JSON.parse(line.slice(6)) as { type: string; issues?: Issue[]; text?: string; score?: number };
          if (data.type === "issues" && data.issues) setIssues(data.issues);
          if (data.type === "token" && data.text) setLlmText(prev => prev + data.text);
          if (data.type === "done") setStatus("分析完成");
        }
      }
    } catch (e) {
      const isTimeout = abort.signal.aborted;
      const msg = isTimeout ? "分析逾時（30s），請稍後再試" : `分析失敗：${String(e)}`;
      setStatus(msg);
      setLlmText(prev => prev || msg);
    } finally {
      clearTimeout(timeout);
      setRunning(false);
    }
  }

  async function adoptSuggestion(issue: Issue) {
    if (!issue.suggestion) return;
    showToast(`✓ 已採用建議：${issue.suggestion}`);
  }

  if (!selectedSchemaId) {
    return <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)" }}>← 從左側選擇一個 Schema</div>;
  }

  const severityColor = { error: "var(--error)", warning: "var(--warning)", info: "var(--info)" };
  const severityBorder = { error: "var(--error)", warning: "var(--warning)", info: "var(--info)" };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>Schema 分析 — {schema?.name}</span>
        <select
          value={selectedTableId ?? ""}
          onChange={e => setSelectedTableId(e.target.value === "" ? null : Number(e.target.value))}
          disabled={running}
          style={{ fontSize: 12, padding: "4px 8px", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "var(--bg-2)", color: "var(--text-1)", cursor: "pointer", minWidth: 160 }}
        >
          <option value="">全部表</option>
          {schema?.tables.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <button className="btn btn-primary" onClick={runAnalysis} disabled={running}>▶ 執行分析</button>
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>{status}</span>
      </div>

      {/* ── Rule 篩選 collapsible panel ── */}
      <div style={{ borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <button
          onClick={() => setRuleFilterOpen(v => !v)}
          style={{ width: "100%", padding: "8px 16px", display: "flex", alignItems: "center", gap: 8,
            background: "var(--bg-2)", border: "none", cursor: "pointer", textAlign: "left" }}>
          <span style={{ fontSize: 11, color: ruleFilterOpen ? "var(--accent)" : "var(--text-2)",
            fontWeight: 600, transition: "color 0.15s" }}>
            {ruleFilterOpen ? "▾" : "▸"} Rule 篩選 ({effectiveSelectedIds.length}/{allRules.length} 已選)
          </span>
          {effectiveSelectedIds.length < allRules.length && (
            <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 5,
              background: "var(--accent-dim)", color: "var(--accent)", border: "1px solid var(--accent)" }}>
              已自訂
            </span>
          )}
        </button>
        {ruleFilterOpen && (
          <div style={{ padding: "10px 16px 14px", background: "var(--bg-1)" }}>
            {/* Action buttons */}
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <button onClick={() => void applyDefaultRules()} disabled={savingRules}
                style={{ fontSize: 11, padding: "3px 10px", borderRadius: 5,
                  border: "1px solid var(--border)", background: "transparent",
                  color: "var(--text-3)", cursor: savingRules ? "not-allowed" : "pointer", opacity: savingRules ? 0.5 : 1 }}>
                ↺ 套用預設
              </button>
              <button onClick={() => void saveSelectedRules()} disabled={savingRules || localSelectedIds === null}
                style={{ fontSize: 11, padding: "3px 10px", borderRadius: 5,
                  border: "none", background: "var(--accent)", color: "#fff",
                  cursor: savingRules ? "not-allowed" : "pointer", opacity: savingRules ? 0.5 : 1, fontWeight: 700 }}>
                ✓ 儲存選取
              </button>
            </div>
            {/* Rule checklist grouped by layer */}
            {(["general", "transaction", "r2u", "unified"] as RuleLayer[]).map(layer => {
              const layerRules = allRules.filter(r => (r.layers ?? ["general"]).includes(layer));
              if (layerRules.length === 0) return null;
              return (
                <div key={layer} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: LAYER_COLORS[layer],
                    textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>
                    {LAYER_LABELS[layer]}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {layerRules.map(r => (
                      <label key={r.id} style={{ display: "flex", alignItems: "center", gap: 8,
                        fontSize: 11, cursor: "pointer", padding: "2px 0", color: "var(--text-2)" }}>
                        <input type="checkbox"
                          checked={effectiveSelectedIds.includes(r.id)}
                          onChange={() => toggleRuleId(r.id)}
                          style={{ cursor: "pointer", accentColor: "var(--accent)" }} />
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)" }}>{r.id}</span>
                        <span style={{ color: "var(--text-3)" }}>{r.description}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: isMobile ? "column" : "row", overflow: "hidden" }}>
        {/* Issues panel */}
        <div style={{ width: isMobile ? "100%" : isTablet ? 280 : 340, borderRight: isMobile ? "none" : "1px solid var(--border)", borderBottom: isMobile ? "1px solid var(--border)" : "none", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span className="panel-title">Issues <span style={{ color: "var(--text-3)" }}>({issues.length})</span></span>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
            {issues.map((issue, i) => (
              <div key={i} onClick={() => setActiveIssue(activeIssue === i ? null : i)}
                style={{ padding: "10px", borderRadius: "var(--radius)", marginBottom: 4, cursor: "pointer", border: `1px solid ${activeIssue === i ? "var(--accent)" : "transparent"}`, borderLeft: `3px solid ${severityBorder[issue.severity]}`, background: activeIssue === i ? "var(--accent-dim)" : "transparent", transition: "all 0.15s" }}
                onMouseEnter={e => { if (activeIssue !== i) (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border-light)"; }}
                onMouseLeave={e => { if (activeIssue !== i) (e.currentTarget as HTMLDivElement).style.borderColor = "transparent"; }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: severityColor[issue.severity], flexShrink: 0 }} />
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-2)", flex: 1 }}>{issue.target}</div>
                  <div style={{ fontSize: 10, padding: "1px 5px", borderRadius: 3, background: "var(--bg-4)", color: "var(--text-3)" }}>{issue.source}</div>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-1)" }}>{issue.message}</div>
                {issue.suggestion && (
                  <div style={{ marginTop: 6 }}>
                    <button onClick={e => { e.stopPropagation(); void adoptSuggestion(issue); }}
                      style={{ padding: "2px 8px", borderRadius: 3, border: "none", fontSize: 11, cursor: "pointer", fontWeight: 500, background: "var(--warning)", color: "#000" }}>
                      採用建議 → {issue.suggestion}
                    </button>
                  </div>
                )}
              </div>
            ))}
            {issues.length === 0 && !running && (
              <div style={{ color: "var(--text-3)", fontSize: 12, padding: "20px 8px" }}>執行分析後顯示問題列表</div>
            )}
          </div>
        </div>

        {/* LLM panel */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: 16, overflowY: "auto", gap: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)" }}>AI 整體評估</div>
          <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8, padding: 14, minHeight: 200 }}>
            {llmText && llmText !== "點擊「執行分析」開始分析..." ? (
              <MarkdownView markdown={llmText} />
            ) : (
              <span style={{ fontSize: 13, color: "var(--text-3)" }}>{llmText}</span>
            )}
            {running && <span style={{ display: "inline-block", width: 2, height: 14, background: "var(--accent)", marginLeft: 2, animation: "blink 1s infinite", verticalAlign: "text-bottom" }} />}
          </div>
        </div>
      </div>
    </div>
  );
}
