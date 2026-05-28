import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "../store.js";
import { useT } from "../i18n.js";
import { api, type Field, type Table, type SchemaDetail, type NamingEntry, type MatchResult, type ImportCheckResult, type ViolationSummary, type SchemaVersion, type TableNamingCheck, type SchemaEnvironment } from "../api.js";

const DATA_TYPES = ["BIGINT", "INT", "SMALLINT", "TINYINT", "DECIMAL(15,4)", "DOUBLE", "FLOAT",
  "VARCHAR(32)", "VARCHAR(64)", "VARCHAR(128)", "VARCHAR(255)", "TEXT", "MEDIUMTEXT",
  "TINYINT(1)", "DATE", "DATETIME", "TIMESTAMP", "JSON"];

// ── Naming hint popup ────────────────────────────────────────────────────────
function NamingHint({ result, onAdopt, onIgnore }: {
  result: MatchResult; onAdopt: (name: string) => void; onIgnore: () => void;
}) {
  if (result.status === "exact") return null;
  const borderColor = result.status === "alias" ? "var(--warning)" : result.status === "fuzzy" ? "var(--info)" : "var(--text-3)";
  return (
    <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 50, minWidth: 260, marginTop: 4, padding: "6px 8px", borderRadius: 4, fontSize: 11, lineHeight: 1.5, background: "var(--bg-4)", border: "1px solid var(--border-light)", borderLeft: `2px solid ${borderColor}`, boxShadow: "0 4px 12px rgba(0,0,0,0.4)" }}>
      {result.status === "alias" && result.stdName && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-2)" }}>
            <span>⚠</span> 此為別名，建議改為 <span style={{ fontFamily: "var(--font-mono)", color: "var(--warning)", fontSize: 11 }}>{result.stdName}</span>
          </div>
          <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
            <button onClick={() => onAdopt(result.stdName!)} style={{ padding: "2px 8px", borderRadius: 3, border: "none", fontSize: 11, cursor: "pointer", fontWeight: 500, background: "var(--warning)", color: "#000" }}>採用建議</button>
            <button onClick={onIgnore} style={{ padding: "2px 8px", borderRadius: 3, border: "1px solid var(--border-light)", fontSize: 11, cursor: "pointer", background: "var(--bg-3)", color: "var(--text-2)" }}>忽略</button>
          </div>
        </>
      )}
      {result.status === "fuzzy" && result.stdName && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-2)" }}>
            <span>~</span> 可能是 <span style={{ fontFamily: "var(--font-mono)", color: "var(--info)", fontSize: 11 }}>{result.stdName}</span>？
          </div>
          <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
            <button onClick={() => onAdopt(result.stdName!)} style={{ padding: "2px 8px", borderRadius: 3, border: "none", fontSize: 11, cursor: "pointer", fontWeight: 500, background: "var(--info)", color: "#000" }}>採用建議</button>
            <button onClick={onIgnore} style={{ padding: "2px 8px", borderRadius: 3, border: "1px solid var(--border-light)", fontSize: 11, cursor: "pointer", background: "var(--bg-3)", color: "var(--text-2)" }}>忽略</button>
          </div>
        </>
      )}
      {result.status === "unknown" && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-3)" }}>
          <span>?</span> 未登錄命名字典
        </div>
      )}
    </div>
  );
}

