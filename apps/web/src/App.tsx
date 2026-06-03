import { useState, useEffect, useRef, type ReactNode } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useStore, type Page, type Theme } from "./store.js";
import { useT } from "./i18n.js";
import { api, type ProductSuite, type SchemaLayer, type SchemaEnvironment, type SearchResults, type SearchNamingResult } from "./api.js";
import { useBreakpoint } from "./hooks/useBreakpoint.js";
import { useLayerSettings } from "./hooks/useLayerSettings.js";
import SchemaEditorPage from "./pages/SchemaEditorPage.js";
import NamingDictPage from "./pages/NamingDictPage.js";
import VersionHistoryPage from "./pages/VersionHistoryPage.js";
import AnalysisPage from "./pages/AnalysisPage.js";
import ErDiagramPage from "./pages/ErDiagramPage.js";
import WideTablePage from "./pages/WideTablePage.js";
import RulesPage from "./pages/RulesPage.js";
import DataHubPage from "./pages/DataHubPage.js";
import SettingsPanel from "./pages/SettingsPanel.js";

const NAV_KEYS: { id: Page; key: string; icon: string }[] = [
  { id: "editor",   key: "nav.editor",   icon: "⬡" },
  { id: "dict",     key: "nav.dict",     icon: "⌨" },
  { id: "versions", key: "nav.versions", icon: "⊛" },
  { id: "analysis", key: "nav.analysis", icon: "◎" },
  { id: "er",       key: "nav.er",       icon: "⊡" },
  { id: "wide",     key: "nav.wide",     icon: "⊞" },
  { id: "rules",    key: "nav.rules",    icon: "◈" },
  { id: "datahub",  key: "nav.datahub",  icon: "⬆" },
];

// ── shared helpers ────────────────────────────────────────────────────────────

function FormRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block", textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</label>
      {children}
    </div>
  );
}

const iconBtnStyle = {
  width: 30, height: 30, borderRadius: 6, border: "1px solid var(--border-light)",
  background: "var(--bg-3)", color: "var(--text-2)", cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
  fontSize: 13, transition: "all 0.15s", flexShrink: 0,
} as const;

function ThemeToggle() {
  const { theme, setTheme } = useStore();
  const isDark = theme === "dark";
  return (
    <button onClick={() => setTheme(isDark ? "light" : "dark")}
      title={isDark ? "Light mode" : "Dark mode"}
      style={iconBtnStyle}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-4)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-3)"; }}>
      {isDark ? "☀" : "☾"}
    </button>
  );
}

function LangToggle() {
  const { locale, setLocale } = useStore();
  return (
    <button onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
      title={locale === "zh" ? "Switch to English" : "切換為中文"}
      style={{ ...iconBtnStyle, fontSize: 11, fontWeight: 700, letterSpacing: "0.3px" }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-4)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-3)"; }}>
      {locale === "zh" ? "EN" : "中"}
    </button>
  );
}

function Toast() {
  const { toastMsg } = useStore();
  return (
    <div style={{
      position: "fixed", bottom: 20, right: 20,
      background: "var(--bg-4)", border: "1px solid var(--border-light)",
      borderLeft: "3px solid var(--success)", borderRadius: 8,
      padding: "10px 16px", fontSize: 13, display: "flex", alignItems: "center", gap: 8,
      boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
      transform: toastMsg ? "translateY(0)" : "translateY(60px)",
      opacity: toastMsg ? 1 : 0, transition: "all 0.25s", zIndex: 999,
    }}>
      {toastMsg}
    </div>
  );
}

function NavBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  const [hover, setHover] = useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ padding: "5px 12px", borderRadius: "var(--radius)", border: "none",
        background: active ? "var(--accent-dim)" : hover ? "var(--bg-3)" : "transparent",
        color: active ? "var(--accent)" : hover ? "var(--text-1)" : "var(--text-2)",
        cursor: "pointer", fontSize: 12, transition: "all 0.15s", fontFamily: "inherit",
        whiteSpace: "nowrap" }}>
      {children}
    </button>
  );
}

