import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api, type GovWtDraft, type GovProposedColumn, type GovValidationReport, type GovGovernedWideTable } from "../api.js";
import { useStore } from "../store.js";
import { useResizable } from "../hooks/useResizable.js";

const S = {
  page: { flex: 1, display: "flex", overflow: "hidden", background: "var(--bg-1)" } as const,
  list: { width: 260, flexShrink: 0, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", overflow: "hidden" } as const,
  listHead: { padding: "12px 14px", borderBottom: "1px solid var(--border)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" } as const,
  items: { flex: 1, overflowY: "auto" } as const,
  item: (active: boolean) => ({
    padding: "10px 14px", borderBottom: "1px solid var(--border)", cursor: "pointer",
    background: active ? "var(--accent-dim)" : "transparent",
    borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
  } as const),
  main: { flex: 1, display: "flex", overflow: "hidden" } as const,
  draftStatus: (s: string) => ({
    fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3,
    background: s === "passed" ? "rgba(74,222,128,0.15)" : s === "failed" ? "rgba(248,113,113,0.15)" : s === "published" ? "rgba(96,165,250,0.15)" : "rgba(251,191,36,0.15)",
    color: s === "passed" ? "#4ade80" : s === "failed" ? "#f87171" : s === "published" ? "#60a5fa" : "#fbbf24",
    border: `1px solid ${s === "passed" ? "rgba(74,222,128,0.3)" : s === "failed" ? "rgba(248,113,113,0.3)" : s === "published" ? "rgba(96,165,250,0.3)" : "rgba(251,191,36,0.3)"}`,
  } as const),
};

function ValidationBadge({ report }: { report: GovValidationReport | null }) {
  if (!report) return null;
  const failCount = report.ruleResults.filter(r => !r.passed).length;
  if (report.summary.passed) {
    return <span style={{ fontSize: 11, color: "#4ade80" }}>✓ 全部通過</span>;
  }
  return <span style={{ fontSize: 11, color: "#f87171" }}>✗ {failCount} 項失敗</span>;
}

function DraftEditor({ draft, impactedGoverned }: { draft: GovWtDraft; impactedGoverned?: GovGovernedWideTable }) {
  const qc = useQueryClient();
  const { showToast } = useStore();
  const [activeTab, setActiveTab] = useState<"columns" | "log" | "validate">("columns");
  const [editingCol, setEditingCol] = useState<number | null>(null);
  const [colDef, setColDef] = useState("");
  const [showSql, setShowSql] = useState(false);
  const [sql, setSql] = useState("");
  const [validationReport, setValidationReport] = useState<GovValidationReport | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishedBy, setPublishedBy] = useState("");

  const patchMut = useMutation({
    mutationFn: (patch: Partial<GovWtDraft>) => api.workspace.patch(draft.id, patch),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["gov-drafts"] });
      setEditingCol(null);
    },
  });

  const validateMut = useMutation({
    mutationFn: () => api.workspace.validate(draft.id),
    onSuccess: async (report) => {
      setValidationReport(report);
      await qc.invalidateQueries({ queryKey: ["gov-drafts"] });
      setActiveTab("validate");
      if (report.summary.passed) showToast("✓ 驗證全部通過");
      else showToast("⚠ 驗證有失敗項目");
    },
  });

  const publishMut = useMutation({
    mutationFn: () => api.workspace.publish(draft.id, { publishedBy: publishedBy.trim() || "admin" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["gov-drafts"] });
      showToast("✓ 已發布至治理目錄");
      setPublishing(false);
    },
  });

  const saveVersionMut = useMutation({
    mutationFn: () => api.workspace.saveVersion(draft.id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["gov-drafts"] });
      showToast("✓ 版本已儲存");
    },
  });

  async function previewSql() {
    try {
      const res = await api.workspace.previewSql(draft.id);
      setSql(res.sql);
      setShowSql(true);
    } catch { showToast("SQL 預覽失敗"); }
  }

  function saveColDef(idx: number) {
    const updated: GovProposedColumn[] = draft.columns.map((c, i) =>
      i === idx ? { ...c, definition: colDef } : c
    );
    patchMut.mutate({ columns: updated });
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{draft.name}</span>
            <span style={{ fontSize: 9, background: draft.blockKind === "small" ? "rgba(52,211,153,0.15)" : "rgba(167,139,250,0.15)", color: draft.blockKind === "small" ? "#34d399" : "#a78bfa", padding: "1px 5px", borderRadius: 3, fontWeight: 700 }}>{draft.blockKind}</span>
            <span style={S.draftStatus(draft.status)}>{draft.status}</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-3)" }}>{draft.columns.length} 欄位 · {draft.joinGraph.length} JOIN</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => saveVersionMut.mutate()}>儲存版本</button>
          <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => void previewSql()}>SQL 預覽</button>
          <button className="btn btn-ghost" style={{ fontSize: 11 }} disabled={validateMut.isPending}
            onClick={() => validateMut.mutate()}>
            {validateMut.isPending ? "驗證中…" : "執行驗證"}
          </button>
          {draft.status === "passed" && !publishing && (
            <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={() => setPublishing(true)}>發布</button>
          )}
        </div>
      </div>

      {/* T10.3: Impacted banner */}
      {impactedGoverned?.impacted && (
        <div style={{ padding: "8px 20px", background: "rgba(248,113,113,0.08)", borderBottom: "1px solid rgba(248,113,113,0.3)", flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: "#f87171", fontWeight: 700, marginBottom: 2 }}>
            ⚠ 已發布版本受影響 — {impactedGoverned.impacted.cause}
          </div>
          {impactedGoverned.impacted.brokenColumns.length > 0 && (
            <div style={{ fontSize: 11, color: "#f87171" }}>
              斷鏈欄位: {impactedGoverned.impacted.brokenColumns.join(", ")}
              {" · "}
              <em style={{ fontStyle: "normal", opacity: 0.8 }}>請修正欄位來源後重新驗證並發布以解除。</em>
            </div>
          )}
        </div>
      )}

      {publishing && (
        <div style={{ padding: "8px 20px", background: "var(--bg-2)", borderBottom: "1px solid var(--border)", flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "var(--text-2)" }}>發布者:</span>
          <input value={publishedBy} onChange={e => setPublishedBy(e.target.value)} placeholder="你的名稱"
            style={{ background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text-1)", padding: "4px 8px", borderRadius: 5, fontSize: 12, outline: "none", width: 160 }} />
          <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={() => publishMut.mutate()}>確認發布</button>
          <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setPublishing(false)}>取消</button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, padding: "0 20px", borderBottom: "1px solid var(--border)", flexShrink: 0, background: "var(--bg-2)" }}>
        {(["columns", "log", "validate"] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{ padding: "7px 12px", fontSize: 12, cursor: "pointer", border: "none", background: "transparent", fontFamily: "inherit",
              borderBottom: activeTab === tab ? "2px solid var(--accent)" : "2px solid transparent",
              color: activeTab === tab ? "var(--accent)" : "var(--text-2)" }}>
            {tab === "columns" ? "欄位編輯" : tab === "log" ? "修改記錄" : "驗證報告"}
          </button>
        ))}
        {validationReport && <div style={{ padding: "7px 8px", fontSize: 11 }}><ValidationBadge report={validationReport} /></div>}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {activeTab === "columns" && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "var(--bg-2)", borderBottom: "1px solid var(--border)" }}>
                {["column", "type", "source", "definition", ""].map(h => (
                  <th key={h} style={{ padding: "7px 14px", textAlign: "left", color: "var(--text-3)", fontWeight: 600, fontSize: 10, textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {draft.columns.map((col, idx) => (
                <tr key={idx} style={{ borderBottom: "1px solid var(--border)", background: (col as { _phantom?: boolean })._phantom ? "rgba(248,113,113,0.05)" : "transparent" }}>
                  <td style={{ padding: "7px 14px", fontFamily: "var(--font-mono)", color: (col as { _phantom?: boolean })._phantom ? "#f87171" : "var(--text-1)" }}>
                    {col.name}{(col as { _phantom?: boolean })._phantom && " ⚠"}
                  </td>
                  <td style={{ padding: "7px 14px", fontFamily: "var(--font-mono)", color: "var(--text-3)" }}>{col.dataType}</td>
                  <td style={{ padding: "7px 14px", fontFamily: "var(--font-mono)", color: "var(--text-3)", fontSize: 11 }}>{col.source.tableName}.{col.source.fieldName}</td>
                  <td style={{ padding: "7px 14px", color: "var(--text-2)", maxWidth: 280 }}>
                    {editingCol === idx ? (
                      <input value={colDef} onChange={e => setColDef(e.target.value)}
                        style={{ width: "100%", background: "var(--bg-3)", border: "1px solid var(--accent)", color: "var(--text-1)", padding: "4px 7px", borderRadius: 4, fontSize: 12, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
                    ) : (
                      <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{col.definition || <em style={{ color: "var(--text-3)" }}>未填寫</em>}</span>
                    )}
                  </td>
                  <td style={{ padding: "7px 14px" }}>
                    {editingCol === idx ? (
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="btn btn-primary" style={{ fontSize: 10, padding: "2px 7px" }} onClick={() => saveColDef(idx)}>儲存</button>
                        <button className="btn btn-ghost" style={{ fontSize: 10, padding: "2px 7px" }} onClick={() => setEditingCol(null)}>取消</button>
                      </div>
                    ) : (
                      <button className="btn btn-ghost" style={{ fontSize: 10, padding: "2px 7px" }}
                        onClick={() => { setEditingCol(idx); setColDef(col.definition); }}>編輯</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {activeTab === "log" && (
          <div style={{ padding: 16 }}>
            {draft.editLog.length === 0 ? (
              <div style={{ color: "var(--text-3)", fontSize: 12, textAlign: "center", padding: "24px 0" }}>尚無修改記錄</div>
            ) : (
              draft.editLog.map((entry, i) => (
                <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, padding: "8px 12px", background: "var(--bg-2)", borderRadius: 6, border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 10, color: "var(--text-3)", flexShrink: 0 }}>{new Date(entry.at).toLocaleString()}</div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-1)" }}>{entry.action}</span>
                    <span style={{ fontSize: 11, color: "var(--text-3)", marginLeft: 6 }}>{entry.detail}</span>
                    <span style={{ fontSize: 10, color: "var(--text-3)", marginLeft: 6 }}>by {entry.by}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "validate" && (
          <div style={{ padding: 16 }}>
            {!validationReport && <div style={{ color: "var(--text-3)", fontSize: 12, textAlign: "center", padding: "24px 0" }}>點「執行驗證」開始治理規則檢查</div>}
            {validationReport && validationReport.ruleResults.map(r => (
              <div key={r.ruleId} style={{ marginBottom: 8, padding: "10px 14px", background: "var(--bg-2)", borderRadius: 6, border: `1px solid ${r.passed ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}`, borderLeft: `3px solid ${r.passed ? "#4ade80" : "#f87171"}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: r.violations.length > 0 ? 6 : 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: r.passed ? "#4ade80" : "#f87171" }}>{r.passed ? "✓" : "✗"}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)", fontFamily: "var(--font-mono)" }}>{r.ruleId}</span>
                </div>
                {r.violations.map((v, vi) => (
                  <div key={vi} style={{ fontSize: 11, color: "#f87171", paddingLeft: 20 }}>
                    · {v.target}: {v.message}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SQL Preview Modal */}
      {showSql && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 700, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowSql(false)}>
          <div style={{ background: "var(--bg-2)", border: "1px solid var(--border-light)", borderRadius: 10, width: "min(760px, 92vw)", padding: 20 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>SQL 預覽 — {draft.name}</div>
            <pre style={{ background: "var(--bg-3)", borderRadius: 6, padding: 14, fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-1)", overflowX: "auto", maxHeight: 400, margin: "0 0 14px" }}>{sql}</pre>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="btn btn-ghost" onClick={() => setShowSql(false)}>關閉</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helper: derive governed slug from draft name ──────────────────────────────
function draftToSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export default function WorkspacePage() {
  const [selected, setSelected] = useState<number | null>(null);
  const { data: drafts = [] } = useQuery({ queryKey: ["gov-drafts"], queryFn: api.workspace.list });
  const { data: governed = [] } = useQuery({ queryKey: ["gov-catalog"], queryFn: api.catalog.list });
  // Build map: slug → governed (to check impacted)
  const governedBySlug = new Map<string, GovGovernedWideTable>(governed.map(g => [g.slug, g]));
  const selectedDraft = drafts.find(d => d.id === selected) ?? null;
  const { size: listW, onMouseDown } = useResizable(260, "horizontal", 140, 500);

  return (
    <div style={S.page}>
      <div style={{ ...S.list, width: listW }}>
        <div style={S.listHead}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>工作區草稿</span>
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>{drafts.length}</span>
        </div>
        <div style={S.items}>
          {drafts.length === 0 && (
            <div style={{ padding: "24px 14px", fontSize: 12, color: "var(--text-3)", textAlign: "center" }}>尚無草稿 — 請在情境組裝頁轉入</div>
          )}
          {drafts.map(d => {
            const correspondingGov = governedBySlug.get(draftToSlug(d.name));
            const isImpacted = !!(correspondingGov?.impacted);
            return (
              <div key={d.id} style={S.item(selected === d.id)} onClick={() => setSelected(d.id)}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: selected === d.id ? "var(--accent)" : "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                  {isImpacted && (
                    <span title={correspondingGov?.impacted?.cause} style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: "rgba(248,113,113,0.15)", color: "#f87171", border: "1px solid rgba(248,113,113,0.3)", flexShrink: 0 }}>⚠</span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={S.draftStatus(d.status)}>{d.status}</span>
                  <span style={{ fontSize: 9, color: "var(--text-3)" }}>{d.columns.length} 欄位</span>
                </div>
              </div>
            );
          })}
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

      <div style={S.main}>
        {selectedDraft ? (
          <DraftEditor key={selectedDraft.id} draft={selectedDraft} {...(governedBySlug.has(draftToSlug(selectedDraft.name)) ? { impactedGoverned: governedBySlug.get(draftToSlug(selectedDraft.name))! } : {})} />
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)", fontSize: 13 }}>
            選擇左側草稿開始審閱與編輯
          </div>
        )}
      </div>
    </div>
  );
}
