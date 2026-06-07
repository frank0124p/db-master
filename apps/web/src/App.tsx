import { useState, useEffect, useRef, Component, type ReactNode, type CSSProperties } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useStore, type Page, type Theme } from "./store.js";
import { useT } from "./i18n.js";
import { api, type ProductSuite, type SchemaLayer, type SchemaEnvironment, type SearchResults, type SearchNamingResult, type DomainDef } from "./api.js";
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

// ── Error Boundary ────────────────────────────────────────────────────────────

interface EBState { hasError: boolean; message: string }
class ErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  override state: EBState = { hasError: false, message: "" };
  static getDerivedStateFromError(e: unknown): EBState {
    return { hasError: true, message: e instanceof Error ? e.message : String(e) };
  }
  override render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ padding: 40, color: "var(--error)", fontFamily: "var(--font-mono)", fontSize: 13 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Something went wrong</div>
        <div style={{ opacity: 0.7 }}>{this.state.message}</div>
        <button onClick={() => this.setState({ hasError: false, message: "" })}
          style={{ marginTop: 16, padding: "6px 14px", borderRadius: 6, border: "1px solid var(--error)", background: "transparent", color: "var(--error)", cursor: "pointer" }}>
          Retry
        </button>
      </div>
    );
  }
}

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
      catch (e) { console.error("[search]", e); }
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
  const { data: nlDomains } = useQuery({ queryKey: ["domains"], queryFn: () => api.settings.getDomains() });
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
            {(nlDomains ?? [{ id: "semiconductor", name: "半導體製造", order: 0, color: null }, { id: "general", name: "通用", order: 1, color: null }]).map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
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
        background: active ? "var(--accent-dim)" : hover ? "var(--bg-2)" : "transparent" }}>
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

