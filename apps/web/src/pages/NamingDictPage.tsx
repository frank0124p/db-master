import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useStore } from "../store.js";
import { api, type NamingEntry } from "../api.js";

const TAG_COLORS: Record<string, { bg: string; color: string }> = {
  識別碼:   { bg: "rgba(99,179,237,0.15)",  color: "#63B3ED" },
  量測值:   { bg: "rgba(104,211,145,0.15)", color: "#68D391" },
  時間戳:   { bg: "rgba(246,173,85,0.15)",  color: "#F6AD55" },
  狀態:     { bg: "rgba(197,132,246,0.15)", color: "#C584F6" },
  參考鍵:   { bg: "rgba(251,113,133,0.15)", color: "#FB7185" },
  數量:     { bg: "rgba(94,234,212,0.15)",  color: "#5EEAD4" },
  文字描述: { bg: "rgba(248,213,126,0.15)", color: "#F8D57E" },
  布林旗標: { bg: "rgba(148,163,184,0.15)", color: "#94A3B8" },
  設備相關: { bg: "rgba(129,140,248,0.15)", color: "#818CF8" },
  批次相關: { bg: "rgba(52,211,153,0.15)",  color: "#34D399" },
  產品相關: { bg: "rgba(251,146,60,0.15)",  color: "#FB923C" },
  製程相關: { bg: "rgba(167,139,250,0.15)", color: "#A78BFA" },
  良率品質: { bg: "rgba(74,222,128,0.15)",  color: "#4ADE80" },
  維護保養: { bg: "rgba(251,191,36,0.15)",  color: "#FBBF24" },
  操作人員: { bg: "rgba(56,189,248,0.15)",  color: "#38BDF8" },
};

const ALL_TAGS = Object.keys(TAG_COLORS);

function TagChip({ tag, onRemove }: { tag: string; onRemove?: () => void }) {
  const c = TAG_COLORS[tag] ?? { bg: "var(--bg-4)", color: "var(--text-3)" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 7px", borderRadius: 10, fontSize: 10, fontWeight: 500, background: c.bg, color: c.color, border: `1px solid ${c.color}30` }}>
      {tag}
      {onRemove && (
        <span onClick={onRemove} style={{ cursor: "pointer", opacity: 0.7, lineHeight: 1, fontSize: 11 }}>×</span>
      )}
    </span>
  );
}

