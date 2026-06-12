import { useState, useRef } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api, type GovSourceDoc, type GovConceptCard, type GovBusinessRule } from "../api.js";
import { useT } from "../i18n.js";
import { useStore } from "../store.js";

const S = {
  page: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg-1)" } as const,
  header: { padding: "16px 20px 0", borderBottom: "1px solid var(--border)", flexShrink: 0 } as const,
  title: { fontSize: 15, fontWeight: 700, color: "var(--text-1)", marginBottom: 8 } as const,
  tabs: { display: "flex", gap: 2 } as const,
  tab: (active: boolean) => ({
    padding: "7px 14px", fontSize: 12, fontWeight: 500, cursor: "pointer",
    border: "none", background: "transparent", borderRadius: "6px 6px 0 0",
    borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
    color: active ? "var(--accent)" : "var(--text-2)",
    fontFamily: "inherit", transition: "color 0.15s",
  } as const),
  body: { flex: 1, overflowY: "auto", padding: 20 } as const,
  card: { background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8, padding: 14, marginBottom: 8 } as const,
  badge: (status: string) => ({
    fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
    background: status === "approved" ? "rgba(74,222,128,0.15)" : status === "rejected" ? "rgba(248,113,113,0.15)" : "rgba(251,191,36,0.15)",
    color: status === "approved" ? "#4ade80" : status === "rejected" ? "#f87171" : "#fbbf24",
    border: `1px solid ${status === "approved" ? "rgba(74,222,128,0.3)" : status === "rejected" ? "rgba(248,113,113,0.3)" : "rgba(251,191,36,0.3)"}`,
  } as const),
  input: { width: "100%", background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text-1)", padding: "7px 10px", borderRadius: 6, fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" } as const,
};

type Tab = "docs" | "concepts" | "rules";

function SseLog({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <div style={{ background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 6, padding: 10, maxHeight: 160, overflowY: "auto", marginTop: 10 }}>
      {lines.map((l, i) => (
        <div key={i} style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-2)", marginBottom: 2 }}>{l}</div>
      ))}
    </div>
  );
}

function DocTab() {
  const qc = useQueryClient();
  const { showToast } = useStore();
  const t = useT();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", content: "" });
  const [extractingId, setExtractingId] = useState<number | null>(null);
  const [sseLines, setSseLines] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const { data: docs = [] } = useQuery({ queryKey: ["gov-sources"], queryFn: api.knowledge.listSources });

  const createMut = useMutation({
    mutationFn: () => api.knowledge.createSource({ title: form.title.trim(), content: form.content.trim() }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["gov-sources"] });
      setShowAdd(false); setForm({ title: "", content: "" });
      showToast("✓ 文件已新增");
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.knowledge.deleteSource(id),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["gov-sources"] }); showToast("✓ 已刪除"); },
  });

  async function extract(doc: GovSourceDoc) {
    if (extractingId != null) return;
    setExtractingId(doc.id); setSseLines([`正在抽取 "${doc.title}"...`]);
    abortRef.current = new AbortController();
    try {
      const res = await api.knowledge.extractSSE(doc.id);
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
          const ev = JSON.parse(line.slice(6)) as { type: string; data?: unknown };
          if (ev.type === "chunk-progress") setSseLines(prev => [...prev, `進度: ${JSON.stringify(ev.data)}`]);
          if (ev.type === "concept-draft") setSseLines(prev => [...prev, `✦ 概念: ${(ev.data as { stdName: string }).stdName}`]);
          if (ev.type === "rule-draft") setSseLines(prev => [...prev, `⊕ 規則: ${(ev.data as { title: string }).title}`]);
          if (ev.type === "done") {
            setSseLines(prev => [...prev, "✓ 抽取完成"]);
            await qc.invalidateQueries({ queryKey: ["gov-concepts"] });
            await qc.invalidateQueries({ queryKey: ["gov-rules"] });
          }
        }
      }
    } catch {
      setSseLines(prev => [...prev, "✗ 抽取失敗"]);
    } finally { setExtractingId(null); }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)} style={{ fontSize: 12 }}>
          + {t("gov.doc.upload")}
        </button>
      </div>

      {showAdd && (
        <div style={{ ...S.card, marginBottom: 16, border: "1px solid var(--accent)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{t("gov.doc.upload")}</div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.4px" }}>{t("gov.doc.title")}</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={S.input} placeholder="例：MES 系統規格書" />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.4px" }}>{t("gov.doc.content")}</label>
            <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              style={{ ...S.input, height: 160, resize: "vertical" } as React.CSSProperties}
              placeholder="貼入業務規格說明、資料定義、命名慣例等..." />
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>取消</button>
            <button className="btn btn-primary" disabled={!form.title.trim() || !form.content.trim() || createMut.isPending}
              onClick={() => createMut.mutate()}>儲存</button>
          </div>
        </div>
      )}

      {docs.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 0", color: "var(--text-3)", fontSize: 13 }}>尚無知識文件 — 點上方「上傳文件」開始</div>
      )}

      {docs.map(doc => (
        <div key={doc.id} style={S.card}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)", marginBottom: 2 }}>{doc.title}</div>
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>{typeof doc.chunks === "number" ? doc.chunks : (doc.chunks?.length ?? 0)} 段落 · {new Date(doc.createdAt).toLocaleDateString()}</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn btn-primary" style={{ fontSize: 11 }}
                disabled={extractingId === doc.id}
                onClick={() => void extract(doc)}>
                {extractingId === doc.id ? "抽取中…" : t("gov.concept.extract")}
              </button>
              <button className="btn btn-danger" style={{ fontSize: 11 }}
                onClick={() => deleteMut.mutate(doc.id)}>刪除</button>
            </div>
          </div>
          {doc.content && (
            <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)", whiteSpace: "pre-wrap", maxHeight: 60, overflow: "hidden" }}>
              {doc.content.slice(0, 300)}{doc.content.length > 300 ? "…" : ""}
            </div>
          )}
          {extractingId === doc.id && <SseLog lines={sseLines} />}
        </div>
      ))}
    </div>
  );
}

