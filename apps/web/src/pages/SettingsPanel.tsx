import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api, type LlmSettings, type MinioSettings } from "../api.js";
import { useStore } from "../store.js";

// ── shared ────────────────────────────────────────────────────────────────────

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 18 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", letterSpacing: "0.3px" }}>{label}</label>
      {children}
      {hint && <span style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.5 }}>{hint}</span>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase",
      letterSpacing: "0.8px", marginBottom: 14, marginTop: 6, paddingBottom: 6,
      borderBottom: "1px solid var(--border)" }}>
      {children}
    </div>
  );
}

// ── LLM settings ──────────────────────────────────────────────────────────────

function LlmTab() {
  const qc = useQueryClient();
  const { showToast } = useStore();
  const { data, isLoading } = useQuery({
    queryKey: ["llm-settings"],
    queryFn: () => api.settings.getLlm(),
  });
  const initial: Partial<LlmSettings> = data?.settings ?? {};
  const [form, setForm] = useState<Partial<LlmSettings>>(initial);
  const [showKey, setShowKey] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Sync form when data loads
  const [initialized, setInitialized] = useState(false);
  if (data && !initialized) { setForm(data.settings); setInitialized(true); }

  const save = useMutation({
    mutationFn: (patch: Partial<LlmSettings>) => api.settings.updateLlm(patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["llm-settings"] });
      showToast("✓ LLM 設定已儲存");
      setTestResult(null);
    },
    onError: (e) => showToast(`儲存失敗: ${String(e)}`),
  });

  const test = useMutation({
    mutationFn: () => api.settings.testLlm(),
    onSuccess: (r) => { setTestResult(r); showToast(r.ok ? "✓ 連線成功" : `連線失敗: ${r.message}`); },
    onError: (e) => showToast(`測試失敗: ${String(e)}`),
  });

  const set = <K extends keyof LlmSettings>(k: K, v: LlmSettings[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const provider = form.provider ?? "anthropic";
  const isOpenAI = provider === "openai";

  if (isLoading) return <div style={{ padding: 32, color: "var(--text-3)", textAlign: "center" }}>載入中…</div>;

  return (
    <div>
      <SectionTitle>API 類型</SectionTitle>
      <FieldRow label="提供商" hint={isOpenAI ? "相容 OpenAI 格式（Azure / Ollama / 私有部署）" : "Anthropic Claude API（預設）"}>
        <div style={{ display: "flex", borderRadius: 6, border: "1px solid var(--border)", overflow: "hidden", width: "fit-content" }}>
          {(["anthropic", "openai"] as const).map(p => (
            <button key={p} onClick={() => set("provider", p)}
              style={{ padding: "6px 18px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                background: provider === p ? "var(--accent)" : "var(--bg-3)",
                color: provider === p ? "#fff" : "var(--text-3)", transition: "all 0.12s" }}>
              {p === "anthropic" ? "Anthropic" : "OpenAI 相容"}
            </button>
          ))}
        </div>
      </FieldRow>

      <SectionTitle>連線設定</SectionTitle>

      {isOpenAI && (
        <FieldRow label="API Base URL" hint="例如：https://your-company-api.com/v1">
          <input value={form.baseUrl ?? ""} onChange={e => set("baseUrl", e.target.value)}
            placeholder="https://..."
            style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)",
              background: "var(--bg-3)", color: "var(--text-1)", fontSize: 13,
              fontFamily: "var(--font-mono)", outline: "none", width: "100%", boxSizing: "border-box" }} />
        </FieldRow>
      )}

      <FieldRow label="API Key" hint="輸入新值即可覆蓋；留空保持現有設定不變">
        <div style={{ display: "flex", gap: 6 }}>
          <input value={form.apiKey ?? ""} onChange={e => set("apiKey", e.target.value)}
            type={showKey ? "text" : "password"}
            placeholder={initial.apiKey ? "••••（已設定，輸入覆蓋）" : "sk-..."}
            style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)",
              background: "var(--bg-3)", color: "var(--text-1)", fontSize: 13,
              fontFamily: "var(--font-mono)", outline: "none" }} />
          <button onClick={() => setShowKey(v => !v)}
            style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border)",
              background: "var(--bg-3)", color: "var(--text-3)", cursor: "pointer", fontSize: 11 }}>
            {showKey ? "隱藏" : "顯示"}
          </button>
        </div>
      </FieldRow>

      <FieldRow label="模型名稱" hint={isOpenAI ? "輸入 API 支援的模型 ID" : "例：claude-sonnet-4-6（留空用預設）"}>
        <input value={form.model ?? ""} onChange={e => set("model", e.target.value)}
          placeholder={isOpenAI ? "gpt-4o" : "claude-sonnet-4-6"}
          style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)",
            background: "var(--bg-3)", color: "var(--text-1)", fontSize: 13,
            fontFamily: "var(--font-mono)", outline: "none", width: "100%", boxSizing: "border-box" }} />
      </FieldRow>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={() => void save.mutate(form)} disabled={save.isPending}
          style={{ padding: "8px 20px", borderRadius: 7, border: "none",
            background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 700,
            cursor: save.isPending ? "not-allowed" : "pointer", opacity: save.isPending ? 0.7 : 1 }}>
          {save.isPending ? "儲存中…" : "儲存設定"}
        </button>
        <button onClick={() => void test.mutate()} disabled={test.isPending || save.isPending}
          style={{ padding: "8px 20px", borderRadius: 7,
            border: "1px solid var(--border)", background: "var(--bg-3)",
            color: "var(--text-2)", fontSize: 13, fontWeight: 600,
            cursor: test.isPending ? "not-allowed" : "pointer", opacity: test.isPending ? 0.7 : 1 }}>
          {test.isPending ? "測試中…" : "測試連線"}
        </button>
        {testResult && (
          <span style={{ fontSize: 12, fontWeight: 600, color: testResult.ok ? "#4ade80" : "#f87171" }}>
            {testResult.ok ? "✓ 連線成功" : `✗ ${testResult.message}`}
          </span>
        )}
      </div>
    </div>
  );
}