function DefinitionPanel({ entry, onClose }: { entry: NamingEntry; onClose: () => void }) {
  const qc = useQueryClient();
  const { showToast } = useStore();
  const [manualDesc, setManualDesc] = useState(entry.description ?? "");
  const [tags, setTags] = useState<string[]>(entry.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);

  const suggestMut = useMutation({
    mutationFn: () => api.naming.suggestAI(entry.id),
    onSuccess: (updated) => {
      qc.setQueryData<NamingEntry[]>(["naming"], old =>
        old?.map(e => e.id === updated.id ? updated : e) ?? old
      );
      setTags(updated.tags);
      showToast("✓ AI 已更新建議定義與標籤");
    },
    onError: () => showToast("AI 建議失敗，請稍後再試"),
  });

  async function saveManual() {
    setSaving(true);
    try {
      const patch: Parameters<typeof api.naming.update>[1] = { tags };
      if (manualDesc) patch.description = manualDesc;
      const updated = await api.naming.update(entry.id, patch);
      qc.setQueryData<NamingEntry[]>(["naming"], old =>
        old?.map(e => e.id === updated.id ? updated : e) ?? old
      );
      showToast("✓ 已儲存欄位定義");
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function addTag(tag: string) {
    if (!tags.includes(tag)) setTags([...tags, tag]);
    setTagInput("");
  }

  const filteredSuggest = tagInput
    ? ALL_TAGS.filter(t => t.includes(tagInput) && !tags.includes(t))
    : [];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "var(--bg-2)", border: "1px solid var(--border-light)", borderRadius: 12, width: 560, maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden" }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700, color: "var(--success)" }}>{entry.stdName}</span>
            <span style={{ fontSize: 13, color: "var(--text-2)" }}>{entry.concept}</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
            {entry.aliases.map(a => (
              <span key={a} style={{ fontFamily: "var(--font-mono)", fontSize: 10, padding: "1px 6px", borderRadius: 3, background: "var(--bg-4)", color: "var(--text-3)", border: "1px solid var(--border)" }}>{a}</span>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Tags */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>分類標籤</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
              {tags.map(t => <TagChip key={t} tag={t} onRemove={() => setTags(tags.filter(x => x !== t))} />)}
              {tags.length === 0 && <span style={{ fontSize: 11, color: "var(--text-3)" }}>尚無標籤</span>}
            </div>
            <div style={{ position: "relative" }}>
              <input
                className="form-input"
                placeholder="輸入標籤名稱快速搜尋…"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                style={{ fontSize: 12, padding: "5px 10px" }}
              />
              {filteredSuggest.length > 0 && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 6, zIndex: 10, marginTop: 2, overflow: "hidden" }}>
                  {filteredSuggest.map(t => (
                    <div key={t} onClick={() => addTag(t)}
                      style={{ padding: "6px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                      onMouseEnter={ev => (ev.currentTarget as HTMLDivElement).style.background = "var(--bg-4)"}
                      onMouseLeave={ev => (ev.currentTarget as HTMLDivElement).style.background = "transparent"}>
                      <TagChip tag={t} />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
              {ALL_TAGS.filter(t => !tags.includes(t)).map(t => (
                <span key={t} onClick={() => addTag(t)}
                  style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", padding: "2px 7px", borderRadius: 10, fontSize: 10, background: "var(--bg-4)", color: "var(--text-3)", border: "1px solid var(--border)" }}
                  onMouseEnter={ev => { const el = ev.currentTarget as HTMLSpanElement; const c = TAG_COLORS[t]; if (c) { el.style.background = c.bg; el.style.color = c.color; } }}
                  onMouseLeave={ev => { const el = ev.currentTarget as HTMLSpanElement; el.style.background = "var(--bg-4)"; el.style.color = "var(--text-3)"; }}>
                  + {t}
                </span>
              ))}
            </div>
          </div>

          {/* Two-panel: AI suggestion vs manual */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

            {/* AI 建議定義 */}
            <div style={{ background: "var(--bg-3)", borderRadius: 8, border: "1px solid var(--border)", overflow: "hidden" }}>
              <div style={{ padding: "8px 12px", background: "rgba(123,140,255,0.08)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13 }}>✦</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.5px" }}>AI 建議定義</span>
                </div>
                <button
                  onClick={() => suggestMut.mutate()}
                  disabled={suggestMut.isPending}
                  style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid var(--accent)", background: "transparent", color: "var(--accent)", fontSize: 10, cursor: suggestMut.isPending ? "not-allowed" : "pointer", opacity: suggestMut.isPending ? 0.6 : 1 }}>
                  {suggestMut.isPending ? "生成中…" : "重新生成"}
                </button>
              </div>
              <div style={{ padding: 12, minHeight: 120 }}>
                {entry.aiDescription ? (
                  <p style={{ fontSize: 12, color: "var(--text-1)", lineHeight: 1.7, margin: 0 }}>{entry.aiDescription}</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 100, gap: 8, color: "var(--text-3)" }}>
                    <span style={{ fontSize: 20 }}>✦</span>
                    <span style={{ fontSize: 11 }}>尚未生成 AI 定義</span>
                    <button
                      onClick={() => suggestMut.mutate()}
                      disabled={suggestMut.isPending}
                      style={{ padding: "4px 12px", borderRadius: 4, border: "1px solid var(--accent)", background: "var(--accent-dim)", color: "var(--accent)", fontSize: 11, cursor: "pointer" }}>
                      立即生成
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* 手動定義 */}
            <div style={{ background: "var(--bg-3)", borderRadius: 8, border: "1px solid var(--border)", overflow: "hidden" }}>
              <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 13 }}>✎</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.5px" }}>手動定義</span>
              </div>
              <textarea
                value={manualDesc}
                onChange={e => setManualDesc(e.target.value)}
                placeholder="輸入此欄位的業務定義、資料規則或使用說明…"
                style={{
                  width: "100%", minHeight: 120, padding: 12,
                  background: "transparent", border: "none", resize: "vertical",
                  fontSize: 12, color: "var(--text-1)", lineHeight: 1.7,
                  fontFamily: "inherit", outline: "none", boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          {/* Diff hint when both exist */}
          {entry.aiDescription && manualDesc && entry.aiDescription !== manualDesc && (
            <div style={{ fontSize: 11, color: "var(--text-3)", background: "var(--bg-3)", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)" }}>
              手動定義將覆蓋 AI 建議作為最終顯示定義。AI 建議仍保留以供參考。
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn btn-success" onClick={saveManual} disabled={saving}>
            {saving ? "儲存中…" : "儲存定義"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EntryModal({ entry, onClose }: { entry?: NamingEntry; onClose: () => void }) {
  const qc = useQueryClient();
  const { showToast } = useStore();
  const isEdit = !!entry;
  const [form, setForm] = useState({
    concept: entry?.concept ?? "",
    std_name: entry?.stdName ?? "",
    aliases: entry?.aliases.join(", ") ?? "",
    domain: entry?.domain ?? "semiconductor",
  });

  async function save() {
    const aliases = form.aliases.split(",").map(s => s.trim()).filter(Boolean);
    if (isEdit) {
      await api.naming.update(entry!.id, { concept: form.concept, std_name: form.std_name, aliases, domain: form.domain });
      showToast(`✓ 已更新：${form.std_name}`);
    } else {
      await api.naming.create({ concept: form.concept, std_name: form.std_name, aliases, domain: form.domain });
      showToast(`✓ 已新增詞彙：${form.std_name}`);
    }
    await qc.invalidateQueries({ queryKey: ["naming"] });
    onClose();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "var(--bg-2)", border: "1px solid var(--border-light)", borderRadius: 10, width: 420, padding: 20 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>{isEdit ? "編輯詞彙" : "新增命名詞彙"}</div>
        {[
          { label: "中文概念", key: "concept", placeholder: "e.g. 設備ID" },
          { label: "標準英文名", key: "std_name", placeholder: "e.g. equip_id", mono: true },
          { label: "常見別名（逗號分隔）", key: "aliases", placeholder: "e.g. equipment_id, eqp_id", mono: true },
        ].map(({ label, key, placeholder, mono }) => (
          <div key={key} style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block", textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</label>
            <input className="form-input" placeholder={placeholder} value={(form as Record<string, string>)[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} style={mono ? { fontFamily: "var(--font-mono)" } : {}} />
          </div>
        ))}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block", textTransform: "uppercase", letterSpacing: "0.5px" }}>領域</label>
          <select className="form-input" value={form.domain} onChange={e => setForm({ ...form, domain: e.target.value })}>
            <option value="semiconductor">半導體</option>
            <option value="general">通用</option>
          </select>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn btn-success" onClick={save}>{isEdit ? "儲存" : "新增"}</button>
        </div>
      </div>
    </div>
  );
}

export default function NamingDictPage() {
  const qc = useQueryClient();
  const { showToast } = useStore();
  const [filter, setFilter] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [editEntry, setEditEntry] = useState<NamingEntry | null>(null);
  const [defEntry, setDefEntry] = useState<NamingEntry | null>(null);

  const { data: entries } = useQuery({ queryKey: ["naming"], queryFn: () => api.naming.list() });

  const filtered = entries?.filter(e => filter === "all" || e.domain === filter);

  async function del(e: NamingEntry) {
    if (!confirm(`刪除「${e.stdName}」？`)) return;
    await api.naming.delete(e.id);
    await qc.invalidateQueries({ queryKey: ["naming"] });
    showToast(`已刪除詞彙：${e.stdName}`);
  }

  const domainChips = [
    { key: "all", label: "全部" },
    { key: "semiconductor", label: "半導體" },
    { key: "general", label: "通用" },
  ];

  // Collect all tags in use across entries for filter
  const usedTags = [...new Set(entries?.flatMap(e => e.tags) ?? [])];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: 20, overflowY: "auto", gap: 14 }}>
      {/* Title bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>命名字典</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 4 }}>
            {domainChips.map(c => (
              <button key={c.key} onClick={() => setFilter(c.key)}
                style={{ padding: "4px 10px", borderRadius: 12, fontSize: 11, cursor: "pointer", background: filter === c.key ? "var(--accent-dim)" : "var(--bg-3)", color: filter === c.key ? "var(--accent)" : "var(--text-2)", border: `1px solid ${filter === c.key ? "var(--accent)" : "var(--border)"}`, transition: "all 0.15s" }}>
                {c.label}
              </button>
            ))}
          </div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>＋ 新增詞彙</button>
        </div>
      </div>

      {/* Table */}
      <table style={{ width: "100%", borderCollapse: "collapse", background: "var(--bg-2)", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }}>
        <thead>
          <tr style={{ background: "var(--bg-3)" }}>
            {["概念", "標準英文名", "領域", "最後更新", ""].map((h, i) => (
              <th key={i} style={{ textAlign: "left", padding: "8px 12px", fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: "1px solid var(--border)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered?.map((e, i) => (
            <tr key={e.id}
              style={{ borderBottom: i < filtered.length - 1 ? "1px solid var(--border)" : "none" }}
              onMouseEnter={ev => (ev.currentTarget as HTMLTableRowElement).style.background = "var(--bg-3)"}
              onMouseLeave={ev => (ev.currentTarget as HTMLTableRowElement).style.background = "transparent"}>
              <td style={{ padding: "9px 12px", fontSize: 12, color: "var(--text-1)" }}>{e.concept}</td>
              <td style={{ padding: "9px 12px" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--success)" }}>{e.stdName}</span>
              </td>
              <td style={{ padding: "9px 12px" }}>
                <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 10, background: e.domain === "semiconductor" ? "rgba(123,140,255,0.12)" : "var(--bg-4)", color: e.domain === "semiconductor" ? "var(--accent)" : "var(--text-3)" }}>
                  {e.domain === "semiconductor" ? "半導體" : "通用"}
                </span>
              </td>
              <td style={{ padding: "9px 12px", fontSize: 11, color: "var(--text-3)", whiteSpace: "nowrap" }}>
                {new Date(e.updatedAt).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </td>
              <td style={{ padding: "9px 12px" }}>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => setDefEntry(e)} style={{ padding: "3px 8px", borderRadius: 3, border: "none", fontSize: 11, cursor: "pointer", background: "var(--bg-4)", color: "var(--accent)" }}>詳細定義</button>
                  <button onClick={() => setEditEntry(e)} style={{ padding: "3px 8px", borderRadius: 3, border: "none", fontSize: 11, cursor: "pointer", background: "var(--bg-4)", color: "var(--text-2)" }}>編輯</button>
                  <button onClick={() => del(e)} style={{ padding: "3px 8px", borderRadius: 3, border: "none", fontSize: 11, cursor: "pointer", background: "var(--bg-4)", color: "var(--text-2)" }}
                    onMouseEnter={ev => { (ev.target as HTMLButtonElement).style.background = "var(--error-dim)"; (ev.target as HTMLButtonElement).style.color = "var(--error)"; }}
                    onMouseLeave={ev => { (ev.target as HTMLButtonElement).style.background = "var(--bg-4)"; (ev.target as HTMLButtonElement).style.color = "var(--text-2)"; }}>
                    刪除
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showModal && <EntryModal onClose={() => setShowModal(false)} />}
      {editEntry && <EntryModal entry={editEntry} onClose={() => setEditEntry(null)} />}
      {defEntry && (
        <DefinitionPanel
          entry={entries?.find(e => e.id === defEntry.id) ?? defEntry}
          onClose={() => setDefEntry(null)}
        />
      )}
    </div>
  );
}
