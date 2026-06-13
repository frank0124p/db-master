import React, { useState, Fragment } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api, ApiError, type RuleDetail, type RuleLayer, type SkillInfo, type RuleSnapshot, type LayerDef, type SkillRuleDef } from "../api.js";
import { useStore } from "../store.js";

// ── shared helpers ────────────────────────────────────────────────────────────
const GROUP_CFG = {
  naming:     { label: "命名",   color: "#60a5fa" },
  semantic:   { label: "語意",   color: "#4ade80" },
  structure:  { label: "結構",   color: "#f59e0b" },
  governance: { label: "治理",   color: "#c084fc" },
} as const;

const SEV_CFG = {
  error:   { label: "error",   bg: "rgba(248,113,113,0.15)", color: "#f87171", border: "rgba(248,113,113,0.35)" },
  warning: { label: "warning", bg: "rgba(251,191,36,0.15)",  color: "#fbbf24", border: "rgba(251,191,36,0.35)" },
  info:    { label: "info",    bg: "rgba(96,165,250,0.15)",  color: "#60a5fa", border: "rgba(96,165,250,0.35)" },
} as const;

function SevBadge({ v }: { v: string }) {
  const c = SEV_CFG[v as keyof typeof SEV_CFG] ?? SEV_CFG.info;
  return <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 8,
    background: c.bg, color: c.color, border: `1px solid ${c.border}`, letterSpacing: "0.3px", flexShrink: 0 }}>{c.label}</span>;
}

function GroupPill({ g }: { g: string }) {
  const c = GROUP_CFG[g as keyof typeof GROUP_CFG];
  return <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 8px", borderRadius: 8,
    background: "var(--bg-4)", color: c?.color ?? "var(--text-3)", border: "1px solid var(--border)", flexShrink: 0 }}>
    {c?.label ?? g}
  </span>;
}

const LAYER_CFG: Record<RuleLayer, { label: string; bg: string; color: string }> = {
  general:     { label: "通用",       bg: "var(--bg-4)",           color: "var(--text-3)" },
  transaction: { label: "交易層",     bg: "rgba(167,139,250,0.15)", color: "#a78bfa" },
  r2u:         { label: "R2U",        bg: "rgba(52,211,153,0.15)",  color: "#34d399" },
  unified:     { label: "Unified",    bg: "rgba(96,165,250,0.15)",  color: "#60a5fa" },
};

function LayerPill({ layer }: { layer: RuleLayer }) {
  const c = LAYER_CFG[layer];
  return <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 6,
    background: c.bg, color: c.color, border: `1px solid ${c.color}33`, flexShrink: 0, letterSpacing: "0.3px" }}>
    {c.label}
  </span>;
}

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: () => void; disabled?: boolean }) {
  return <div onClick={disabled ? undefined : onChange}
    title={on ? "點擊停用" : "點擊啟用"}
    style={{ width: 34, height: 18, borderRadius: 9, flexShrink: 0,
      background: on ? "var(--accent)" : "var(--bg-4)",
      border: `1px solid ${on ? "var(--accent)" : "var(--border-light)"}`,
      position: "relative", cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1, transition: "all 0.2s" }}>
    <div style={{ position: "absolute", width: 12, height: 12, borderRadius: "50%",
      background: on ? "#fff" : "var(--text-3)", top: 2, left: on ? 18 : 2, transition: "left 0.2s" }} />
  </div>;
}

// ── Rule config inline editor ─────────────────────────────────────────────────
function RuleConfigEditor({ r, onClose }: { r: RuleDetail; onClose: () => void }) {
  const qc = useQueryClient();
  const { showToast } = useStore();
  const [draft, setDraft] = useState(() => JSON.stringify(r.config, null, 2));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(draft) as Record<string, unknown>; }
    catch { setErr("JSON 格式有誤"); return; }
    setErr(null);
    setSaving(true);
    try {
      await api.rules.update(r.id, { config: parsed });
      await qc.invalidateQueries({ queryKey: ["rules"] });
      showToast(`✓ ${r.id} 設定已更新`);
      onClose();
    } catch (e) { showToast(`失敗: ${String(e)}`); }
    finally { setSaving(false); }
  }

  const hasConfig = Object.keys(r.defaultConfig ?? {}).length > 0;

  return (
    <div style={{ padding: "12px 16px 14px 48px", borderTop: "1px dashed var(--border)" }}>
      {hasConfig ? (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ minWidth: 220, flex: 1, maxWidth: 420 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)",
              textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 5 }}>目前設定</div>
            <textarea
              value={draft}
              onChange={e => { setDraft(e.target.value); setErr(null); }}
              spellCheck={false}
              style={{ width: "100%", boxSizing: "border-box", fontSize: 11,
                fontFamily: "var(--font-mono)", color: "var(--text-1)",
                background: "var(--bg-3)", border: `1px solid ${err ? "#f87171" : "var(--border)"}`,
                padding: "8px 10px", borderRadius: 6, resize: "vertical",
                minHeight: 80, outline: "none", lineHeight: 1.5 }}
            />
            {err && <div style={{ fontSize: 10, color: "#f87171", marginTop: 3 }}>{err}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 7, alignItems: "center" }}>
              <button onClick={() => void save()} disabled={saving}
                style={{ fontSize: 11, padding: "3px 12px", borderRadius: 5,
                  border: "none", background: "var(--accent)", color: "#fff",
                  cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1, fontWeight: 700 }}>
                {saving ? "儲存中…" : "✓ 套用"}
              </button>
              <button onClick={onClose}
                style={{ fontSize: 11, padding: "3px 10px", borderRadius: 5,
                  border: "1px solid var(--border)", background: "transparent",
                  color: "var(--text-3)", cursor: "pointer" }}>
                取消
              </button>
              <button onClick={() => setDraft(JSON.stringify(r.defaultConfig, null, 2))}
                style={{ fontSize: 11, padding: "3px 10px", borderRadius: 5,
                  border: "1px solid var(--border)", background: "transparent",
                  color: "var(--text-3)", cursor: "pointer" }}>
                重設預設
              </button>
            </div>
          </div>
          <div style={{ minWidth: 180, maxWidth: 300 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)",
              textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 5 }}>預設值</div>
            <pre style={{ margin: 0, fontSize: 11, fontFamily: "var(--font-mono)",
              color: "var(--text-3)", background: "var(--bg-3)", border: "1px solid var(--border)",
              padding: "8px 10px", borderRadius: 6, whiteSpace: "pre-wrap", wordBreak: "break-word",
              maxHeight: 160, overflowY: "auto" }}>
              {JSON.stringify(r.defaultConfig, null, 2)}
            </pre>
          </div>
        </div>
      ) : (
        <span style={{ fontSize: 11, color: "var(--text-3)" }}>此規則無額外設定參數</span>
      )}
    </div>
  );
}

// ── Snapshot diff ─────────────────────────────────────────────────────────────

type OverrideEntry = { severity?: string; enabled?: boolean; config?: Record<string, unknown> };

interface SnapDiffItem {
  ruleId: string;
  kind: "added" | "removed" | "changed";
  before: OverrideEntry;
  after: OverrideEntry;
}

function asOverrides(raw: Record<string, unknown>): Record<string, OverrideEntry> {
  return raw as Record<string, OverrideEntry>;
}

function diffSnapshots(before: Record<string, OverrideEntry>, after: Record<string, OverrideEntry>): SnapDiffItem[] {
  const allIds = new Set([...Object.keys(before), ...Object.keys(after)]);
  const items: SnapDiffItem[] = [];
  for (const id of allIds) {
    const b = before[id];
    const a = after[id];
    if (!b && a) {
      items.push({ ruleId: id, kind: "added", before: {}, after: a });
    } else if (b && !a) {
      items.push({ ruleId: id, kind: "removed", before: b, after: {} });
    } else if (b && a) {
      const sevChanged = b.severity !== a.severity;
      const enChanged  = (b.enabled ?? true) !== (a.enabled ?? true);
      const cfgChanged = JSON.stringify(b.config) !== JSON.stringify(a.config);
      if (sevChanged || enChanged || cfgChanged) {
        items.push({ ruleId: id, kind: "changed", before: b, after: a });
      }
    }
  }
  return items.sort((x, y) => x.ruleId.localeCompare(y.ruleId));
}

