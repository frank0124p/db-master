import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type NamingEntry } from "../api.js";
import { Btn, Card, Input, Modal, Spinner, EmptyState } from "../components/ui.js";
import { useT } from "../i18n.js";

function EntryModal({ entry, onClose }: { entry?: NamingEntry; onClose: () => void }) {
  const qc = useQueryClient();
  const t = useT();
  const isEdit = !!entry;
  const [form, setForm] = useState({
    concept:     entry?.concept ?? "",
    std_name:    entry?.stdName ?? "",
    aliases:     entry?.aliases.join(", ") ?? "",
    domain:      entry?.domain ?? "semiconductor",
    description: entry?.description ?? "",
  });

  const save = useMutation({
    mutationFn: () => {
      const aliases = form.aliases.split(",").map((s) => s.trim()).filter(Boolean);
      const patch: Parameters<typeof api.naming.update>[1] = { concept: form.concept, std_name: form.std_name, aliases, domain: form.domain };
      if (form.description) patch.description = form.description;
      return isEdit
        ? api.naming.update(entry!.id, patch)
        : api.naming.create({ concept: form.concept, std_name: form.std_name, aliases, domain: form.domain, ...(form.description ? { description: form.description } : {}) });
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["naming"] }); onClose(); },
  });

  return (
    <Modal title={isEdit ? t("naming.modal_edit") : t("naming.modal_new")} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--text-3)] mb-1 block">{t("form.concept")}</label>
            <Input placeholder={t("form.concept_ph")} value={form.concept} onChange={(e) => setForm({ ...form, concept: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-[var(--text-3)] mb-1 block">{t("form.std_name")}</label>
            <Input placeholder={t("form.std_name_ph")} value={form.std_name} onChange={(e) => setForm({ ...form, std_name: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="text-xs text-[var(--text-3)] mb-1 block">{t("form.aliases")}</label>
          <Input placeholder={t("form.aliases_ph")} value={form.aliases} onChange={(e) => setForm({ ...form, aliases: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--text-3)] mb-1 block">{t("form.domain")}</label>
            <Input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-[var(--text-3)] mb-1 block">{t("form.description")}</label>
            <Input placeholder={t("form.optional")} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        </div>
        {save.error && <p className="text-xs text-[var(--red)]">{String(save.error)}</p>}
        <div className="flex justify-end gap-2 mt-1">
          <Btn variant="ghost" onClick={onClose}>{t("btn.cancel")}</Btn>
          <Btn variant="primary" onClick={() => save.mutate()} disabled={!form.concept || !form.std_name || save.isPending}>
            {save.isPending ? <Spinner /> : isEdit ? t("btn.save") : t("btn.add_entry")}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

// ── Naming Check Tab ──────────────────────────────────────────────────────────
function NamingCheckTab() {
  const t = useT();
  const [input, setInput] = useState("");
  const [results, setResults] = useState<import("../api.js").FieldCheckResult[] | null>(null);

  const check = useMutation({
    mutationFn: () => {
      const names = input.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
      return api.naming.check(names, "semiconductor");
    },
    onSuccess: setResults,
  });

  const statusColor: Record<string, string> = {
    exact:   "text-green-400",
    alias:   "text-yellow-400",
    fuzzy:   "text-orange-400",
    unknown: "text-zinc-500",
  };
  const statusIcon: Record<string, string> = {
    exact: "✓", alias: "⚠", fuzzy: "~", unknown: "?",
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <label className="text-xs text-[var(--text-3)] mb-2 block">{t("naming.check_label")}</label>
        <textarea
          className="w-full h-28 px-3 py-2 rounded bg-[var(--bg-0)] border border-[var(--border)] text-[var(--text-1)] text-sm font-mono placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--accent)] resize-none"
          placeholder={t("naming.check_ph")}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <div className="flex justify-end mt-3">
          <Btn variant="primary" onClick={() => check.mutate()} disabled={!input.trim() || check.isPending}>
            {check.isPending ? <Spinner /> : t("btn.run_check")}
          </Btn>
        </div>
      </Card>

      {results && (
        <Card className="overflow-hidden">
          <div className="px-4 py-2.5 bg-[var(--bg-2)] border-b border-[var(--border)] text-xs text-[var(--text-3)]">
            {t("naming.results_summary", {
              n:       results.length,
              exact:   results.filter((r) => r.result.status === "exact").length,
              alias:   results.filter((r) => r.result.status === "alias").length,
              fuzzy:   results.filter((r) => r.result.status === "fuzzy").length,
              unknown: results.filter((r) => r.result.status === "unknown").length,
            })}
          </div>
          <div className="divide-y divide-[var(--border)]">
            {results.map((r) => (
              <div key={r.fieldName} className="flex items-center justify-between px-4 py-2.5 hover:bg-[var(--bg-2)]">
                <span className="font-mono text-sm text-[var(--text-1)]">{r.fieldName}</span>
                <div className="flex items-center gap-3">
                  {r.result.stdName && r.result.status !== "exact" && (
                    <span className="text-xs text-[var(--text-3)]">→ {r.result.stdName}</span>
                  )}
                  {r.result.distance !== null && r.result.distance > 0 && (
                    <span className="text-xs text-[var(--text-3)]">dist {r.result.distance}</span>
                  )}
                  <span className={`font-mono text-xs font-semibold ${statusColor[r.result.status]}`}>
                    {statusIcon[r.result.status]} {t(`status.${r.result.status}`)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export function NamingPage() {
  const qc = useQueryClient();
  const t = useT();
  const [tab, setTab] = useState<"entries" | "check">("entries");
  const [showCreate, setShowCreate] = useState(false);
  const [editEntry, setEditEntry] = useState<NamingEntry | null>(null);
  const [search, setSearch] = useState("");

  const { data: entries, isLoading } = useQuery({
    queryKey: ["naming"],
    queryFn: () => api.naming.list(),
  });

  const del = useMutation({
    mutationFn: (id: number) => api.naming.delete(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["naming"] }),
  });

  const filtered = entries?.filter((e) =>
    !search || e.stdName.includes(search.toLowerCase()) || e.concept.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">{t("naming.title")}</h1>
          <p className="text-sm text-[var(--text-3)] mt-0.5">{t("naming.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <div className="flex rounded border border-[var(--border)] overflow-hidden text-sm">
            {(["entries", "check"] as const).map((tabId) => (
              <button key={tabId} onClick={() => setTab(tabId)}
                className={`px-3 py-1.5 transition-colors ${tab === tabId ? "bg-[var(--accent)] text-white" : "text-[var(--text-2)] hover:bg-[var(--bg-3)]"}`}>
                {tabId === "entries" ? t("naming.tab_dict") : t("naming.tab_check")}
              </button>
            ))}
          </div>
          {tab === "entries" && <Btn variant="primary" onClick={() => setShowCreate(true)}>{t("naming.new_entry")}</Btn>}
        </div>
      </div>

      {tab === "check" ? <NamingCheckTab /> : (
        <>
          <div className="mb-4">
            <Input placeholder={t("naming.search_ph")} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          </div>

          {isLoading && <div className="flex justify-center py-16"><Spinner /></div>}
          {!isLoading && filtered?.length === 0 && <EmptyState icon="📖" message={t("naming.no_entries")} />}

          <Card className="overflow-hidden">
            {filtered && filtered.length > 0 && (
              <table className="w-full text-left">
                <thead className="bg-[var(--bg-2)]">
                  <tr className="text-xs text-[var(--text-3)]">
                    <th className="px-4 py-2.5 font-normal">{t("col.std_name")}</th>
                    <th className="px-4 py-2.5 font-normal">{t("col.concept")}</th>
                    <th className="px-4 py-2.5 font-normal">{t("col.aliases")}</th>
                    <th className="px-4 py-2.5 font-normal">{t("col.domain")}</th>
                    <th className="px-4 py-2.5 font-normal">{t("col.description")}</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => (
                    <tr key={e.id} className="group border-t border-[var(--border)] hover:bg-[var(--bg-2)]">
                      <td className="px-4 py-2.5 font-mono text-[var(--accent)] text-sm">{e.stdName}</td>
                      <td className="px-4 py-2.5 text-sm text-[var(--text-1)]">{e.concept}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {e.aliases.map((a) => (
                            <span key={a} className="px-1.5 py-0.5 rounded text-xs font-mono bg-[var(--bg-3)] text-[var(--text-3)] border border-[var(--border)]">{a}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[var(--text-3)]">{e.domain}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--text-3)]">{e.description ?? "—"}</td>
                      <td className="px-4 py-2.5 text-right opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                        <Btn size="sm" variant="ghost" onClick={() => setEditEntry(e)}>{t("btn.edit")}</Btn>
                        <Btn size="sm" variant="danger" onClick={() => { if (confirm(t("misc.delete_confirm", { name: e.stdName }))) del.mutate(e.id); }}>{t("btn.delete")}</Btn>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}

      {showCreate && <EntryModal onClose={() => setShowCreate(false)} />}
      {editEntry && <EntryModal entry={editEntry} onClose={() => setEditEntry(null)} />}
    </div>
  );
}
