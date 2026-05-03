import React, { useState, Fragment } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api, type RuleDetail, type SkillInfo, type LlmSettings } from "../api.js";
import { useStore } from "../store.js";

// ── shared helpers ────────────────────────────────────────────────────────────
const GROUP_CFG = {
  naming:    { label: "命名",   color: "#60a5fa" },
  semantic:  { label: "語意",   color: "#4ade80" },
  structure: { label: "結構",   color: "#f59e0b" },
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

// ── Rules tab ─────────────────────────────────────────────────────────────────
function RulesTab({ rules }: { rules: RuleDetail[] }) {
  const qc = useQueryClient();
  const { showToast } = useStore();
  const [busy, setBusy] = useState<string | null>(null);
  const [group, setGroup] = useState<"all" | "naming" | "semantic" | "structure">("all");
  const [srcFilter, setSrcFilter] = useState<"all" | "built-in" | "skill">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const visible = rules.filter(r =>
    (group === "all" || r.group === group) &&
    (srcFilter === "all" || (r.source ?? "built-in") === srcFilter)
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

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
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
                        <div style={{ padding: "12px 16px 14px 48px", borderTop: "1px dashed var(--border)" }}>
                          {hasConfig ? (
                            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                              <div style={{ minWidth: 200, maxWidth: 400 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)",
                                  textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 5 }}>目前設定</div>
                                <pre style={{ margin: 0, fontSize: 11, fontFamily: "var(--font-mono)",
                                  color: "var(--text-2)", background: "var(--bg-3)", border: "1px solid var(--border)",
                                  padding: "8px 10px", borderRadius: 6, whiteSpace: "pre-wrap", wordBreak: "break-word",
                                  maxHeight: 160, overflowY: "auto" }}>
                                  {JSON.stringify(r.config, null, 2)}
                                </pre>
                              </div>
                              <div style={{ minWidth: 200, maxWidth: 400 }}>
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
    </div>
  );
}

// ── Skills tab ────────────────────────────────────────────────────────────────
function SkillCard({ skill }: { skill: SkillInfo }) {
  const [open, setOpen] = useState(false);
  const isUser = skill.source === "user";

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
          <div style={{ display: "flex", gap: 10, alignItems: "center', flexWrap: 'wrap" }}>
            <span style={{ fontSize: 11, color: skill.ruleCount > 0 ? "var(--warning)" : "var(--text-3)" }}>
              {skill.ruleCount > 0 ? `${skill.ruleCount} 條規則` : "無規則定義"}
            </span>
          </div>
        </div>

        {/* Expand button */}
        {skill.content && (
          <button onClick={() => setOpen(v => !v)}
            style={{ fontSize: 11, padding: "3px 10px", borderRadius: 5, flexShrink: 0,
              border: "1px solid var(--border)", background: "transparent",
              color: "var(--text-3)", cursor: "pointer", transition: "all 0.15s" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--text-1)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--text-3)"; }}>
            {open ? "收合 ▲" : "說明 ▼"}
          </button>
        )}
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

      {/* Expanded description */}
      {open && skill.content && (
        <div style={{ borderTop: "1px solid var(--border)", background: "var(--bg-1)",
          maxHeight: 360, overflowY: "auto" }}>
          <pre style={{ margin: 0, padding: "12px 16px", fontSize: 12, lineHeight: 1.7, color: "var(--text-2)",
            fontFamily: "inherit", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {skill.content}
          </pre>
        </div>
      )}
    </div>
  );
}

function SkillsTab({ skills }: { skills: SkillInfo[] }) {
  const qc = useQueryClient();
  const { showToast } = useStore();
  const [reloading, setReloading] = useState(false);
  const [srcFilter, setSrcFilter] = useState<"all" | "built-in" | "user">("all");

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

// ── LLM Settings tab ─────────────────────────────────────────────────────────
function FieldRow({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 20 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", letterSpacing: "0.3px" }}>{label}</label>
      {children}
      {hint && <span style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.5 }}>{hint}</span>}
    </div>
  );
}

function LlmSettingsTab({ initial }: { initial: Partial<LlmSettings> }) {
  const qc = useQueryClient();
  const { showToast } = useStore();
  const [form, setForm] = useState<Partial<LlmSettings>>(initial);
  const [showKey, setShowKey] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

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
    onSuccess: (r) => {
      setTestResult(r);
      showToast(r.ok ? "✓ 連線成功" : `連線失敗: ${r.message}`);
    },
    onError: (e) => showToast(`測試失敗: ${String(e)}`),
  });

  const set = <K extends keyof LlmSettings>(k: K, v: LlmSettings[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const provider = form.provider ?? "anthropic";
  const isOpenAI = provider === "openai";

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px", maxWidth: 560 }}>
      <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 0, marginBottom: 24, lineHeight: 1.6 }}>
        設定 AI 分析與命名建議所使用的語言模型 API。儲存後立即生效，無需重啟伺服器。
        留空的欄位將使用 <code style={{ background: "var(--bg-3)", padding: "1px 5px", borderRadius: 3 }}>.env.local</code> 設定。
      </p>

      {/* Provider */}
      <FieldRow label="API 類型" hint={isOpenAI ? "相容 OpenAI 格式的 API（如 Azure、Ollama、私有部署模型）" : "Anthropic Claude API（預設）"}>
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

      {/* Base URL (only for openai) */}
      {isOpenAI && (
        <FieldRow label="API Base URL" hint="例如：https://your-company-api.com/v1">
          <input value={form.baseUrl ?? ""} onChange={e => set("baseUrl", e.target.value)}
            placeholder="https://..."
            style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)",
              background: "var(--bg-3)", color: "var(--text-1)", fontSize: 13,
              fontFamily: "var(--font-mono)", outline: "none", width: "100%", boxSizing: "border-box" }} />
        </FieldRow>
      )}

      {/* API Key */}
      <FieldRow label="API Key" hint="輸入新值即可覆蓋；留空保持現有設定不變">
        <div style={{ display: "flex", gap: 6 }}>
          <input value={form.apiKey ?? ""} onChange={e => set("apiKey", e.target.value)}
            type={showKey ? "text" : "password"}
            placeholder={initial.apiKey ? "••••••（已設定，輸入覆蓋）" : "sk-..."}
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

      {/* Model */}
      <FieldRow label="模型名稱" hint={isOpenAI ? "輸入你的 API 支援的模型 ID" : "例如：claude-sonnet-4-6（留空使用預設）"}>
        <input value={form.model ?? ""} onChange={e => set("model", e.target.value)}
          placeholder={isOpenAI ? "gpt-4o / your-model-id" : "claude-sonnet-4-6"}
          style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)",
            background: "var(--bg-3)", color: "var(--text-1)", fontSize: 13,
            fontFamily: "var(--font-mono)", outline: "none", width: "100%", boxSizing: "border-box" }} />
      </FieldRow>

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
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
          <span style={{ fontSize: 12, fontWeight: 600,
            color: testResult.ok ? "#4ade80" : "#f87171" }}>
            {testResult.ok ? "✓ 連線成功" : `✗ ${testResult.message}`}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function RulesPage() {
  const [tab, setTab] = useState<"rules" | "skills" | "llm">("rules");

  const { data: rulesData, isLoading: rulesLoading } = useQuery({
    queryKey: ["rules"],
    queryFn: () => api.rules.list(),
  });
  const { data: skillsData, isLoading: skillsLoading } = useQuery({
    queryKey: ["skills"],
    queryFn: () => api.skills.list(),
  });
  const { data: llmData, isLoading: llmLoading } = useQuery({
    queryKey: ["llm-settings"],
    queryFn: () => api.settings.getLlm(),
  });

  const rules  = rulesData?.rules   ?? [];
  const skills = skillsData?.skills ?? [];
  const llmSettings: Partial<LlmSettings> = llmData?.settings ?? {};

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
          {
            id: "llm" as const, label: "LLM 設定",
            meta: llmSettings.provider ? llmSettings.provider : "",
          },
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
            : <RulesTab rules={rules} />
        ) : tab === "skills" ? (
          skillsLoading
            ? <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)" }}>載入中…</div>
            : <SkillsTab skills={skills} />
        ) : (
          llmLoading
            ? <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)" }}>載入中…</div>
            : <LlmSettingsTab key={JSON.stringify(llmSettings)} initial={llmSettings} />
        )}
      </div>
    </div>
  );
}
