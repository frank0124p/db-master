import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore, type Page, type Theme } from "./store.js";
import { useT } from "./i18n.js";
import { api } from "./api.js";
import SchemaEditorPage from "./pages/SchemaEditorPage.js";
import NamingDictPage from "./pages/NamingDictPage.js";
import VersionHistoryPage from "./pages/VersionHistoryPage.js";
import AnalysisPage from "./pages/AnalysisPage.js";
import ErDiagramPage from "./pages/ErDiagramPage.js";
import WideTablePage from "./pages/WideTablePage.js";
import RulesPage from "./pages/RulesPage.js";

const NAV_KEYS: { id: Page; key: string }[] = [
  { id: "editor",   key: "nav.editor" },
  { id: "dict",     key: "nav.dict" },
  { id: "versions", key: "nav.versions" },
  { id: "analysis", key: "nav.analysis" },
  { id: "er",       key: "nav.er" },
  { id: "wide",     key: "nav.wide" },
  { id: "rules",    key: "nav.rules" },
];

function FormRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block", textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</label>
      {children}
    </div>
  );
}

// ── NL Generate Modal ──────────────────────────────────────────────────────────
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
    setStreaming(true);
    setTokens("");
    setStatus("正在生成 Schema...");

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
    } catch (e) {
      setStatus(`錯誤：${e instanceof Error ? e.message : "連線失敗"}`);
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "var(--bg-2)", border: "1px solid var(--border-light)", borderRadius: 12, width: "min(720px, 92vw)", padding: 24, boxShadow: "0 8px 40px rgba(0,0,0,0.6)" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>✦ AI 自然語言生成 Schema</div>
        <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 16 }}>描述你需要的資料庫結構，AI 將自動套用命名字典並生成符合規範的 Schema</div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>描述需求</div>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder={"例如：建立一個設備保養記錄系統，需要記錄設備 ID、保養類型、執行人員、保養日期、下次保養日期，以及保養結果描述"}
            disabled={streaming}
            style={{ width: "100%", height: 100, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-3)", color: "var(--text-1)", fontSize: 13, lineHeight: 1.6, resize: "none", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
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
            <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>{t("misc.ai_output")}</div>
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

// ── Sidebar ─────────────────────────────────────────────────────────────────────
function Sidebar() {
  const qc = useQueryClient();
  const { selectedSchemaId, setSelectedSchemaId, showToast } = useStore();
  const { data: schemas } = useQuery({ queryKey: ["schemas"], queryFn: api.schemas.list });
  const [showModal, setShowModal] = useState(false);
  const [showNl, setShowNl] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", domain: "semiconductor" });
  const t = useT();

  async function reloadDdl() {
    if (reloading) return;
    setReloading(true);
    try {
      await api.reload();
      await qc.invalidateQueries({ queryKey: ["schemas"] });
      showToast(t("toast.reloaded"));
    } catch {
      showToast(t("toast.reload_failed"));
    } finally {
      setReloading(false);
    }
  }

  async function create() {
    if (!form.name.trim()) return;
    const s = await api.schemas.create({ name: form.name, ...(form.description ? { description: form.description } : {}), domain: form.domain });
    await qc.invalidateQueries({ queryKey: ["schemas"] });
    setSelectedSchemaId(s.id);
    setShowModal(false);
    setForm({ name: "", description: "", domain: "semiconductor" });
    showToast(t("toast.schema_created"));
  }

  return (
    <>
      <div style={{ width: 220, background: "var(--bg-2)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "12px 14px 8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.8px" }}>{t("sidebar.schemas")}</span>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => setShowNl(true)} title={t("sidebar.ai_gen")} style={{ padding: "2px 7px", borderRadius: 4, border: "1px solid var(--accent)", background: "var(--accent-dim)", color: "var(--accent)", cursor: "pointer", fontSize: 10, fontWeight: 700, letterSpacing: "0.3px" }}>✦ AI</button>
            <button onClick={() => void reloadDdl()} title={t("sidebar.reload")} disabled={reloading} style={{ width: 22, height: 22, borderRadius: 4, border: "none", background: "transparent", color: "var(--text-3)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, opacity: reloading ? 0.5 : 1 }}>↺</button>
            <button onClick={() => setShowModal(true)} title={t("sidebar.new_schema")} style={{ width: 22, height: 22, borderRadius: 4, border: "none", background: "transparent", color: "var(--text-2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>＋</button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px" }}>
          {schemas?.map((s) => (
            <SchemaItem key={s.id} name={s.name} active={selectedSchemaId === s.id} onClick={() => setSelectedSchemaId(s.id)} />
          ))}
        </div>
      </div>

      {showNl && <NlGenerateModal onClose={() => setShowNl(false)} />}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowModal(false)}>
          <div style={{ background: "var(--bg-2)", border: "1px solid var(--border-light)", borderRadius: 10, width: 400, padding: 20, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>{t("schemas.modal_new_schema")}</div>
            <FormRow label={t("form.schema_name")}>
              <input className="form-input" placeholder={t("form.schema_name_ph")} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} onKeyDown={e => e.key === "Enter" && create()} />
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
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>{t("btn.cancel")}</button>
              <button className="btn btn-primary" onClick={create}>{t("btn.create")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SchemaItem({ name, active, onClick }: { name: string; active: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ padding: "7px 8px", borderRadius: "var(--radius)", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, marginBottom: 1, background: active ? "var(--accent-dim)" : hover ? "var(--bg-3)" : "transparent" }}
    >
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: active ? "var(--accent)" : "var(--text-3)", flexShrink: 0 }} />
      <div style={{ fontSize: 12, color: active ? "var(--accent)" : "var(--text-2)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
    </div>
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
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-3)"; }}
    >
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
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-3)"; }}
    >
      {locale === "zh" ? "EN" : "中"}
    </button>
  );
}

export default function App() {
  const { page, setPage } = useStore();
  const t = useT();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      {/* Top bar */}
      <div style={{ height: 44, background: "var(--bg-2)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", padding: "0 16px", gap: 24, flexShrink: 0, zIndex: 100 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "var(--accent)", letterSpacing: "0.5px" }}>⬡ Schema Studio</div>
        <nav style={{ display: "flex", gap: 2 }}>
          {NAV_KEYS.map((n) => (
            <NavBtn key={n.id} active={page === n.id} onClick={() => setPage(n.id)}>{t(n.key)}</NavBtn>
          ))}
        </nav>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <LangToggle />
          <ThemeToggle />
        </div>
      </div>

      {/* Main */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <Sidebar />
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {page === "editor" && <SchemaEditorPage />}
          {page === "dict" && <NamingDictPage />}
          {page === "versions" && <VersionHistoryPage />}
          {page === "analysis" && <AnalysisPage />}
          {page === "er" && <ErDiagramPage />}
          {page === "wide" && <WideTablePage />}
          {page === "rules" && <RulesPage />}
        </div>
      </div>

      <Toast />

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

function NavBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  const [hover, setHover] = useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ padding: "5px 12px", borderRadius: "var(--radius)", border: "none", background: active ? "var(--accent-dim)" : hover ? "var(--bg-3)" : "transparent", color: active ? "var(--accent)" : hover ? "var(--text-1)" : "var(--text-2)", cursor: "pointer", fontSize: 12, transition: "all 0.15s", fontFamily: "inherit" }}>
      {children}
    </button>
  );
}