function ConceptTab() {
  const qc = useQueryClient();
  const { showToast } = useStore();
  const { data: concepts = [] } = useQuery({ queryKey: ["gov-concepts"], queryFn: () => api.knowledge.listConcepts() });

  const pendingConcepts = concepts.filter(c => c.status === "pending");
  const approvedConcepts = concepts.filter(c => c.status === "approved");

  const approveMut = useMutation({
    mutationFn: (id: number) => api.knowledge.approveConcept(id),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["gov-concepts"] }); showToast("✓ 概念已核准"); },
  });
  const rejectMut = useMutation({
    mutationFn: (id: number) => api.knowledge.rejectConcept(id),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["gov-concepts"] }); showToast("概念已拒絕"); },
  });

  return (
    <div>
      {pendingConcepts.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#fbbf24", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>
            待審核 ({pendingConcepts.length})
          </div>
          {pendingConcepts.map(c => <ConceptCard key={c.id} concept={c} onApprove={() => approveMut.mutate(c.id)} onReject={() => rejectMut.mutate(c.id)} />)}
        </div>
      )}

      {approvedConcepts.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>
            已核准 ({approvedConcepts.length})
          </div>
          {approvedConcepts.map(c => <ConceptCard key={c.id} concept={c} />)}
        </div>
      )}

      {concepts.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 0", color: "var(--text-3)", fontSize: 13 }}>尚無概念卡 — 請先上傳文件並執行 ✦ 抽取</div>
      )}
    </div>
  );
}