// ── Global Search Modal ───────────────────────────────────────────────────────
function GlobalSearchModal({ onClose }: { onClose: () => void }) {
  const { setSelectedSchemaId, setPage } = useStore();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!q.trim()) { setResults(null); setSelected(0); return; }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try { setResults(await api.search(q.trim())); setSelected(0); }
      catch { /* ignore */ }
      finally { setLoading(false); }
    }, 250);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [q]);

  type NavItem = { type: "table" | "field"; label: string; sub: string; schemaId: number; tableId: number };
  type DictItem = { type: "dict"; label: string; sub: string; entry: SearchNamingResult };

  const navItems: NavItem[] = [
    ...(results?.tables ?? []).map(t => ({
      type: "table" as const, label: t.tableName,
      sub: `${t.schemaName}${t.tableComment ? ` · ${t.tableComment}` : ""}`,
      schemaId: t.schemaId, tableId: t.tableId,
    })),
    ...(results?.fields ?? []).map(f => ({
      type: "field" as const, label: f.fieldName,
      sub: `${f.schemaName} › ${f.tableName} · ${f.fieldType}${f.fieldComment ? ` · ${f.fieldComment}` : ""}`,
      schemaId: f.schemaId, tableId: f.tableId,
    })),
  ];
  const dictItems: DictItem[] = (results?.naming ?? []).map(e => ({
    type: "dict" as const, label: e.concept,
    sub: `${e.stdName} · ${e.domain}`,
    entry: e,
  }));
  const totalItems = navItems.length + dictItems.length;

  function pick(idx: number) {
    if (idx < navItems.length) {
      const item = navItems[idx]!;
      setSelectedSchemaId(item.schemaId);
      setPage("editor");
    } else {
      setPage("dict");
    }
    onClose();
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected(s => Math.min(s + 1, totalItems - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    if (e.key === "Enter") { e.preventDefault(); pick(selected); }
  }

  const hasResults = totalItems > 0;
  const tableCount = results?.tables.length ?? 0;
  const fieldCount = results?.fields.length ?? 0;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 800, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 80 }}
      onClick={onClose}>
      <div style={{ background: "var(--bg-2)", border: "1px solid var(--border-light)", borderRadius: 12, width: "min(640px, 92vw)", boxShadow: "0 16px 60px rgba(0,0,0,0.6)", overflow: "hidden" }}
        onClick={e => e.stopPropagation()}>
        {/* Search input */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontSize: 16, color: "var(--text-3)", flexShrink: 0 }}>⊕</span>
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={handleKey}
            placeholder="搜尋 Table、Column 或命名規範..."
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 15, color: "var(--text-1)", fontFamily: "inherit" }} />
          {loading && <span style={{ fontSize: 11, color: "var(--text-3)", flexShrink: 0 }}>搜尋中...</span>}
          <span style={{ fontSize: 11, color: "var(--text-3)", flexShrink: 0, background: "var(--bg-3)", padding: "2px 6px", borderRadius: 4, border: "1px solid var(--border)" }}>Esc</span>
        </div>

        {/* Results */}
        {q.trim() && (
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            {!hasResults && !loading && (
              <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 13, color: "var(--text-3)" }}>找不到符合「{q}」的結果</div>
            )}
            {hasResults && (
              <>
                {tableCount > 0 && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.6px", padding: "8px 16px 4px" }}>Table</div>
                    {navItems.slice(0, tableCount).map((item, i) => (
                      <SearchRow key={`t-${item.tableId}`} badge="TABLE" label={item.label} sub={item.sub} active={selected === i} onHover={() => setSelected(i)} onClick={() => pick(i)} />
                    ))}
                  </div>
                )}
                {fieldCount > 0 && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.6px", padding: "8px 16px 4px" }}>Column</div>
                    {navItems.slice(tableCount).map((item, i) => {
                      const idx = tableCount + i;
                      return <SearchRow key={`f-${item.tableId}-${item.label}-${i}`} badge="COL" label={item.label} sub={item.sub} active={selected === idx} onHover={() => setSelected(idx)} onClick={() => pick(idx)} />;
                    })}
                  </div>
                )}
                {dictItems.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.6px", padding: "8px 16px 4px" }}>Dict</div>
                    {dictItems.map((item, i) => {
                      const idx = navItems.length + i;
                      return <SearchRow key={`d-${item.entry.id}`} badge="DICT" label={item.label} sub={item.sub} active={selected === idx} onHover={() => setSelected(idx)} onClick={() => pick(idx)} />;
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Footer hint */}
        <div style={{ padding: "8px 16px", borderTop: "1px solid var(--border)", display: "flex", gap: 12, fontSize: 11, color: "var(--text-3)" }}>
          <span>↑↓ 選擇</span>
          <span>↵ 跳轉</span>
          <span>Esc 關閉</span>
          {hasResults && <span style={{ marginLeft: "auto" }}>{tableCount} 張表 · {fieldCount} 個欄位 · {dictItems.length} 命名</span>}
        </div>
      </div>
    </div>
  );
}

function SearchRow({ badge, label, sub, active, onHover, onClick }: {
  badge: string; label: string; sub: string;
  active: boolean; onHover: () => void; onClick: () => void;
}) {
  const isAccent = badge === "TABLE";
  return (
    <div onMouseEnter={onHover} onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", cursor: "pointer",
        background: active ? "var(--accent-dim)" : "transparent", borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent" }}>
      <span style={{ fontSize: 11, color: isAccent ? "var(--accent)" : "var(--text-3)", background: isAccent ? "var(--accent-dim)" : "var(--bg-3)", padding: "1px 5px", borderRadius: 3, flexShrink: 0, fontWeight: 600 }}>
        {badge}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: active ? "var(--accent)" : "var(--text-1)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
        <div style={{ fontSize: 11, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
      </div>
    </div>
  );
}

// ── NL Generate Modal ─────────────────────────────────────────────────────────
function NlGenerateModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { setSelectedSchemaId, showToast } = useStore();
  const t = useT();
  const [prompt, setPrompt] = useState("");
  const [domain, setDomain] = useState("semiconductor");
  const [streaming, setStreaming] = useState(false);
  const [tokens, setTokens] = useState("");
  const [status, setStatus] = useState("");

  async function generate() {
    if (!prompt.trim() || streaming) return;
    setStreaming(true); setTokens(""); setStatus("正在生成 Schema...");
    try {
      const res = await api.llm.generate(prompt, domain);
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = JSON.parse(line.slice(6)) as {
            type: string; text?: string; message?: string;
            schemaId?: number; schemaName?: string; tableCount?: number;
          };
          if (data.type === "token" && data.text) setTokens(t => t + data.text);
          if (data.type === "error") { setStatus(`錯誤：${data.message ?? "未知錯誤"}`); setStreaming(false); return; }
          if (data.type === "done" && data.schemaId) {
            await qc.invalidateQueries({ queryKey: ["schemas"] });
            setSelectedSchemaId(data.schemaId);
            showToast(`✓ Schema "${data.schemaName}" 已生成（${data.tableCount} 張表）`);
            onClose();
          }
        }
      }
    } catch (e) { setStatus(`錯誤：${e instanceof Error ? e.message : "連線失敗"}`); }
    finally { setStreaming(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "var(--bg-2)", border: "1px solid var(--border-light)", borderRadius: 12, width: "min(720px, 92vw)", padding: 24, boxShadow: "0 8px 40px rgba(0,0,0,0.6)" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>✦ AI 自然語言生成 Schema</div>
        <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 16 }}>描述你需要的資料庫結構，AI 將自動套用命名字典並生成符合規範的 Schema</div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>描述需求</div>
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
            placeholder="例如：建立一個設備保養記錄系統..."
            disabled={streaming}
            style={{ width: "100%", height: 100, padding: "10px 12px", borderRadius: 8,
              border: "1px solid var(--border)", background: "var(--bg-3)", color: "var(--text-1)",
              fontSize: 13, lineHeight: 1.6, resize: "none", outline: "none",
              fontFamily: "inherit", boxSizing: "border-box" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.5px" }}>領域</div>
          <select value={domain} onChange={e => setDomain(e.target.value)} disabled={streaming}
            style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-3)", color: "var(--text-1)" }}>
            <option value="semiconductor">半導體製造</option>
            <option value="general">通用</option>
          </select>
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>{status}</span>
          <div style={{ flex: 1 }} />
          <button className="btn btn-ghost" onClick={onClose} disabled={streaming}>{t("btn.cancel")}</button>
          <button className="btn btn-primary" onClick={() => void generate()} disabled={!prompt.trim() || streaming}>
            {streaming ? t("btn.generating") : t("btn.ai_generate")}
          </button>
        </div>
        {tokens && (
          <div style={{ background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, maxHeight: 240, overflowY: "auto" }}>
            <pre style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-2)", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              {tokens}
              {streaming && <span style={{ display: "inline-block", width: 2, height: 12, background: "var(--accent)", marginLeft: 2, animation: "blink 1s infinite", verticalAlign: "text-bottom" }} />}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

const SUITE_COLORS = ["#7b8cff", "#4ade80", "#fbbf24", "#f87171", "#60a5fa", "#c084fc", "#fb923c"];

// ── Schema list (shared between Sidebar and mobile drawer) ────────────────────
const ENV_COLOR: Record<SchemaEnvironment, string> = { DEV: "#60a5fa", TEST: "#4ade80", STAGING: "#fbbf24", PROD: "#f87171" };

function SchemaItem({ name, active, suiteColor, layerType, environment, onClick }: { name: string; active: boolean; suiteColor?: string | null; layerType?: SchemaLayer | null; environment?: SchemaEnvironment | null; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ padding: "7px 8px", borderRadius: "var(--radius)", cursor: "pointer",
        display: "flex", alignItems: "center", gap: 8, marginBottom: 1,
        background: active ? "var(--accent-dim)" : hover ? "var(--bg-3)" : "transparent" }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: suiteColor ?? (active ? "var(--accent)" : "var(--text-3)"), flexShrink: 0 }} />
      <div style={{ fontSize: 12, color: active ? "var(--accent)" : "var(--text-2)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
      {environment && (
        <span style={{ fontSize: 9, fontWeight: 700, color: ENV_COLOR[environment], background: `${ENV_COLOR[environment]}22`, borderRadius: 3, padding: "1px 4px", flexShrink: 0, letterSpacing: "0.3px", border: `1px solid ${ENV_COLOR[environment]}44` }}>
          {environment}
        </span>
      )}
      {layerType && (
        <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-3)", background: "var(--bg-4)", borderRadius: 3, padding: "1px 4px", flexShrink: 0, letterSpacing: "0.3px" }}>
          {layerType.slice(0, 3).toUpperCase()}
        </span>
      )}
    </div>
  );
}

// ── Suite Management Modal ────────────────────────────────────────────────────
function SuiteManageModal({ suites, schemas, activeSuiteId, onClose }: {
  suites: ProductSuite[];
  schemas: import("./api.js").Schema[];
  activeSuiteId: number | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { showToast, setActiveSuiteId } = useStore();
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(SUITE_COLORS[0]!);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");

  const createMut = useMutation({
    mutationFn: () => api.suites.create({ name: newName.trim(), color: newColor }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["suites"] });
      setNewName(""); showToast("Suite 已建立");
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.suites.delete(id),
    onSuccess: async (_data, id) => {
      await qc.invalidateQueries({ queryKey: ["suites"] });
      if (activeSuiteId === id) setActiveSuiteId(null);
      showToast("Suite 已刪除");
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, name, color }: { id: number; name: string; color: string }) =>
      api.suites.update(id, { name, color }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["suites"] });
      setEditId(null); showToast("Suite 已更新");
    },
  });

  function startEdit(s: ProductSuite) {
    setEditId(s.id); setEditName(s.name); setEditColor(s.color ?? SUITE_COLORS[0]!);
  }

  function schemaCountFor(suiteId: number) {
    return schemas.filter(sc => sc.suiteId === suiteId).length;
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 700, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "var(--bg-2)", border: "1px solid var(--border-light)", borderRadius: 10, width: "min(480px, 92vw)", padding: 20, boxShadow: "0 8px 32px rgba(0,0,0,0.5)", maxHeight: "80vh", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>管理 Product Suite</div>

        <div style={{ flex: 1, overflowY: "auto", marginBottom: 16 }}>
          {suites.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--text-3)", padding: "12px 0" }}>尚無 Suite，在下方建立第一個</div>
          )}
          {suites.map(s => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", marginBottom: 6, background: "var(--bg-3)" }}>
              {editId === s.id ? (
                <>
                  <input value={editName} onChange={e => setEditName(e.target.value)}
                    style={{ flex: 1, background: "var(--bg-4)", border: "1px solid var(--border)", color: "var(--text-1)", padding: "4px 8px", borderRadius: 4, fontSize: 13, outline: "none" }} />
                  <div style={{ display: "flex", gap: 3 }}>
                    {SUITE_COLORS.map(c => (
                      <div key={c} onClick={() => setEditColor(c)}
                        style={{ width: 14, height: 14, borderRadius: "50%", background: c, cursor: "pointer", border: editColor === c ? "2px solid var(--text-1)" : "2px solid transparent" }} />
                    ))}
                  </div>
                  <button className="btn btn-primary" style={{ fontSize: 11, padding: "3px 8px" }}
                    onClick={() => updateMut.mutate({ id: s.id, name: editName.trim() || s.name, color: editColor })}>
                    儲存
                  </button>
                  <button className="btn btn-ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => setEditId(null)}>取消</button>
                </>
              ) : (
                <>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: s.color ?? "var(--text-3)", flexShrink: 0 }} />
                  <span style={{ fontSize: 13, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                  <span style={{ fontSize: 11, color: "var(--text-3)", flexShrink: 0 }}>{schemaCountFor(s.id)} 個 Schema</span>
                  <button className="btn btn-ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => startEdit(s)}>編輯</button>
                  <button className="btn btn-danger" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => deleteMut.mutate(s.id)}>刪除</button>
                </>
              )}
            </div>
          ))}
        </div>

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>新增 Suite</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input className="form-input" placeholder="Suite 名稱" value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && newName.trim() && createMut.mutate()}
              style={{ flex: 1 }} />
            <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
              {SUITE_COLORS.map(c => (
                <div key={c} onClick={() => setNewColor(c)}
                  style={{ width: 16, height: 16, borderRadius: "50%", background: c, cursor: "pointer", border: newColor === c ? "2px solid var(--text-1)" : "2px solid transparent" }} />
              ))}
            </div>
            <button className="btn btn-primary" style={{ fontSize: 11 }} disabled={!newName.trim() || createMut.isPending} onClick={() => createMut.mutate()}>建立</button>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <button className="btn btn-ghost" onClick={onClose}>關閉</button>
        </div>
      </div>
    </div>
  );
}