function SnapshotDiff({ snap, prevSnap, rules }: {
  snap: RuleSnapshot;
  prevSnap: RuleSnapshot | null;
  rules: RuleDetail[];
}) {
  const before = asOverrides(prevSnap?.overrides ?? {});
  const after  = asOverrides(snap.overrides ?? {});
  const diffs = diffSnapshots(before, after);
  const ruleMap = new Map(rules.map(r => [r.id, r]));

  if (diffs.length === 0) {
    return (
      <div style={{ padding: "10px 14px", fontSize: 12, color: "var(--text-3)", background: "var(--bg-1)", borderTop: "1px solid var(--border)" }}>
        {prevSnap ? "與前一快照無差異" : "首個快照 — 無對比基準"}
      </div>
    );
  }

  return (
    <div style={{ borderTop: "1px solid var(--border)", background: "var(--bg-1)" }}>
      <div style={{ padding: "8px 14px 6px", fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.5px", display: "flex", alignItems: "center", gap: 8 }}>
        <span>與前一快照差異</span>
        {prevSnap && <span style={{ fontWeight: 400, color: "var(--text-3)" }}>← {prevSnap.name}</span>}
        <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-3)" }}>{diffs.length} 項變更</span>
      </div>
      <div style={{ padding: "0 14px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
        {diffs.map(d => {
          const rule = ruleMap.get(d.ruleId);
          const kindColor = d.kind === "added" ? "#4ade80" : d.kind === "removed" ? "#f87171" : "#fbbf24";
          const kindBg = d.kind === "added" ? "rgba(74,222,128,0.1)" : d.kind === "removed" ? "rgba(248,113,113,0.1)" : "rgba(251,191,36,0.08)";
          const kindLabel = d.kind === "added" ? "新增覆蓋" : d.kind === "removed" ? "移除覆蓋" : "修改";
          return (
            <div key={d.ruleId} style={{ display: "grid", gridTemplateColumns: "70px 1fr auto", alignItems: "start", gap: 8, padding: "6px 10px", borderRadius: 5, background: kindBg, border: `1px solid ${kindColor}33` }}>
              {/* Kind badge */}
              <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 5, background: `${kindColor}22`, color: kindColor, border: `1px solid ${kindColor}44`, textAlign: "center", lineHeight: "16px" }}>
                {kindLabel}
              </span>
              {/* Rule info */}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "var(--text-1)", marginBottom: rule?.description ? 2 : 0 }}>{d.ruleId}</div>
                {rule?.description && <div style={{ fontSize: 10, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rule.description}</div>}
              </div>
              {/* Change detail */}
              <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-end", fontSize: 11, flexShrink: 0 }}>
                {/* enabled change */}
                {(d.before.enabled ?? true) !== (d.after.enabled ?? true) && (
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ color: "#f87171", textDecoration: "line-through" }}>{(d.before.enabled ?? true) ? "啟用" : "停用"}</span>
                    <span style={{ color: "var(--text-3)" }}>→</span>
                    <span style={{ color: "#4ade80", fontWeight: 600 }}>{(d.after.enabled ?? true) ? "啟用" : "停用"}</span>
                  </div>
                )}
                {/* severity change */}
                {d.before.severity !== d.after.severity && (d.before.severity || d.after.severity) && (
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {d.before.severity
                      ? <SevBadge v={d.before.severity} />
                      : <span style={{ fontSize: 10, color: "var(--text-3)" }}>預設</span>}
                    <span style={{ color: "var(--text-3)" }}>→</span>
                    {d.after.severity
                      ? <SevBadge v={d.after.severity} />
                      : <span style={{ fontSize: 10, color: "var(--text-3)" }}>預設</span>}
                  </div>
                )}
                {/* config change */}
                {d.kind !== "removed" && d.kind !== "added" && JSON.stringify(d.before.config) !== JSON.stringify(d.after.config) && (
                  <div style={{ fontSize: 10, color: "var(--text-3)" }}>config 已更新</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Rule definition form (shared by create and edit modals) ──────────────────

interface RuleDefFormState {
  id: string;
  group: "naming" | "semantic" | "structure" | "governance";
  severity: "error" | "warning" | "info";
  description: string;
  tablePattern: string | undefined;
  requiredFields: string[];
  forbiddenFields: string[];
  fieldPattern: string | undefined;
  forbiddenFieldPattern: string | undefined;
}

function RuleDefForm({
  value,
  onChange,
  disableId,
}: {
  value: RuleDefFormState;
  onChange: (v: RuleDefFormState) => void;
  disableId?: boolean;
}) {
  const [reqInput, setReqInput] = useState("");
  const [forbInput, setForbInput] = useState("");

  function addTag(field: "requiredFields" | "forbiddenFields", raw: string) {
    const t = raw.trim();
    if (!t || value[field].includes(t)) return;
    onChange({ ...value, [field]: [...value[field], t] });
  }
  function removeTag(field: "requiredFields" | "forbiddenFields", t: string) {
    onChange({ ...value, [field]: value[field].filter(x => x !== t) });
  }

  const labelStyle: React.CSSProperties = { fontSize: 10, color: "var(--text-3)", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" };
  const inputStyle: React.CSSProperties = { fontSize: 12, padding: "5px 8px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg-3)", color: "var(--text-1)", outline: "none", width: "100%", boxSizing: "border-box" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* ID */}
      <div>
        <label style={labelStyle}>規則 ID</label>
        <input
          style={{ ...inputStyle, opacity: disableId ? 0.5 : 1, cursor: disableId ? "not-allowed" : "text" }}
          placeholder="例：custom.my_rule"
          value={value.id}
          disabled={disableId}
          onChange={e => onChange({ ...value, id: e.target.value })}
        />
      </div>
      {/* Group + Severity row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={labelStyle}>分組</label>
          <select style={inputStyle} value={value.group} onChange={e => onChange({ ...value, group: e.target.value as SkillRuleDef["group"] })}>
            <option value="naming">naming（命名）</option>
            <option value="semantic">semantic（語意）</option>
            <option value="structure">structure（結構）</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>嚴重度</label>
          <select style={inputStyle} value={value.severity} onChange={e => onChange({ ...value, severity: e.target.value as SkillRuleDef["severity"] })}>
            <option value="error">error</option>
            <option value="warning">warning</option>
            <option value="info">info</option>
          </select>
        </div>
      </div>
      {/* Description */}
      <div>
        <label style={labelStyle}>說明</label>
        <input style={inputStyle} placeholder="規則說明文字" value={value.description} onChange={e => onChange({ ...value, description: e.target.value })} />
      </div>
      {/* Table Pattern */}
      <div>
        <label style={labelStyle}>tablePattern（選填，只對符合的表名套用）</label>
        <input style={inputStyle} placeholder="lot|wafer|operation" value={value.tablePattern ?? ""} onChange={e => onChange({ ...value, tablePattern: e.target.value || undefined })} />
      </div>
      {/* Required Fields */}
      <div>
        <label style={labelStyle}>requiredFields（必要欄位）</label>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 5 }}>
          {value.requiredFields.map(t => (
            <span key={t} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, padding: "2px 7px", borderRadius: 5, background: "var(--bg-4)", color: "var(--text-2)", border: "1px solid var(--border)" }}>
              {t}
              <span onClick={() => removeTag("requiredFields", t)} style={{ cursor: "pointer", opacity: 0.7 }}>✕</span>
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <input style={{ ...inputStyle, flex: 1 }} placeholder="欄位名稱，Enter 加入" value={reqInput}
            onChange={e => setReqInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag("requiredFields", reqInput); setReqInput(""); } }} />
          <button onClick={() => { addTag("requiredFields", reqInput); setReqInput(""); }}
            style={{ fontSize: 11, padding: "4px 10px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg-3)", color: "var(--text-2)", cursor: "pointer", flexShrink: 0 }}>＋</button>
        </div>
      </div>
      {/* Forbidden Fields */}
      <div>
        <label style={labelStyle}>forbiddenFields（禁用欄位）</label>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 5 }}>
          {value.forbiddenFields.map(t => (
            <span key={t} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, padding: "2px 7px", borderRadius: 5, background: "var(--bg-4)", color: "var(--text-2)", border: "1px solid var(--border)" }}>
              {t}
              <span onClick={() => removeTag("forbiddenFields", t)} style={{ cursor: "pointer", opacity: 0.7 }}>✕</span>
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <input style={{ ...inputStyle, flex: 1 }} placeholder="欄位名稱，Enter 加入" value={forbInput}
            onChange={e => setForbInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag("forbiddenFields", forbInput); setForbInput(""); } }} />
          <button onClick={() => { addTag("forbiddenFields", forbInput); setForbInput(""); }}
            style={{ fontSize: 11, padding: "4px 10px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg-3)", color: "var(--text-2)", cursor: "pointer", flexShrink: 0 }}>＋</button>
        </div>
      </div>
      {/* fieldPattern + forbiddenFieldPattern */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={labelStyle}>fieldPattern（欄位名稱符合此 regex 則標記）</label>
          <input style={inputStyle} placeholder="^tmp_" value={value.fieldPattern ?? ""} onChange={e => onChange({ ...value, fieldPattern: e.target.value || undefined })} />
        </div>
        <div>
          <label style={labelStyle}>forbiddenFieldPattern（欄位名稱禁止符合此 regex）</label>
          <input style={inputStyle} placeholder="^old_" value={value.forbiddenFieldPattern ?? ""} onChange={e => onChange({ ...value, forbiddenFieldPattern: e.target.value || undefined })} />
        </div>
      </div>
    </div>
  );
}

function emptyRuleDef(): RuleDefFormState {
  return { id: "", group: "naming", severity: "warning", description: "", tablePattern: undefined, requiredFields: [], forbiddenFields: [], fieldPattern: undefined, forbiddenFieldPattern: undefined };
}

// ── Create Rule Modal ─────────────────────────────────────────────────────────
function ValidationErrorBox({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return (
    <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.35)", borderRadius: 6, padding: "8px 12px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#f87171", marginBottom: 4 }}>規則驗證失敗</div>
      {errors.map((e, i) => (
        <div key={i} style={{ fontSize: 11, color: "var(--text-2)", fontFamily: "var(--font-mono)", lineHeight: 1.6 }}>• {e}</div>
      ))}
    </div>
  );
}

function CreateRuleModal({ skills, onClose }: { skills: SkillInfo[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { showToast } = useStore();
  const userSkills = skills.filter(s => s.source === "user");
  const [skillName, setSkillName] = useState(userSkills[0]?.name ?? "");
  const [rule, setRule] = useState<RuleDefFormState>(emptyRuleDef());
  const [saving, setSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  async function create() {
    if (!skillName) { showToast("請先選擇目標 Skill"); return; }
    setValidationErrors([]);
    setSaving(true);
    try {
      const rulePayload: SkillRuleDef = {
        id: rule.id.trim(),
        group: rule.group,
        severity: rule.severity,
        description: rule.description.trim(),
        ...(rule.tablePattern !== undefined ? { tablePattern: rule.tablePattern } : {}),
        ...(rule.fieldPattern !== undefined ? { fieldPattern: rule.fieldPattern } : {}),
        ...(rule.forbiddenFieldPattern !== undefined ? { forbiddenFieldPattern: rule.forbiddenFieldPattern } : {}),
        ...(rule.requiredFields.length > 0 ? { requiredFields: rule.requiredFields } : {}),
        ...(rule.forbiddenFields.length > 0 ? { forbiddenFields: rule.forbiddenFields } : {}),
      };
      await api.rules.createSkillRule({ skillName, rule: rulePayload });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["rules"] }),
        qc.invalidateQueries({ queryKey: ["skills"] }),
      ]);
      showToast(`✓ 規則「${rule.id.trim()}」已新增至 ${skillName}`);
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.errors?.length) {
        setValidationErrors(e.errors);
      } else {
        showToast(`新增失敗: ${String(e)}`);
      }
    }
    finally { setSaving(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={onClose}>
      <div style={{ background: "var(--bg-1)", border: "1px solid var(--border-light)", borderRadius: 12, width: "min(580px,96vw)", maxHeight: "90vh", overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 16, boxShadow: "0 16px 48px rgba(0,0,0,0.5)" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>＋ 新增 Skill 規則</div>

        {/* Skill selector */}
        <div>
          <label style={{ fontSize: 10, color: "var(--text-3)", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>加入哪個 Skill</label>
          {userSkills.length === 0 ? (
            <div style={{ fontSize: 12, color: "#f87171", padding: "8px 10px", borderRadius: 5, background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)" }}>
              尚無自訂 Skill，請先在 Skills 頁籤建立一個。
            </div>
          ) : (
            <select style={{ fontSize: 12, padding: "5px 8px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg-3)", color: "var(--text-1)", outline: "none", width: "100%" }}
              value={skillName} onChange={e => setSkillName(e.target.value)}>
              {userSkills.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
            </select>
          )}
        </div>

        <RuleDefForm value={rule} onChange={setRule} disableId={false} />

        <ValidationErrorBox errors={validationErrors} />

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>取消</button>
          <button className="btn btn-primary" onClick={() => void create()} disabled={saving || userSkills.length === 0}>
            {saving ? "新增中…" : "✓ 新增規則"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit Rule Modal ───────────────────────────────────────────────────────────
function EditRuleModal({ rule: r, onClose }: { rule: RuleDetail; onClose: () => void }) {
  const qc = useQueryClient();
  const { showToast } = useStore();
  const [rule, setRule] = useState<RuleDefFormState>({
    id: r.id,
    group: r.group,
    severity: r.defaultSeverity,
    description: r.description,
    tablePattern: undefined,
    requiredFields: [],
    forbiddenFields: [],
    fieldPattern: undefined,
    forbiddenFieldPattern: undefined,
  });
  const [saving, setSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  async function save() {
    setValidationErrors([]);
    setSaving(true);
    try {
      const payload: Omit<SkillRuleDef, "id"> = {
        group: rule.group,
        severity: rule.severity,
        description: rule.description.trim(),
        ...(rule.tablePattern !== undefined ? { tablePattern: rule.tablePattern } : {}),
        ...(rule.fieldPattern !== undefined ? { fieldPattern: rule.fieldPattern } : {}),
        ...(rule.forbiddenFieldPattern !== undefined ? { forbiddenFieldPattern: rule.forbiddenFieldPattern } : {}),
        ...(rule.requiredFields.length > 0 ? { requiredFields: rule.requiredFields } : {}),
        ...(rule.forbiddenFields.length > 0 ? { forbiddenFields: rule.forbiddenFields } : {}),
      };
      await api.rules.updateSkillRule(r.id, payload);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["rules"] }),
        qc.invalidateQueries({ queryKey: ["skills"] }),
      ]);
      showToast(`✓ 規則「${r.id}」已更新`);
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.errors?.length) {
        setValidationErrors(e.errors);
      } else {
        showToast(`更新失敗: ${String(e)}`);
      }
    }
    finally { setSaving(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={onClose}>
      <div style={{ background: "var(--bg-1)", border: "1px solid var(--border-light)", borderRadius: 12, width: "min(580px,96vw)", maxHeight: "90vh", overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 16, boxShadow: "0 16px 48px rgba(0,0,0,0.5)" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>✎ 編輯規則定義</div>

        <RuleDefForm value={rule} onChange={setRule} disableId={true} />

        <ValidationErrorBox errors={validationErrors} />

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>取消</button>
          <button className="btn btn-primary" onClick={() => void save()} disabled={saving}>
            {saving ? "儲存中…" : "✓ 儲存"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Rules tab ─────────────────────────────────────────────────────────────────
function RulesTab({ rules, skills }: { rules: RuleDetail[]; skills: SkillInfo[] }) {
  const qc = useQueryClient();
  const { showToast } = useStore();
  const [busy, setBusy] = useState<string | null>(null);
  const [group, setGroup] = useState<"all" | "naming" | "semantic" | "structure">("all");
  const [srcFilter, setSrcFilter] = useState<"all" | "built-in" | "skill">("all");
  const [layerFilter, setLayerFilter] = useState<"all" | RuleLayer>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRule, setEditingRule] = useState<RuleDetail | null>(null);

  // ── Snapshot state ────────────────────────────────────────────────────────
  const [snapshotPanelOpen, setSnapshotPanelOpen] = useState(false);
  const [savingSnapshotName, setSavingSnapshotName] = useState(false);
  const [snapshotNameInput, setSnapshotNameInput] = useState("");
  const [showNameInput, setShowNameInput] = useState(false);
  const [expandedSnapId, setExpandedSnapId] = useState<string | null>(null);

  const { data: snapshotsData, refetch: refetchSnapshots } = useQuery({
    queryKey: ["rule-snapshots"],
    queryFn: () => api.rules.snapshots.list(),
  });
  const snapshots: RuleSnapshot[] = snapshotsData?.snapshots ?? [];

  const saveMut = useMutation({
    mutationFn: (name: string) => api.rules.snapshots.save(name),
    onSuccess: (data) => {
      void refetchSnapshots();
      showToast(`✓ 快照「${data.snapshot.name}」已儲存`);
      setSnapshotNameInput("");
      setShowNameInput(false);
    },
    onError: (e) => showToast(`快照儲存失敗: ${String(e)}`),
  });

  const restoreMut = useMutation({
    mutationFn: (id: string) => api.rules.snapshots.restore(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["rules"] });
      showToast("✓ 已還原規則快照");
    },
    onError: (e) => showToast(`還原失敗: ${String(e)}`),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.rules.snapshots.delete(id),
    onSuccess: () => {
      void refetchSnapshots();
      showToast("已刪除快照");
    },
    onError: (e) => showToast(`刪除失敗: ${String(e)}`),
  });

  function handleSaveSnapshot() {
    const name = snapshotNameInput.trim() || new Date().toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    setSavingSnapshotName(true);
    saveMut.mutate(name);
    setSavingSnapshotName(false);
  }

  const visible = rules.filter(r =>
    (group === "all" || r.group === group) &&
    (srcFilter === "all" || (r.source ?? "built-in") === srcFilter) &&
    (layerFilter === "all" || (r.layers ?? ["general"]).includes(layerFilter))
  );

  const gc = (g: string) => rules.filter(r => r.group === g).length;
  const modifiedCount = rules.filter(r => r.severity !== r.defaultSeverity || !r.enabled).length;
  const disabledCount = rules.filter(r => !r.enabled).length;
  const skillCount    = rules.filter(r => r.source === "skill").length;

  async function toggleRule(r: RuleDetail) {
    setBusy(r.id);
    try {
      await api.rules.update(r.id, { enabled: !r.enabled });
      await qc.invalidateQueries({ queryKey: ["rules"] });
      showToast(`${!r.enabled ? "✓ 已啟用" : "⊘ 已停用"} ${r.id}`);
    } catch (e) { showToast(`失敗: ${String(e)}`); }
    finally { setBusy(null); }
  }

  async function setSeverity(r: RuleDetail, sev: "error" | "warning" | "info") {
    if (sev === r.severity) return;
    setBusy(r.id);
    try {
      await api.rules.update(r.id, { severity: sev });
      await qc.invalidateQueries({ queryKey: ["rules"] });
      showToast(`✓ ${r.id} → ${sev}`);
    } catch (e) { showToast(`失敗: ${String(e)}`); }
    finally { setBusy(null); }
  }

  async function reset(r: RuleDetail) {
    setBusy(r.id);
    try {
      await api.rules.update(r.id, { severity: r.defaultSeverity, enabled: true });
      await qc.invalidateQueries({ queryKey: ["rules"] });
      showToast(`↺ ${r.id} 已還原`);
    } catch (e) { showToast(`失敗: ${String(e)}`); }
    finally { setBusy(null); }
  }

  async function deleteSkillRule(r: RuleDetail) {
    if (!window.confirm(`確定刪除規則「${r.id}」？此操作無法復原。`)) return;
    setBusy(r.id);
    try {
      await api.rules.deleteSkillRule(r.id);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["rules"] }),
        qc.invalidateQueries({ queryKey: ["skills"] }),
      ]);
      showToast(`已刪除規則 ${r.id}`);
      if (expandedId === r.id) setExpandedId(null);
    } catch (e) { showToast(`刪除失敗: ${String(e)}`); }
    finally { setBusy(null); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      {/* ── Modals ── */}
      {showCreateModal && (
        <CreateRuleModal skills={skills} onClose={() => setShowCreateModal(false)} />
      )}
      {editingRule && (
        <EditRuleModal rule={editingRule} onClose={() => setEditingRule(null)} />
      )}

      {/* ── Toolbar ── */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", background: "var(--bg-2)",
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flexShrink: 0 }}>

        {/* Summary pills */}
        <span style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 600 }}>{rules.length} 條規則</span>
        {skillCount > 0 && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 8,
          background: "rgba(251,191,36,0.12)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)" }}>
          ✦ {skillCount} Skill 規則
        </span>}
        {disabledCount > 0 && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 8,
          background: "var(--bg-4)", color: "var(--text-3)", border: "1px solid var(--border)" }}>
          ⊘ {disabledCount} 停用
        </span>}
        {modifiedCount > 0 && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 8,
          background: "var(--accent-dim)", color: "var(--accent)", border: "1px solid var(--accent)" }}>
          ✎ {modifiedCount} 已調整
        </span>}

        <div style={{ flex: 1 }} />

        {/* Add rule button */}
        <button onClick={() => setShowCreateModal(true)}
          style={{ fontSize: 11, padding: "4px 12px", borderRadius: 5,
            border: "1px solid rgba(251,191,36,0.5)", background: "rgba(251,191,36,0.1)",
            color: "#fbbf24", cursor: "pointer", fontWeight: 700, flexShrink: 0 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(251,191,36,0.2)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(251,191,36,0.1)"; }}>
          ＋ 新增規則
        </button>

        {/* Source filter */}
        <div style={{ display: "flex", borderRadius: 6, border: "1px solid var(--border)", overflow: "hidden" }}>
          {(["all", "built-in", "skill"] as const).map(s => (
            <button key={s} onClick={() => setSrcFilter(s)}
              style={{ padding: "3px 10px", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600,
                background: srcFilter === s ? "var(--bg-4)" : "var(--bg-3)",
                color: srcFilter === s ? "var(--text-1)" : "var(--text-3)", transition: "all 0.12s" }}>
              {s === "all" ? "全部" : s === "built-in" ? "⬡ 內建" : "✦ Skill"}
            </button>
          ))}
        </div>

        {/* Group filter */}
        <div style={{ display: "flex", borderRadius: 6, border: "1px solid var(--border)", overflow: "hidden" }}>
          {(["all", "naming", "semantic", "structure"] as const).map(g => (
            <button key={g} onClick={() => setGroup(g)}
              style={{ padding: "3px 10px", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600,
                background: group === g ? "var(--accent-dim)" : "var(--bg-3)",
                color: group === g ? "var(--accent)" : "var(--text-3)", transition: "all 0.12s" }}>
              {g === "all" ? `全部 ${rules.length}` : g === "naming" ? `命名 ${gc("naming")}` : g === "semantic" ? `語意 ${gc("semantic")}` : `結構 ${gc("structure")}`}
            </button>
          ))}
        </div>
      </div>

      {/* ── Layer filter bar ── */}
      <div style={{ padding: "8px 20px", borderBottom: "1px solid var(--border)", background: "var(--bg-1)",
        display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.5px", marginRight: 4 }}>適用層級</span>
        {([
          { k: "all" as const,         label: "全部" },
          { k: "general" as const,     label: "通用" },
          { k: "transaction" as const, label: "交易層" },
          { k: "r2u" as const,         label: "寬表 R2U" },
          { k: "unified" as const,     label: "寬表 Unified" },
        ]).map(({ k, label }) => (
          <button key={k} onClick={() => setLayerFilter(k)}
            style={{ padding: "3px 10px", borderRadius: 6, border: `1px solid ${layerFilter === k ? (k === "all" ? "var(--accent)" : LAYER_CFG[k as RuleLayer]?.color ?? "var(--accent)") : "var(--border)"}`,
              cursor: "pointer", fontSize: 11, fontWeight: 600,
              background: layerFilter === k ? (k === "all" ? "var(--accent-dim)" : (LAYER_CFG[k as RuleLayer]?.bg ?? "var(--accent-dim)")) : "transparent",
              color: layerFilter === k ? (k === "all" ? "var(--accent)" : (LAYER_CFG[k as RuleLayer]?.color ?? "var(--accent)")) : "var(--text-3)",
              transition: "all 0.12s" }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Table ── */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: 48 }} />   {/* toggle */}
            <col />                          {/* id + description (fills remaining width) */}
            <col style={{ width: 68 }} />   {/* group */}
            <col style={{ width: 116 }} />  {/* severity */}
            <col style={{ width: 32 }} />   {/* expand */}
            <col style={{ width: 68 }} />   {/* reset */}
          </colgroup>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--border)", background: "var(--bg-2)", position: "sticky", top: 0, zIndex: 2 }}>
              {["", "規則 ID / 說明", "分組", "嚴重度", "", ""].map((h, i) => (
                <th key={i} style={{ padding: "8px 12px", textAlign: "left", fontSize: 10, fontWeight: 700,
                  color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.6px" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map(r => {
              const isBusy = busy === r.id;
              const isModified = r.severity !== r.defaultSeverity || !r.enabled;
              const isExpanded = expandedId === r.id;
              const hasConfig = Object.keys(r.config ?? {}).length > 0 || Object.keys(r.defaultConfig ?? {}).length > 0;
              return (
                <Fragment key={r.id}>
                  <tr
                    onClick={() => setExpandedId(isExpanded ? null : r.id)}
                    style={{ borderBottom: isExpanded ? "none" : "1px solid var(--border)",
                      opacity: r.enabled ? 1 : 0.5, transition: "all 0.15s", cursor: "pointer",
                      background: isExpanded ? "var(--bg-2)" : "transparent" }}
                    onMouseEnter={e => { if (!isExpanded) (e.currentTarget.style.background = "var(--bg-2)"); }}
                    onMouseLeave={e => { if (!isExpanded) (e.currentTarget.style.background = "transparent"); }}>

                    {/* Toggle */}
                    <td style={{ padding: "12px 12px", verticalAlign: "top", paddingTop: 14 }}
                        onClick={e => e.stopPropagation()}>
                      <Toggle on={r.enabled} onChange={() => void toggleRule(r)} disabled={isBusy} />
                    </td>

                    {/* ID + Description merged */}
                    <td style={{ padding: "11px 12px 11px 0", verticalAlign: "top" }}>
                      {/* ID row */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600,
                          color: r.enabled ? "var(--accent)" : "var(--text-3)" }}>
                          {r.id}
                        </span>
                        {(r.source ?? "built-in") === "skill" && (
                          <span style={{ fontSize: 9, fontWeight: 800, padding: "0 5px", borderRadius: 4,
                            background: "rgba(251,191,36,0.15)", color: "#fbbf24",
                            border: "1px solid rgba(251,191,36,0.4)", flexShrink: 0 }}>SKILL</span>
                        )}
                        {(r.layers ?? ["general"]).map((layer) => (
                          <LayerPill key={layer} layer={layer} />
                        ))}
                        {hasConfig && !isExpanded && (
                          <span style={{ fontSize: 9, color: "var(--text-3)", flexShrink: 0 }}>⚙ 有設定</span>
                        )}
                      </div>
                      {/* Description — full text, wraps naturally */}
                      <div style={{ fontSize: 12, color: r.enabled ? "var(--text-2)" : "var(--text-3)",
                        lineHeight: 1.6 }}>
                        {r.description}
                      </div>
                    </td>

                    {/* Group */}
                    <td style={{ padding: "12px 12px", verticalAlign: "top", paddingTop: 14 }}>
                      <GroupPill g={r.group} />
                    </td>

                    {/* Severity */}
                    <td style={{ padding: "12px 12px", verticalAlign: "top", paddingTop: 13 }}
                        onClick={e => e.stopPropagation()}>
                      <select value={r.severity} disabled={isBusy || !r.enabled}
                        onChange={e => void setSeverity(r, e.target.value as "error" | "warning" | "info")}
                        style={{ fontSize: 11, padding: "3px 6px", borderRadius: 4,
                          border: `1px solid ${SEV_CFG[r.severity as keyof typeof SEV_CFG]?.border ?? "var(--border)"}`,
                          background: SEV_CFG[r.severity as keyof typeof SEV_CFG]?.bg ?? "var(--bg-3)",
                          color: SEV_CFG[r.severity as keyof typeof SEV_CFG]?.color ?? "var(--text-1)",
                          cursor: isBusy || !r.enabled ? "not-allowed" : "pointer",
                          opacity: !r.enabled ? 0.4 : 1, fontWeight: 700 }}>
                        <option value="error">error</option>
                        <option value="warning">warning</option>
                        <option value="info">info</option>
                      </select>
                    </td>

                    {/* Expand arrow */}
                    <td style={{ padding: "12px 4px", verticalAlign: "top", paddingTop: 14, textAlign: "center" }}>
                      <span style={{ fontSize: 10, color: isExpanded ? "var(--accent)" : "var(--text-3)",
                        display: "inline-block", transition: "transform 0.2s",
                        transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
                    </td>

                    {/* Reset */}
                    <td style={{ padding: "12px 8px", verticalAlign: "top", paddingTop: 13 }}
                        onClick={e => e.stopPropagation()}>
                      {isModified && (
                        <button onClick={() => void reset(r)} disabled={isBusy}
                          style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5,
                            border: "1px solid var(--border)", background: "transparent",
                            color: "var(--text-3)", cursor: isBusy ? "not-allowed" : "pointer" }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--text-1)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border-light)"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--text-3)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}>
                          ↺ 還原
                        </button>
                      )}
                    </td>
                  </tr>

                  {/* ── Expandable config detail row ── */}
                  {isExpanded && (
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <td colSpan={6} style={{ padding: 0, background: "var(--bg-1)" }}>
                        <RuleConfigEditor r={r} onClose={() => setExpandedId(null)} />
                        {r.source === "skill" && (
                          <div style={{ padding: "10px 16px 12px 48px", borderTop: "1px dashed var(--border)", display: "flex", gap: 8, alignItems: "center" }}
                            onClick={e => e.stopPropagation()}>
                            <span style={{ fontSize: 10, color: "var(--text-3)", marginRight: 4 }}>Skill 規則操作：</span>
                            <button
                              onClick={() => setEditingRule(r)}
                              style={{ fontSize: 11, padding: "3px 10px", borderRadius: 5, border: "1px solid rgba(251,191,36,0.4)", background: "rgba(251,191,36,0.08)", color: "#fbbf24", cursor: "pointer" }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(251,191,36,0.18)"; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(251,191,36,0.08)"; }}>
                              ✎ 編輯定義
                            </button>
                            <button
                              onClick={() => void deleteSkillRule(r)}
                              disabled={busy === r.id}
                              style={{ fontSize: 11, padding: "3px 10px", borderRadius: 5, border: "1px solid var(--border)", background: "transparent", color: "var(--text-3)", cursor: busy === r.id ? "not-allowed" : "pointer" }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--error,#f87171)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(248,113,113,0.5)"; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--text-3)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}>
                              刪除規則
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>

        {visible.length === 0 && (
          <div style={{ padding: 48, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
            無符合條件的規則
          </div>
        )}
      </div>

      {/* ── Snapshot toolbar row ── */}
      <div style={{ padding: "8px 20px", borderTop: "1px solid var(--border)", background: "var(--bg-2)",
        display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {showNameInput ? (
          <>
            <input
              autoFocus
              placeholder="快照名稱（可留空使用日期時間）"
              value={snapshotNameInput}
              onChange={e => setSnapshotNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSaveSnapshot(); if (e.key === "Escape") { setShowNameInput(false); setSnapshotNameInput(""); } }}
              style={{ fontSize: 12, padding: "4px 8px", borderRadius: 4, border: "1px solid var(--border)",
                background: "var(--bg-3)", color: "var(--text-1)", outline: "none", width: 240 }}
            />
            <button onClick={handleSaveSnapshot} disabled={saveMut.isPending || savingSnapshotName}
              style={{ fontSize: 11, padding: "4px 12px", borderRadius: 5, border: "none",
                background: "var(--accent)", color: "#fff", cursor: "pointer", fontWeight: 700,
                opacity: saveMut.isPending ? 0.7 : 1 }}>
              {saveMut.isPending ? "儲存中…" : "確認儲存"}
            </button>
            <button onClick={() => { setShowNameInput(false); setSnapshotNameInput(""); }}
              style={{ fontSize: 11, padding: "4px 10px", borderRadius: 5, border: "1px solid var(--border)",
                background: "transparent", color: "var(--text-3)", cursor: "pointer" }}>
              取消
            </button>
          </>
        ) : (
          <button onClick={() => setShowNameInput(true)}
            style={{ fontSize: 11, padding: "4px 12px", borderRadius: 5, border: "1px solid var(--border)",
              background: "var(--bg-3)", color: "var(--text-2)", cursor: "pointer", transition: "all 0.15s" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--bg-4)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "var(--bg-3)"; }}>
            ⊕ 儲存快照
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={() => setSnapshotPanelOpen(v => !v)}
          style={{ fontSize: 11, padding: "4px 10px", borderRadius: 5, border: "1px solid var(--border)",
            background: snapshotPanelOpen ? "var(--bg-4)" : "transparent",
            color: "var(--text-3)", cursor: "pointer", transition: "all 0.15s" }}>
          設定快照歷史 {snapshots.length > 0 ? `(${snapshots.length})` : ""} {snapshotPanelOpen ? "▲" : "▼"}
        </button>
      </div>

      {/* ── Snapshot history panel ── */}
      {snapshotPanelOpen && (
        <div style={{ borderTop: "1px solid var(--border)", background: "var(--bg-1)",
          padding: "12px 20px", flexShrink: 0, maxHeight: 280, overflowY: "auto" }}>
          {snapshots.length === 0 ? (
            <div style={{ color: "var(--text-3)", fontSize: 12, textAlign: "center", padding: "16px 0" }}>
              尚無儲存的快照
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {snapshots.map((snap, idx) => {
                const prevSnap = snapshots[idx + 1] ?? null;
                const isExpanded = expandedSnapId === snap.id;
                const overrideCount = Object.keys(snap.overrides ?? {}).length;
                const diffItems = diffSnapshots(asOverrides(prevSnap?.overrides ?? {}), asOverrides(snap.overrides ?? {}));
                return (
                  <div key={snap.id} style={{ borderRadius: 6, border: `1px solid ${isExpanded ? "var(--accent)" : "var(--border)"}`, overflow: "hidden", background: "var(--bg-2)", transition: "border-color 0.15s" }}>
                    {/* Header row */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px" }}>
                      <button onClick={() => setExpandedSnapId(isExpanded ? null : snap.id)}
                        style={{ width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer", color: "var(--text-3)", fontSize: 9, flexShrink: 0, transition: "transform 0.15s", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>
                        ▼
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {snap.name}
                        </div>
                        <div style={{ display: "flex", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 10, color: "var(--text-3)" }}>
                            {new Date(snap.createdAt).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <span style={{ fontSize: 10, color: "var(--text-3)" }}>{overrideCount} 個覆蓋</span>
                          {diffItems.length > 0 && (
                            <span style={{ fontSize: 10, fontWeight: 600, color: "#fbbf24" }}>△ {diffItems.length} 項變更</span>
                          )}
                          {diffItems.length === 0 && idx < snapshots.length - 1 && (
                            <span style={{ fontSize: 10, color: "var(--text-3)" }}>= 與前版相同</span>
                          )}
                        </div>
                      </div>
                      <button onClick={() => restoreMut.mutate(snap.id)} disabled={restoreMut.isPending}
                        style={{ fontSize: 11, padding: "3px 10px", borderRadius: 4, border: "1px solid var(--border)",
                          background: "var(--accent-dim)", color: "var(--accent)", cursor: "pointer", flexShrink: 0 }}>
                        還原
                      </button>
                      <button onClick={() => deleteMut.mutate(snap.id)} disabled={deleteMut.isPending}
                        style={{ fontSize: 11, padding: "3px 8px", borderRadius: 4, border: "1px solid var(--border)",
                          background: "transparent", color: "var(--text-3)", cursor: "pointer", flexShrink: 0 }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--error,#f87171)"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--text-3)"; }}>
                        刪除
                      </button>
                    </div>
                    {/* Expanded diff */}
                    {isExpanded && (
                      <SnapshotDiff snap={snap} prevSnap={prevSnap} rules={rules} />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Skills tab ────────────────────────────────────────────────────────────────
function SkillCard({ skill }: { skill: SkillInfo }) {
  const qc = useQueryClient();
  const { showToast } = useStore();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(skill.content ?? "");
  const [saving, setSaving] = useState(false);
  const isUser = skill.source === "user";

  async function saveEdit() {
    setSaving(true);
    try {
      await api.skills.update(skill.name, draft);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["skills"] }),
        qc.invalidateQueries({ queryKey: ["rules"] }),
      ]);
      showToast(`✓ ${skill.name} 已儲存`);
      setEditing(false);
    } catch (e) { showToast(`儲存失敗: ${String(e)}`); }
    finally { setSaving(false); }
  }

  function cancelEdit() {
    setDraft(skill.content ?? "");
    setEditing(false);
  }

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", background: "var(--bg-1)" }}>
      {/* Header */}
      <div style={{ padding: "12px 16px", background: "var(--bg-2)",
        display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Name row */}
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700,
              color: isUser ? "#fbbf24" : "var(--text-1)" }}>
              {isUser ? "✦" : "⬡"} {skill.name}
            </span>
            <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 6, border: "1px solid var(--border)",
              background: "var(--bg-4)", color: "var(--text-3)" }}>{skill.domain}</span>
            <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 6, border: isUser
              ? "1px solid rgba(251,191,36,0.4)" : "1px solid var(--border)",
              background: isUser ? "rgba(251,191,36,0.1)" : "var(--bg-4)",
              color: isUser ? "#fbbf24" : "var(--text-3)" }}>
              {isUser ? "自訂" : "內建"}
            </span>
            {skill.tags.map(t => (
              <span key={t} style={{ fontSize: 10, padding: "1px 7px", borderRadius: 6,
                background: "var(--accent-dim)", color: "var(--accent)", border: "1px solid var(--accent)" }}>{t}</span>
            ))}
          </div>

          {/* Stats */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: skill.ruleCount > 0 ? "var(--warning)" : "var(--text-3)" }}>
              {skill.ruleCount > 0 ? `${skill.ruleCount} 條規則` : "無規則定義"}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {isUser && skill.content && !editing && (
            <button onClick={() => { setOpen(true); setEditing(true); }}
              style={{ fontSize: 11, padding: "3px 10px", borderRadius: 5,
                border: "1px solid rgba(251,191,36,0.4)", background: "rgba(251,191,36,0.08)",
                color: "#fbbf24", cursor: "pointer", transition: "all 0.15s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(251,191,36,0.18)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(251,191,36,0.08)"; }}>
              ✎ 編輯
            </button>
          )}
          {skill.content && !editing && (
            <button onClick={() => setOpen(v => !v)}
              style={{ fontSize: 11, padding: "3px 10px", borderRadius: 5,
                border: "1px solid var(--border)", background: "transparent",
                color: "var(--text-3)", cursor: "pointer", transition: "all 0.15s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--text-1)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--text-3)"; }}>
              {open ? "收合 ▲" : "說明 ▼"}
            </button>
          )}
          {isUser && !editing && (
            <button onClick={async () => {
              if (!window.confirm(`確定刪除 Skill「${skill.name}」？`)) return;
              try {
                await api.skills.delete(skill.name);
                await Promise.all([qc.invalidateQueries({ queryKey: ["skills"] }), qc.invalidateQueries({ queryKey: ["rules"] })]);
                showToast(`已刪除 ${skill.name}`);
              } catch (e) { showToast(`刪除失敗: ${String(e)}`); }
            }}
              style={{ fontSize: 11, padding: "3px 8px", borderRadius: 5,
                border: "1px solid var(--border)", background: "transparent",
                color: "var(--text-3)", cursor: "pointer" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--error,#f87171)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--text-3)"; }}>
              刪除
            </button>
          )}
        </div>
      </div>

      {/* Rules chips */}
      {skill.rules.length > 0 && (
        <div style={{ padding: "8px 16px", display: "flex", gap: 6, flexWrap: "wrap",
          borderTop: "1px solid var(--border)", background: "var(--bg-1)" }}>
          {skill.rules.map(r => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 10px",
              borderRadius: 6, background: "var(--bg-3)", border: "1px solid var(--border)" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)" }}>{r.id}</span>
              <SevBadge v={r.severity} />
              <GroupPill g={r.group} />
            </div>
          ))}
        </div>
      )}

      {/* Expanded / Edit section */}
      {open && skill.content && (
        <div style={{ borderTop: "1px solid var(--border)", background: "var(--bg-1)" }}>
          {editing ? (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                spellCheck={false}
                style={{ margin: 0, padding: "12px 16px", fontSize: 12, lineHeight: 1.7,
                  color: "var(--text-1)", background: "var(--bg-2)",
                  fontFamily: "var(--font-mono)", whiteSpace: "pre", resize: "vertical",
                  border: "none", borderBottom: "1px solid var(--border)",
                  outline: "none", minHeight: 260, width: "100%", boxSizing: "border-box" }}
              />
              <div style={{ display: "flex", gap: 8, padding: "8px 12px",
                background: "var(--bg-2)", alignItems: "center" }}>
                <button onClick={() => void saveEdit()} disabled={saving}
                  style={{ fontSize: 11, padding: "4px 14px", borderRadius: 5,
                    border: "none", background: "var(--accent)", color: "#fff",
                    cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1, fontWeight: 700 }}>
                  {saving ? "儲存中…" : "✓ 儲存"}
                </button>
                <button onClick={cancelEdit} disabled={saving}
                  style={{ fontSize: 11, padding: "4px 12px", borderRadius: 5,
                    border: "1px solid var(--border)", background: "transparent",
                    color: "var(--text-3)", cursor: "pointer" }}>
                  取消
                </button>
                <span style={{ fontSize: 10, color: "var(--text-3)", marginLeft: 4 }}>
                  儲存後自動重新載入規則
                </span>
              </div>
            </div>
          ) : (
            <div style={{ maxHeight: 360, overflowY: "auto" }}>
              <pre style={{ margin: 0, padding: "12px 16px", fontSize: 12, lineHeight: 1.7, color: "var(--text-2)",
                fontFamily: "inherit", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {skill.content}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Create Skill Modal ────────────────────────────────────────────────────────
function CreateSkillModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { showToast } = useStore();
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("general");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  function addTag() {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, "-");
    if (t && !tags.includes(t)) setTags(prev => [...prev, t]);
    setTagInput("");
  }

  async function create() {
    if (!name.trim()) { showToast("請填寫 Skill 名稱"); return; }
    setSaving(true);
    try {
      await api.skills.create({ name: name.trim(), domain: domain.trim() || "general", tags, description: description.trim() });
      showToast(`✓ Skill「${name.trim()}」已建立`);
      onCreated();
      onClose();
    } catch (e) { showToast(`建立失敗: ${String(e)}`); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={onClose}>
      <div style={{ background: "var(--bg-1)", border: "1px solid var(--border-light)", borderRadius: 12, width: "min(500px,94vw)", padding: 24, display: "flex", flexDirection: "column", gap: 14, boxShadow: "0 16px 48px rgba(0,0,0,0.5)" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>✦ 建立新 Skill</div>

        {/* Name */}
        <div>
          <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>Skill 名稱</label>
          <input className="form-input" placeholder="例：Custom Naming Rules" value={name} onChange={e => setName(e.target.value)} />
        </div>

        {/* Domain */}
        <div>
          <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>Domain</label>
          <input className="form-input" placeholder="general / semiconductor / ..." value={domain} onChange={e => setDomain(e.target.value)} />
        </div>

        {/* Tags */}
        <div>
          <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>Tags</label>
          <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
            {tags.map(t => (
              <span key={t} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, padding: "2px 8px", borderRadius: 6, background: "var(--accent-dim)", color: "var(--accent)", border: "1px solid var(--accent)" }}>
                {t}
                <span onClick={() => setTags(prev => prev.filter(x => x !== t))} style={{ cursor: "pointer", opacity: 0.7, fontSize: 11 }}>✕</span>
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input className="form-input" placeholder="輸入 tag 後按 Enter 或＋" style={{ flex: 1 }}
              value={tagInput} onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }} />
            <button className="btn btn-ghost" onClick={addTag} style={{ fontSize: 11, padding: "4px 10px", flexShrink: 0 }}>＋</button>
          </div>
        </div>

        {/* Description */}
        <div>
          <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>說明（可選）</label>
          <textarea className="form-input" placeholder="這個 Skill 的用途..." value={description} onChange={e => setDescription(e.target.value)}
            style={{ resize: "vertical", minHeight: 60, fontFamily: "inherit", lineHeight: 1.5 }} />
        </div>

        <div style={{ fontSize: 11, color: "var(--text-3)", background: "var(--bg-3)", borderRadius: 6, padding: "8px 10px" }}>
          建立後，在展開的 Skill 卡片中編輯 Markdown 內容即可新增自訂規則。
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>取消</button>
          <button className="btn btn-primary" onClick={() => void create()} disabled={saving || !name.trim()}>
            {saving ? "建立中…" : "✓ 建立 Skill"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SkillsTab({ skills }: { skills: SkillInfo[] }) {
  const qc = useQueryClient();
  const { showToast } = useStore();
  const [reloading, setReloading] = useState(false);
  const [srcFilter, setSrcFilter] = useState<"all" | "built-in" | "user">("all");
  const [showCreateModal, setShowCreateModal] = useState(false);

  const builtIn = skills.filter(s => s.source === "built-in");
  const user    = skills.filter(s => s.source === "user");
  const visible = srcFilter === "all" ? skills : srcFilter === "built-in" ? builtIn : user;

  async function reload() {
    setReloading(true);
    try {
      await api.reload();
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["skills"] }),
        qc.invalidateQueries({ queryKey: ["rules"] }),
      ]);
      showToast("✓ Skills 與規則已重新載入");
    } catch (e) { showToast(`載入失敗: ${String(e)}`); }
    finally { setReloading(false); }
  }

  const totalRules = skills.reduce((n, s) => n + s.ruleCount, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      {/* ── Toolbar ── */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", background: "var(--bg-2)",
        display: "flex", alignItems: "center", gap: 10, flexShrink: 0, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)" }}>{skills.length} 個 Skill</span>
        {totalRules > 0 && (
          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 8,
            background: "rgba(251,191,36,0.12)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)" }}>
            共 {totalRules} 條自訂規則
          </span>
        )}

        <div style={{ flex: 1 }} />

        {/* Source filter */}
        <div style={{ display: "flex", borderRadius: 6, border: "1px solid var(--border)", overflow: "hidden" }}>
          {([
            { k: "all" as const,      label: `全部 ${skills.length}` },
            { k: "built-in" as const, label: `⬡ 內建 ${builtIn.length}` },
            { k: "user" as const,     label: `✦ 自訂 ${user.length}` },
          ]).map(({ k, label }) => (
            <button key={k} onClick={() => setSrcFilter(k)}
              style={{ padding: "3px 10px", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600,
                background: srcFilter === k ? "var(--accent-dim)" : "var(--bg-3)",
                color: srcFilter === k ? "var(--accent)" : "var(--text-3)", transition: "all 0.12s" }}>
              {label}
            </button>
          ))}
        </div>

        <button onClick={() => setShowCreateModal(true)}
          style={{ fontSize: 11, padding: "5px 14px", borderRadius: 6,
            border: "1px solid rgba(251,191,36,0.5)", background: "rgba(251,191,36,0.1)",
            color: "#fbbf24", cursor: "pointer", fontWeight: 700 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(251,191,36,0.2)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(251,191,36,0.1)"; }}>
          ＋ 新建 Skill
        </button>

        <button onClick={() => void reload()} disabled={reloading}
          style={{ fontSize: 11, padding: "5px 12px", borderRadius: 6,
            border: "1px solid var(--border)", background: "var(--bg-3)",
            color: "var(--text-2)", cursor: reloading ? "not-allowed" : "pointer",
            opacity: reloading ? 0.5 : 1, transition: "all 0.15s" }}
          onMouseEnter={e => { if (!reloading) (e.currentTarget as HTMLElement).style.background = "var(--bg-4)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "var(--bg-3)"; }}>
          {reloading ? "載入中…" : "↺ 重新載入"}
        </button>
      </div>
      {showCreateModal && (
        <CreateSkillModal
          onClose={() => setShowCreateModal(false)}
          onCreated={async () => {
            await Promise.all([qc.invalidateQueries({ queryKey: ["skills"] }), qc.invalidateQueries({ queryKey: ["rules"] })]);
          }}
        />
      )}

      {/* ── Hint ── */}
      <div style={{ padding: "8px 20px", fontSize: 11, color: "var(--text-3)",
        borderBottom: "1px solid var(--border)", background: "var(--bg-2)", flexShrink: 0 }}>
        自訂規則：將 <code style={{ background: "var(--bg-4)", padding: "1px 5px", borderRadius: 3, color: "var(--accent)" }}>.md</code> 放入{" "}
        <code style={{ background: "var(--bg-4)", padding: "1px 5px", borderRadius: 3, color: "var(--text-1)" }}>data/skills/</code>{" "}
        後點擊「↺ 重新載入」即可生效，無需重啟伺服器
      </div>

      {/* ── Skill list ── */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
      <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
        {visible.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--text-3)", fontSize: 13, paddingTop: 40 }}>
            <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.4 }}>✦</div>
            {srcFilter === "user" ? "尚未建立自訂 Skill" : "無 Skill"}
          </div>
        ) : (
          visible.map(s => <SkillCard key={s.name} skill={s} />)
        )}
      </div>
      </div>
    </div>
  );
}

// ── Layers Tab ────────────────────────────────────────────────────────────────
function LayerEditor({ title, layers, onChange }: { title: string; layers: LayerDef[]; onChange: (next: LayerDef[]) => void }) {
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState("");

  function startEdit(i: number) { setEditIdx(i); setDraft(layers[i]?.label ?? ""); }
  function commit(i: number) {
    if (draft.trim()) {
      const next = layers.map((l, idx) => idx === i ? { ...l, label: draft.trim() } : l);
      onChange(next);
    }
    setEditIdx(null);
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {layers.map((l, i) => (
          <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-2)" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)", minWidth: 80 }}>{l.id}</span>
            {editIdx === i ? (
              <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
                onBlur={() => commit(i)} onKeyDown={e => { if (e.key === "Enter") commit(i); if (e.key === "Escape") setEditIdx(null); }}
                style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--text-1)", background: "var(--bg-3)", border: "1px solid var(--accent)", borderRadius: 4, padding: "3px 8px", outline: "none" }} />
            ) : (
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--text-1)", cursor: "text", padding: "3px 8px", borderRadius: 4, border: "1px solid transparent" }}
                onClick={() => startEdit(i)}
                onMouseEnter={e => (e.currentTarget.style.border = "1px solid var(--border-light)")}
                onMouseLeave={e => (e.currentTarget.style.border = "1px solid transparent")}>
                {l.label}
              </span>
            )}
            <span style={{ fontSize: 10, color: "var(--text-3)" }}>← 點擊編輯</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LayersTab() {
  const qc = useQueryClient();
  const { showToast } = useStore();
  const { data: layerSettings } = useQuery({ queryKey: ["layer-settings"], queryFn: () => api.settings.getLayers() });
  const [localSchema, setLocalSchema] = useState<LayerDef[] | null>(null);
  const [localDict, setLocalDict]     = useState<LayerDef[] | null>(null);
  const [saving, setSaving] = useState(false);

  const schemaLayers = localSchema ?? layerSettings?.schemaLayers ?? [];
  const dictLayers   = localDict   ?? layerSettings?.dictLayers   ?? [];

  async function save() {
    setSaving(true);
    try {
      await api.settings.updateLayers({ schemaLayers: localSchema ?? schemaLayers, dictLayers: localDict ?? dictLayers });
      await qc.invalidateQueries({ queryKey: ["layer-settings"] });
      setLocalSchema(null); setLocalDict(null);
      showToast("✓ 分層名稱已儲存");
    } catch (e) { showToast(`儲存失敗: ${String(e)}`); }
    finally { setSaving(false); }
  }

  const dirty = localSchema !== null || localDict !== null;

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px", maxWidth: 600 }}>
      <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 24 }}>
        自訂各分層的顯示名稱。修改後點擊「儲存」即套用至全站（字典、規則、Schema 設定）。
      </div>
      <LayerEditor title="Schema 分層" layers={schemaLayers}
        onChange={next => setLocalSchema(next)} />
      <LayerEditor title="字典 / 規則分層" layers={dictLayers}
        onChange={next => setLocalDict(next)} />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        {dirty && <button className="btn btn-ghost" onClick={() => { setLocalSchema(null); setLocalDict(null); }}>還原</button>}
        <button className="btn btn-primary" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? "儲存中…" : "儲存"}
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function RulesPage() {
  const [tab, setTab] = useState<"rules" | "skills" | "layers">("rules");

  const { data: rulesData, isLoading: rulesLoading } = useQuery({
    queryKey: ["rules"],
    queryFn: () => api.rules.list(),
  });
  const { data: skillsData, isLoading: skillsLoading } = useQuery({
    queryKey: ["skills"],
    queryFn: () => api.skills.list(),
  });

  const rules  = rulesData?.rules   ?? [];
  const skills = skillsData?.skills ?? [];

  const disabledCount  = rules.filter(r => !r.enabled).length;
  const skillRuleCount = rules.filter(r => r.source === "skill").length;
  const userSkillCount = skills.filter(s => s.source === "user").length;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* ── Tab bar ── */}
      <div style={{ borderBottom: "1px solid var(--border)", display: "flex", alignItems: "stretch",
        padding: "0 20px", background: "var(--bg-2)", flexShrink: 0 }}>
        {([
          {
            id: "rules" as const, label: "規則設定",
            meta: [
              rules.length > 0 && `${rules.length} 條`,
              disabledCount  > 0 && `${disabledCount} 停用`,
              skillRuleCount > 0 && `${skillRuleCount} Skill`,
            ].filter(Boolean).join(" · "),
          },
          {
            id: "skills" as const, label: "Skills",
            meta: [
              skills.length > 0 && `${skills.length} 個`,
              userSkillCount > 0 && `${userSkillCount} 自訂`,
            ].filter(Boolean).join(" · "),
          },
          { id: "layers" as const, label: "分層設定", meta: "" },
        ]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: "12px 0", marginRight: 28, border: "none", background: "transparent",
              cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2,
              borderBottom: tab === t.id ? "2px solid var(--accent)" : "2px solid transparent",
              marginBottom: -1, transition: "all 0.15s" }}>
            <span style={{ fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? "var(--text-1)" : "var(--text-3)" }}>{t.label}</span>
            {t.meta && (
              <span style={{ fontSize: 10, color: tab === t.id ? "var(--accent)" : "var(--text-3)" }}>{t.meta}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {tab === "rules" ? (
          rulesLoading
            ? <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)" }}>載入中…</div>
            : <RulesTab rules={rules} skills={skills} />
        ) : tab === "skills" ? (
          skillsLoading
            ? <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)" }}>載入中…</div>
            : <SkillsTab skills={skills} />
        ) : (
          <LayersTab />
        )}
      </div>
    </div>
  );
}