function SchemaTreeItem({ schema, suiteColor, isSelected, onSelect, expanded, onToggle }: {
  schema: import("./api.js").Schema;
  suiteColor: string | null;
  isSelected: boolean;
  onSelect: () => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { setPage, setSelectedSchemaId } = useStore();
  const { data: detail } = useQuery({
    queryKey: ["schemas", schema.id],
    queryFn: () => api.schemas.get(schema.id),
    enabled: expanded,
    staleTime: 30_000,
  });
  const { data: wideTables } = useQuery({
    queryKey: ["wideTables", schema.id],
    queryFn: () => api.wideTables.list(schema.id),
    enabled: expanded,
    staleTime: 30_000,
  });
  const [hover, setHover] = useState(false);

  function goToWide() {
    setSelectedSchemaId(schema.id);
    setPage("wide");
  }

  return (
    <div>
      <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        style={{ display: "flex", alignItems: "center", marginBottom: 1, borderRadius: "var(--radius)",
          background: isSelected ? "var(--accent-dim)" : hover ? "var(--bg-2)" : "transparent" }}>
        <div onClick={e => { e.stopPropagation(); onToggle(); }}
          style={{ width: 20, flexShrink: 0, alignSelf: "stretch", display: "flex", alignItems: "center",
            justifyContent: "center", cursor: "pointer", color: "var(--text-3)", fontSize: 9,
            opacity: hover ? 1 : 0.6 }}>
          {expanded ? "▾" : "▸"}
        </div>
        <div onClick={onSelect} data-testid="schema-item" data-schema-name={schema.name}
          style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6,
            padding: "6px 8px 6px 2px", cursor: "pointer" }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
            background: suiteColor ?? (isSelected ? "var(--accent)" : "var(--text-3)") }} />
          <div style={{ fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            color: isSelected ? "var(--accent)" : "var(--text-2)" }}>{schema.name}</div>
          {schema.environment && (
            <span style={{ fontSize: 9, fontWeight: 700, flexShrink: 0, letterSpacing: "0.3px",
              color: ENV_COLOR[schema.environment], background: `${ENV_COLOR[schema.environment]}22`,
              border: `1px solid ${ENV_COLOR[schema.environment]}44`, borderRadius: 3, padding: "1px 4px" }}>
              {schema.environment}
            </span>
          )}
        </div>
      </div>
      {expanded && (
        <div style={{ paddingLeft: 20, paddingBottom: 2 }}>
          {detail
            ? detail.tables.map(table => (
                <div key={table.id} onClick={onSelect}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 8px",
                    borderRadius: 3, cursor: "pointer", color: "var(--text-3)", fontSize: 11 }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.color = "var(--text-2)"; (e.currentTarget as HTMLDivElement).style.background = "var(--bg-2)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.color = "var(--text-3)"; (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}>
                  <span style={{ fontSize: 9, flexShrink: 0, opacity: 0.6 }}>⊞</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{table.name}</span>
                </div>
              ))
            : <div style={{ fontSize: 10, color: "var(--text-3)", padding: "4px 8px" }}>載入中…</div>
          }
          {/* Wide tables section */}
          {wideTables && wideTables.length > 0 && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 8px 2px", marginTop: 2, borderTop: "1px solid var(--border)" }}>
                <span style={{ fontSize: 9, color: "#a78bfa", opacity: 0.8 }}>⊞</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.4px", flex: 1 }}>寬表</span>
                <span style={{ fontSize: 9, color: "var(--text-3)" }}>{wideTables.length}</span>
              </div>
              {wideTables.map(wt => (
                <div key={wt.id} onClick={goToWide}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 8px",
                    borderRadius: 3, cursor: "pointer", fontSize: 10 }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "var(--bg-2)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}>
                  <span style={{ fontSize: 9, flexShrink: 0, color: wt.wideTableType === "r2u" ? "#a78bfa" : "#34d399" }}>⊕</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>{wt.name}</span>
                  <span style={{ fontSize: 8, flexShrink: 0, padding: "0 4px", borderRadius: 3,
                    background: wt.wideTableType === "r2u" ? "rgba(167,139,250,0.15)" : "rgba(52,211,153,0.15)",
                    color: wt.wideTableType === "r2u" ? "#a78bfa" : "#34d399" }}>
                    {wt.wideTableType === "r2u" ? "R2U" : "UNI"}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
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

const DOMAIN_COLORS = ["#7b8cff", "#4ade80", "#fbbf24", "#f87171", "#60a5fa", "#c084fc", "#fb923c", "#2dd4bf"];

function FolderEditorModal({ domains, onClose }: { domains: DomainDef[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { showToast } = useStore();
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: () => api.settings.createDomain({ name: newName.trim(), color: newColor }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["domains"] }); setNewName(""); setNewColor(null); showToast("領域已建立"); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, name, color }: { id: string; name: string; color: string | null }) => api.settings.updateDomain(id, { name, color }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["domains"] }); setEditId(null); showToast("領域已更新"); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.settings.deleteDomain(id),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["domains"] }); showToast("領域已刪除"); },
  });
  const reorderMut = useMutation({
    mutationFn: (ids: string[]) => api.settings.reorderDomains(ids),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["domains"] }); },
  });

  function move(idx: number, dir: -1 | 1) {
    const ids = domains.map(d => d.id);
    const swap = idx + dir;
    if (swap < 0 || swap >= ids.length) return;
    [ids[idx], ids[swap]] = [ids[swap]!, ids[idx]!];
    reorderMut.mutate(ids);
  }

  const ColorPicker = ({ value, onChange }: { value: string | null; onChange: (c: string | null) => void }) => (
    <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
      {DOMAIN_COLORS.map(c => (
        <div key={c} onClick={() => onChange(value === c ? null : c)}
          style={{ width: 13, height: 13, borderRadius: "50%", background: c, cursor: "pointer", flexShrink: 0,
            border: value === c ? "2px solid var(--text-1)" : "2px solid transparent" }} />
      ))}
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 700, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "var(--bg-2)", border: "1px solid var(--border-light)", borderRadius: 10, width: "min(500px, 92vw)", padding: 20, boxShadow: "0 8px 32px rgba(0,0,0,0.5)", maxHeight: "80vh", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>管理領域 (Domain)</div>
        <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 14 }}>領域為側欄第一層分類，對應 Schema 的 domain 欄位。</div>

        <div style={{ flex: 1, overflowY: "auto", marginBottom: 16 }}>
          {domains.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--text-3)", padding: "12px 0" }}>尚無領域，在下方建立第一個</div>
          )}
          {domains.map((d, idx) => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", borderRadius: 6, border: "1px solid var(--border)", marginBottom: 5, background: "var(--bg-3)" }}>
              {editId === d.id ? (
                <>
                  <input value={editName} onChange={e => setEditName(e.target.value)}
                    style={{ flex: 1, background: "var(--bg-4)", border: "1px solid var(--border)", color: "var(--text-1)", padding: "4px 8px", borderRadius: 4, fontSize: 13, outline: "none" }} />
                  <ColorPicker value={editColor} onChange={setEditColor} />
                  <button className="btn btn-primary" style={{ fontSize: 11, padding: "3px 8px" }}
                    onClick={() => updateMut.mutate({ id: d.id, name: editName.trim() || d.name, color: editColor })}>儲存</button>
                  <button className="btn btn-ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => setEditId(null)}>取消</button>
                </>
              ) : (
                <>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: d.color ?? "var(--text-3)", flexShrink: 0 }} />
                  <span style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "var(--font-mono)", flexShrink: 0 }}>{d.id}</span>
                  <span style={{ fontSize: 13, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                  <button onClick={() => move(idx, -1)} disabled={idx === 0}
                    style={{ width: 20, height: 20, border: "none", background: "transparent", color: "var(--text-2)", cursor: idx === 0 ? "default" : "pointer", fontSize: 12, opacity: idx === 0 ? 0.3 : 1 }}>↑</button>
                  <button onClick={() => move(idx, 1)} disabled={idx === domains.length - 1}
                    style={{ width: 20, height: 20, border: "none", background: "transparent", color: "var(--text-2)", cursor: idx === domains.length - 1 ? "default" : "pointer", fontSize: 12, opacity: idx === domains.length - 1 ? 0.3 : 1 }}>↓</button>
                  <button className="btn btn-ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => { setEditId(d.id); setEditName(d.name); setEditColor(d.color); }}>編輯</button>
                  <button className="btn btn-danger" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => deleteMut.mutate(d.id)}>刪除</button>
                </>
              )}
            </div>
          ))}
        </div>

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>新增領域</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input className="form-input" placeholder="領域名稱（例：採購、人資）" value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && newName.trim() && createMut.mutate()}
              style={{ flex: 1 }} />
            <ColorPicker value={newColor} onChange={setNewColor} />
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
  const [showFolderEditor, setShowFolderEditor] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [treeCollapsed, setTreeCollapsed] = useState<Set<string>>(new Set());
  function toggleTree(key: string) {
    setTreeCollapsed(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }
  const [expandedSchemas, setExpandedSchemas] = useState<Set<number>>(new Set());
  function toggleSchema(id: number) {
    setExpandedSchemas(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  const [form, setForm] = useState({ name: "", description: "", domain: "semiconductor", suiteId: "", layerType: "", environment: "" });
  const { data: domains } = useQuery({ queryKey: ["domains"], queryFn: () => api.settings.getDomains() });
  const domainList = domains ?? [];
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
  const activeSuiteObj = activeSuiteId !== null ? suiteMap.get(activeSuiteId) : null;

  return (
    <>
      {/* Suite context strip — always visible */}
      <button onClick={() => setSuitePicked(false)} title="切換 Suite"
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8,
          padding: "7px 14px", border: "none", borderBottom: "1px solid var(--border)",
          background: activeSuiteObj
            ? `${activeSuiteObj.color ?? "var(--accent)"}15`
            : "var(--bg-3)",
          cursor: "pointer", flexShrink: 0, textAlign: "left",
          borderLeft: activeSuiteObj ? `3px solid ${activeSuiteObj.color ?? "var(--accent)"}` : "3px solid var(--border)",
        }}>
        {activeSuiteObj
          ? <>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: activeSuiteObj.color ?? "var(--accent)", flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-1)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeSuiteObj.name}</span>
            </>
          : <>
              <span style={{ fontSize: 11, color: "var(--text-3)" }}>⊞</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-2)", flex: 1 }}>ALL Suites</span>
            </>
        }
        <span style={{ fontSize: 9, color: "var(--text-3)", flexShrink: 0 }}>⇄</span>
      </button>

      <div style={{ padding: "8px 14px 6px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.8px" }}>{t("sidebar.schemas")}</span>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => setShowFolderEditor(true)} title="管理領域資料夾"
            style={{ width: 22, height: 22, borderRadius: 4, border: "none", background: "transparent", color: "var(--text-3)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>⊟</button>
          <button onClick={() => setShowSuiteModal(true)} title="管理 Suite"
            style={{ width: 22, height: 22, borderRadius: 4, border: "none", background: "transparent", color: "var(--text-3)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>⊛</button>
          <button onClick={() => setShowNl(true)} title={t("sidebar.ai_gen")}
            style={{ padding: "2px 7px", borderRadius: 4, border: "1px solid var(--accent)", background: "var(--accent-dim)", color: "var(--accent)", cursor: "pointer", fontSize: 10, fontWeight: 700, letterSpacing: "0.3px" }}>✦ AI</button>
          <button onClick={() => void reloadDdl()} disabled={reloading}
            style={{ width: 22, height: 22, borderRadius: 4, border: "none", background: "transparent", color: "var(--text-3)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, opacity: reloading ? 0.5 : 1 }}>↺</button>
          <button onClick={() => setShowModal(true)} title={t("sidebar.new_schema")}
            style={{ width: 22, height: 22, borderRadius: 4, border: "none", background: "transparent", color: "var(--text-2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>＋</button>
        </div>
      </div>

      {onSearch && (
        <div style={{ padding: "0 10px 8px", flexShrink: 0 }}>
          <button onClick={onSearch}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, padding: "4px 6px", borderRadius: 5, border: "1px solid transparent", background: "transparent", color: "var(--text-3)", cursor: "pointer", textAlign: "left", fontSize: 11, transition: "background 0.12s, border-color 0.12s" }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-3)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.borderColor = "transparent"; }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>⊕</span>
            <span style={{ flex: 1 }}>搜尋 Table / Column...</span>
            <span style={{ fontSize: 9, background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 3, padding: "1px 4px", opacity: 0.7 }}>⌘K</span>
          </button>
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
        {(() => {
          const allSchemas = schemas ?? [];
          const allSuites = suites ?? [];

          const renderSchemaItem = (sc: import("./api.js").Schema, suiteColor: string | null) => (
            <SchemaTreeItem key={sc.id} schema={sc} suiteColor={suiteColor}
              isSelected={selectedSchemaId === sc.id}
              onSelect={() => { setSelectedSchemaId(sc.id); onSchemaSelect?.(); }}
              expanded={expandedSchemas.has(sc.id)}
              onToggle={() => toggleSchema(sc.id)} />
          );

          // Group all schemas by suiteId
          const bySuite = new Map<number | null, import("./api.js").Schema[]>();
          for (const sc of allSchemas) {
            const k = sc.suiteId ?? null;
            if (!bySuite.has(k)) bySuite.set(k, []);
            bySuite.get(k)!.push(sc);
          }

          const treeRow = (
            content: ReactNode,
            indent: number,
            onClick?: () => void,
            extraStyle?: CSSProperties,
          ) => (
            <div onClick={onClick}
              style={{ display: "flex", alignItems: "center", gap: 5, paddingLeft: indent, paddingRight: 8, minHeight: 22, cursor: onClick ? "pointer" : undefined, userSelect: "none", ...extraStyle }}>
              {content}
            </div>
          );

          return (
            <>
              {allSuites.map(suite => {
                const suiteSchemas = bySuite.get(suite.id) ?? [];
                const suiteKey = `s-${suite.id}`;
                const suiteOpen = !treeCollapsed.has(suiteKey);

                const byDomain = new Map<string, import("./api.js").Schema[]>();
                const undomained: import("./api.js").Schema[] = [];
                for (const sc of suiteSchemas) {
                  if (domainList.some(d => d.id === sc.domain)) {
                    if (!byDomain.has(sc.domain)) byDomain.set(sc.domain, []);
                    byDomain.get(sc.domain)!.push(sc);
                  } else {
                    undomained.push(sc);
                  }
                }

                return (
                  <div key={suite.id} style={{ marginBottom: 2 }}>
                    {treeRow(
                      <>
                        <span style={{ fontSize: 8, color: "var(--text-3)", width: 8, flexShrink: 0 }}>{suiteOpen ? "▾" : "▸"}</span>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: suite.color ?? "var(--accent)", flexShrink: 0 }} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-1)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{suite.name}</span>
                        <span style={{ fontSize: 9, color: "var(--text-3)", flexShrink: 0 }}>{suiteSchemas.length}</span>
                      </>,
                      8, () => toggleTree(suiteKey),
                      { borderLeft: `3px solid ${suite.color ?? "var(--accent)"}`, paddingTop: 4, paddingBottom: 4 },
                    )}

                    {suiteOpen && (
                      <div>
                        {domainList.map(domain => {
                          const domainSchemas = byDomain.get(domain.id) ?? [];
                          if (domainSchemas.length === 0) return null;
                          const domainKey = `d-${suite.id}-${domain.id}`;
                          const domainOpen = !treeCollapsed.has(domainKey);

                          const byLayer = new Map<string | null, import("./api.js").Schema[]>();
                          for (const sc of domainSchemas) {
                            if (!byLayer.has(sc.layerType)) byLayer.set(sc.layerType, []);
                            byLayer.get(sc.layerType)!.push(sc);
                          }

                          return (
                            <div key={domain.id}>
                              {treeRow(
                                <>
                                  <span style={{ fontSize: 8, color: "var(--text-3)", width: 8, flexShrink: 0 }}>{domainOpen ? "▾" : "▸"}</span>
                                  <span style={{ fontSize: 10, fontWeight: 700, color: domain.color ?? "var(--text-2)", letterSpacing: "0.3px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{domain.name}</span>
                                  <span style={{ fontSize: 9, color: "var(--text-3)", flexShrink: 0 }}>{domainSchemas.length}</span>
                                </>,
                                20, () => toggleTree(domainKey),
                              )}
                              {domainOpen && (
                                <div>
                                  {schemaLayers.map(layer => {
                                    const layerSchemas = byLayer.get(layer.id as SchemaLayer) ?? [];
                                    if (layerSchemas.length === 0) return null;
                                    const layerKey = `l-${suite.id}-${domain.id}-${layer.id}`;
                                    const layerOpen = !treeCollapsed.has(layerKey);
                                    return (
                                      <div key={layer.id}>
                                        {treeRow(
                                          <>
                                            <span style={{ fontSize: 8, color: "var(--text-3)", width: 8, flexShrink: 0 }}>{layerOpen ? "▾" : "▸"}</span>
                                            <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{layer.label}</span>
                                          </>,
                                          32, () => toggleTree(layerKey),
                                        )}
                                        {layerOpen && <div style={{ paddingLeft: 28 }}>{layerSchemas.map(sc => renderSchemaItem(sc, suite.color ?? null))}</div>}
                                      </div>
                                    );
                                  })}
                                  {(byLayer.get(null) ?? []).length > 0 && (
                                    <div style={{ paddingLeft: 28 }}>{(byLayer.get(null) ?? []).map(sc => renderSchemaItem(sc, suite.color ?? null))}</div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {undomained.map(sc => (
                          <div key={sc.id} style={{ paddingLeft: 20 }}>{renderSchemaItem(sc, suite.color ?? null)}</div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Schemas with no suite */}
              {(bySuite.get(null) ?? []).length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-3)", padding: "4px 8px 2px", textTransform: "uppercase", letterSpacing: "0.5px" }}>未指定 Suite</div>
                  {(bySuite.get(null) ?? []).map(sc => renderSchemaItem(sc, null))}
                </div>
              )}

              {/* No suites at all — flat list grouped by domain + layer */}
              {allSuites.length === 0 && (() => {
                const byDomain = new Map<string, import("./api.js").Schema[]>();
                const undomain: import("./api.js").Schema[] = [];
                for (const sc of allSchemas) {
                  if (domainList.some(d => d.id === sc.domain)) {
                    if (!byDomain.has(sc.domain)) byDomain.set(sc.domain, []);
                    byDomain.get(sc.domain)!.push(sc);
                  } else { undomain.push(sc); }
                }
                return (
                  <div style={{ padding: "0 8px" }}>
                    {domainList.map(domain => {
                      const ds = byDomain.get(domain.id) ?? [];
                      if (ds.length === 0) return null;
                      return (
                        <div key={domain.id} style={{ marginBottom: 4 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, padding: "5px 6px 3px 8px", borderLeft: `3px solid ${domain.color ?? "var(--border-light)"}`, color: domain.color ?? "var(--text-2)" }}>{domain.name}</div>
                          {ds.map(sc => renderSchemaItem(sc, null))}
                        </div>
                      );
                    })}
                    {undomain.map(sc => renderSchemaItem(sc, null))}
                  </div>
                );
              })()}
            </>
          );
        })()}
      </div>

      {showNl && <NlGenerateModal onClose={() => setShowNl(false)} />}
      {showFolderEditor && <FolderEditorModal domains={domainList} onClose={() => setShowFolderEditor(false)} />}
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
                {(domainList.length > 0 ? domainList : [{ id: "semiconductor", name: t("form.semiconductor"), order: 0, color: null }, { id: "general", name: t("form.general"), order: 1, color: null }]).map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
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
    <div style={{ width: "100%", height: "100%", background: "var(--bg-1)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
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
  const { page, setPage, suitePicked, activeSuiteId, setSuitePicked } = useStore();
  const { data: suites } = useQuery({ queryKey: ["suites"], queryFn: api.suites.list });
  const activeSuite = (suites ?? []).find(s => s.id === activeSuiteId) ?? null;
  const t = useT();
  const { isMobile, isTablet, isDesktop } = useBreakpoint();
  const [showSettings, setShowSettings] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const s = localStorage.getItem("schema-studio-sidebar-width");
    return s ? Math.max(160, Math.min(480, Number(s))) : 220;
  });
  const resizing = useRef(false);
  const resizeStartX = useRef(0);
  const resizeStartW = useRef(0);

  function startSidebarResize(e: React.MouseEvent) {
    e.preventDefault();
    resizing.current = true;
    resizeStartX.current = e.clientX;
    resizeStartW.current = sidebarWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowSearch(v => !v);
      }
    }
    function onMove(e: MouseEvent) {
      if (!resizing.current) return;
      const newW = Math.max(160, Math.min(480, resizeStartW.current + e.clientX - resizeStartX.current));
      setSidebarWidth(newW);
      localStorage.setItem("schema-studio-sidebar-width", String(newW));
    }
    function onUp() {
      if (!resizing.current) return;
      resizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
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
        {/* Logo + Suite indicator — grouped together on the left */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: isMobile ? 13 : 14, color: "var(--accent)", letterSpacing: "0.5px" }}>
            ⬡{!isMobile && " Schema Studio"}
            {isMobile && <span style={{ marginLeft: 4 }}>Schema Studio</span>}
          </div>

          {/* Separator */}
          {suitePicked && <span style={{ width: 1, height: 16, background: "var(--border)", flexShrink: 0 }} />}

          {/* Suite badge — always shown when suitePicked */}
          {suitePicked && (() => {
            const dotColor = activeSuite?.color ?? "var(--accent)";
            const label = activeSuite?.name ?? "ALL";
            const isAll = !activeSuite;
            return (
              <button
                onClick={() => setSuitePicked(false)}
                title="切換 Product Suite"
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "0 9px 0 7px", height: 26, borderRadius: 6,
                  border: isAll ? "1px solid var(--border)" : `1.5px solid ${dotColor}66`,
                  background: isAll ? "var(--bg-3)" : `${dotColor}20`,
                  cursor: "pointer", flexShrink: 0, transition: "opacity 0.15s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.7"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}>
                {isAll
                  ? <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-2)", letterSpacing: "0.3px" }}>ALL</span>
                  : <>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-1)", maxWidth: isMobile ? 80 : 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                    </>
                }
                <span style={{ fontSize: 9, color: "var(--text-3)", marginLeft: 2 }}>⇄</span>
              </button>
            );
          })()}
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
            style={{ width: (isDesktop || sidebarOpen) ? sidebarWidth : 0, opacity: (isDesktop || sidebarOpen) ? 1 : 0 }}>
            {(isDesktop || sidebarOpen) && <Sidebar onSearch={() => setShowSearch(true)} />}
          </div>
        )}
        {/* Drag handle */}
        {!isMobile && (isDesktop || sidebarOpen) && (
          <div onMouseDown={startSidebarResize}
            style={{ width: 4, flexShrink: 0, cursor: "col-resize", background: "var(--border)", zIndex: 10, transition: "background 0.15s" }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "var(--accent)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "var(--border)"; }}
          />
        )}

        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          <ErrorBoundary>
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
          </ErrorBoundary>
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