// ── MinIO storage settings ────────────────────────────────────────────────────

function StorageTab() {
  const { showToast } = useStore();
  const { data, isLoading } = useQuery({
    queryKey: ["storage-settings"],
    queryFn: () => api.settings.getStorage(),
  });

  const initial: Partial<MinioSettings> = data?.minio ?? {};
  const [form, setForm] = useState<Partial<MinioSettings>>(initial);
  const [showSecret, setShowSecret] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState<"save" | "test" | "push" | "restore" | null>(null);

  const [initialized, setInitialized] = useState(false);
  if (data && !initialized) { setForm(data.minio); setInitialized(true); }

  const set = <K extends keyof MinioSettings>(k: K, v: MinioSettings[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  async function save() {
    setBusy("save");
    try {
      await api.settings.updateStorage(form);
      showToast("✓ MinIO 設定已儲存");
      setTestResult(null);
    } catch (e) { showToast(`儲存失敗: ${String(e)}`); }
    finally { setBusy(null); }
  }

  async function test() {
    setBusy("test");
    try {
      const r = await api.settings.testStorage();
      setTestResult(r);
      showToast(r.ok ? "✓ 連線成功" : `連線失敗: ${r.message}`);
    } catch (e) { showToast(`測試失敗: ${String(e)}`); }
    finally { setBusy(null); }
  }

  async function push() {
    setBusy("push");
    try {
      const r = await api.settings.pushToStorage();
      showToast(`✓ 已推送 ${r.pushed} 個檔案${r.errors > 0 ? `（${r.errors} 個失敗）` : ""}`);
    } catch (e) { showToast(`推送失敗: ${String(e)}`); }
    finally { setBusy(null); }
  }

  async function restore() {
    if (!confirm("⚠️ 將從 MinIO 還原所有資料，可能覆蓋本地檔案。確定繼續？")) return;
    setBusy("restore");
    try {
      const r = await api.settings.restoreFromStorage();
      showToast(`✓ 已還原 ${r.restored} 個檔案${r.errors > 0 ? `（${r.errors} 個失敗）` : ""}`);
    } catch (e) { showToast(`還原失敗: ${String(e)}`); }
    finally { setBusy(null); }
  }

  const inputStyle = {
    padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)",
    background: "var(--bg-3)", color: "var(--text-1)", fontSize: 13,
    fontFamily: "var(--font-mono)", outline: "none", width: "100%", boxSizing: "border-box" as const,
  };

  if (isLoading) return <div style={{ padding: 32, color: "var(--text-3)", textAlign: "center" }}>載入中…</div>;

  const isReady = data?.ready ?? false;

  return (
    <div>
      <SectionTitle>MinIO 連線</SectionTitle>

      {isReady && (
        <div style={{ marginBottom: 14, padding: "7px 12px", borderRadius: 6,
          background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.3)",
          fontSize: 12, color: "#4ade80", display: "flex", alignItems: "center", gap: 6 }}>
          ● 已連線　每次儲存動作都會自動備份至 MinIO
        </div>
      )}

      <div style={{ display: "flex", gap: 12 }}>
        <FieldRow label="Endpoint（主機名稱或 IP）">
          <input value={form.endpoint ?? ""} onChange={e => set("endpoint", e.target.value)}
            placeholder="minio.example.com" style={inputStyle} />
        </FieldRow>
        <div style={{ width: 110, flexShrink: 0 }}>
          <FieldRow label="Port">
            <input value={form.port ?? 9000} onChange={e => set("port", Number(e.target.value))}
              type="number" min={1} max={65535} style={inputStyle} />
          </FieldRow>
        </div>
      </div>

      <FieldRow label="SSL">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div onClick={() => set("useSSL", !form.useSSL)}
            style={{ width: 34, height: 18, borderRadius: 9, flexShrink: 0,
              background: form.useSSL ? "var(--accent)" : "var(--bg-4)",
              border: `1px solid ${form.useSSL ? "var(--accent)" : "var(--border-light)"}`,
              position: "relative", cursor: "pointer", transition: "all 0.2s" }}>
            <div style={{ position: "absolute", width: 12, height: 12, borderRadius: "50%",
              background: form.useSSL ? "#fff" : "var(--text-3)", top: 2,
              left: form.useSSL ? 18 : 2, transition: "left 0.2s" }} />
          </div>
          <span style={{ fontSize: 12, color: "var(--text-2)" }}>{form.useSSL ? "啟用 HTTPS" : "使用 HTTP"}</span>
        </div>
      </FieldRow>

      <SectionTitle>認證</SectionTitle>

      <FieldRow label="Access Key">
        <input value={form.accessKey ?? ""} onChange={e => set("accessKey", e.target.value)}
          placeholder="minioadmin" style={inputStyle} />
      </FieldRow>

      <FieldRow label="Secret Key" hint="輸入新值即可覆蓋">
        <div style={{ display: "flex", gap: 6 }}>
          <input value={form.secretKey ?? ""} onChange={e => set("secretKey", e.target.value)}
            type={showSecret ? "text" : "password"}
            placeholder={initial.secretKey ? "••••（已設定）" : "minioadmin"}
            style={{ ...inputStyle, flex: 1, width: "auto" }} />
          <button onClick={() => setShowSecret(v => !v)}
            style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border)",
              background: "var(--bg-3)", color: "var(--text-3)", cursor: "pointer", fontSize: 11, flexShrink: 0 }}>
            {showSecret ? "隱藏" : "顯示"}
          </button>
        </div>
      </FieldRow>

      <SectionTitle>儲存路徑</SectionTitle>

      <FieldRow label="Bucket 名稱">
        <input value={form.bucket ?? ""} onChange={e => set("bucket", e.target.value)}
          placeholder="schema-studio" style={inputStyle} />
      </FieldRow>

      <FieldRow label="路徑前綴（Path Prefix）" hint="資料在 Bucket 內的目錄。留空則存在根目錄。例：schema-studio/data">
        <input value={form.pathPrefix ?? ""} onChange={e => set("pathPrefix", e.target.value)}
          placeholder="schema-studio/data" style={inputStyle} />
      </FieldRow>

      {/* Buttons */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <button onClick={() => void save()} disabled={busy !== null}
          style={{ padding: "8px 20px", borderRadius: 7, border: "none",
            background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 700,
            cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.7 : 1 }}>
          {busy === "save" ? "儲存中…" : "儲存設定"}
        </button>
        <button onClick={() => void test()} disabled={busy !== null}
          style={{ padding: "8px 20px", borderRadius: 7, border: "1px solid var(--border)",
            background: "var(--bg-3)", color: "var(--text-2)", fontSize: 13, fontWeight: 600,
            cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.7 : 1 }}>
          {busy === "test" ? "測試中…" : "測試連線"}
        </button>
        {testResult && (
          <span style={{ fontSize: 12, fontWeight: 600, color: testResult.ok ? "#4ade80" : "#f87171" }}>
            {testResult.ok ? `✓ ${testResult.message}` : `✗ ${testResult.message}`}
          </span>
        )}
      </div>

      <SectionTitle>手動同步</SectionTitle>
      <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 0, marginBottom: 12, lineHeight: 1.6 }}>
        儲存設定後，每次 save 動作會自動備份至 MinIO。也可手動執行全量推送或從 MinIO 還原。
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={() => void push()} disabled={busy !== null || !isReady}
          title={!isReady ? "請先設定並測試連線" : ""}
          style={{ padding: "7px 16px", borderRadius: 7, fontSize: 12, fontWeight: 600,
            border: "1px solid var(--border)", background: "var(--bg-3)",
            color: isReady ? "var(--text-1)" : "var(--text-3)",
            cursor: (busy || !isReady) ? "not-allowed" : "pointer", opacity: (busy || !isReady) ? 0.5 : 1 }}>
          {busy === "push" ? "推送中…" : "↑ 全量推送至 MinIO"}
        </button>
        <button onClick={() => void restore()} disabled={busy !== null || !isReady}
          title={!isReady ? "請先設定並測試連線" : ""}
          style={{ padding: "7px 16px", borderRadius: 7, fontSize: 12, fontWeight: 600,
            border: "1px solid rgba(248,113,113,0.4)", background: "transparent",
            color: isReady ? "#f87171" : "var(--text-3)",
            cursor: (busy || !isReady) ? "not-allowed" : "pointer", opacity: (busy || !isReady) ? 0.5 : 1 }}>
          {busy === "restore" ? "還原中…" : "↓ 從 MinIO 還原"}
        </button>
      </div>
    </div>
  );
}

