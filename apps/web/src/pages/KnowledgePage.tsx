import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api, type GovSourceDoc, type GovConceptCard, type GovBusinessRule } from "../api.js";
import { useT } from "../i18n.js";
import { useStore } from "../store.js";
import type { DomainDef } from "../api.js";

const S = {
  page: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg-1)" } as const,
  header: { padding: "12px 20px 0", borderBottom: "1px solid var(--border)", flexShrink: 0 } as const,
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

// ── Domain Splash ─────────────────────────────────────────────────────────────
function DomainSplash({ domains }: { domains: DomainDef[] }) {
  const { setKnowledgeDomain } = useStore();
  const { data: docs = [] } = useQuery({ queryKey: ["gov-sources"], queryFn: () => api.knowledge.listSources() });
  const { data: concepts = [] } = useQuery({ queryKey: ["gov-concepts"], queryFn: () => api.knowledge.listConcepts() });
  const { data: rules = [] } = useQuery({ queryKey: ["gov-rules"], queryFn: () => api.knowledge.listRules() });

  function countForDomain(d: string) {
    return docs.filter(x => x.domain === d).length
      + concepts.filter(x => x.domain === d).length
      + rules.filter(x => x.domain === d).length;
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", overflowY: "auto" }}>
      <div style={{ maxWidth: 720, width: "100%", display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 8, color: "var(--accent)" }}>⊕</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", marginBottom: 6 }}>選擇知識庫 Domain</div>
          <div style={{ fontSize: 13, color: "var(--text-3)" }}>選擇你要管理的業務領域，或顯示全部知識</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {/* ALL option */}
          <button onClick={() => setKnowledgeDomain(null, true)}
            style={{ padding: "20px 16px", borderRadius: 12, border: "2px solid var(--border)", background: "var(--bg-2)", cursor: "pointer", textAlign: "left", transition: "all 0.15s", display: "flex", flexDirection: "column", gap: 8 }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLButtonElement).style.background = "var(--accent-dim)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-2)"; }}>
            <div style={{ fontSize: 22 }}>⊞</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", marginBottom: 2 }}>ALL</div>
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>顯示全部知識</div>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: "auto" }}>
              {docs.length + concepts.length + rules.length} 筆知識
            </div>
          </button>

          {domains.map(d => {
            const color = d.color ?? "var(--accent)";
            const count = countForDomain(d.id);
            return (
              <button key={d.id} onClick={() => setKnowledgeDomain(d.id, true)}
                style={{ padding: "20px 16px", borderRadius: 12, border: "2px solid var(--border)", background: "var(--bg-2)", cursor: "pointer", textAlign: "left", transition: "all 0.15s", display: "flex", flexDirection: "column", gap: 8 }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = color; (e.currentTarget as HTMLButtonElement).style.background = `${color}18`; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-2)"; }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: color }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", marginBottom: 2 }}>{d.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-3)" }}>{d.id}</div>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: "auto" }}>{count} 筆知識</div>
              </button>
            );
          })}
        </div>

        {domains.length === 0 && (
          <div style={{ textAlign: "center", color: "var(--text-3)", fontSize: 12 }}>
            尚未建立 Domain — 可至設定頁建立
            <button onClick={() => setKnowledgeDomain(null, true)}
              style={{ marginLeft: 12, padding: "4px 14px", borderRadius: 6, border: "none", background: "var(--accent)", color: "#fff", cursor: "pointer", fontSize: 12 }}>
              直接進入 →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── SseLog ─────────────────────────────────────────────────────────────────────
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

// ── Doc Viewer Modal ──────────────────────────────────────────────────────────
function DocViewerModal({ docId, onClose }: { docId: number; onClose: () => void }) {
  const { data: doc } = useQuery({ queryKey: ["gov-source", docId], queryFn: () => api.knowledge.getSource(docId) });
  const { data: concepts = [] } = useQuery({ queryKey: ["gov-concepts"], queryFn: () => api.knowledge.listConcepts() });
  const { data: rules = [] } = useQuery({ queryKey: ["gov-rules"], queryFn: () => api.knowledge.listRules() });

  useEffect(() => {
    const handle = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [onClose]);

  const docConcepts = concepts.filter(c => c.sourceRefs.some(r => r.docId === docId));
  const docRules = rules.filter(r => r.sourceRefs.some(r2 => r2.docId === docId));
  const chunkCount = typeof doc?.chunks === "number" ? doc.chunks : (doc?.chunks?.length ?? 0);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 800, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "var(--bg-2)", border: "1px solid var(--border-light)", borderRadius: 10, width: "min(900px, 95vw)", height: "min(700px, 90vh)", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>{doc?.title ?? "載入中…"}</div>
            {doc && (
              <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2, display: "flex", gap: 10 }}>
                <span>{chunkCount} 段落</span>
                <span>{new Date(doc.createdAt).toLocaleString()}</span>
                {doc.originalFilename && <span>📎 {doc.originalFilename}</span>}
                {doc.minioKey && <span style={{ color: "#60a5fa" }}>☁ Minio</span>}
              </div>
            )}
          </div>
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={onClose}>✕ 關閉</button>
        </div>
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          <div style={{ flex: 1, overflowY: "auto", padding: 16, borderRight: "1px solid var(--border)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>文件全文</div>
            {doc?.content ? (
              <pre style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-1)", whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, lineHeight: 1.6 }}>{doc.content}</pre>
            ) : (
              <div style={{ color: "var(--text-3)", fontSize: 12 }}>載入中…</div>
            )}
          </div>
          <div style={{ width: 280, flexShrink: 0, overflowY: "auto", padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>已抽取內容</div>
            {docConcepts.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#a78bfa", textTransform: "uppercase", marginBottom: 6 }}>概念卡 ({docConcepts.length})</div>
                {docConcepts.map(c => (
                  <div key={c.id} style={{ padding: "6px 8px", background: "var(--bg-3)", borderRadius: 5, marginBottom: 4, borderLeft: "2px solid #a78bfa" }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-1)" }}>{c.name}</div>
                    <div style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>{c.stdName}</div>
                    <span style={S.badge(c.status)}>{c.status}</span>
                  </div>
                ))}
              </div>
            )}
            {docRules.length > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", marginBottom: 6 }}>業務規則 ({docRules.length})</div>
                {docRules.map(r => (
                  <div key={r.id} style={{ padding: "6px 8px", background: "var(--bg-3)", borderRadius: 5, marginBottom: 4, borderLeft: "2px solid #60a5fa" }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-1)", marginBottom: 2 }}>{r.title}</div>
                    <div style={{ fontSize: 10, color: "var(--text-3)" }}>{r.statement.slice(0, 80)}{r.statement.length > 80 ? "…" : ""}</div>
                    <span style={S.badge(r.status)}>{r.status}</span>
                  </div>
                ))}
              </div>
            )}
            {docConcepts.length === 0 && docRules.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--text-3)" }}>尚未進行 LLM 抽取</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── DocTab ─────────────────────────────────────────────────────────────────────
function DocTab({ domain }: { domain: string | null }) {
  const qc = useQueryClient();
  const { showToast } = useStore();
  const t = useT();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", content: "", originalFilename: "" });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ title: "", content: "" });
  const [extractingId, setExtractingId] = useState<number | null>(null);
  const [sseLines, setSseLines] = useState<string[]>([]);
  const [viewingDocId, setViewingDocId] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: docs = [] } = useQuery({
    queryKey: ["gov-sources", domain],
    queryFn: () => api.knowledge.listSources(domain ?? undefined),
  });

  const createMut = useMutation({
    mutationFn: () => {
      const payload: Parameters<typeof api.knowledge.createSource>[0] = {
        title: form.title.trim(), content: form.content.trim(), format: "markdown",
      };
      if (domain) payload.domain = domain;
      if (form.originalFilename) payload.originalFilename = form.originalFilename;
      return api.knowledge.createSource(payload);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["gov-sources"] });
      setShowAdd(false); setForm({ title: "", content: "", originalFilename: "" });
      showToast("✓ 文件已新增");
    },
  });

  const patchMut = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: { title?: string; content?: string } }) =>
      api.knowledge.patchSource(id, patch),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["gov-sources"] });
      setEditingId(null); showToast("✓ 文件已更新");
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.knowledge.deleteSource(id),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["gov-sources"] }); showToast("✓ 已刪除"); },
  });

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const content = ev.target?.result as string;
      const title = form.title.trim() || file.name.replace(/\.[^.]+$/, "");
      setForm(f => ({ ...f, title, content, originalFilename: file.name }));
    };
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  }

  function startEdit(doc: GovSourceDoc) {
    setEditingId(doc.id);
    setEditForm({ title: doc.title, content: "" });
  }

  async function extract(doc: GovSourceDoc) {
    if (extractingId !== null) return;
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
          if (ev.type === "concept-draft") setSseLines(prev => [...prev, `✦ 概念: ${(ev.data as { stdName: string }).stdName}`]);
          if (ev.type === "rule-draft") setSseLines(prev => [...prev, `⊕ 規則: ${(ev.data as { title: string }).title}`]);
          if (ev.type === "done") {
            setSseLines(prev => [...prev, "✓ 抽取完成"]);
            await qc.invalidateQueries({ queryKey: ["gov-concepts"] });
            await qc.invalidateQueries({ queryKey: ["gov-rules"] });
          }
        }
      }
    } catch { setSseLines(prev => [...prev, "✗ 抽取失敗"]); }
    finally { setExtractingId(null); }
  }

  return (
    <div>
      <input ref={fileInputRef} type="file" accept=".md,.txt,.sql,.csv" style={{ display: "none" }} onChange={handleFileSelect} />

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12 }}>
        <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => fileInputRef.current?.click()}>📎 從檔案選取</button>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)} style={{ fontSize: 12 }}>+ 新增文件</button>
      </div>

      {showAdd && (
        <div style={{ ...S.card, marginBottom: 16, border: "1px solid var(--accent)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
            新增文件
            {form.originalFilename && <span style={{ marginLeft: 8, fontSize: 11, color: "#60a5fa" }}>📎 {form.originalFilename}</span>}
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 3, textTransform: "uppercase" }}>標題</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={S.input} placeholder="例：MES 系統規格書" />
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
              <label style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase" }}>內容</label>
              <button className="btn btn-ghost" style={{ fontSize: 10, padding: "2px 8px" }} onClick={() => fileInputRef.current?.click()}>📎 選擇檔案</button>
            </div>
            <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              style={{ ...S.input, height: 140, resize: "vertical" } as React.CSSProperties}
              placeholder="貼入業務規格說明，或點「選擇檔案」讀入 .md / .txt / .sql..." />
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn btn-ghost" onClick={() => { setShowAdd(false); setForm({ title: "", content: "", originalFilename: "" }); }}>取消</button>
            <button className="btn btn-primary" disabled={!form.title.trim() || !form.content.trim() || createMut.isPending}
              onClick={() => createMut.mutate()}>儲存</button>
          </div>
        </div>
      )}

      {docs.length === 0 && !showAdd && (
        <div style={{ textAlign: "center", padding: "48px 0", color: "var(--text-3)", fontSize: 13 }}>
          此 Domain 尚無知識文件 — 點「+ 新增文件」或「📎 從檔案選取」開始
        </div>
      )}

      {docs.map(doc => (
        <div key={doc.id} style={S.card}>
          {editingId === doc.id ? (
            <div>
              <input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                style={{ ...S.input, marginBottom: 8, fontWeight: 600 }} />
              <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 4 }}>
                留空則不更新內容（只改標題）
              </div>
              <textarea value={editForm.content} onChange={e => setEditForm(f => ({ ...f, content: e.target.value }))}
                style={{ ...S.input, height: 120, resize: "vertical", marginBottom: 8 } as React.CSSProperties}
                placeholder="留空保持原內容，或貼入新內容..." />
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setEditingId(null)}>取消</button>
                <button className="btn btn-primary" style={{ fontSize: 11 }} disabled={patchMut.isPending}
                  onClick={() => {
                    const patch: { title?: string; content?: string } = {};
                    if (editForm.title.trim()) patch.title = editForm.title.trim();
                    if (editForm.content.trim()) patch.content = editForm.content.trim();
                    patchMut.mutate({ id: doc.id, patch });
                  }}>儲存</button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}
                onClick={() => setViewingDocId(doc.id)}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)", marginBottom: 2 }}>{doc.title}</div>
                  <div style={{ fontSize: 11, color: "var(--text-3)", display: "flex", gap: 8 }}>
                    <span>{typeof doc.chunks === "number" ? doc.chunks : (doc.chunks?.length ?? 0)} 段落</span>
                    <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                    {doc.originalFilename && <span>📎 {doc.originalFilename}</span>}
                    {doc.minioKey && <span style={{ color: "#60a5fa" }}>☁ Minio</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
                  <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setViewingDocId(doc.id)}>閱讀</button>
                  <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => startEdit(doc)}>編輯</button>
                  <button className="btn btn-primary" style={{ fontSize: 11 }} disabled={extractingId === doc.id}
                    onClick={() => void extract(doc)}>
                    {extractingId === doc.id ? "抽取中…" : t("gov.concept.extract")}
                  </button>
                  <button className="btn btn-danger" style={{ fontSize: 11 }} onClick={() => deleteMut.mutate(doc.id)}>刪除</button>
                </div>
              </div>
              {extractingId === doc.id && <SseLog lines={sseLines} />}
            </>
          )}
        </div>
      ))}

      {viewingDocId !== null && (
        <DocViewerModal docId={viewingDocId} onClose={() => setViewingDocId(null)} />
      )}
    </div>
  );
}

