import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type DataHubSettings, type PushRecord } from "../api.js";
import { useStore } from "../store.js";

type Tab = "push" | "settings" | "log";

export default function DataHubPage() {
  const [tab, setTab] = useState<Tab>("push");

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 16, background: "var(--bg-2)", flexShrink: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--accent)" }}>⬡ DataHub 整合</span>
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>將 Schema metadata 推送至 DataHub 資料目錄</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
          {([["push", "推送 Schema"], ["settings", "連線設定"], ["log", "推送記錄"]] as [Tab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: "4px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 500, transition: "all 0.15s", fontFamily: "inherit",
                background: tab === t ? "var(--accent-dim)" : "transparent",
                color: tab === t ? "var(--accent)" : "var(--text-3)" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {tab === "push"     && <PushTab />}
        {tab === "settings" && <SettingsTab />}
        {tab === "log"      && <LogTab />}
      </div>
    </div>
  );
}

// ── Push Tab ──────────────────────────────────────────────────────────────────

type SchemaSelection = { tables: Set<number>; wideTables: Set<number> };

function PushTab() {
  const { showToast } = useStore();
  const qc = useQueryClient();
  const { data: schemas } = useQuery({ queryKey: ["schemas"], queryFn: () => api.schemas.list() });
  const { data: settings } = useQuery({ queryKey: ["datahub-settings"], queryFn: () => api.datahub.getSettings() });
  const { data: log } = useQuery({ queryKey: ["datahub-log"], queryFn: () => api.datahub.getPushLog() });
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [selections, setSelections] = useState<Map<number, SchemaSelection>>(new Map());
  const [pushing, setPushing] = useState(false);

  const isConfigured = !!(settings?.settings?.url && settings?.settings?.token);

  const lastPushBySchema = new Map<number, PushRecord>();
  for (const r of log ?? []) {
    if (!lastPushBySchema.has(r.schemaId)) lastPushBySchema.set(r.schemaId, r);
  }

  const totalSelected = [...selections.values()].reduce((n, s) => n + s.tables.size + s.wideTables.size, 0);

  function toggleExpand(id: number) {
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  const updateSel = useCallback((schemaId: number, updater: (s: SchemaSelection) => SchemaSelection) => {
    setSelections(prev => {
      const next = new Map(prev);
      const cur = next.get(schemaId) ?? { tables: new Set(), wideTables: new Set() };
      next.set(schemaId, updater({ tables: new Set(cur.tables), wideTables: new Set(cur.wideTables) }));
      return next;
    });
  }, []);

  async function doPush(schemaId: number, opts?: { tableIds?: number[]; wideTableIds?: number[] }) {
    const schemaName = schemas?.find(s => s.id === schemaId)?.name ?? String(schemaId);
    const result = await api.datahub.push(schemaId, opts);
    await qc.invalidateQueries({ queryKey: ["datahub-log"] });
    if (result.status === "ok") showToast(`✓ ${schemaName} 推送成功（${result.tablesOk}/${result.tablesTotal}）`);
    else showToast(`⚠ ${schemaName} 完成，${result.tablesFailed} 個失敗`);
  }

  async function pushSelected() {
    if (!totalSelected || pushing) return;
    setPushing(true);
    try {
      for (const [schemaId, sel] of selections) {
        if (!sel.tables.size && !sel.wideTables.size) continue;
        await doPush(schemaId, { tableIds: [...sel.tables], wideTableIds: [...sel.wideTables] });
      }
    } catch (e) {
      showToast(`✗ 推送失敗：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPushing(false);
    }
  }

  async function pushAllInSchema(schemaId: number) {
    if (pushing) return;
    setPushing(true);
    try { await doPush(schemaId); }
    catch (e) { showToast(`✗ 推送失敗：${e instanceof Error ? e.message : String(e)}`); }
    finally { setPushing(false); }
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Connection status banner */}
      <div style={{ padding: "10px 14px", borderRadius: 8, display: "flex", alignItems: "center", gap: 10, fontSize: 12,
        background: isConfigured ? "rgba(52,211,153,0.08)" : "rgba(251,191,36,0.08)",
        border: `1px solid ${isConfigured ? "var(--success)" : "var(--warning)"}` }}>
        <span style={{ fontSize: 16 }}>{isConfigured ? "✓" : "⚠"}</span>
        {isConfigured
          ? <span>已設定 DataHub URL：<code style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)" }}>{settings?.settings?.url}</code>　平台：<b>{settings?.settings?.platform ?? "mariadb"}</b>　環境：<b>{settings?.settings?.env ?? "DEV"}</b></span>
          : <span>尚未設定 DataHub 連線。請先至「<b>連線設定</b>」頁填寫 URL 與 Token。</span>
        }
      </div>

      {/* Stub notice */}
      <div style={{ padding: "10px 14px", borderRadius: 8, fontSize: 12, color: "var(--text-3)",
        background: "var(--bg-3)", border: "1px solid var(--border)" }}>
        <b style={{ color: "var(--text-2)" }}>⚙ 整合狀態：框架已就緒，等待 API 串接</b>
        <div style={{ marginTop: 4 }}>
          支援推送單張 Table、寬表，或整個 Schema。提供 DataHub REST API 端點後，更新{" "}
          <code style={{ fontFamily: "var(--font-mono)" }}>apps/api/src/services/datahub.ts</code> 即可啟用。
        </div>
      </div>

      {/* Schema list with accordion */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)" }}>
          Schema 清單（{schemas?.length ?? 0} 個）
          {totalSelected > 0 && <span style={{ marginLeft: 8, color: "var(--accent)" }}>· {totalSelected} 個已選取</span>}
        </span>
        {totalSelected > 0 && (
          <button className="btn btn-primary" onClick={pushSelected} disabled={pushing} style={{ fontSize: 12 }}>
            {pushing ? "推送中..." : `⬆ 推送已選取 (${totalSelected})`}
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {schemas?.map(s => (
          <SchemaAccordion
            key={s.id}
            schemaId={s.id}
            schemaName={s.name}
            domain={s.domain}
            lastPush={lastPushBySchema.get(s.id)}
            isExpanded={expanded.has(s.id)}
            selection={selections.get(s.id)}
            pushing={pushing}
            onToggleExpand={() => toggleExpand(s.id)}
            onUpdateSel={updateSel}
            onPushAll={() => pushAllInSchema(s.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Schema Accordion ──────────────────────────────────────────────────────────

function SchemaAccordion({
  schemaId, schemaName, domain, lastPush, isExpanded, selection, pushing,
  onToggleExpand, onUpdateSel, onPushAll,
}: {
  schemaId: number; schemaName: string; domain: string;
  lastPush: PushRecord | undefined; isExpanded: boolean;
  selection: SchemaSelection | undefined; pushing: boolean;
  onToggleExpand: () => void;
  onUpdateSel: (id: number, updater: (s: SchemaSelection) => SchemaSelection) => void;
  onPushAll: () => void;
}) {
  const { data: schema } = useQuery({
    queryKey: ["schema", schemaId],
    queryFn: () => api.schemas.get(schemaId),
    enabled: isExpanded,
  });
  const { data: wideTables } = useQuery({
    queryKey: ["wide-tables", schemaId],
    queryFn: () => api.wideTables.list(schemaId),
    enabled: isExpanded,
  });

  const sel = selection ?? { tables: new Set<number>(), wideTables: new Set<number>() };
  const tableCount = schema?.tables.length ?? 0;
  const wideCount = wideTables?.length ?? 0;
  const selCount = sel.tables.size + sel.wideTables.size;

  function toggleTable(id: number) {
    onUpdateSel(schemaId, s => {
      s.tables.has(id) ? s.tables.delete(id) : s.tables.add(id);
      return s;
    });
  }
  function toggleWide(id: number) {
    onUpdateSel(schemaId, s => {
      s.wideTables.has(id) ? s.wideTables.delete(id) : s.wideTables.add(id);
      return s;
    });
  }
  function selectAllTables(tables: { id: number }[]) {
    onUpdateSel(schemaId, s => {
      const allSelected = tables.every(t => s.tables.has(t.id));
      if (allSelected) tables.forEach(t => s.tables.delete(t.id));
      else tables.forEach(t => s.tables.add(t.id));
      return s;
    });
  }
  function selectAllWide(wts: { id: number }[]) {
    onUpdateSel(schemaId, s => {
      const allSelected = wts.every(w => s.wideTables.has(w.id));
      if (allSelected) wts.forEach(w => s.wideTables.delete(w.id));
      else wts.forEach(w => s.wideTables.add(w.id));
      return s;
    });
  }

  return (
    <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: "var(--accent)" }}>{schemaName}</span>
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>{domain}</span>
            {selCount > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                background: "var(--accent-dim)", color: "var(--accent)" }}>{selCount} 已選</span>
            )}
          </div>
          {lastPush ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
              <StatusBadge status={lastPush.status} />
              <span style={{ color: "var(--text-3)" }}>{lastPush.tablesOk}/{lastPush.tablesTotal} 個物件</span>
              <span style={{ color: "var(--text-3)" }}>· {new Date(lastPush.pushedAt).toLocaleString("zh-TW")}</span>
            </div>
          ) : (
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>尚未推送過</span>
          )}
        </div>
        <button className="btn btn-ghost" style={{ fontSize: 11, padding: "3px 9px", flexShrink: 0 }}
          disabled={pushing} onClick={onPushAll} title="推送此 Schema 全部 Tables">
          ⬆ 全推
        </button>
        <button onClick={onToggleExpand}
          style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid var(--border-light)",
            background: isExpanded ? "var(--accent-dim)" : "var(--bg-3)",
            color: isExpanded ? "var(--accent)" : "var(--text-3)",
            cursor: "pointer", fontSize: 11, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {isExpanded ? "▲" : "▼"}
        </button>
      </div>

      {/* Expanded panel */}
      {isExpanded && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Tables section */}
          {!schema ? (
            <div style={{ fontSize: 12, color: "var(--text-3)" }}>載入中...</div>
          ) : (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Tables（{tableCount}）
                </span>
                {tableCount > 0 && (
                  <button onClick={() => selectAllTables(schema.tables)}
                    style={{ fontSize: 10, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                    {schema.tables.every(t => sel.tables.has(t.id)) ? "全部取消" : "全選"}
                  </button>
                )}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {schema.tables.map(t => (
                  <label key={t.id} style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer",
                    padding: "4px 9px", borderRadius: 6, fontSize: 12,
                    background: sel.tables.has(t.id) ? "var(--accent-dim)" : "var(--bg-3)",
                    border: `1px solid ${sel.tables.has(t.id) ? "var(--accent)" : "var(--border)"}`,
                    color: sel.tables.has(t.id) ? "var(--accent)" : "var(--text-2)" }}>
                    <input type="checkbox" checked={sel.tables.has(t.id)} onChange={() => toggleTable(t.id)}
                      style={{ width: 12, height: 12, accentColor: "var(--accent)", cursor: "pointer" }} />
                    <span style={{ fontFamily: "var(--font-mono)" }}>{t.name}</span>
                  </label>
                ))}
                {tableCount === 0 && <span style={{ fontSize: 11, color: "var(--text-3)" }}>此 Schema 無 Tables</span>}
              </div>
            </div>
          )}

          {/* Wide tables section */}
          {wideTables !== undefined && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  寬表（{wideCount}）
                </span>
                {wideCount > 0 && (
                  <button onClick={() => selectAllWide(wideTables)}
                    style={{ fontSize: 10, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                    {wideTables.every(w => sel.wideTables.has(w.id)) ? "全部取消" : "全選"}
                  </button>
                )}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {wideTables.map(w => (
                  <label key={w.id} style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer",
                    padding: "4px 9px", borderRadius: 6, fontSize: 12,
                    background: sel.wideTables.has(w.id) ? "rgba(139,92,246,0.12)" : "var(--bg-3)",
                    border: `1px solid ${sel.wideTables.has(w.id) ? "rgba(139,92,246,0.6)" : "var(--border)"}`,
                    color: sel.wideTables.has(w.id) ? "rgb(167,139,250)" : "var(--text-2)" }}>
                    <input type="checkbox" checked={sel.wideTables.has(w.id)} onChange={() => toggleWide(w.id)}
                      style={{ width: 12, height: 12, cursor: "pointer" }} />
                    <span style={{ fontFamily: "var(--font-mono)" }}>{w.name}</span>
                    <span style={{ fontSize: 10, opacity: 0.7 }}>寬</span>
                  </label>
                ))}
                {wideCount === 0 && <span style={{ fontSize: 11, color: "var(--text-3)" }}>無寬表</span>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Settings Tab ───────────────────────────────────────────────────────────────

function SettingsTab() {
  const { showToast } = useStore();
  const qc = useQueryClient();
  const { data: resp } = useQuery({ queryKey: ["datahub-settings"], queryFn: () => api.datahub.getSettings() });
  const [form, setForm] = useState<Partial<DataHubSettings>>({});
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const current = resp?.settings ?? {};
  const merged: Partial<DataHubSettings> = { ...current, ...form };

  async function save() {
    setSaving(true);
    try {
      await api.datahub.updateSettings(form);
      await qc.invalidateQueries({ queryKey: ["datahub-settings"] });
      setForm({});
      showToast("✓ DataHub 設定已儲存");
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.datahub.test();
      setTestResult(result);
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  }

  function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 11, color: "var(--text-2)", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</label>
        {children}
        {hint && <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>{hint}</div>}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
      <div style={{ maxWidth: 560, display: "flex", flexDirection: "column", gap: 0 }}>
        <Field label="DataHub URL" hint="例：http://datahub.internal:8080　（不含尾部 /）">
          <input className="form-input" placeholder="http://datahub.internal:8080"
            value={form.url ?? current.url ?? ""}
            onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
            style={{ fontFamily: "var(--font-mono)" }} />
        </Field>

        <Field label="Personal Access Token" hint="在 DataHub UI → Settings → Access Tokens 建立">
          <input className="form-input" type="password" placeholder="eyJhbGc..."
            value={form.token ?? ""}
            onChange={e => setForm(f => ({ ...f, token: e.target.value }))}
            style={{ fontFamily: "var(--font-mono)" }} />
          {current.token && !form.token && (
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>
              目前已儲存 Token（{current.token}），輸入新值以覆蓋
            </div>
          )}
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 11, color: "var(--text-2)", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>資料平台</label>
            <select className="form-input"
              value={form.platform ?? current.platform ?? "mariadb"}
              onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}>
              <option value="mariadb">MariaDB</option>
              <option value="mysql">MySQL</option>
              <option value="mssql">SQL Server</option>
              <option value="postgres">PostgreSQL</option>
              <option value="oracle">Oracle</option>
              <option value="clickhouse">ClickHouse</option>
            </select>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>對應 DataHub Platform URN</div>
          </div>
          <div>
            <label style={{ fontSize: 11, color: "var(--text-2)", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>環境</label>
            <select className="form-input"
              value={form.env ?? current.env ?? "DEV"}
              onChange={e => setForm(f => ({ ...f, env: e.target.value as DataHubSettings["env"] }))}>
              <option value="PROD">PROD</option>
              <option value="STAGING">STAGING</option>
              <option value="DEV">DEV</option>
              <option value="TEST">TEST</option>
            </select>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>DataHub Fabric Type</div>
          </div>
        </div>

        {/* URN preview */}
        {(merged.url || merged.platform) && (
          <div style={{ padding: "10px 12px", background: "var(--bg-3)", borderRadius: 6, marginBottom: 16, fontSize: 11 }}>
            <div style={{ color: "var(--text-3)", marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>URN 格式預覽</div>
            <code style={{ fontFamily: "var(--font-mono)", color: "var(--text-2)", wordBreak: "break-all" }}>
              urn:li:dataset:(urn:li:dataPlatform:{merged.platform ?? "mariadb"},{"<schema_name>.<table_name>"},{merged.env ?? "DEV"})
            </code>
          </div>
        )}

        {/* Test result */}
        {testResult && (
          <div style={{ padding: "10px 12px", borderRadius: 6, marginBottom: 16, fontSize: 12,
            background: testResult.ok ? "rgba(52,211,153,0.08)" : "rgba(248,113,113,0.08)",
            border: `1px solid ${testResult.ok ? "var(--success)" : "rgba(248,113,113,0.4)"}`,
            color: testResult.ok ? "var(--success)" : "var(--error, #f87171)" }}>
            {testResult.ok ? "✓ " : "✗ "}{testResult.message}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={test} disabled={testing}>
            {testing ? "測試中..." : "測試連線"}
          </button>
          <button className="btn btn-primary" onClick={save} disabled={saving || Object.keys(form).length === 0}>
            {saving ? "儲存中..." : "儲存設定"}
          </button>
        </div>

        {/* Implementation guide */}
        <div style={{ marginTop: 24, padding: "14px 16px", background: "var(--bg-3)", borderRadius: 8, border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>⚙ 開發人員：API 串接說明</div>
          <div style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.8 }}>
            取得 DataHub REST API 端點後，編輯以下函式：
          </div>
          <div style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-2)", lineHeight: 1.8 }}>
            <div><span style={{ color: "var(--accent)" }}>testConnection()</span>　→　GET {"{url}"}/config</div>
            <div><span style={{ color: "var(--accent)" }}>pushSchema()</span>　→　POST {"{url}"}/entities?action=ingest</div>
            <div style={{ marginTop: 4, color: "var(--text-3)" }}>檔案：apps/api/src/services/datahub.ts</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Log Tab ───────────────────────────────────────────────────────────────────

function LogTab() {
  const { data: log } = useQuery({ queryKey: ["datahub-log"], queryFn: () => api.datahub.getPushLog(), refetchInterval: 5000 });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>推送記錄</span>
        <span style={{ fontSize: 11, color: "var(--text-3)" }}>最近 {log?.length ?? 0} 筆（最多保留 100 筆）</span>
      </div>

      {(!log || log.length === 0) && (
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-3)" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>⬡</div>
          <div style={{ fontSize: 13 }}>尚無推送記錄</div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {log?.map(r => {
          const isExpanded = expanded.has(r.id);
          return (
            <div key={r.id} style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: r.errors.length > 0 ? "pointer" : "default" }}
                onClick={() => r.errors.length > 0 && toggleExpand(r.id)}>
                <StatusBadge status={r.status} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: "var(--accent)", flex: 1 }}>{r.schemaName}</span>
                <span style={{ fontSize: 11, color: "var(--text-3)" }}>{r.tablesOk}/{r.tablesTotal} 張表</span>
                {r.tablesFailed > 0 && <span style={{ fontSize: 11, color: "var(--error, #f87171)", fontWeight: 600 }}>{r.tablesFailed} 失敗</span>}
                <span style={{ fontSize: 11, color: "var(--text-3)" }}>{new Date(r.pushedAt).toLocaleString("zh-TW")}</span>
                {r.errors.length > 0 && (
                  <span style={{ fontSize: 11, color: "var(--text-3)", marginLeft: 4 }}>{isExpanded ? "▲" : "▼"}</span>
                )}
              </div>
              {isExpanded && r.errors.length > 0 && (
                <div style={{ padding: "0 14px 12px", borderTop: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, padding: "8px 0 4px" }}>錯誤訊息</div>
                  {r.errors.map((err: string, i: number) => (
                    <div key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--error, #f87171)", padding: "3px 0", lineHeight: 1.5 }}>{err}</div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Shared components ─────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: "ok" | "partial" | "failed" }) {
  const map = {
    ok:      { label: "成功", color: "var(--success)", bg: "rgba(52,211,153,0.1)" },
    partial: { label: "部分", color: "var(--warning)", bg: "rgba(251,191,36,0.1)" },
    failed:  { label: "失敗", color: "var(--error, #f87171)", bg: "rgba(248,113,113,0.1)" },
  };
  const { label, color, bg } = map[status];
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: bg, color, flexShrink: 0 }}>
      {label}
    </span>
  );
}