// ── Settings panel (drawer) ───────────────────────────────────────────────────

const TABS = [
  { id: "llm" as const,     label: "LLM 設定",   icon: "✦" },
  { id: "storage" as const, label: "MinIO 儲存",  icon: "⬢" },
] as const;

type TabId = typeof TABS[number]["id"];

interface Props {
  onClose: () => void;
}

export default function SettingsPanel({ onClose }: Props) {
  const [tab, setTab] = useState<TabId>("llm");

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 400 }} />

      {/* Drawer */}
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(520px, 95vw)",
        background: "var(--bg-1)", borderLeft: "1px solid var(--border-light)",
        boxShadow: "-8px 0 40px rgba(0,0,0,0.5)", zIndex: 401,
        display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)",
          background: "var(--bg-2)", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", flex: 1 }}>⚙ 系統設定</span>
          <button onClick={onClose}
            style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid var(--border)",
              background: "transparent", color: "var(--text-3)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
            ✕
          </button>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--border)",
          background: "var(--bg-2)", flexShrink: 0, padding: "0 20px" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding: "10px 0", marginRight: 24, border: "none", background: "transparent",
                cursor: "pointer", fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
                color: tab === t.id ? "var(--text-1)" : "var(--text-3)",
                borderBottom: tab === t.id ? "2px solid var(--accent)" : "2px solid transparent",
                marginBottom: -1, transition: "all 0.15s" }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 24px 32px" }}>
          {tab === "llm" ? <LlmTab /> : <StorageTab />}
        </div>
      </div>
    </>
  );
}