// ── Single-field dict modal ──────────────────────────────────────────────────
function SingleFieldDictModal({ fieldName, comment, domain, onClose, onAdded }: {
  fieldName: string; comment: string | null; domain: string; onClose: () => void; onAdded: () => void;
}) {
  const { showToast } = useStore();
  const [concept, setConcept] = useState(fieldName.replace(/_/g, " "));
  const [description, setDescription] = useState(comment ?? "");
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!concept.trim()) return;
    setSaving(true);
    try {
      await api.naming.create({
        concept: concept.trim(),
        std_name: fieldName,
        aliases: [],
        domain,
        ...(description.trim() ? { description: description.trim() } : {}),
      });
      showToast(`✓ "${fieldName}" 已加入命名字典`);
      onAdded(); onClose();
    } catch (e) { showToast(`加入失敗: ${String(e)}`); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "var(--bg-2)", border: "1px solid var(--border-light)", borderRadius: 10, width: "min(420px, 92vw)", padding: 20, display: "flex", flexDirection: "column", gap: 14 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>加入命名字典</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 4 }}>欄位名稱</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--accent)", padding: "4px 8px", background: "var(--bg-3)", borderRadius: 4 }}>{fieldName}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 4 }}>概念名稱</div>
            <input value={concept} onChange={e => setConcept(e.target.value)} autoFocus
              style={{ width: "100%", boxSizing: "border-box", fontSize: 12, fontFamily: "var(--font-mono)", background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text-1)", padding: "5px 8px", borderRadius: 4, outline: "none" }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 4 }}>描述（可留空）</div>
            <input value={description} onChange={e => setDescription(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", fontSize: 12, background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text-1)", padding: "5px 8px", borderRadius: 4, outline: "none" }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleAdd} disabled={saving || !concept.trim()}>
            {saving ? "加入中…" : "加入字典"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Field row ────────────────────────────────────────────────────────────────
function FieldRow({ field, tableId, domain, namingEntries, onRefresh, showToast }: {
  field: Field;
  tableId: number;
  domain: string;
  namingEntries: import("../api.js").NamingEntry[];
  onRefresh: () => void;
  showToast: (m: string) => void;
}) {
  const [name, setName] = useState(field.name);
  const [showHint, setShowHint] = useState(false);
  const [hintResult, setHintResult] = useState<MatchResult | null>(null);
  const [showDictModal, setShowDictModal] = useState(false);
  const hintRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const { checkFieldName } = useNamingCheck(namingEntries);

  useEffect(() => { setName(field.name); }, [field.name]);

  function onFocus() {
    const r = checkFieldName(name);
    if (r.status !== "exact") { setHintResult(r); setShowHint(true); }
  }
  function onInput(v: string) {
    setName(v);
    const r = checkFieldName(v);
    setHintResult(r);
    setShowHint(r.status !== "exact");
  }
  async function onBlur() {
    setTimeout(() => setShowHint(false), 150);
    if (name !== field.name && name.trim()) {
      await api.fields.update(field.id, { name: name.trim() });
      onRefresh();
    }
  }
  async function adopt(stdName: string) {
    setName(stdName);
    setShowHint(false);
    await api.fields.update(field.id, { name: stdName });
    onRefresh();
    showToast(`✓ 已採用建議：${stdName}`);
  }
  async function updateType(data_type: string) {
    await api.fields.update(field.id, { data_type });
    onRefresh();
  }
  async function toggleNullable() {
    await api.fields.update(field.id, { nullable: !field.nullable });
    onRefresh();
  }
  async function deleteField() {
    if (!confirm(`刪除欄位 "${field.name}"？`)) return;
    await api.fields.delete(field.id);
    onRefresh();
  }

  const r = checkFieldName(name);
  const statusColor = r.status === "exact" ? "var(--success)" : r.status === "alias" ? "var(--warning)" : r.status === "fuzzy" ? "var(--info)" : "var(--text-3)";
  const statusIcon = r.status === "exact" ? "✓" : r.status === "alias" ? "⚠" : r.status === "fuzzy" ? "~" : "?";

  return (
    <>
    <tr style={{ borderBottom: "1px solid var(--border)" }}
      onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = "var(--bg-2)"}
      onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = "transparent"}>
      <td style={{ padding: "8px 10px", verticalAlign: "middle", position: "relative" }}>
        {field.isPrimaryKey && <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 6px", borderRadius: 10, fontSize: 10, fontWeight: 600, background: "var(--accent-dim)", color: "var(--accent)", marginRight: 4 }}>🔑 PK</span>}
        <div style={{ position: "relative", display: "inline-block" }}>
          <input value={name}
            onFocus={onFocus}
            onBlur={onBlur}
            onChange={e => onInput(e.target.value)}
            style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-1)", background: "transparent", border: "1px solid transparent", padding: "3px 6px", borderRadius: 4, width: 160, outline: "none", transition: "all 0.15s" }}
            onMouseEnter={e => (e.target as HTMLInputElement).style.borderColor = "var(--border-light)"}
            onMouseLeave={e => { if (document.activeElement !== e.target) (e.target as HTMLInputElement).style.borderColor = "transparent"; }}
            onFocusCapture={e => (e.target as HTMLInputElement).style.borderColor = "var(--accent)"}
            onBlurCapture={e => (e.target as HTMLInputElement).style.borderColor = "transparent"}
          />
          {showHint && hintResult && hintResult.status !== "exact" && (
            <div ref={hintRef}>
              <NamingHint result={hintResult} onAdopt={adopt} onIgnore={() => setShowHint(false)} />
            </div>
          )}
        </div>
      </td>
      <td style={{ padding: "8px 10px", verticalAlign: "middle" }}>
        <select value={field.dataType} onChange={e => updateType(e.target.value)}
          style={{ background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text-1)", padding: "3px 6px", borderRadius: 4, fontFamily: "var(--font-mono)", fontSize: 11, outline: "none" }}>
          {DATA_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
      </td>
      <td style={{ padding: "8px 10px", verticalAlign: "middle" }}>
        <div onClick={toggleNullable} style={{ width: 32, height: 16, background: field.nullable ? "var(--accent)" : "var(--bg-4)", borderRadius: 8, position: "relative", cursor: "pointer", border: `1px solid ${field.nullable ? "var(--accent)" : "var(--border-light)"}`, transition: "all 0.2s" }}>
          <div style={{ position: "absolute", width: 10, height: 10, background: field.nullable ? "#fff" : "var(--text-3)", borderRadius: "50%", top: 2, left: field.nullable ? 18 : 2, transition: "all 0.2s" }} />
        </div>
      </td>
      <td style={{ padding: "8px 10px", verticalAlign: "middle", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>{field.defaultValue || "—"}</td>
      <td style={{ padding: "8px 10px", verticalAlign: "middle" }}>
        <span onClick={() => { setHintResult(r); setShowHint(!showHint); }} style={{ color: statusColor, fontSize: 14, cursor: "pointer" }} title={r.status}>{statusIcon}</span>
      </td>
      <td style={{ padding: "8px 10px", verticalAlign: "middle", color: "var(--text-2)", fontSize: 12 }}>{field.comment || ""}</td>
      <td style={{ padding: "8px 10px", verticalAlign: "middle" }}>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {r.status === "unknown" && (
            <button onClick={() => setShowDictModal(true)}
              title="加入命名字典"
              style={{ background: "transparent", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 13, opacity: 0, lineHeight: 1 }}
              className="del-btn">＋</button>
          )}
          <button onClick={deleteField} style={{ background: "transparent", border: "none", color: "var(--text-3)", cursor: "pointer", fontSize: 14, opacity: 0 }} className="del-btn">✕</button>
        </div>
      </td>
    </tr>
    {showDictModal && createPortal(
      <SingleFieldDictModal
        fieldName={name}
        comment={field.comment}
        domain={domain}
        onClose={() => setShowDictModal(false)}
        onAdded={() => void qc.invalidateQueries({ queryKey: ["naming"] })}
      />,
      document.body
    )}
    </>
  );
}

// ── Add field row ────────────────────────────────────────────────────────────
function AddFieldRow({ tableId, onRefresh }: { tableId: number; onRefresh: () => void }) {
  const [hover, setHover] = useState(false);
  async function add() {
    await api.fields.create(tableId, { name: "new_field", data_type: "VARCHAR(64)", nullable: true });
    onRefresh();
  }
  return (
    <tr>
      <td colSpan={7} style={{ padding: 10 }}>
        <button onClick={add}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          style={{ background: hover ? "var(--accent-dim)" : "transparent", border: `1px dashed ${hover ? "var(--accent)" : "var(--border-light)"}`, color: hover ? "var(--accent)" : "var(--text-3)", padding: "5px 12px", borderRadius: "var(--radius)", cursor: "pointer", fontSize: 12, transition: "all 0.15s", width: "100%", textAlign: "left" }}>
          ＋ 新增欄位
        </button>
      </td>
    </tr>
  );
}

// ── Naming check (module-level so SchemaEditorPage can also use it) ───────────
const SKIP_FIELD_NAMES = new Set(["id", "created_at", "updated_at", "deleted_at"]);

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    dp[i]![j] = a[i-1] === b[j-1] ? dp[i-1]![j-1]! : 1 + Math.min(dp[i-1]![j]!, dp[i]![j-1]!, dp[i-1]![j-1]!);
  return dp[m]![n]!;
}

function runNamingCheck(name: string, entries: NamingEntry[]): MatchResult {
  const lower = name.toLowerCase();
  for (const e of entries) {
    if (e.stdName === lower) return { status: "exact", stdName: e.stdName, matchedAlias: null, distance: 0 };
  }
  for (const e of entries) {
    const hit = e.aliases.map(a => a.toLowerCase()).find(a => a === lower);
    if (hit) return { status: "alias", stdName: e.stdName, matchedAlias: hit, distance: 0 };
  }
  let best: { entry: NamingEntry; distance: number } | null = null;
  for (const e of entries) {
    for (const c of [e.stdName, ...e.aliases]) {
      const d = levenshtein(lower, c.toLowerCase());
      if (d <= 3 && (!best || d < best.distance)) best = { entry: e, distance: d };
    }
  }
  if (best) return { status: "fuzzy", stdName: best.entry.stdName, matchedAlias: null, distance: best.distance };
  return { status: "unknown", stdName: null, matchedAlias: null, distance: null };
}

function tableIssueCount(fields: Field[], entries: NamingEntry[]): number {
  return fields.filter(f => !SKIP_FIELD_NAMES.has(f.name) && runNamingCheck(f.name, entries).status !== "exact").length;
}

function useNamingCheck(entries: NamingEntry[]) {
  return { checkFieldName: (name: string) => runNamingCheck(name, entries) };
}

// ── Dict suggest modal ────────────────────────────────────────────────────────

interface DictCandidate { fieldName: string; tableName: string; concept: string; description: string; checked: boolean; }

function DictSuggestModal({ candidates: initial, domain, onClose, onAdded }: {
  candidates: DictCandidate[]; domain: string; onClose: () => void; onAdded: () => void;
}) {
  const { showToast } = useStore();
  const [rows, setRows] = useState<DictCandidate[]>(initial);
  const [saving, setSaving] = useState(false);

  function toggle(i: number) { setRows(p => p.map((r, idx) => idx === i ? { ...r, checked: !r.checked } : r)); }
  function setField<K extends keyof DictCandidate>(i: number, key: K, v: DictCandidate[K]) {
    setRows(p => p.map((r, idx) => idx === i ? { ...r, [key]: v } : r));
  }
  function toggleAll() { const all = rows.every(r => r.checked); setRows(p => p.map(r => ({ ...r, checked: !all }))); }

  async function handleAdd() {
    const toAdd = rows.filter(r => r.checked);
    if (!toAdd.length) { onClose(); return; }
    setSaving(true);
    try {
      for (const row of toAdd) {
        await api.naming.create({
          concept: row.concept,
          std_name: row.fieldName,
          aliases: [],
          domain,
          ...(row.description.trim() ? { description: row.description.trim() } : {}),
        });
      }
      showToast(`✓ 已加入 ${toAdd.length} 筆命名字典`);
      onAdded(); onClose();
    } catch (e) { showToast(`加入失敗: ${String(e)}`); }
    finally { setSaving(false); }
  }

  const inputStyle = (active: boolean): React.CSSProperties => ({
    fontSize: 12,
    background: active ? "var(--bg-3)" : "transparent",
    border: active ? "1px solid var(--border)" : "1px solid transparent",
    color: active ? "var(--text-1)" : "var(--text-3)",
    padding: "3px 8px", borderRadius: 4, outline: "none", width: "100%",
  });

  const checkedCount = rows.filter(r => r.checked).length;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "var(--bg-2)", border: "1px solid var(--border-light)", borderRadius: 12, width: "min(780px, 96vw)", maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>加入命名字典</div>
          <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>版本已儲存。以下欄位名稱未登錄字典，填入概念名稱與描述後批次加入。</div>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: 36 }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "20%" }} />
              <col style={{ width: "38%" }} />
              <col style={{ width: "20%" }} />
            </colgroup>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "8px 12px", textAlign: "center" }}>
                  <input type="checkbox" checked={rows.every(r => r.checked)} onChange={toggleAll} style={{ cursor: "pointer", accentColor: "var(--accent)" }} />
                </th>
                {["欄位名稱", "概念名稱", "描述（中文說明）", "來源 Table"].map(h => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={`${row.tableName}.${row.fieldName}`}
                  style={{ borderBottom: "1px solid var(--border)", background: row.checked ? "var(--accent-dim)" : "transparent", cursor: "pointer" }}
                  onClick={() => toggle(i)}>
                  <td style={{ padding: "8px 12px", textAlign: "center" }}>
                    <input type="checkbox" checked={row.checked} onChange={() => toggle(i)} onClick={e => e.stopPropagation()} style={{ cursor: "pointer", accentColor: "var(--accent)" }} />
                  </td>
                  <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--accent)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.fieldName}</td>
                  <td style={{ padding: "6px 8px" }} onClick={e => e.stopPropagation()}>
                    <input value={row.concept} onChange={e => setField(i, "concept", e.target.value)} disabled={!row.checked}
                      style={{ ...inputStyle(row.checked), fontFamily: "var(--font-mono)" }} />
                  </td>
                  <td style={{ padding: "6px 8px" }} onClick={e => e.stopPropagation()}>
                    <input value={row.description} onChange={e => setField(i, "description", e.target.value)} disabled={!row.checked}
                      placeholder={row.checked ? "可留空" : ""}
                      style={inputStyle(row.checked)} />
                  </td>
                  <td style={{ padding: "8px 12px", fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.tableName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>已選 {checkedCount} / {rows.length} 筆</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose}>略過</button>
            <button className="btn btn-primary" onClick={handleAdd} disabled={saving || checkedCount === 0}>
              {saving ? "加入中…" : `加入字典 (${checkedCount})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Save Version Modal ────────────────────────────────────────────────────────
function SaveVersionModal({ schemaId, onClose, onSaved }: {
  schemaId: number;
  onClose: () => void;
  onSaved: (v: SchemaVersion) => void;
}) {
  const qc = useQueryClient();
  const { showToast } = useStore();
  const [message, setMessage] = useState(() => `版本快照 ${new Date().toLocaleString("zh-TW")}`);
  const [saving, setSaving] = useState(false);
  const [namingResult, setNamingResult] = useState<TableNamingCheck[] | null>(null);
  const [namingLoading, setNamingLoading] = useState(true);

  const { data: versions } = useQuery({
    queryKey: ["versions", schemaId],
    queryFn: () => api.schemas.versions.list(schemaId),
  });
  const nextVer = (versions?.[0]?.versionNo ?? 0) + 1;

  useEffect(() => {
    api.schemas.namingCheck(schemaId)
      .then(r => setNamingResult(r))
      .catch(() => setNamingResult([]))
      .finally(() => setNamingLoading(false));
  }, [schemaId]);

  const totalFields = namingResult?.reduce((n, t) => n + t.fields.length, 0) ?? 0;
  const exact = namingResult?.reduce((n, t) => n + t.fields.filter(f => f.result.status === "exact").length, 0) ?? 0;
  const warnCount = namingResult?.reduce((n, t) => n + t.fields.filter(f => f.result.status === "alias" || f.result.status === "fuzzy").length, 0) ?? 0;
  const unknownCount = namingResult?.reduce((n, t) => n + t.fields.filter(f => f.result.status === "unknown").length, 0) ?? 0;
  const score = totalFields > 0 ? Math.round((exact / totalFields) * 100) : 100;
  const scoreColor = score >= 80 ? "var(--success)" : score >= 50 ? "var(--warning)" : "var(--error, #f87171)";

  async function handleSave() {
    setSaving(true);
    try {
      const v = await api.schemas.versions.save(schemaId, message.trim() || undefined);
      // localStorage backup
      const lsKey = `ss-versions-${schemaId}`;
      const prev: { id: number; versionNo: number; message: string | null; createdAt: string }[] =
        JSON.parse(localStorage.getItem(lsKey) ?? "[]");
      localStorage.setItem(lsKey, JSON.stringify([...prev.filter(e => e.id !== v.id),
        { id: v.id, versionNo: v.versionNo, message: v.message, createdAt: v.createdAt }].slice(-100)));
      await qc.invalidateQueries({ queryKey: ["versions", schemaId] });
      showToast(`✓ v${v.versionNo} 已儲存`);
      onSaved(v);
      onClose();
    } catch (e) {
      showToast(`儲存失敗: ${String(e)}`);
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "var(--bg-2)", border: "1px solid var(--border-light)", borderRadius: 12, width: "min(440px, 92vw)", padding: 24, display: "flex", flexDirection: "column", gap: 16 }} onClick={e => e.stopPropagation()}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>儲存版本</div>
          <div style={{ fontSize: 12, color: "var(--text-3)" }}>
            即將建立 <span style={{ fontFamily: "var(--font-mono)", color: "var(--accent)", fontWeight: 600 }}>v{nextVer}</span> 版本快照
          </div>
        </div>

        <div style={{ background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-3)", marginBottom: 10 }}>命名規範檢查</div>
          {namingLoading ? (
            <div style={{ fontSize: 12, color: "var(--text-3)" }}>檢查中…</div>
          ) : (
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 700, color: scoreColor, lineHeight: 1 }}>{score}%</div>
              <div style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 3 }}>
                <div style={{ color: "var(--success)" }}>✓ {exact} 完全符合</div>
                {warnCount > 0 && <div style={{ color: "var(--warning)" }}>⚠ {warnCount} 別名 / 相似</div>}
                {unknownCount > 0 && <div style={{ color: "var(--text-3)" }}>? {unknownCount} 未登錄命名字典</div>}
              </div>
            </div>
          )}
        </div>

        <div>
          <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>版本備註</label>
          <input
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="描述此版本的變更..."
            style={{ width: "100%", padding: "8px 10px", background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-1)", fontSize: 13, outline: "none", boxSizing: "border-box" }}
            onFocus={e => (e.target.style.borderColor = "var(--accent)")}
            onBlur={e => (e.target.style.borderColor = "var(--border)")}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "儲存中…" : `✓ 儲存 v${nextVer}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Field editor panel ────────────────────────────────────────────────────────
function FieldEditorPanel({ schema, table }: { schema: SchemaDetail; table: Table }) {
  const qc = useQueryClient();
  const { showToast } = useStore();
  const t = useT();
  const { data: naming } = useQuery({ queryKey: ["naming"], queryFn: () => api.naming.list() });
  const namingEntries: NamingEntry[] = naming ?? [];
  const [dictCandidates, setDictCandidates] = useState<DictCandidate[] | null>(null);
  const { checkFieldName } = useNamingCheck(namingEntries);

  const schemaId = schema.id;
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [fieldViewMode, setFieldViewMode] = useState<"list" | "classified">("list");
  const [dialectStatus, setDialectStatus] = useState<"idle" | "loading" | "ok" | "warn" | "error">("idle");
  const [dialectCheckResult, setDialectCheckResult] = useState<ImportCheckResult | null>(null);
  const [showDialectPopover, setShowDialectPopover] = useState(false);
  const dialectRevRef = useRef(0);

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["schema", schemaId] });
  }

  function findUnknownFields(): DictCandidate[] {
    const seen = new Set<string>();
    const candidates: DictCandidate[] = [];
    for (const t of schema.tables) {
      for (const f of t.fields) {
        if (SKIP_FIELD_NAMES.has(f.name) || seen.has(f.name)) continue;
        if (checkFieldName(f.name).status === "unknown") {
          seen.add(f.name);
          candidates.push({ fieldName: f.name, tableName: t.name, concept: f.name.replace(/_/g, " "), description: f.comment ?? "", checked: true });
        }
      }
    }
    return candidates;
  }

  function openSaveModal() {
    const unknowns = findUnknownFields();
    if (unknowns.length > 0) {
      setDictCandidates(unknowns); // Dict modal → onClose/onAdded both open save modal
    } else {
      setShowSaveModal(true);
    }
  }

  const [ddlDialect, setDdlDialect] = useState<"mariadb" | "oracle" | "clickhouse">("mariadb");

  useEffect(() => {
    if (schema.tables.length === 0) { setDialectStatus("idle"); return; }
    const rev = ++dialectRevRef.current;
    setDialectStatus("loading");
    setDialectCheckResult(null);
    // Always check naming/structure using MariaDB DDL (dialect-agnostic);
    // for non-MariaDB dialects, also verify the target DDL generates without error.
    const dialectOkP: Promise<boolean> = ddlDialect !== "mariadb"
      ? api.schemas.ddl(schemaId, ddlDialect).then(() => true).catch(() => false)
      : Promise.resolve(true);
    api.schemas.ddl(schemaId, "mariadb")
      .then(ddl => Promise.all([api.importDdl.check(schemaId, ddl), dialectOkP]))
      .then(([checkRes, dialectOk]) => {
        if (dialectRevRef.current !== rev) return;
        const c = (checkRes as { check: ImportCheckResult }).check;
        setDialectCheckResult(c);
        setDialectStatus(!dialectOk || c.summary.errors > 0 ? "error" : c.summary.warnings > 0 ? "warn" : "ok");
      })
      .catch(() => { if (dialectRevRef.current === rev) setDialectStatus("error"); });
  }, [ddlDialect, schemaId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function exportDDL() {
    const ddl = await api.schemas.ddl(schemaId, ddlDialect);
    const blob = new Blob([ddl], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const schemaName = schema.name.replace(/\s+/g, "_");
    const a = document.createElement("a"); a.href = url; a.download = `${schemaName}_${ddlDialect}.sql`; a.click();
    URL.revokeObjectURL(url);
    showToast(`✓ DDL 已匯出（${ddlDialect}）`);
  }

  const issueCount = tableIssueCount(table.fields, namingEntries);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 600, color: "var(--text-1)" }}>{table.name}</span>
        {table.comment && <span style={{ fontSize: 12, color: "var(--text-2)" }}>{table.comment}</span>}
        {issueCount > 0 && (
          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 10px", borderRadius: 10,
            background: "rgba(251,191,36,0.15)", color: "var(--warning)", border: "1px solid rgba(251,191,36,0.35)" }}>
            ⚠ {issueCount} 命名問題
          </span>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <select
            value={ddlDialect}
            onChange={e => setDdlDialect(e.target.value as typeof ddlDialect)}
            style={{ height: 28, fontSize: 12, padding: "0 6px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg-3)", color: "var(--text-1)", cursor: "pointer" }}
          >
            <option value="mariadb">MariaDB</option>
            <option value="oracle">Oracle</option>
            <option value="clickhouse">ClickHouse</option>
          </select>
          {dialectStatus !== "idle" && (() => {
            const hasDetail = (dialectCheckResult?.violations.length ?? 0) > 0 || (dialectCheckResult?.parseErrors.length ?? 0) > 0;
            const cfg = {
              loading: { bg: "var(--bg-4)",              color: "var(--text-3)",         border: "var(--border)",                  label: "檢查中…" },
              ok:      { bg: "rgba(74,222,128,0.12)",    color: "var(--success)",         border: "rgba(74,222,128,0.3)",            label: "✓ 語法正常" },
              warn:    { bg: "rgba(251,191,36,0.12)",    color: "var(--warning)",         border: "rgba(251,191,36,0.3)",            label: `⚠ ${dialectCheckResult?.summary.warnings ?? 0} 項命名警告` },
              error:   { bg: "rgba(248,113,113,0.12)",   color: "var(--error,#f87171)",   border: "rgba(248,113,113,0.3)",           label: `✕ ${dialectCheckResult?.summary.errors ?? 0} 項錯誤` },
            }[dialectStatus];
            return (
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => hasDetail && setShowDialectPopover(v => !v)}
                  style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 10, whiteSpace: "nowrap",
                    background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
                    cursor: hasDetail ? "pointer" : "default", outline: "none",
                    textDecoration: hasDetail && showDialectPopover ? "underline" : "none" }}>
                  {cfg.label}{hasDetail ? " ▾" : ""}
                </button>
                {showDialectPopover && dialectCheckResult && (
                  <>
                    {/* Backdrop */}
                    <div style={{ position: "fixed", inset: 0, zIndex: 98 }} onClick={() => setShowDialectPopover(false)} />
                    {/* Popover */}
                    <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 99,
                      width: "min(400px, 92vw)", background: "var(--bg-2)", border: "1px solid var(--border-light)",
                      borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.45)", overflow: "hidden" }}>
                      {/* Header */}
                      <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)" }}>
                          {ddlDialect.toUpperCase()} 語法 &amp; 命名檢查
                        </span>
                        <div style={{ display: "flex", gap: 8, fontSize: 11 }}>
                          {dialectCheckResult.summary.errors   > 0 && <span style={{ color: "var(--error,#f87171)" }}>✕ {dialectCheckResult.summary.errors} 錯誤</span>}
                          {dialectCheckResult.summary.warnings > 0 && <span style={{ color: "var(--warning)" }}>⚠ {dialectCheckResult.summary.warnings} 警告</span>}
                          {dialectCheckResult.summary.infos    > 0 && <span style={{ color: "var(--info,#60a5fa)" }}>ℹ {dialectCheckResult.summary.infos} 提示</span>}
                        </div>
                      </div>
                      {/* Violation list */}
                      <div style={{ maxHeight: 320, overflowY: "auto" }}>
                        {dialectCheckResult.parseErrors.map((e, i) => (
                          <div key={`pe-${i}`} style={{ display: "flex", gap: 8, padding: "8px 14px", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
                            <span style={{ color: "var(--error,#f87171)", fontWeight: 700, flexShrink: 0 }}>✕</span>
                            <span style={{ color: "var(--text-2)" }}>解析錯誤：{e}</span>
                          </div>
                        ))}
                        {dialectCheckResult.violations.map((v, i) => {
                          const [icon, color] = v.severity === "error"
                            ? ["✕", "var(--error,#f87171)"]
                            : v.severity === "warning"
                            ? ["⚠", "var(--warning)"]
                            : ["ℹ", "var(--info,#60a5fa)"];
                          const groupLabel: Record<string, string> = { naming: "命名", semantic: "語意", structure: "結構" };
                          return (
                            <div key={i} style={{ display: "flex", gap: 10, padding: "8px 14px", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
                              <span style={{ color, fontWeight: 700, flexShrink: 0, lineHeight: 1.5 }}>{icon}</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 2 }}>
                                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)" }}>{v.tableName}{v.fieldName ? `.${v.fieldName}` : ""}</span>
                                  <span style={{ fontSize: 10, padding: "0px 5px", borderRadius: 4, background: "var(--bg-4)", color: "var(--text-3)", border: "1px solid var(--border)" }}>{groupLabel[v.group] ?? v.group}</span>
                                </div>
                                <div style={{ color: "var(--text-2)", lineHeight: 1.4 }}>{v.message}</div>
                              </div>
                            </div>
                          );
                        })}
                        {dialectCheckResult.violations.length === 0 && dialectCheckResult.parseErrors.length === 0 && (
                          <div style={{ padding: "16px 14px", color: "var(--success)", fontSize: 12, textAlign: "center" }}>✓ 無問題</div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })()}
          <div style={{ display: "flex", borderRadius: 4, overflow: "hidden", border: "1px solid var(--border)" }}>
            {(["list", "classified"] as const).map(mode => (
              <button key={mode} onClick={() => setFieldViewMode(mode)}
                style={{ padding: "3px 9px", border: "none", cursor: "pointer", fontSize: 10, fontWeight: 600, letterSpacing: "0.3px", transition: "all 0.15s",
                  background: fieldViewMode === mode ? "var(--accent)" : "var(--bg-3)",
                  color: fieldViewMode === mode ? "#fff" : "var(--text-3)" }}>
                {mode === "list" ? "列表" : "分類"}
              </button>
            ))}
          </div>
          <button className="btn btn-ghost" onClick={exportDDL}>↓ 匯出 DDL</button>
          <button className="btn btn-primary" onClick={openSaveModal}>儲存版本</button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {fieldViewMode === "list" ? (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {[t("col.field_name"), t("col.type"), t("col.nullable"), t("col.default"), t("col.naming"), t("col.comment"), ""].map((h, i) => (
                  <th key={i} style={{ textAlign: "left", padding: "6px 10px", fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: "1px solid var(--border)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.fields.sort((a, b) => a.position - b.position).map(f => (
                <FieldRow key={f.id} field={f} tableId={table.id} domain={schema.domain} namingEntries={namingEntries} onRefresh={refresh} showToast={showToast} />
              ))}
              <AddFieldRow tableId={table.id} onRefresh={refresh} />
            </tbody>
          </table>
        ) : (
          <ClassifiedFieldView table={table} schema={schema} namingEntries={namingEntries} onRefresh={refresh} />
        )}
      </div>
      <style>{`.del-btn { opacity: 0 !important; } tr:hover .del-btn { opacity: 1 !important; }`}</style>

      {dictCandidates && (
        <DictSuggestModal
          candidates={dictCandidates}
          domain={schema.domain}
          onClose={() => { setDictCandidates(null); setShowSaveModal(true); }}
          onAdded={() => {
            void qc.invalidateQueries({ queryKey: ["naming"] });
            setDictCandidates(null);
            setShowSaveModal(true);
          }}
        />
      )}
      {showSaveModal && (
        <SaveVersionModal
          schemaId={schemaId}
          onClose={() => setShowSaveModal(false)}
          onSaved={() => setShowSaveModal(false)}
        />
      )}
    </div>
  );
}

// ── Classified Field View ─────────────────────────────────────────────────────
type FieldCategory = { key: string; label: string; icon: string; color: string; bg: string };
const FIELD_CATEGORIES: FieldCategory[] = [
  { key: "pk",        label: "主鍵",   icon: "🔑", color: "var(--warning)",         bg: "rgba(251,191,36,0.08)" },
  { key: "unique",    label: "唯一鍵", icon: "🔒", color: "var(--info)",             bg: "rgba(96,165,250,0.08)" },
  { key: "timestamp", label: "時間戳", icon: "🕐", color: "var(--text-2)",           bg: "rgba(139,92,246,0.08)" },
  { key: "boolean",   label: "布林值", icon: "☑",  color: "var(--success)",          bg: "rgba(74,222,128,0.08)" },
  { key: "numeric",   label: "數值",   icon: "🔢", color: "#5EEAD4",                 bg: "rgba(94,234,212,0.08)" },
  { key: "text",      label: "文字",   icon: "📝", color: "var(--text-1)",           bg: "rgba(255,255,255,0.04)" },
  { key: "other",     label: "其他",   icon: "📦", color: "var(--text-3)",           bg: "rgba(255,255,255,0.02)" },
];

function classifyField(f: Field): string {
  if (f.isPrimaryKey) return "pk";
  if (f.isUnique) return "unique";
  const dt = f.dataType.toUpperCase();
  const nm = f.name.toLowerCase();
  if (dt.includes("DATETIME") || dt.includes("TIMESTAMP") || dt.includes("DATE") || nm.endsWith("_at") || nm.endsWith("_date") || nm.endsWith("_time")) return "timestamp";
  if (dt === "TINYINT(1)" || nm.startsWith("is_") || nm.startsWith("has_") || nm.startsWith("on_")) return "boolean";
  if (dt.includes("INT") || dt.includes("DECIMAL") || dt.includes("DOUBLE") || dt.includes("FLOAT") || dt.includes("NUMERIC")) return "numeric";
  if (dt.includes("VARCHAR") || dt.includes("TEXT") || dt.includes("CHAR")) return "text";
  return "other";
}

function ClassifiedFieldView({ table, schema, namingEntries, onRefresh }: { table: Table; schema: SchemaDetail; namingEntries: NamingEntry[]; onRefresh: () => void }) {
  const { showToast } = useStore();
  const grouped = new Map<string, Field[]>();
  for (const cat of FIELD_CATEGORIES) grouped.set(cat.key, []);
  for (const f of table.fields.slice().sort((a, b) => a.position - b.position)) {
    grouped.get(classifyField(f))!.push(f);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {FIELD_CATEGORIES.map(cat => {
        const fields = grouped.get(cat.key) ?? [];
        if (fields.length === 0) return null;
        return (
          <div key={cat.key} style={{ borderRadius: 8, border: "1px solid var(--border)", overflow: "hidden" }}>
            <div style={{ padding: "7px 12px", background: cat.bg, borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13 }}>{cat.icon}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: cat.color, textTransform: "uppercase", letterSpacing: "0.5px" }}>{cat.label}</span>
              <span style={{ fontSize: 10, color: "var(--text-3)", background: "var(--bg-4)", padding: "0 6px", borderRadius: 8, border: "1px solid var(--border)" }}>{fields.length}</span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {fields.map(f => (
                  <FieldRow key={f.id} field={f} tableId={table.id} domain={schema.domain} namingEntries={namingEntries} onRefresh={onRefresh} showToast={showToast} />
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

// ── DDL Import Modal ──────────────────────────────────────────────────────────
function ViolationRow({ v }: { v: ViolationSummary }) {
  const color = v.severity === "error" ? "var(--error, #f87171)" : v.severity === "warning" ? "var(--warning)" : "var(--info)";
  const icon = v.severity === "error" ? "✕" : v.severity === "warning" ? "⚠" : "ℹ";
  return (
    <div style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
      <span style={{ color, fontWeight: 700, minWidth: 16, flexShrink: 0 }}>{icon}</span>
      <div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)", marginRight: 8 }}>{v.tableName}{v.fieldName ? `.${v.fieldName}` : ""}</span>
        <span style={{ color: "var(--text-2)" }}>{v.message}</span>
      </div>
    </div>
  );
}

function DdlImportModal({ schemaId, onClose, onImported }: { schemaId: number; onClose: () => void; onImported: () => void }) {
  const { showToast } = useStore();
  const [sql, setSql] = useState("");
  const [checking, setChecking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [checkResult, setCheckResult] = useState<ImportCheckResult | null>(null);
  const [activeTab, setActiveTab] = useState<"naming" | "semantic" | "structure">("naming");

  async function handleCheck() {
    if (!sql.trim()) return;
    setChecking(true);
    try {
      const r = await api.importDdl.check(schemaId, sql);
      setCheckResult(r.check);
      const firstGroupWithIssues = (["naming", "semantic", "structure"] as const).find(
        g => r.check.violations.some(v => v.group === g)
      );
      if (firstGroupWithIssues) setActiveTab(firstGroupWithIssues);
    } catch (e) { showToast(`檢查失敗: ${String(e)}`); }
    finally { setChecking(false); }
  }

  async function handleImport() {
    if (!sql.trim()) return;
    if (!confirm(`確定匯入？${checkResult && !checkResult.summary.passed ? "\n\n警告：有 error 級別的問題，確定要繼續？" : ""}`)) return;
    setImporting(true);
    try {
      const r = await api.importDdl.import(schemaId, sql);
      showToast(`✓ 匯入完成：${r.import.tablesCreated} 張表、${r.import.fieldsCreated} 個欄位`);
      onImported();
      onClose();
    } catch (e) { showToast(`匯入失敗: ${String(e)}`); }
    finally { setImporting(false); }
  }

  const groups = (["naming", "semantic", "structure"] as const);
  const groupLabel: Record<string, string> = { naming: "命名規則", semantic: "語意層", structure: "結構規範" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "var(--bg-2)", border: "1px solid var(--border-light)", borderRadius: 12, width: "min(1100px, 94vw)", height: "min(860px, 92vh)", display: "flex", flexDirection: "column", overflow: "hidden" }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>匯入 DDL</div>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>貼入 CREATE TABLE 語法，系統會自動檢查並匯入</div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--text-3)", cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>

        {/* Body: 2 columns */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
          {/* Left: SQL editor */}
          <div style={{ flex: "0 0 50%", display: "flex", flexDirection: "column", borderRight: "1px solid var(--border)", padding: 20, gap: 12 }}>
            <label style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.5px" }}>SQL 輸入</label>
            <textarea
              value={sql}
              onChange={e => { setSql(e.target.value); setCheckResult(null); }}
              placeholder={`CREATE TABLE \`parts\` (\n  \`id\` BIGINT NOT NULL AUTO_INCREMENT,\n  \`part_no\` VARCHAR(32) NOT NULL COMMENT '料號',\n  PRIMARY KEY (\`id\`)\n) COMMENT='零件主表';`}
              style={{ flex: 1, resize: "none", fontFamily: "var(--font-mono)", fontSize: 13, background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text-1)", borderRadius: 6, padding: "12px 14px", outline: "none", lineHeight: 1.7, tabSize: 2 }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost" onClick={handleCheck} disabled={checking || !sql.trim()} style={{ flex: 1 }}>
                {checking ? "檢查中…" : "檢查 DDL"}
              </button>
              <button className="btn btn-primary" onClick={handleImport} disabled={importing || !sql.trim()} style={{ flex: 1 }}>
                {importing ? "匯入中…" : "匯入"}
              </button>
            </div>
          </div>

          {/* Right: Check result */}
          <div style={{ flex: "0 0 50%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {!checkResult ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)", fontSize: 12, flexDirection: "column", gap: 8 }}>
                <span style={{ fontSize: 28 }}>🔍</span>
                點擊「檢查 DDL」查看結果
              </div>
            ) : (
              <>
                {/* Summary bar */}
                <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", gap: 16, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--text-2)" }}>找到 <b>{checkResult.summary.tablesFound}</b> 張表</span>
                  {checkResult.summary.errors > 0 && <span style={{ fontSize: 11, color: "var(--error, #f87171)", background: "rgba(248,113,113,0.1)", padding: "2px 8px", borderRadius: 10 }}>✕ {checkResult.summary.errors} errors</span>}
                  {checkResult.summary.warnings > 0 && <span style={{ fontSize: 11, color: "var(--warning)", background: "rgba(251,191,36,0.1)", padding: "2px 8px", borderRadius: 10 }}>⚠ {checkResult.summary.warnings} warnings</span>}
                  {checkResult.summary.infos > 0 && <span style={{ fontSize: 11, color: "var(--info)", background: "rgba(96,165,250,0.1)", padding: "2px 8px", borderRadius: 10 }}>ℹ {checkResult.summary.infos} infos</span>}
                  {checkResult.summary.passed && checkResult.violations.length === 0 && <span style={{ fontSize: 11, color: "var(--success)", background: "rgba(74,222,128,0.1)", padding: "2px 8px", borderRadius: 10 }}>✓ 全部通過</span>}
                </div>

                {/* Tables found */}
                {checkResult.tables.length > 0 && (
                  <div style={{ padding: "8px 16px", borderBottom: "1px solid var(--border)", display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {checkResult.tables.map(t => (
                      <span key={t.name} style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--bg-3)", border: "1px solid var(--border)", padding: "2px 8px", borderRadius: 10, color: "var(--text-2)" }}>
                        {t.name} <span style={{ color: "var(--text-3)" }}>({t.fieldCount})</span>
                      </span>
                    ))}
                  </div>
                )}

                {/* Tabs */}
                <div style={{ display: "flex", borderBottom: "1px solid var(--border)", padding: "0 16px" }}>
                  {groups.map(g => {
                    const count = checkResult.violations.filter(v => v.group === g).length;
                    return (
                      <button key={g} onClick={() => setActiveTab(g)}
                        style={{ padding: "8px 14px", background: "transparent", border: "none", cursor: "pointer", fontSize: 12, fontWeight: activeTab === g ? 600 : 400, color: activeTab === g ? "var(--accent)" : "var(--text-3)", borderBottom: activeTab === g ? "2px solid var(--accent)" : "2px solid transparent", marginBottom: -1 }}>
                        {groupLabel[g]} {count > 0 && <span style={{ background: "var(--bg-4)", borderRadius: 8, padding: "1px 6px", fontSize: 10 }}>{count}</span>}
                      </button>
                    );
                  })}
                </div>

                {/* Violations list */}
                <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px" }}>
                  {checkResult.violations.filter(v => v.group === activeTab).length === 0 ? (
                    <div style={{ textAlign: "center", color: "var(--success)", fontSize: 13, paddingTop: 24 }}>✓ {groupLabel[activeTab]} 全部通過</div>
                  ) : (
                    checkResult.violations.filter(v => v.group === activeTab).map((v, i) => <ViolationRow key={i} v={v} />)
                  )}
                </div>

                {/* Parse errors */}
                {checkResult.parseErrors.length > 0 && (
                  <div style={{ padding: "8px 16px", borderTop: "1px solid var(--border)", background: "rgba(248,113,113,0.05)" }}>
                    {checkResult.parseErrors.map((e, i) => <div key={i} style={{ fontSize: 11, color: "var(--error, #f87171)" }}>{e}</div>)}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── DDL syntax coloring ───────────────────────────────────────────────────────
function renderDdlHtml(ddl: string): string {
  const esc = ddl.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc
    .replace(/(--[^\n]*)/g, '<span class="dc">$1</span>')
    .replace(/\b(CREATE TABLE|NOT NULL|NULL|PRIMARY KEY|AUTO_INCREMENT|DEFAULT|UNIQUE KEY|UNIQUE|ENGINE|DEFAULT CHARSET|COLLATE|COMMENT|IF NOT EXISTS|ON UPDATE|InnoDB)\b/g,
      '<span class="dk">$1</span>')
    .replace(/\b(BIGINT|INT|SMALLINT|TINYINT|DECIMAL|DOUBLE|FLOAT|VARCHAR|TEXT|MEDIUMTEXT|DATE|DATETIME|TIMESTAMP|JSON)\b/g,
      '<span class="dt">$1</span>')
    .replace(/`([^`]+)`/g, '<span class="di">`$1`</span>')
    .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, "<span class=\"ds\">'$1'</span>");
}

// ── Client-side DDL generator (mirrors the backend DDL route) ─────────────────
function generateTableDdl(table: Table): string {
  const sorted = [...table.fields].sort((a, b) => a.position - b.position);
  const cols: string[] = [];
  for (const f of sorted) {
    let col = `  \`${f.name}\` ${f.dataType}`;
    if (!f.nullable) col += " NOT NULL";
    if (f.isPrimaryKey) col += " AUTO_INCREMENT";
    if (f.defaultValue) col += ` DEFAULT ${f.defaultValue}`;
    if (f.comment) col += ` COMMENT '${f.comment.replace(/'/g, "\\'")}'`;
    cols.push(col);
  }
  const pks = sorted.filter(f => f.isPrimaryKey).map(f => `\`${f.name}\``);
  if (pks.length) cols.push(`  PRIMARY KEY (${pks.join(", ")})`);
  for (const u of sorted.filter(f => f.isUnique && !f.isPrimaryKey))
    cols.push(`  UNIQUE KEY \`uk_${table.name}_${u.name}\` (\`${u.name}\`)`);
  const comment = table.comment ? ` COMMENT='${table.comment}'` : "";
  return [
    `CREATE TABLE \`${table.name}\` (`,
    cols.join(",\n"),
    `) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci${comment};`,
  ].join("\n");
}

// ── DDL Panel ─────────────────────────────────────────────────────────────────
function DdlPanel({ table, schema, schemaId, onApplied }: { table: Table | null; schema: SchemaDetail | undefined; schemaId: number; onApplied: () => void }) {
  const qc = useQueryClient();
  const { showToast } = useStore();
  const [editMode, setEditMode] = useState(false);
  const [editSql, setEditSql] = useState("");
  const [applying, setApplying] = useState(false);
  const [preChecking, setPreChecking] = useState(false);
  const [applyCheckResult, setApplyCheckResult] = useState<ImportCheckResult | null>(null);
  const [showApplyConfirm, setShowApplyConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [ddlScope, setDdlScope] = useState<"table" | "schema" | "history">("table");

  const { data: versions } = useQuery({
    queryKey: ["versions", schemaId],
    queryFn: () => api.schemas.versions.list(schemaId),
    enabled: ddlScope === "history",
  });

  // Single table DDL from live data
  const tableDdl = table ? generateTableDdl(table) : null;

  // Full schema DDL from live data (all tables sorted by name)
  const schemaDdl = schema
    ? schema.tables
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(t => {
          const header = t.comment ? `-- ${t.comment}\n` : "";
          return header + generateTableDdl(t);
        })
        .join("\n\n")
    : null;

  const ddl = ddlScope === "schema" ? schemaDdl : tableDdl;

  // When the active table switches, exit edit mode
  useEffect(() => { setEditMode(false); }, [table?.id]);
  // Schema / history views are always read-only
  useEffect(() => { if (ddlScope !== "table") setEditMode(false); }, [ddlScope]);

  function enterEdit() { setEditSql(ddl ?? ""); setEditMode(true); }
  function cancelEdit() { setEditMode(false); }

  async function handleApplyClick() {
    if (!editSql.trim()) return;
    setPreChecking(true);
    try {
      const r = await api.importDdl.check(schemaId, editSql);
      setApplyCheckResult(r.check);
      setShowApplyConfirm(true);
    } catch (e) { showToast(`DDL 解析失敗: ${String(e)}`); }
    finally { setPreChecking(false); }
  }

  async function confirmApply() {
    setShowApplyConfirm(false);
    setApplying(true);
    try {
      const r = await api.importDdl.import(schemaId, editSql);
      showToast(`✓ 套用完成：${r.import.tablesCreated} 張表、${r.import.fieldsCreated} 個欄位`);
      void qc.invalidateQueries({ queryKey: ["schema", schemaId] });
      setEditMode(false);
      onApplied();
    } catch (e) { showToast(`套用失敗: ${String(e)}`); }
    finally { setApplying(false); }
  }

  async function copy() {
    if (!ddl) return;
    await navigator.clipboard.writeText(ddl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  if (collapsed) {
    return (
      <div style={{ width: 28, flexShrink: 0, borderLeft: "1px solid var(--border)", background: "var(--bg-2)", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 12 }}>
        <button onClick={() => setCollapsed(false)} title="展開 DDL"
          style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-3)", fontSize: 10, fontWeight: 600, writingMode: "vertical-rl", padding: "10px 2px", letterSpacing: 1, textTransform: "uppercase" }}
          onMouseEnter={e => (e.currentTarget.style.color = "var(--accent)")}
          onMouseLeave={e => (e.currentTarget.style.color = "var(--text-3)")}>
          DDL ▶
        </button>
      </div>
    );
  }

  return (
    <div style={{ width: 460, flexShrink: 0, borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", background: "var(--bg-1)", minWidth: 0 }}>
      {/* Header */}
      <div style={{ padding: "9px 12px", borderBottom: "1px solid var(--border)", background: "var(--bg-2)", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {/* Scope toggle */}
        <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: "1px solid var(--border)", flexShrink: 0 }}>
          {(["table", "schema", "history"] as const).map(s => (
            <button key={s} onClick={() => { setDdlScope(s); if (s !== "table" && s !== "schema") setEditMode(false); }}
              style={{ padding: "2px 9px", border: "none", cursor: "pointer", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", transition: "all 0.15s",
                background: ddlScope === s ? "var(--accent)" : "var(--bg-3)",
                color: ddlScope === s ? "#fff" : "var(--text-3)" }}>
              {s === "table" ? "此表" : s === "schema" ? "全 Schema" : "版本歷史"}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {ddlScope === "table" && table && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--success)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {table.name}
              <span style={{ color: "var(--text-3)", fontSize: 10, marginLeft: 6 }}>{table.fields.length} fields</span>
              {table.comment && <span style={{ color: "var(--text-3)", fontSize: 10, marginLeft: 6 }}>— {table.comment}</span>}
            </div>
          )}
          {ddlScope === "schema" && schema && (
            <div style={{ fontSize: 11, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {schema.tables.length} tables · {schema.tables.reduce((n, t) => n + t.fields.length, 0)} fields
            </div>
          )}
          {ddlScope === "history" && (
            <div style={{ fontSize: 11, color: "var(--text-3)" }}>
              {versions ? `${versions.length} 個版本` : "載入中…"}
            </div>
          )}
        </div>
        {!editMode && ddlScope !== "history" ? (
          <>
            <button onClick={copy} disabled={!ddl}
              style={{ padding: "3px 9px", borderRadius: 4, border: "1px solid var(--border)", background: "transparent", color: copied ? "var(--success)" : "var(--text-2)", fontSize: 11, cursor: ddl ? "pointer" : "not-allowed", opacity: ddl ? 1 : 0.4, transition: "all 0.15s" }}>
              {copied ? "✓ 已複製" : "複製"}
            </button>
            {ddlScope === "table" && (
              <button onClick={enterEdit} disabled={!ddl}
                style={{ padding: "3px 9px", borderRadius: 4, border: "1px solid var(--accent)", background: "var(--accent-dim)", color: "var(--accent)", fontSize: 11, cursor: ddl ? "pointer" : "not-allowed", fontWeight: 500, opacity: ddl ? 1 : 0.4 }}>
                編輯 DDL
              </button>
            )}
          </>
        ) : editMode ? (
          <>
            <span style={{ fontSize: 10, color: "var(--warning)", background: "rgba(251,191,36,0.12)", padding: "2px 7px", borderRadius: 8, border: "1px solid rgba(251,191,36,0.3)" }}>編輯中</span>
            <button onClick={cancelEdit}
              style={{ padding: "3px 9px", borderRadius: 4, border: "1px solid var(--border)", background: "transparent", color: "var(--text-2)", fontSize: 11, cursor: "pointer" }}>
              取消
            </button>
            <button onClick={handleApplyClick} disabled={applying || preChecking}
              style={{ padding: "3px 9px", borderRadius: 4, border: "none", background: applying || preChecking ? "var(--bg-4)" : "var(--success)", color: applying || preChecking ? "var(--text-3)" : "#000", fontSize: 11, cursor: applying || preChecking ? "not-allowed" : "pointer", fontWeight: 600 }}>
              {preChecking ? "檢查中…" : applying ? "套用中…" : "套用"}
            </button>
          </>
        ) : null}
        <button onClick={() => { setEditMode(false); setCollapsed(true); }} title="收合"
          style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-3)", fontSize: 13, padding: "2px 2px", lineHeight: 1 }}
          onMouseEnter={e => (e.currentTarget.style.color = "var(--text-1)")}
          onMouseLeave={e => (e.currentTarget.style.color = "var(--text-3)")}>
          ▶
        </button>
      </div>

      {/* Edit warning bar */}
      {editMode && (
        <div style={{ padding: "5px 12px", background: "rgba(251,191,36,0.07)", borderBottom: "1px solid var(--border)", fontSize: 11, color: "var(--warning)", flexShrink: 0 }}>
          ⚠ 編輯模式：套用後將執行 DDL 匯入，可新增 Table / 欄位
        </div>
      )}

      {/* Schema scope: table of contents bar */}
      {ddlScope === "schema" && !editMode && schema && (
        <div style={{ padding: "6px 12px", borderBottom: "1px solid var(--border)", background: "var(--bg-2)", display: "flex", gap: 6, flexWrap: "wrap", flexShrink: 0 }}>
          {schema.tables.slice().sort((a, b) => a.name.localeCompare(b.name)).map(t => (
            <span key={t.id} style={{ fontFamily: "var(--font-mono)", fontSize: 10, padding: "1px 7px", borderRadius: 8, background: "var(--bg-3)", color: "var(--text-2)", border: "1px solid var(--border)" }}>
              {t.name} <span style={{ color: "var(--text-3)" }}>{t.fields.length}</span>
            </span>
          ))}
        </div>
      )}

      {/* Body */}
      {ddlScope === "history" ? (
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }}>
          {!versions ? (
            <div style={{ color: "var(--text-3)", fontSize: 12, paddingTop: 20, textAlign: "center" }}>載入中…</div>
          ) : versions.length === 0 ? (
            <div style={{ color: "var(--text-3)", fontSize: 12, paddingTop: 40, textAlign: "center" }}>尚無版本記錄</div>
          ) : versions.map((v: SchemaVersion) => (
            <div key={v.id} style={{ marginBottom: 12, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-2)", overflow: "hidden" }}>
              {/* Version header */}
              <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8, background: "var(--bg-3)" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>v{v.versionNo}</span>
                <span style={{ flex: 1, fontSize: 12, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.message ?? "（無說明）"}</span>
                <span style={{ fontSize: 10, color: "var(--text-3)", flexShrink: 0 }}>{new Date(v.createdAt).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              {/* Diff summary */}
              {v.diff ? (
                <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
                  {v.diff.tables.added.map((name: string) => (
                    <div key={name} style={{ fontSize: 11, color: "var(--success)", display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontFamily: "var(--font-mono)", background: "var(--success-dim)", padding: "0 5px", borderRadius: 3 }}>+ {name}</span>
                      <span>新增 Table</span>
                    </div>
                  ))}
                  {v.diff.tables.removed.map((name: string) => (
                    <div key={name} style={{ fontSize: 11, color: "var(--error)", display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontFamily: "var(--font-mono)", background: "var(--error-dim)", padding: "0 5px", borderRadius: 3 }}>− {name}</span>
                      <span>移除 Table</span>
                    </div>
                  ))}
                  {v.diff.tables.modified.map((mod) => (
                    <div key={mod.name} style={{ fontSize: 11, color: "var(--text-2)", background: "var(--bg-3)", borderRadius: 4, padding: "4px 8px" }}>
                      <span style={{ fontFamily: "var(--font-mono)", color: "var(--warning)", fontSize: 11 }}>{mod.name}</span>
                      <span style={{ color: "var(--text-3)", marginLeft: 6 }}>
                        {[
                          mod.fieldsAdded.length > 0 && `+${mod.fieldsAdded.length} 欄位`,
                          mod.fieldsRemoved.length > 0 && `−${mod.fieldsRemoved.length} 欄位`,
                          mod.fieldsModified.length > 0 && `~${mod.fieldsModified.length} 修改`,
                        ].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                  ))}
                  {v.diff.tables.added.length === 0 && v.diff.tables.removed.length === 0 && v.diff.tables.modified.length === 0 && (
                    <div style={{ fontSize: 11, color: "var(--text-3)" }}>無 Table 結構變更</div>
                  )}
                </div>
              ) : (
                <div style={{ padding: "8px 12px", fontSize: 11, color: "var(--text-3)" }}>初始版本（無 diff）</div>
              )}
            </div>
          ))}
        </div>
      ) : !ddl ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)", fontSize: 12 }}>
          {ddlScope === "table" ? "選擇左側 Table 查看 DDL" : "尚無 Table 資料"}
        </div>
      ) : editMode ? (
        <textarea
          value={editSql}
          onChange={e => setEditSql(e.target.value)}
          spellCheck={false}
          style={{ flex: 1, resize: "none", fontFamily: "var(--font-mono)", fontSize: 12.5, lineHeight: 1.7, background: "var(--bg-3)", color: "var(--text-1)", border: "none", outline: "none", padding: "14px 16px", tabSize: 2 }}
        />
      ) : (
        <pre
          dangerouslySetInnerHTML={{ __html: renderDdlHtml(ddl) }}
          style={{ flex: 1, overflowY: "auto", overflowX: "auto", margin: 0, padding: "14px 16px", fontFamily: "var(--font-mono)", fontSize: 12.5, lineHeight: 1.8, color: "var(--text-1)", whiteSpace: "pre" }}
        />
      )}

      <style>{`
        .dc { color: var(--text-3); font-style: italic; }
        .dk { color: var(--accent); font-weight: 600; }
        .dt { color: #5EEAD4; }
        .di { color: var(--success); }
        .ds { color: #F6AD55; }
      `}</style>

      {showApplyConfirm && applyCheckResult && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowApplyConfirm(false)}>
          <div style={{ background: "var(--bg-2)", border: "1px solid var(--border-light)", borderRadius: 12, width: "min(560px, 94vw)", maxHeight: "80vh", display: "flex", flexDirection: "column", overflow: "hidden" }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>套用前確認</div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: "var(--text-2)" }}>找到 <b>{applyCheckResult.summary.tablesFound}</b> 張表</span>
                {applyCheckResult.summary.errors > 0 && <span style={{ fontSize: 11, color: "var(--error,#f87171)", background: "rgba(248,113,113,0.1)", padding: "2px 8px", borderRadius: 10 }}>✕ {applyCheckResult.summary.errors} errors</span>}
                {applyCheckResult.summary.warnings > 0 && <span style={{ fontSize: 11, color: "var(--warning)", background: "rgba(251,191,36,0.1)", padding: "2px 8px", borderRadius: 10 }}>⚠ {applyCheckResult.summary.warnings} warnings</span>}
                {applyCheckResult.summary.infos > 0 && <span style={{ fontSize: 11, color: "var(--info)", background: "rgba(96,165,250,0.1)", padding: "2px 8px", borderRadius: 10 }}>ℹ {applyCheckResult.summary.infos} infos</span>}
                {applyCheckResult.summary.passed && applyCheckResult.violations.length === 0 && <span style={{ fontSize: 11, color: "var(--success)", background: "rgba(74,222,128,0.1)", padding: "2px 8px", borderRadius: 10 }}>✓ 全部通過</span>}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px" }}>
              {applyCheckResult.violations.length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--success)", fontSize: 13, paddingTop: 16 }}>✓ 無違規項目</div>
              ) : (
                applyCheckResult.violations.map((v, i) => <ViolationRow key={i} v={v} />)
              )}
            </div>
            <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setShowApplyConfirm(false)}>取消</button>
              <button className="btn btn-primary" onClick={confirmApply} disabled={applying}
                style={{ background: applyCheckResult.summary.errors > 0 ? "var(--warning)" : undefined, color: applyCheckResult.summary.errors > 0 ? "#000" : undefined }}>
                {applyCheckResult.summary.errors > 0 ? "強制套用（有錯誤）" : "確認套用"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
const ENV_COLORS: Record<SchemaEnvironment, string> = { DEV: "#60a5fa", TEST: "#4ade80", STAGING: "#fbbf24", PROD: "#f87171" };
const ALL_ENVS: SchemaEnvironment[] = ["DEV", "TEST", "STAGING", "PROD"];

function SchemaMetaBar({ schema }: { schema: SchemaDetail }) {
  const qc = useQueryClient();
  const { showToast } = useStore();
  const [tagInput, setTagInput] = useState("");
  const [showEnvMenu, setShowEnvMenu] = useState(false);

  async function setEnv(env: SchemaEnvironment | null) {
    await api.schemas.update(schema.id, { environment: env });
    await qc.invalidateQueries({ queryKey: ["schema", schema.id] });
    await qc.invalidateQueries({ queryKey: ["schemas"] });
    setShowEnvMenu(false);
    showToast(env ? `環境已設為 ${env}` : "已清除環境標記");
  }

  async function addTag(tag: string) {
    const t = tag.trim();
    if (!t || schema.tags.includes(t)) return;
    await api.schemas.update(schema.id, { tags: [...schema.tags, t] });
    await qc.invalidateQueries({ queryKey: ["schema", schema.id] });
    await qc.invalidateQueries({ queryKey: ["schemas"] });
    setTagInput("");
  }

  async function removeTag(tag: string) {
    await api.schemas.update(schema.id, { tags: schema.tags.filter(t => t !== tag) });
    await qc.invalidateQueries({ queryKey: ["schema", schema.id] });
    await qc.invalidateQueries({ queryKey: ["schemas"] });
  }

  const env = schema.environment as SchemaEnvironment | null;

  return (
    <div style={{ padding: "6px 10px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
      {/* Environment */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.4px", flexShrink: 0 }}>ENV</span>
        <div style={{ position: "relative" }}>
          <button onClick={() => setShowEnvMenu(v => !v)}
            style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, border: `1px solid ${env ? `${ENV_COLORS[env]}44` : "var(--border)"}`,
              background: env ? `${ENV_COLORS[env]}22` : "var(--bg-3)", color: env ? ENV_COLORS[env] : "var(--text-3)",
              cursor: "pointer", letterSpacing: "0.3px" }}>
            {env ?? "未指定"} ▾
          </button>
          {showEnvMenu && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 98 }} onClick={() => setShowEnvMenu(false)} />
              <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 99, background: "var(--bg-2)", border: "1px solid var(--border-light)", borderRadius: 6, padding: 4, boxShadow: "0 4px 16px rgba(0,0,0,0.4)", minWidth: 100 }}>
                <div onClick={() => void setEnv(null)}
                  style={{ padding: "5px 10px", fontSize: 11, borderRadius: 4, cursor: "pointer", color: "var(--text-3)" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-3)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                  未指定
                </div>
                {ALL_ENVS.map(e => (
                  <div key={e} onClick={() => void setEnv(e)}
                    style={{ padding: "5px 10px", fontSize: 11, borderRadius: 4, cursor: "pointer", color: ENV_COLORS[e], fontWeight: 700 }}
                    onMouseEnter={el => (el.currentTarget.style.background = "var(--bg-3)")}
                    onMouseLeave={el => (el.currentTarget.style.background = "transparent")}>
                    {e}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      {/* Tags */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.4px", flexShrink: 0 }}>TAG</span>
        {schema.tags.map(tag => (
          <span key={tag} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "var(--accent-dim)", color: "var(--accent)", border: "1px solid var(--accent)", display: "flex", alignItems: "center", gap: 3 }}>
            {tag}
            <button onClick={() => void removeTag(tag)}
              style={{ border: "none", background: "none", color: "var(--accent)", cursor: "pointer", fontSize: 10, padding: 0, lineHeight: 1, opacity: 0.7 }}>✕</button>
          </span>
        ))}
        <input value={tagInput} onChange={e => setTagInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); void addTag(tagInput); } }}
          placeholder="+ 新增標籤"
          style={{ fontSize: 10, border: "1px dashed var(--border)", borderRadius: 4, padding: "2px 6px", background: "transparent", color: "var(--text-2)", outline: "none", width: 70, minWidth: 0 }} />
      </div>
    </div>
  );
}

export default function SchemaEditorPage() {
  const qc = useQueryClient();
  const { selectedSchemaId, selectedTableId, setSelectedTableId, showToast } = useStore();
  const [addTableModal, setAddTableModal] = useState(false);
  const [importModal, setImportModal] = useState(false);
  const [newTableName, setNewTableName] = useState("");

  const { data: schema } = useQuery({
    queryKey: ["schema", selectedSchemaId],
    queryFn: () => api.schemas.get(selectedSchemaId!),
    enabled: selectedSchemaId !== null,
  });

  const { data: naming } = useQuery({ queryKey: ["naming"], queryFn: () => api.naming.list() });
  const namingEntries: NamingEntry[] = naming ?? [];

  const activeTableId = selectedTableId ?? schema?.tables[0]?.id ?? null;
  const activeTable = schema?.tables.find(t => t.id === activeTableId);

  async function addTable() {
    if (!newTableName.trim() || !selectedSchemaId) return;
    const t = await api.tables.create(selectedSchemaId, { name: newTableName });
    await qc.invalidateQueries({ queryKey: ["schema", selectedSchemaId] });
    setSelectedTableId(t.id);
    setAddTableModal(false);
    setNewTableName("");
    showToast(`✓ Table "${t.name}" 已建立`);
  }

  async function deleteTable(id: number, name: string) {
    if (!confirm(`刪除 table "${name}"？`)) return;
    await api.tables.delete(id);
    await qc.invalidateQueries({ queryKey: ["schema", selectedSchemaId] });
    if (activeTableId === id) setSelectedTableId(null);
  }

  if (!selectedSchemaId) {
    return <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)", fontSize: 13 }}>← 從左側選擇一個 Schema 開始編輯</div>;
  }

  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
      {/* Table list panel */}
      <div style={{ width: 200, background: "var(--bg-2)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span className="panel-title">Tables</span>
          <div style={{ display: "flex", gap: 4 }}>
            <button className="icon-btn" title="匯入 DDL" onClick={() => setImportModal(true)}>↑</button>
            <button className="icon-btn" title="新增 Table" onClick={() => setAddTableModal(true)}>＋</button>
          </div>
        </div>
        {schema && <SchemaMetaBar schema={schema} />}
        <div style={{ flex: 1, overflowY: "auto", padding: 6 }}>
          {schema?.tables.map(t => (
            <TableItem key={t.id} table={t} active={t.id === activeTableId}
              issueCount={tableIssueCount(t.fields, namingEntries)}
              onClick={() => setSelectedTableId(t.id)}
              onDelete={() => deleteTable(t.id, t.name)} />
          ))}
        </div>
      </div>

      {/* Field editor */}
      {activeTable
        ? <FieldEditorPanel schema={schema!} table={activeTable} />
        : <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)" }}>選擇左側 Table 開始編輯欄位</div>
      }

      {/* DDL panel */}
      <DdlPanel
        table={activeTable ?? null}
        schema={schema}
        schemaId={selectedSchemaId}
        onApplied={() => void qc.invalidateQueries({ queryKey: ["schema", selectedSchemaId] })}
      />

      {importModal && selectedSchemaId && (
        <DdlImportModal
          schemaId={selectedSchemaId}
          onClose={() => setImportModal(false)}
          onImported={() => void qc.invalidateQueries({ queryKey: ["schema", selectedSchemaId] })}
        />
      )}

      {addTableModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setAddTableModal(false)}>
          <div style={{ background: "var(--bg-2)", border: "1px solid var(--border-light)", borderRadius: 10, width: "min(360px, 92vw)", padding: 20 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>新增 Table</div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block", textTransform: "uppercase" }}>Table 名稱（snake_case）</label>
              <input className="form-input" placeholder="e.g. lot_records" value={newTableName} onChange={e => setNewTableName(e.target.value)} onKeyDown={e => e.key === "Enter" && addTable()} style={{ fontFamily: "var(--font-mono)" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setAddTableModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={addTable}>建立</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TableItem({ table, active, issueCount, onClick, onDelete }: { table: Table; active: boolean; issueCount: number; onClick: () => void; onDelete: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ padding: "6px 8px", borderRadius: "var(--radius)", cursor: "pointer", marginBottom: 1, background: active ? "var(--accent-dim)" : hover ? "var(--bg-3)" : "transparent", display: "flex", justifyContent: "space-between", alignItems: "center" }}
      onClick={onClick}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: active ? "var(--accent)" : "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{table.name}</div>
          {issueCount > 0 && (
            <span title={`${issueCount} 個命名問題`}
              style={{ flexShrink: 0, fontSize: 9, fontWeight: 700, padding: "0px 5px", borderRadius: 8,
                background: "rgba(251,191,36,0.18)", color: "var(--warning)", border: "1px solid rgba(251,191,36,0.35)", lineHeight: "14px" }}>
              ⚠{issueCount}
            </span>
          )}
        </div>
        <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 1 }}>{table.fields.length} fields</div>
      </div>
      {hover && <button onClick={e => { e.stopPropagation(); onDelete(); }} style={{ background: "transparent", border: "none", color: "var(--text-3)", cursor: "pointer", fontSize: 13, padding: "0 2px", flexShrink: 0 }}>✕</button>}
    </div>
  );
}