function SidebarContent({ onSchemaSelect, onSearch }: { onSchemaSelect?: () => void; onSearch?: () => void }) {
  const qc = useQueryClient();
  const { selectedSchemaId, setSelectedSchemaId, showToast, activeSuiteId, setActiveSuiteId, setSuitePicked } = useStore();
  const { data: schemas } = useQuery({ queryKey: ["schemas"], queryFn: api.schemas.list });
  const { data: suites } = useQuery({ queryKey: ["suites"], queryFn: api.suites.list });
  const [showModal, setShowModal] = useState(false);
  const [showNl, setShowNl] = useState(false);
  const [showSuiteModal, setShowSuiteModal] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", domain: "semiconductor", suiteId: "", layerType: "", environment: "" });
  const t = useT();
  const { schemaLayers } = useLayerSettings();

  async function reloadDdl() {
    if (reloading) return;
    setReloading(true);
    try { await api.reload(); await qc.invalidateQueries({ queryKey: ["schemas"] }); showToast(t("toast.reloaded")); }
    catch { showToast(t("toast.reload_failed")); }
    finally { setReloading(false); }
  }

  async function create() {
    if (!form.name.trim()) return;
    const suiteId = form.suiteId ? Number(form.suiteId) : (activeSuiteId ?? undefined);
    const layerType = form.layerType ? (form.layerType as SchemaLayer) : null;
    const environment = form.environment ? (form.environment as SchemaEnvironment) : null;
    const s = await api.schemas.create({
      name: form.name,
      ...(form.description ? { description: form.description } : {}),
      domain: form.domain,
      ...(suiteId != null ? { suiteId } : {}),
      ...(layerType ? { layerType } : {}),
      ...(environment ? { environment } : {}),
    });
    await qc.invalidateQueries({ queryKey: ["schemas"] });
    setSelectedSchemaId(s.id);
    setShowModal(false);
    setForm({ name: "", description: "", domain: "semiconductor", suiteId: "", layerType: "", environment: "" });
    showToast(t("toast.schema_created"));
  }

  const suiteMap = new Map((suites ?? []).map(s => [s.id, s]));
  const filteredSchemas = activeSuiteId === null
    ? (schemas ?? [])
    : (schemas ?? []).filter(s => s.suiteId === activeSuiteId);

  const wideTableSubs = ["r2u", "unified"] as const;
  const hierarchicalGroups = activeSuiteId !== null ? (() => {
    const txItems = filteredSchemas.filter(s => s.layerType === "transaction");
    const wideItems = filteredSchemas.filter(s => s.layerType === "r2u" || s.layerType === "unified");
    const noneItems = filteredSchemas.filter(s => s.layerType === null);
    return { txItems, wideItems, noneItems };
  })() : null;

  return (
    <>
      <div style={{ padding: "12px 14px 8px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.8px" }}>{t("sidebar.schemas")}</span>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => setShowSuiteModal(true)} title="管理 Suite"
            style={{ width: 22, height: 22, borderRadius: 4, border: "none", background: "transparent", color: "var(--text-3)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>⊛</button>
          <button onClick={() => setShowNl(true)} title={t("sidebar.ai_gen")}
            style={{ padding: "2px 7px", borderRadius: 4, border: "1px solid var(--accent)", background: "var(--accent-dim)", color: "var(--accent)", cursor: "pointer", fontSize: 10, fontWeight: 700, letterSpacing: "0.3px" }}>✦ AI</button>
          <button onClick={() => void reloadDdl()} disabled={reloading}
            style={{ width: 22, height: 22, borderRadius: 4, border: "none", background: "transparent", color: "var(--text-3)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, opacity: reloading ? 0.5 : 1 }}>↺</button>
          <button onClick={() => setShowModal(true)}
            style={{ width: 22, height: 22, borderRadius: 4, border: "none", background: "transparent", color: "var(--text-2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>＋</button>
        </div>
      </div>

      {onSearch && (
        <div style={{ padding: "0 8px 6px", flexShrink: 0 }}>
          <button onClick={onSearch} style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-3)", color: "var(--text-3)", cursor: "pointer", textAlign: "left", fontSize: 12 }}>
            <span style={{ fontSize: 13 }}>⊕</span>
            <span style={{ flex: 1 }}>搜尋 Table / Column...</span>
            <span style={{ fontSize: 10, background: "var(--bg-4)", border: "1px solid var(--border)", borderRadius: 3, padding: "1px 4px" }}>⌘K</span>
          </button>
        </div>
      )}

      {suites && suites.length > 0 && (
        <div style={{ padding: "4px 8px 4px", display: "flex", gap: 4, flexWrap: "wrap", flexShrink: 0, alignItems: "center" }}>
          <button onClick={() => setSuitePicked(false)}
            title="切換 Suite"
            style={{ fontSize: 10, padding: "2px 7px", borderRadius: 10, border: "1px solid var(--border)", cursor: "pointer", background: "transparent", color: "var(--text-3)", marginRight: 2 }}>
            ⇄
          </button>
          <button onClick={() => setActiveSuiteId(null)}
            style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, border: "1px solid var(--border)", cursor: "pointer", fontWeight: activeSuiteId === null ? 700 : 400,
              background: activeSuiteId === null ? "var(--accent-dim)" : "transparent",
              color: activeSuiteId === null ? "var(--accent)" : "var(--text-3)" }}>
            全部
          </button>
          {suites.map(s => (
            <button key={s.id} onClick={() => setActiveSuiteId(s.id)}
              style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, border: `1px solid ${activeSuiteId === s.id ? (s.color ?? "var(--accent)") : "var(--border)"}`, cursor: "pointer",
                background: activeSuiteId === s.id ? `${s.color ?? "var(--accent)"}22` : "transparent",
                color: activeSuiteId === s.id ? (s.color ?? "var(--accent)") : "var(--text-3)",
                fontWeight: activeSuiteId === s.id ? 700 : 400,
                display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.color ?? "var(--text-3)", display: "inline-block", flexShrink: 0 }} />
              {s.name}
            </button>
          ))}
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px" }}>
        {hierarchicalGroups ? (() => {
          const { txItems, wideItems, noneItems } = hierarchicalGroups;
          const renderItem = (s: import("./api.js").Schema) => (
            <SchemaItem key={s.id} name={s.name} active={selectedSchemaId === s.id}
              suiteColor={s.suiteId != null ? (suiteMap.get(s.suiteId)?.color ?? null) : null}
              layerType={s.layerType} environment={s.environment}
              onClick={() => { setSelectedSchemaId(s.id); onSchemaSelect?.(); }} />
          );
          const sectionHeader = (label: string, indent = false) => (
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.6px", padding: `${indent ? 4 : 8}px ${indent ? 12 : 4}px 3px` }}>{label}</div>
          );
          return (
            <>
              {txItems.length > 0 && (
                <div>
                  {sectionHeader("交易層 Transaction")}
                  {txItems.map(renderItem)}
                </div>
              )}
              {wideItems.length > 0 && (
                <div>
                  {sectionHeader("寬表層 Wide Table")}
                  {wideTableSubs.map(sub => {
                    const items = wideItems.filter(s => s.layerType === sub);
                    if (items.length === 0) return null;
                    return (
                      <div key={sub}>
                        {sectionHeader(sub === "r2u" ? "R2U（Ready to Use）" : "Unified Layer", true)}
                        {items.map(renderItem)}
                      </div>
                    );
                  })}
                </div>
              )}
              {noneItems.length > 0 && (
                <div>
                  {sectionHeader("未分類")}
                  {noneItems.map(renderItem)}
                </div>
              )}
            </>
          );
        })() : (
          filteredSchemas.map(s => (
            <SchemaItem key={s.id} name={s.name} active={selectedSchemaId === s.id}
              suiteColor={s.suiteId != null ? (suiteMap.get(s.suiteId)?.color ?? null) : null}
              layerType={s.layerType} environment={s.environment}
              onClick={() => { setSelectedSchemaId(s.id); onSchemaSelect?.(); }} />
          ))
        )}
      </div>

      {showNl && <NlGenerateModal onClose={() => setShowNl(false)} />}
      {showSuiteModal && (
        <SuiteManageModal
          suites={suites ?? []}
          schemas={schemas ?? []}
          activeSuiteId={activeSuiteId}
          onClose={() => setShowSuiteModal(false)}
        />
      )}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowModal(false)}>
          <div style={{ background: "var(--bg-2)", border: "1px solid var(--border-light)", borderRadius: 10, width: "min(400px, 92vw)", padding: 20, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>{t("schemas.modal_new_schema")}</div>
            <FormRow label={t("form.schema_name")}>
              <input className="form-input" placeholder={t("form.schema_name_ph")} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} onKeyDown={e => e.key === "Enter" && void create()} />
            </FormRow>
            <FormRow label={t("form.description")}>
              <input className="form-input" placeholder={t("form.description_ph")} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </FormRow>
            <FormRow label={t("form.domain")}>
              <select className="form-input" value={form.domain} onChange={e => setForm({ ...form, domain: e.target.value })}>
                <option value="semiconductor">{t("form.semiconductor")}</option>
                <option value="general">{t("form.general")}</option>
              </select>
            </FormRow>
            {suites && suites.length > 0 && (
              <FormRow label="Product Suite">
                <select className="form-input" value={form.suiteId} onChange={e => setForm({ ...form, suiteId: e.target.value })}>
                  <option value="">（無 Suite）</option>
                  {suites.map(s => (
                    <option key={s.id} value={String(s.id)}>{s.name}</option>
                  ))}
                </select>
              </FormRow>
            )}
            <FormRow label="Schema 用途層">
              <select className="form-input" value={form.layerType} onChange={e => setForm({ ...form, layerType: e.target.value })}>
                <option value="">（未分類）</option>
                {schemaLayers.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
              </select>
            </FormRow>
            <FormRow label="環境 Environment">
              <select className="form-input" value={form.environment} onChange={e => setForm({ ...form, environment: e.target.value })}>
                <option value="">（未指定）</option>
                <option value="DEV">DEV</option>
                <option value="TEST">TEST</option>
                <option value="STAGING">STAGING</option>
                <option value="PROD">PROD</option>
              </select>
            </FormRow>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>{t("btn.cancel")}</button>
              <button className="btn btn-primary" onClick={() => void create()}>{t("btn.create")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Desktop/Tablet sidebar shell
function Sidebar({ onSearch }: { onSearch?: () => void }) {
  return (
    <div style={{ width: 220, background: "var(--bg-2)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" }}>
      {onSearch ? <SidebarContent onSearch={onSearch} /> : <SidebarContent />}
    </div>
  );
}

// ── Mobile drawer (nav + schema list) ─────────────────────────────────────────
function MobileDrawer({ open, onClose, onSearch }: { open: boolean; onClose: () => void; onSearch?: () => void }) {
  const { page, setPage } = useStore();
  const t = useT();

  function navigate(id: Page) { setPage(id); onClose(); }

  // Lock body scroll when open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <div className={`drawer-backdrop${open ? " open" : ""}`} onClick={onClose} />
      <div className={`mobile-drawer${open ? " open" : ""}`}>
        {/* Drawer header */}
        <div style={{ padding: "0 16px", height: 48, display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: "var(--accent)", letterSpacing: "0.5px" }}>⬡ Schema Studio</span>
          <button onClick={onClose}
            style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "transparent", color: "var(--text-3)", cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>
            ✕
          </button>
        </div>

        {/* Page navigation */}
        <div style={{ padding: "8px 8px 4px", flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.8px", padding: "6px 8px 4px" }}>頁面</div>
          {NAV_KEYS.map(n => (
            <button key={n.id} onClick={() => navigate(n.id)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "9px 10px", borderRadius: "var(--radius)", border: "none",
                background: page === n.id ? "var(--accent-dim)" : "transparent",
                color: page === n.id ? "var(--accent)" : "var(--text-2)",
                cursor: "pointer", fontSize: 13, fontFamily: "inherit", textAlign: "left",
                marginBottom: 2, transition: "all 0.12s" }}>
              <span style={{ fontSize: 14, width: 20, textAlign: "center", flexShrink: 0 }}>{n.icon}</span>
              {t(n.key)}
            </button>
          ))}
        </div>

        <div style={{ height: 1, background: "var(--border)", margin: "4px 16px", flexShrink: 0 }} />

        {/* Schema list */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {onSearch
            ? <SidebarContent onSchemaSelect={onClose} onSearch={onSearch} />
            : <SidebarContent onSchemaSelect={onClose} />}
        </div>
      </div>
    </>
  );
}

// ── Suite Splash Screen ───────────────────────────────────────────────────────
function SuiteSplash() {
  const { setActiveSuiteId, setSuitePicked } = useStore();
  const { data: suites } = useQuery({ queryKey: ["suites"], queryFn: api.suites.list });
  const { data: schemas } = useQuery({ queryKey: ["schemas"], queryFn: api.schemas.list });

  function pick(suiteId: number | null) {
    setActiveSuiteId(suiteId);
    setSuitePicked(true);
  }

  const suiteList = suites ?? [];
  const schemaList = schemas ?? [];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", overflowY: "auto" }}>
      <div style={{ maxWidth: 720, width: "100%", display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 8, color: "var(--accent)" }}>⬡</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", marginBottom: 6 }}>選擇 Product Suite</div>
          <div style={{ fontSize: 13, color: "var(--text-3)" }}>選擇你要查看的產品範疇，或顯示所有 Schema</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {/* ALL option */}
          <button onClick={() => pick(null)}
            style={{ padding: "20px 16px", borderRadius: 12, border: "2px solid var(--border)", background: "var(--bg-2)", cursor: "pointer", textAlign: "left", transition: "all 0.15s", display: "flex", flexDirection: "column", gap: 8 }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLButtonElement).style.background = "var(--accent-dim)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-2)"; }}>
            <div style={{ fontSize: 22, lineHeight: 1 }}>⊞</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", marginBottom: 2 }}>ALL</div>
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>顯示所有 Schema</div>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: "auto" }}>{schemaList.length} 個 Schema</div>
          </button>

          {suiteList.map(suite => {
            const count = schemaList.filter(s => s.suiteId === suite.id).length;
            const color = suite.color ?? "var(--accent)";
            return (
              <button key={suite.id} onClick={() => pick(suite.id)}
                style={{ padding: "20px 16px", borderRadius: 12, border: `2px solid var(--border)`, background: "var(--bg-2)", cursor: "pointer", textAlign: "left", transition: "all 0.15s", display: "flex", flexDirection: "column", gap: 8 }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = color; (e.currentTarget as HTMLButtonElement).style.background = `${color}18`; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-2)"; }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: color, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", marginBottom: 2 }}>{suite.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-3)" }}>Product Suite</div>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: "auto" }}>{count} 個 Schema</div>
              </button>
            );
          })}
        </div>

        {suiteList.length === 0 && schemas !== undefined && (
          <div style={{ textAlign: "center", color: "var(--text-3)", fontSize: 12, padding: "8px 0" }}>
            尚未建立任何 Suite — 可至側欄「⊛ 管理 Suite」新增
            <button onClick={() => pick(null)}
              style={{ marginLeft: 12, padding: "4px 14px", borderRadius: 6, border: "none", background: "var(--accent)", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
              直接進入 →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const { page, setPage, suitePicked } = useStore();
  const t = useT();
  const { isMobile, isTablet, isDesktop } = useBreakpoint();
  const [showSettings, setShowSettings] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowSearch(v => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close mobile menu when resizing to desktop
  useEffect(() => { if (isDesktop) setMobileMenuOpen(false); }, [isDesktop]);
  // Reset sidebar open state when going from mobile to larger
  useEffect(() => { if (!isMobile) setSidebarOpen(true); }, [isMobile]);

  const topBarHeight = isMobile ? 48 : 44;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      {/* ── Top bar ── */}
      <div style={{
        height: topBarHeight, background: "var(--bg-2)", borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", padding: isMobile ? "0 12px" : "0 16px",
        gap: isMobile ? 8 : 16, flexShrink: 0, zIndex: 100,
      }}>
        {/* Logo */}
        <div style={{ fontWeight: 700, fontSize: isMobile ? 13 : 14, color: "var(--accent)", letterSpacing: "0.5px", flexShrink: 0 }}>
          ⬡{!isMobile && " Schema Studio"}
          {isMobile && <span style={{ marginLeft: 4 }}>Schema Studio</span>}
        </div>

        {/* Desktop: full nav | Tablet: scrollable nav | Mobile: nothing (in drawer) */}
        {!isMobile && (
          <nav className={isTablet ? "nav-scroll" : undefined}
            style={{ display: "flex", gap: 2, flex: isTablet ? 1 : undefined, minWidth: 0 }}>
            {NAV_KEYS.map((n) => (
              <NavBtn key={n.id} active={page === n.id} onClick={() => setPage(n.id)}>{t(n.key)}</NavBtn>
            ))}
          </nav>
        )}

        <div style={{ marginLeft: isMobile ? "auto" : !isTablet ? "auto" : undefined, display: "flex", gap: 6, alignItems: "center" }}>
          {/* Tablet: sidebar toggle */}
          {isTablet && (
            <button onClick={() => setSidebarOpen(v => !v)} title={sidebarOpen ? "收合側欄" : "展開側欄"}
              style={{ ...iconBtnStyle, fontSize: 15 }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-4)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-3)"; }}>
              {sidebarOpen ? "⊟" : "⊞"}
            </button>
          )}

          <button onClick={() => setShowSearch(true)} title="全局搜尋 (⌘K)"
            style={{ ...iconBtnStyle, fontSize: 14, gap: 4, width: "auto", padding: "0 8px", minWidth: 30 }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-4)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-3)"; }}>
            ⊕{!isMobile && <span style={{ fontSize: 10, color: "var(--text-3)", marginLeft: 2 }}>⌘K</span>}
          </button>
          <LangToggle />
          <ThemeToggle />

          <button onClick={() => setShowSettings(true)} title="系統設定"
            style={{ ...iconBtnStyle, fontSize: 15 }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-4)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-3)"; }}>
            ⚙
          </button>

          {/* Mobile: hamburger */}
          {isMobile && (
            <button onClick={() => setMobileMenuOpen(true)} title="選單"
              style={{ ...iconBtnStyle, fontSize: 18, border: "none" }}>
              ☰
            </button>
          )}
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar: desktop always, tablet when open, mobile = hidden (in drawer) */}
        {!isMobile && (
          <div className="sidebar-panel"
            style={{ width: (isDesktop || sidebarOpen) ? 220 : 0, opacity: (isDesktop || sidebarOpen) ? 1 : 0 }}>
            {(isDesktop || sidebarOpen) && <Sidebar onSearch={() => setShowSearch(true)} />}
          </div>
        )}

        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {!suitePicked ? (
            <SuiteSplash />
          ) : (
            <>
              {page === "editor"   && <SchemaEditorPage />}
              {page === "dict"     && <NamingDictPage />}
              {page === "versions" && <VersionHistoryPage />}
              {page === "analysis" && <AnalysisPage />}
              {page === "er"       && <ErDiagramPage />}
              {page === "wide"     && <WideTablePage />}
              {page === "rules"    && <RulesPage />}
              {page === "datahub"  && <DataHubPage />}
            </>
          )}
        </div>
      </div>

      {/* Mobile slide-in drawer */}
      {isMobile && <MobileDrawer open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} onSearch={() => setShowSearch(true)} />}

      <Toast />
      {showSearch && <GlobalSearchModal onClose={() => setShowSearch(false)} />}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

      <style>{`
        .btn { padding: 5px 12px; border-radius: var(--radius); border: none; cursor: pointer; font-size: 12px; font-weight: 500; transition: all 0.15s; font-family: inherit; }
        .btn-primary { background: var(--accent); color: #fff; }
        .btn-primary:hover { opacity: 0.9; }
        .btn-ghost { background: transparent; color: var(--text-2); border: 1px solid var(--border-light); }
        .btn-ghost:hover { background: var(--bg-3); color: var(--text-1); }
        .btn-success { background: var(--success); color: #000; font-weight: 600; }
        .btn-danger { background: transparent; color: var(--error); border: 1px solid transparent; }
        .btn-danger:hover { background: var(--error-dim); }
        .form-input { width: 100%; background: var(--bg-3); border: 1px solid var(--border); color: var(--text-1); padding: 7px 10px; border-radius: var(--radius); font-size: 13px; outline: none; transition: border-color 0.15s; font-family: inherit; }
        .form-input:focus { border-color: var(--accent); }
        .panel-title { font-size: 11px; font-weight: 600; color: var(--text-2); }
        .icon-btn { width: 22px; height: 22px; border-radius: 4px; border: none; background: transparent; color: var(--text-2); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 16px; transition: all 0.15s; }
        .icon-btn:hover { background: var(--bg-3); color: var(--text-1); }
      `}</style>
    </div>
  );
}