function ConceptCard({ concept, onApprove, onReject }: { concept: GovConceptCard; onApprove?: () => void; onReject?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ ...S.card, cursor: "pointer" }} onClick={() => setExpanded(v => !v)}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{concept.name}</span>
            <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>{concept.stdName}</span>
            <span style={S.badge(concept.status)}>{concept.status}</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: expanded ? "normal" : "nowrap" }}>
            {concept.definition}
          </div>
        </div>
        {concept.status === "pending" && onApprove && onReject && (
          <div style={{ display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
            <button className="btn btn-success" style={{ fontSize: 11 }} onClick={onApprove}>核准</button>
            <button className="btn btn-danger" style={{ fontSize: 11 }} onClick={onReject}>拒絕</button>
          </div>
        )}
      </div>
      {expanded && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
          {concept.aliases.length > 0 && (
            <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 4 }}>
              別名: {concept.aliases.join(", ")}
            </div>
          )}
          {concept.tableHints.length > 0 && (
            <div style={{ fontSize: 11, color: "var(--text-3)" }}>
              關聯表: {concept.tableHints.map(h => `${h.tableName} (${h.role})`).join(", ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RuleTab() {
  const qc = useQueryClient();
  const { showToast } = useStore();
  const { data: rules = [] } = useQuery({ queryKey: ["gov-rules"], queryFn: () => api.knowledge.listRules() });

  const pendingRules = rules.filter(r => r.status === "pending");
  const approvedRules = rules.filter(r => r.status === "approved");

  const approveMut = useMutation({
    mutationFn: (id: number) => api.knowledge.approveRule(id),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["gov-rules"] }); showToast("✓ 規則已核准"); },
  });
  const rejectMut = useMutation({
    mutationFn: (id: number) => api.knowledge.rejectRule(id),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["gov-rules"] }); showToast("規則已拒絕"); },
  });

  return (
    <div>
      {pendingRules.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#fbbf24", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>
            待審核 ({pendingRules.length})
          </div>
          {pendingRules.map(r => <RuleCard key={r.id} rule={r} onApprove={() => approveMut.mutate(r.id)} onReject={() => rejectMut.mutate(r.id)} />)}
        </div>
      )}
      {approvedRules.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>
            已核准 ({approvedRules.length})
          </div>
          {approvedRules.map(r => <RuleCard key={r.id} rule={r} />)}
        </div>
      )}
      {rules.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 0", color: "var(--text-3)", fontSize: 13 }}>尚無業務規則 — 請先上傳文件並執行 ✦ 抽取</div>
      )}
    </div>
  );
}

function RuleCard({ rule, onApprove, onReject }: { rule: GovBusinessRule; onApprove?: () => void; onReject?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ ...S.card, cursor: "pointer" }} onClick={() => setExpanded(v => !v)}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{rule.title}</span>
            <span style={{ fontSize: 10, color: "var(--text-3)", background: "var(--bg-3)", padding: "1px 5px", borderRadius: 3 }}>{rule.ruleType}</span>
            <span style={S.badge(rule.status)}>{rule.status}</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: expanded ? "normal" : "nowrap" }}>
            {rule.statement}
          </div>
        </div>
        {rule.status === "pending" && onApprove && onReject && (
          <div style={{ display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
            <button className="btn btn-success" style={{ fontSize: 11 }} onClick={onApprove}>核准</button>
            <button className="btn btn-danger" style={{ fontSize: 11 }} onClick={onReject}>拒絕</button>
          </div>
        )}
      </div>
      {expanded && rule.machine && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
          <pre style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-3)", margin: 0, whiteSpace: "pre-wrap" }}>
            {JSON.stringify(rule.machine, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function KnowledgePage() {
  const [tab, setTab] = useState<Tab>("docs");
  const { data: concepts = [] } = useQuery({ queryKey: ["gov-concepts"], queryFn: () => api.knowledge.listConcepts() });
  const { data: rules = [] } = useQuery({ queryKey: ["gov-rules"], queryFn: () => api.knowledge.listRules() });
  const pendingCount = concepts.filter(c => c.status === "pending").length + rules.filter(r => r.status === "pending").length;

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={S.title}>
          知識庫
          {pendingCount > 0 && (
            <span style={{ marginLeft: 8, fontSize: 10, background: "#fbbf2440", color: "#fbbf24", border: "1px solid #fbbf2460", borderRadius: 10, padding: "1px 7px" }}>
              {pendingCount} 待審
            </span>
          )}
        </div>
        <div style={S.tabs}>
          <button style={S.tab(tab === "docs")} onClick={() => setTab("docs")}>文件</button>
          <button style={S.tab(tab === "concepts")} onClick={() => setTab("concepts")}>
            概念卡 {concepts.filter(c => c.status === "pending").length > 0 && `(${concepts.filter(c => c.status === "pending").length})`}
          </button>
          <button style={S.tab(tab === "rules")} onClick={() => setTab("rules")}>
            業務規則 {rules.filter(r => r.status === "pending").length > 0 && `(${rules.filter(r => r.status === "pending").length})`}
          </button>
        </div>
      </div>
      <div style={S.body}>
        {tab === "docs" && <DocTab />}
        {tab === "concepts" && <ConceptTab />}
        {tab === "rules" && <RuleTab />}
      </div>
    </div>
  );
}