// ── ConceptTab ────────────────────────────────────────────────────────────────
function ConceptTab({ domain }: { domain: string | null }) {
  const qc = useQueryClient();
  const { showToast } = useStore();
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", stdName: "", definition: "", aliases: "" });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: "", definition: "", aliases: "" });

  const { data: concepts = [] } = useQuery({
    queryKey: ["gov-concepts", domain],
    queryFn: () => api.knowledge.listConcepts(domain ? { domain } : undefined),
  });

  const createMut = useMutation({
    mutationFn: () => {
      const payload: Parameters<typeof api.knowledge.createConcept>[0] = {
        name: addForm.name.trim(),
        std_name: addForm.stdName.trim().toLowerCase().replace(/\s+/g, "_"),
        definition: addForm.definition.trim(),
        aliases: addForm.aliases.split(",").map(a => a.trim()).filter(Boolean),
      };
      if (domain) payload.domain = domain;
      return api.knowledge.createConcept(payload);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["gov-concepts"] });
      setShowAdd(false); setAddForm({ name: "", stdName: "", definition: "", aliases: "" });
      showToast("✓ 概念已建立");
    },
  });

  const patchMut = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Parameters<typeof api.knowledge.patchConcept>[1] }) =>
      api.knowledge.patchConcept(id, patch),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["gov-concepts"] });
      setEditingId(null); showToast("✓ 概念已更新");
    },
  });

  const approveMut = useMutation({
    mutationFn: (id: number) => api.knowledge.approveConcept(id),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["gov-concepts"] }); showToast("✓ 概念已核准"); },
  });
  const rejectMut = useMutation({
    mutationFn: (id: number) => api.knowledge.rejectConcept(id),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["gov-concepts"] }); showToast("概念已拒絕"); },
  });

  const pendingConcepts = concepts.filter(c => c.status === "pending");
  const approvedConcepts = concepts.filter(c => c.status === "approved");

  function startEdit(c: GovConceptCard) {
    setEditingId(c.id);
    setEditForm({ name: c.name, definition: c.definition, aliases: c.aliases.join(", ") });
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setShowAdd(true)}>+ 新增概念卡</button>
      </div>

      {showAdd && (
        <div style={{ ...S.card, marginBottom: 16, border: "1px solid var(--accent)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>新增概念卡</div>
          {[
            { label: "概念名稱", key: "name" as const, placeholder: "例：批次 (Lot)" },
            { label: "標準名稱 (snake_case)", key: "stdName" as const, placeholder: "例：lot" },
            { label: "別名（逗號分隔）", key: "aliases" as const, placeholder: "例：wafer lot, work-in-process" },
          ].map(f => (
            <div key={f.key} style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 3, textTransform: "uppercase" }}>{f.label}</label>
              <input value={addForm[f.key]} onChange={e => setAddForm(p => ({ ...p, [f.key]: e.target.value }))} style={S.input} placeholder={f.placeholder} />
            </div>
          ))}
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 3, textTransform: "uppercase" }}>定義</label>
            <textarea value={addForm.definition} onChange={e => setAddForm(p => ({ ...p, definition: e.target.value }))}
              style={{ ...S.input, height: 80, resize: "vertical" } as React.CSSProperties} placeholder="清楚描述此概念的業務含義..." />
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn btn-ghost" onClick={() => { setShowAdd(false); setAddForm({ name: "", stdName: "", definition: "", aliases: "" }); }}>取消</button>
            <button className="btn btn-primary" disabled={!addForm.name.trim() || !addForm.stdName.trim() || !addForm.definition.trim() || createMut.isPending}
              onClick={() => createMut.mutate()}>建立</button>
          </div>
        </div>
      )}

      {concepts.length === 0 && !showAdd && (
        <div style={{ textAlign: "center", padding: "48px 0", color: "var(--text-3)", fontSize: 13 }}>
          此 Domain 尚無概念卡 — 點「+ 新增概念卡」或上傳文件並執行 ✦ 抽取
        </div>
      )}

      {pendingConcepts.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#fbbf24", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>待審核 ({pendingConcepts.length})</div>
          {pendingConcepts.map(c => (
            <ConceptCardItem key={c.id} concept={c} editing={editingId === c.id} editForm={editForm}
              onEditFormChange={f => setEditForm(prev => ({ ...prev, ...f }))}
              onStartEdit={() => startEdit(c)}
              onSaveEdit={() => patchMut.mutate({ id: c.id, patch: { name: editForm.name, definition: editForm.definition, aliases: editForm.aliases.split(",").map(a => a.trim()).filter(Boolean) } })}
              onCancelEdit={() => setEditingId(null)}
              onApprove={() => approveMut.mutate(c.id)}
              onReject={() => rejectMut.mutate(c.id)} />
          ))}
        </div>
      )}
      {approvedConcepts.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>已核准 ({approvedConcepts.length})</div>
          {approvedConcepts.map(c => (
            <ConceptCardItem key={c.id} concept={c} editing={editingId === c.id} editForm={editForm}
              onEditFormChange={f => setEditForm(prev => ({ ...prev, ...f }))}
              onStartEdit={() => startEdit(c)}
              onSaveEdit={() => patchMut.mutate({ id: c.id, patch: { name: editForm.name, definition: editForm.definition, aliases: editForm.aliases.split(",").map(a => a.trim()).filter(Boolean) } })}
              onCancelEdit={() => setEditingId(null)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ConceptCardItem({ concept, editing, editForm, onEditFormChange, onStartEdit, onSaveEdit, onCancelEdit, onApprove, onReject }: {
  concept: GovConceptCard;
  editing: boolean;
  editForm: { name: string; definition: string; aliases: string };
  onEditFormChange: (f: Partial<{ name: string; definition: string; aliases: string }>) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onApprove?: () => void;
  onReject?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (editing) {
    return (
      <div style={{ ...S.card, borderColor: "var(--accent)" }}>
        <div style={{ marginBottom: 6 }}>
          <label style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase" }}>名稱</label>
          <input value={editForm.name} onChange={e => onEditFormChange({ name: e.target.value })} style={{ ...S.input, marginTop: 2 }} />
        </div>
        <div style={{ marginBottom: 6 }}>
          <label style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase" }}>定義</label>
          <textarea value={editForm.definition} onChange={e => onEditFormChange({ definition: e.target.value })}
            style={{ ...S.input, height: 80, resize: "vertical", marginTop: 2 } as React.CSSProperties} />
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase" }}>別名（逗號分隔）</label>
          <input value={editForm.aliases} onChange={e => onEditFormChange({ aliases: e.target.value })} style={{ ...S.input, marginTop: 2 }} />
        </div>
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={onCancelEdit}>取消</button>
          <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={onSaveEdit}>儲存</button>
        </div>
      </div>
    );
  }

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
        <div style={{ display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
          <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={onStartEdit}>編輯</button>
          {concept.status === "pending" && onApprove && onReject && (
            <>
              <button className="btn btn-success" style={{ fontSize: 11 }} onClick={onApprove}>核准</button>
              <button className="btn btn-danger" style={{ fontSize: 11 }} onClick={onReject}>拒絕</button>
            </>
          )}
        </div>
      </div>
      {expanded && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
          {concept.aliases.length > 0 && <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 4 }}>別名: {concept.aliases.join(", ")}</div>}
          {concept.tableHints.length > 0 && <div style={{ fontSize: 11, color: "var(--text-3)" }}>關聯表: {concept.tableHints.map(h => `${h.tableName} (${h.role})`).join(", ")}</div>}
        </div>
      )}
    </div>
  );
}

// ── SchemaRulePicker — multi-chip selector for schemaRuleIds ──────────────────
function SchemaRulePicker({ value, onChange, allDefs }: {
  value: string[];
  onChange: (ids: string[]) => void;
  allDefs: Array<{ id: string; group: string; severity: string; description: string }>;
}) {
  const [pickerVal, setPickerVal] = useState("");
  const remaining = allDefs.filter(d => !value.includes(d.id));
  function add() {
    if (pickerVal && !value.includes(pickerVal)) onChange([...value, pickerVal]);
    setPickerVal("");
  }
  function remove(id: string) { onChange(value.filter(x => x !== id)); }

  const GROUP_COLOR: Record<string, string> = {
    naming: "#60a5fa", semantic: "#a78bfa", structure: "#4ade80",
    governance: "#fbbf24",
  };

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: value.length ? 6 : 0 }}>
        {value.map(id => {
          const def = allDefs.find(d => d.id === id);
          const grp = def?.group ?? "governance";
          const color = GROUP_COLOR[grp] ?? "var(--text-3)";
          return (
            <span key={id} title={def?.description ?? id} style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 6px", borderRadius: 4, background: `${color}18`, border: `1px solid ${color}50`, fontSize: 10, color }}>
              {id}
              <button onClick={() => remove(id)} style={{ background: "none", border: "none", cursor: "pointer", color, fontSize: 11, padding: 0, lineHeight: 1 }}>×</button>
            </span>
          );
        })}
      </div>
      {remaining.length > 0 && (
        <div style={{ display: "flex", gap: 4 }}>
          <select value={pickerVal} onChange={e => setPickerVal(e.target.value)}
            style={{ ...S.input, flex: 1, fontSize: 11, appearance: "auto" } as React.CSSProperties}>
            <option value="">— 選擇技術規則 —</option>
            {(["naming", "semantic", "structure", "governance"] as const).map(grp => {
              const opts = remaining.filter(d => d.group === grp);
              if (!opts.length) return null;
              return (
                <optgroup key={grp} label={grp}>
                  {opts.map(d => <option key={d.id} value={d.id}>{d.id}</option>)}
                </optgroup>
              );
            })}
          </select>
          <button className="btn btn-ghost" style={{ fontSize: 11, flexShrink: 0 }} disabled={!pickerVal} onClick={add}>+ 加入</button>
        </div>
      )}
    </div>
  );
}

// ── RuleTab ────────────────────────────────────────────────────────────────────
function RuleTab({ domain }: { domain: string | null }) {
  const qc = useQueryClient();
  const { showToast } = useStore();
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ title: "", statement: "", ruleType: "constraint", schemaRuleIds: [] as string[] });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ title: "", statement: "", ruleType: "", schemaRuleIds: [] as string[] });

  const { data: rules = [] } = useQuery({
    queryKey: ["gov-rules", domain],
    queryFn: () => api.knowledge.listRules(domain ? { domain } : undefined),
  });

  const { data: ruleDefs } = useQuery({
    queryKey: ["rule-definitions"],
    queryFn: () => api.rules.definitions(),
    staleTime: 60_000,
  });
  const allRuleDefs = [...(ruleDefs?.studioRules ?? []), ...(ruleDefs?.governanceRules ?? [])];

  const createMut = useMutation({
    mutationFn: () => {
      const payload: Parameters<typeof api.knowledge.createRule>[0] = {
        title: addForm.title.trim(),
        statement: addForm.statement.trim(),
        rule_type: addForm.ruleType,
      };
      if (domain) payload.domain = domain;
      if (addForm.schemaRuleIds.length) payload.schema_rule_ids = addForm.schemaRuleIds;
      return api.knowledge.createRule(payload);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["gov-rules"] });
      setShowAdd(false); setAddForm({ title: "", statement: "", ruleType: "constraint", schemaRuleIds: [] });
      showToast("✓ 業務規則已建立");
    },
  });

  const patchMut = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Parameters<typeof api.knowledge.patchRule>[1] }) =>
      api.knowledge.patchRule(id, patch),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["gov-rules"] });
      setEditingId(null); showToast("✓ 規則已更新");
    },
  });

  const approveMut = useMutation({
    mutationFn: (id: number) => api.knowledge.approveRule(id),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["gov-rules"] }); showToast("✓ 規則已核准"); },
  });
  const rejectMut = useMutation({
    mutationFn: (id: number) => api.knowledge.rejectRule(id),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["gov-rules"] }); showToast("規則已拒絕"); },
  });

  const pendingRules = rules.filter(r => r.status === "pending");
  const approvedRules = rules.filter(r => r.status === "approved");
  const RULE_TYPES = ["ssot", "constraint", "relationship", "process"];

  function startEdit(r: GovBusinessRule) {
    setEditingId(r.id);
    setEditForm({ title: r.title, statement: r.statement, ruleType: r.ruleType, schemaRuleIds: r.schemaRuleIds ?? [] });
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setShowAdd(true)}>+ 新增業務規則</button>
      </div>

      {showAdd && (
        <div style={{ ...S.card, marginBottom: 16, border: "1px solid var(--accent)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>新增業務規則</div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 3, textTransform: "uppercase" }}>標題</label>
            <input value={addForm.title} onChange={e => setAddForm(p => ({ ...p, title: e.target.value }))} style={S.input} placeholder="例：批次資料 SSOT 聲明" />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 3, textTransform: "uppercase" }}>規則類型</label>
            <select value={addForm.ruleType} onChange={e => setAddForm(p => ({ ...p, ruleType: e.target.value }))}
              style={{ ...S.input, appearance: "auto" } as React.CSSProperties}>
              {RULE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 3, textTransform: "uppercase" }}>規則陳述</label>
            <textarea value={addForm.statement} onChange={e => setAddForm(p => ({ ...p, statement: e.target.value }))}
              style={{ ...S.input, height: 80, resize: "vertical" } as React.CSSProperties}
              placeholder="清楚描述業務規則的要求與約束..." />
          </div>
          {allRuleDefs.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 3, textTransform: "uppercase" }}>關聯技術規則</label>
              <SchemaRulePicker value={addForm.schemaRuleIds} allDefs={allRuleDefs}
                onChange={ids => setAddForm(p => ({ ...p, schemaRuleIds: ids }))} />
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn btn-ghost" onClick={() => { setShowAdd(false); setAddForm({ title: "", statement: "", ruleType: "constraint", schemaRuleIds: [] }); }}>取消</button>
            <button className="btn btn-primary" disabled={!addForm.title.trim() || !addForm.statement.trim() || createMut.isPending}
              onClick={() => createMut.mutate()}>建立</button>
          </div>
        </div>
      )}

      {rules.length === 0 && !showAdd && (
        <div style={{ textAlign: "center", padding: "48px 0", color: "var(--text-3)", fontSize: 13 }}>
          此 Domain 尚無業務規則 — 點「+ 新增業務規則」或上傳文件並執行 ✦ 抽取
        </div>
      )}

      {pendingRules.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#fbbf24", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>待審核 ({pendingRules.length})</div>
          {pendingRules.map(r => (
            <RuleCardItem key={r.id} rule={r} editing={editingId === r.id} editForm={editForm} ruleTypes={RULE_TYPES} allRuleDefs={allRuleDefs}
              onEditFormChange={f => setEditForm(prev => ({ ...prev, ...f }))}
              onStartEdit={() => startEdit(r)}
              onSaveEdit={() => patchMut.mutate({ id: r.id, patch: { title: editForm.title, statement: editForm.statement, ruleType: editForm.ruleType, schemaRuleIds: editForm.schemaRuleIds } })}
              onCancelEdit={() => setEditingId(null)}
              onApprove={() => approveMut.mutate(r.id)}
              onReject={() => rejectMut.mutate(r.id)} />
          ))}
        </div>
      )}
      {approvedRules.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>已核准 ({approvedRules.length})</div>
          {approvedRules.map(r => (
            <RuleCardItem key={r.id} rule={r} editing={editingId === r.id} editForm={editForm} ruleTypes={RULE_TYPES} allRuleDefs={allRuleDefs}
              onEditFormChange={f => setEditForm(prev => ({ ...prev, ...f }))}
              onStartEdit={() => startEdit(r)}
              onSaveEdit={() => patchMut.mutate({ id: r.id, patch: { title: editForm.title, statement: editForm.statement, ruleType: editForm.ruleType, schemaRuleIds: editForm.schemaRuleIds } })}
              onCancelEdit={() => setEditingId(null)} />
          ))}
        </div>
      )}
    </div>
  );
}

function RuleCardItem({ rule, editing, editForm, ruleTypes, allRuleDefs, onEditFormChange, onStartEdit, onSaveEdit, onCancelEdit, onApprove, onReject }: {
  rule: GovBusinessRule;
  editing: boolean;
  editForm: { title: string; statement: string; ruleType: string; schemaRuleIds: string[] };
  ruleTypes: string[];
  allRuleDefs: Array<{ id: string; group: string; severity: string; description: string }>;
  onEditFormChange: (f: Partial<{ title: string; statement: string; ruleType: string; schemaRuleIds: string[] }>) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onApprove?: () => void;
  onReject?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const GROUP_COLOR: Record<string, string> = {
    naming: "#60a5fa", semantic: "#a78bfa", structure: "#4ade80",
    governance: "#fbbf24",
  };

  if (editing) {
    return (
      <div style={{ ...S.card, borderColor: "var(--accent)" }}>
        <div style={{ marginBottom: 6 }}>
          <label style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase" }}>標題</label>
          <input value={editForm.title} onChange={e => onEditFormChange({ title: e.target.value })} style={{ ...S.input, marginTop: 2 }} />
        </div>
        <div style={{ marginBottom: 6 }}>
          <label style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase" }}>規則類型</label>
          <select value={editForm.ruleType} onChange={e => onEditFormChange({ ruleType: e.target.value })}
            style={{ ...S.input, appearance: "auto", marginTop: 2 } as React.CSSProperties}>
            {ruleTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase" }}>規則陳述</label>
          <textarea value={editForm.statement} onChange={e => onEditFormChange({ statement: e.target.value })}
            style={{ ...S.input, height: 80, resize: "vertical", marginTop: 2 } as React.CSSProperties} />
        </div>
        {allRuleDefs.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase" }}>關聯技術規則</label>
            <div style={{ marginTop: 2 }}>
              <SchemaRulePicker value={editForm.schemaRuleIds} allDefs={allRuleDefs}
                onChange={ids => onEditFormChange({ schemaRuleIds: ids })} />
            </div>
          </div>
        )}
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={onCancelEdit}>取消</button>
          <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={onSaveEdit}>儲存</button>
        </div>
      </div>
    );
  }

  const linkedRuleIds = rule.schemaRuleIds ?? [];

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
          {linkedRuleIds.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 5 }}>
              {linkedRuleIds.map(id => {
                const def = allRuleDefs.find(d => d.id === id);
                const grp = def?.group ?? "governance";
                const color = GROUP_COLOR[grp] ?? "var(--text-3)";
                return (
                  <span key={id} title={def?.description ?? id} style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 5px", borderRadius: 3, background: `${color}18`, border: `1px solid ${color}50`, fontSize: 10, color }}>
                    ⚙ {id}
                  </span>
                );
              })}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
          <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={onStartEdit}>編輯</button>
          {rule.status === "pending" && onApprove && onReject && (
            <>
              <button className="btn btn-success" style={{ fontSize: 11 }} onClick={onApprove}>核准</button>
              <button className="btn btn-danger" style={{ fontSize: 11 }} onClick={onReject}>拒絕</button>
            </>
          )}
        </div>
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

// ── Main KnowledgePage ────────────────────────────────────────────────────────
export default function KnowledgePage() {
  const [tab, setTab] = useState<Tab>("docs");
  const { knowledgeDomain, knowledgeDomainPicked, setKnowledgeDomain } = useStore();
  const { data: domains = [] } = useQuery({ queryKey: ["domains"], queryFn: () => api.settings.getDomains() });

  const { data: concepts = [] } = useQuery({
    queryKey: ["gov-concepts", knowledgeDomain],
    queryFn: () => api.knowledge.listConcepts(knowledgeDomain ? { domain: knowledgeDomain } : undefined),
  });
  const { data: rules = [] } = useQuery({
    queryKey: ["gov-rules", knowledgeDomain],
    queryFn: () => api.knowledge.listRules(knowledgeDomain ? { domain: knowledgeDomain } : undefined),
  });
  const pendingCount = concepts.filter(c => c.status === "pending").length + rules.filter(r => r.status === "pending").length;

  const activeDomain = domains.find(d => d.id === knowledgeDomain) ?? null;

  if (!knowledgeDomainPicked) {
    return <DomainSplash domains={domains} />;
  }

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div style={S.title}>
            知識庫
            {pendingCount > 0 && (
              <span style={{ marginLeft: 8, fontSize: 10, background: "#fbbf2440", color: "#fbbf24", border: "1px solid #fbbf2460", borderRadius: 10, padding: "1px 7px" }}>
                {pendingCount} 待審
              </span>
            )}
          </div>
          {/* Domain badge */}
          <button onClick={() => setKnowledgeDomain(null, false)}
            style={{
              marginLeft: 4, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
              background: activeDomain?.color ? `${activeDomain.color}25` : "var(--accent-dim)",
              color: activeDomain?.color ?? "var(--accent)",
              border: `1px solid ${activeDomain?.color ?? "var(--accent)"}50`,
              cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
            }}>
            {activeDomain ? (
              <>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: activeDomain.color ?? "var(--accent)", display: "inline-block" }} />
                {activeDomain.name}
              </>
            ) : "ALL"}
            <span style={{ fontSize: 9, color: "var(--text-3)", marginLeft: 2 }}>切換 ▾</span>
          </button>
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
        {tab === "docs"     && <DocTab domain={knowledgeDomain} />}
        {tab === "concepts" && <ConceptTab domain={knowledgeDomain} />}
        {tab === "rules"    && <RuleTab domain={knowledgeDomain} />}
      </div>
    </div>
  );
}
