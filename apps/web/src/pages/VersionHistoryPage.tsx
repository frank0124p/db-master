import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "../store.js";
import { api, type SchemaVersion, type VersionDiff, type Field, type NamingEntry, type MatchStatus, type FieldModifiedDiff } from "../api.js";

// ── Naming helpers ─────────────────────────────────────────────────────────────

function checkName(name: string, entries: NamingEntry[]): MatchStatus {
  const sys = new Set(["id", "created_at", "updated_at", "deleted_at"]);
  if (sys.has(name)) return "exact";
  for (const e of entries) {
    if (e.stdName === name) return "exact";
    if (e.aliases.includes(name)) return "alias";
  }
  for (const e of entries)
    if (name.startsWith(e.stdName) || e.stdName.startsWith(name.split("_")[0] ?? "")) return "fuzzy";
  return "unknown";
}

function namingScore(tables: { fields: { name: string }[] }[], entries: NamingEntry[]): number {
  let total = 0, exact = 0;
  for (const t of tables) for (const f of t.fields) { total++; if (checkName(f.name, entries) === "exact") exact++; }
  return total === 0 ? 100 : Math.round((exact / total) * 100);
}

const NAMING_ICON: Record<MatchStatus, string>  = { exact: "✓", alias: "⚠", fuzzy: "~", unknown: "?" };
const NAMING_COLOR: Record<MatchStatus, string> = {
  exact: "var(--success,#4ade80)", alias: "var(--warning)", fuzzy: "#fb923c", unknown: "var(--text-3)",
};

// ── Change summary ─────────────────────────────────────────────────────────────

interface Chg { tablesAdded: number; tablesRemoved: number; tablesModified: number; fieldsAdded: number; fieldsRemoved: number; fieldsModified: number; }
function diffSummary(diff: VersionDiff | null): Chg {
  if (!diff) return { tablesAdded: 0, tablesRemoved: 0, tablesModified: 0, fieldsAdded: 0, fieldsRemoved: 0, fieldsModified: 0 };
  return {
    tablesAdded:    diff.tables.added.length,
    tablesRemoved:  diff.tables.removed.length,
    tablesModified: diff.tables.modified.length,
    fieldsAdded:    diff.tables.modified.reduce((n, m) => n + m.fieldsAdded.length, 0),
    fieldsRemoved:  diff.tables.modified.reduce((n, m) => n + m.fieldsRemoved.length, 0),
    fieldsModified: diff.tables.modified.reduce((n, m) => n + m.fieldsModified.length, 0),
  };
}

// ── Shared cell style ──────────────────────────────────────────────────────────

const TH: React.CSSProperties = {
  padding: "6px 10px", fontSize: 10, fontWeight: 600, color: "var(--text-3)",
  textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "left",
  background: "var(--bg-3)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
};
const TD: React.CSSProperties = {
  padding: "6px 10px", fontSize: 12, borderBottom: "1px solid var(--border)",
  verticalAlign: "middle",
};

// ── Snapshot table — one table's fields ──────────────────────────────────────

function SnapshotTable({ table, entries }: {
  table: { name: string; comment: string | null; fields: Field[] };
  entries: NamingEntry[];
}) {
  const sorted = [...table.fields].sort((a, b) => a.position - b.position);
  const tableScore = entries.length > 0 ? namingScore([table], entries) : null;
  const scoreColor = tableScore === null ? "var(--text-3)"
    : tableScore >= 80 ? "var(--success,#4ade80)"
    : tableScore >= 50 ? "var(--warning)" : "var(--error,#f87171)";

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
      {/* Table header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px",
        background: "var(--bg-3)", borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--accent)" }}>{table.name}</span>
        {table.comment && <span style={{ fontSize: 11, color: "var(--text-2)" }}>{table.comment}</span>}
        <span style={{ fontSize: 11, color: "var(--text-3)", marginLeft: 4 }}>{sorted.length} 欄位</span>
        {tableScore !== null && (
          <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: scoreColor }}>
            {tableScore}%
          </span>
        )}
      </div>
      {/* Fields */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...TH, width: 180 }}>欄位名稱</th>
            <th style={{ ...TH, width: 140 }}>型別</th>
            <th style={{ ...TH, width: 60, textAlign: "center" }}>可空</th>
            <th style={{ ...TH, width: 50, textAlign: "center" }}>PK</th>
            <th style={{ ...TH, width: 100 }}>預設值</th>
            <th style={TH}>備註</th>
            {entries.length > 0 && <th style={{ ...TH, width: 60, textAlign: "center" }}>命名</th>}
          </tr>
        </thead>
        <tbody>
          {sorted.map(f => {
            const ns = entries.length > 0 ? checkName(f.name, entries) : null;
            return (
              <tr key={f.id} style={{ background: "transparent" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-2)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                <td style={{ ...TD, fontFamily: "var(--font-mono)", color: f.isPrimaryKey ? "var(--warning)" : "var(--accent)", fontWeight: f.isPrimaryKey ? 700 : 400 }}>
                  {f.isPrimaryKey && <span style={{ fontSize: 10, marginRight: 4 }}>🔑</span>}
                  {f.isUnique && !f.isPrimaryKey && <span style={{ fontSize: 10, marginRight: 4, color: "var(--info,#60a5fa)" }}>⬡</span>}
                  {f.name}
                </td>
                <td style={{ ...TD, fontFamily: "var(--font-mono)", color: "var(--text-2)", fontSize: 11 }}>{f.dataType}</td>
                <td style={{ ...TD, textAlign: "center" }}>
                  <span style={{ fontSize: 11, color: f.nullable ? "var(--success,#4ade80)" : "var(--text-3)" }}>
                    {f.nullable ? "NULL" : "NOT NULL"}
                  </span>
                </td>
                <td style={{ ...TD, textAlign: "center", color: f.isPrimaryKey ? "var(--warning)" : "var(--text-3)", fontSize: 11 }}>
                  {f.isPrimaryKey ? "✓" : "—"}
                </td>
                <td style={{ ...TD, fontFamily: "var(--font-mono)", color: "var(--text-3)", fontSize: 11 }}>
                  {f.defaultValue ?? "—"}
                </td>
                <td style={{ ...TD, color: "var(--text-2)", fontSize: 11 }}>{f.comment ?? "—"}</td>
                {ns && (
                  <td style={{ ...TD, textAlign: "center" }}>
                    <span title={ns} style={{ fontSize: 13, fontWeight: 700, color: NAMING_COLOR[ns] }}>{NAMING_ICON[ns]}</span>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Prop label map ─────────────────────────────────────────────────────────────

const PROP_LABEL: Record<string, string> = {
  dataType: "型別", nullable: "可空", defaultValue: "預設值", comment: "備註",
  isPrimaryKey: "主鍵", isUnique: "唯一索引",
};

// ── Diff for a single modified table ─────────────────────────────────────────

function ModifiedTableDiff({ modified, snapshotTable, entries }: {
  modified: NonNullable<VersionDiff["tables"]["modified"][number]>;
  snapshotTable: { fields: Field[] } | undefined;
  entries: NamingEntry[];
}) {
  const isStructured = (fm: unknown): fm is FieldModifiedDiff =>
    typeof fm === "object" && fm !== null && "name" in fm && "changes" in fm;

  const structuredModified: FieldModifiedDiff[] = (modified.fieldsModified as unknown[]).map(fm => {
    if (isStructured(fm)) return fm;
    // Legacy string format: "fieldName TYPE [NOT NULL]"
    const legacy = fm as { before: string; after: string };
    const name = legacy.before.split(" ")[0] ?? "";
    const beforeDef = legacy.before.split(" ").slice(1).join(" ");
    const afterDef  = legacy.after.split(" ").slice(1).join(" ");
    return { name, changes: [{ prop: "definition", before: beforeDef, after: afterDef }] };
  });

  const totalChanges = modified.fieldsAdded.length + modified.fieldsRemoved.length + structuredModified.length;
  const snapshotMap = new Map((snapshotTable?.fields ?? []).map(f => [f.name, f]));

  const badge = (label: string, bg: string, color: string, border: string) => (
    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 6, fontWeight: 700,
      background: bg, color, border: `1px solid ${border}` }}>{label}</span>
  );

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px",
        background: "var(--bg-3)", borderBottom: "1px solid var(--border)" }}>
        {badge("修改", "rgba(251,191,36,0.15)", "var(--warning)", "rgba(251,191,36,0.3)")}
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>{modified.name}</span>
        {modified.commentBefore !== undefined && (
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>
            備註：<span style={{ textDecoration: "line-through", color: "var(--error,#f87171)" }}>{modified.commentBefore ?? "—"}</span>
            {" → "}
            <span style={{ color: "var(--success,#4ade80)" }}>{modified.commentAfter ?? "—"}</span>
          </span>
        )}
        <span style={{ fontSize: 11, color: "var(--text-3)" }}>{totalChanges} 項變更</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {modified.fieldsAdded.length > 0 && badge(`+${modified.fieldsAdded.length} 欄`, "rgba(74,222,128,0.12)", "var(--success,#4ade80)", "rgba(74,222,128,0.25)")}
          {modified.fieldsRemoved.length > 0 && badge(`-${modified.fieldsRemoved.length} 欄`, "rgba(248,113,113,0.12)", "var(--error,#f87171)", "rgba(248,113,113,0.25)")}
          {structuredModified.length > 0 && badge(`~${structuredModified.length} 欄`, "rgba(251,191,36,0.12)", "var(--warning)", "rgba(251,191,36,0.25)")}
        </div>
      </div>

      {/* Changes table */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...TH, width: 70 }}>變更</th>
            <th style={{ ...TH, width: 160 }}>欄位名稱</th>
            <th style={{ ...TH, width: 100 }}>屬性</th>
            <th style={TH}>修改前</th>
            <th style={TH}>修改後</th>
            {entries.length > 0 && <th style={{ ...TH, width: 50, textAlign: "center" }}>命名</th>}
          </tr>
        </thead>
        <tbody>
          {/* Added fields */}
          {modified.fieldsAdded.map(fname => {
            const f = snapshotMap.get(fname);
            const ns = entries.length > 0 ? checkName(fname, entries) : null;
            return (
              <tr key={`add-${fname}`} style={{ background: "rgba(74,222,128,0.05)" }}>
                <td style={TD}>{badge("新增", "rgba(74,222,128,0.15)", "var(--success,#4ade80)", "rgba(74,222,128,0.3)")}</td>
                <td style={{ ...TD, fontFamily: "var(--font-mono)", color: "var(--success,#4ade80)", fontWeight: 600 }}>{fname}</td>
                <td colSpan={2} style={{ ...TD, color: "var(--text-3)" }}>—</td>
                <td style={{ ...TD, fontSize: 11, color: "var(--text-1)" }}>
                  {f ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 10px" }}>
                      <span style={{ fontFamily: "var(--font-mono)", color: "var(--accent)" }}>{f.dataType}</span>
                      <span style={{ color: f.nullable ? "var(--success,#4ade80)" : "var(--text-3)" }}>{f.nullable ? "NULL" : "NOT NULL"}</span>
                      {f.isPrimaryKey && <span style={{ color: "var(--warning)", fontWeight: 700 }}>PK</span>}
                      {f.isUnique && !f.isPrimaryKey && <span style={{ color: "var(--info,#60a5fa)" }}>UNIQUE</span>}
                      {f.defaultValue && <span style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>DEFAULT {f.defaultValue}</span>}
                      {f.comment && <span style={{ color: "var(--text-2)", fontStyle: "italic" }}>{f.comment}</span>}
                    </div>
                  ) : "—"}
                </td>
                {ns && <td style={{ ...TD, textAlign: "center" }}><span style={{ fontSize: 13, fontWeight: 700, color: NAMING_COLOR[ns] }}>{NAMING_ICON[ns]}</span></td>}
              </tr>
            );
          })}

          {/* Removed fields */}
          {modified.fieldsRemoved.map(fname => (
            <tr key={`rm-${fname}`} style={{ background: "rgba(248,113,113,0.05)" }}>
              <td style={TD}>{badge("刪除", "rgba(248,113,113,0.15)", "var(--error,#f87171)", "rgba(248,113,113,0.3)")}</td>
              <td style={{ ...TD, fontFamily: "var(--font-mono)", color: "var(--error,#f87171)", fontWeight: 600, textDecoration: "line-through" }}>{fname}</td>
              <td colSpan={3} style={{ ...TD, color: "var(--text-3)", fontSize: 11 }}>此欄位已從表中移除</td>
              {entries.length > 0 && <td style={TD} />}
            </tr>
          ))}

          {/* Modified fields — one row per changed property */}
          {structuredModified.map((fm, fi) =>
            fm.changes.map((ch, ci) => {
              const ns = entries.length > 0 ? checkName(fm.name, entries) : null;
              const isFirstRow = ci === 0;
              const isMonoProp = ["dataType", "defaultValue", "definition"].includes(ch.prop);
              return (
                <tr key={`mod-${fi}-${ci}`} style={{ background: "rgba(251,191,36,0.04)", borderTop: isFirstRow && fi > 0 ? "1px dashed var(--border)" : undefined }}>
                  <td style={TD}>
                    {isFirstRow && badge("修改", "rgba(251,191,36,0.15)", "var(--warning)", "rgba(251,191,36,0.3)")}
                  </td>
                  <td style={{ ...TD, fontFamily: "var(--font-mono)", color: "var(--warning)", fontWeight: 600 }}>
                    {isFirstRow ? fm.name : ""}
                  </td>
                  <td style={{ ...TD, color: "var(--text-3)", fontSize: 11 }}>
                    {PROP_LABEL[ch.prop] ?? ch.prop}
                  </td>
                  <td style={{ ...TD, fontFamily: isMonoProp ? "var(--font-mono)" : "inherit", fontSize: 11,
                    color: "var(--error,#f87171)", textDecoration: "line-through", opacity: 0.8 }}>
                    {ch.before ?? "—"}
                  </td>
                  <td style={{ ...TD, fontFamily: isMonoProp ? "var(--font-mono)" : "inherit", fontSize: 11,
                    color: "var(--success,#4ade80)", fontWeight: 600 }}>
                    {ch.after ?? "—"}
                  </td>
                  {ns && <td style={{ ...TD, textAlign: "center" }}>
                    {isFirstRow && <span style={{ fontSize: 13, fontWeight: 700, color: NAMING_COLOR[ns] }}>{NAMING_ICON[ns]}</span>}
                  </td>}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Version detail (expanded row content) ─────────────────────────────────────

function VersionDetail({ version, entries }: { version: SchemaVersion; entries: NamingEntry[] }) {
  const [tab, setTab] = useState<"diff" | "snapshot">("diff");
  const diff = version.diff as VersionDiff | null;
  const snapshotTableMap = new Map(version.snapshot.tables.map(t => [t.name, t]));

  const score = namingScore(version.snapshot.tables, entries);
  const scoreColor = score >= 80 ? "var(--success,#4ade80)" : score >= 50 ? "var(--warning)" : "var(--error,#f87171)";
  const totalFields = version.snapshot.tables.reduce((n, t) => n + t.fields.length, 0);
  const exactFields = version.snapshot.tables.reduce((n, t) =>
    n + t.fields.filter(f => entries.length > 0 && checkName(f.name, entries) === "exact").length, 0);
  const warnFields  = version.snapshot.tables.reduce((n, t) =>
    n + t.fields.filter(f => entries.length > 0 && ["alias","fuzzy"].includes(checkName(f.name, entries))).length, 0);
  const unknFields  = totalFields - exactFields - warnFields;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── Stats bar ───────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 20, padding: "10px 16px",
        background: "var(--bg-2)", borderRadius: 8, border: "1px solid var(--border)", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 800, color: scoreColor, lineHeight: 1 }}>{score}%</span>
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>命名規範</span>
        </div>
        <div style={{ width: 1, height: 28, background: "var(--border)", flexShrink: 0 }} />
        <div style={{ display: "flex", gap: 16, fontSize: 12, flexWrap: "wrap" }}>
          <span><b style={{ color: "var(--text-1)" }}>{version.snapshot.tables.length}</b> <span style={{ color: "var(--text-3)" }}>張表</span></span>
          <span><b style={{ color: "var(--text-1)" }}>{totalFields}</b> <span style={{ color: "var(--text-3)" }}>欄位</span></span>
          {entries.length > 0 && (
            <>
              <span style={{ color: "var(--success,#4ade80)" }}>✓ {exactFields}</span>
              {warnFields > 0 && <span style={{ color: "var(--warning)" }}>⚠ {warnFields}</span>}
              {unknFields > 0 && <span style={{ color: "var(--text-3)" }}>? {unknFields}</span>}
            </>
          )}
        </div>
        {version.message && (
          <>
            <div style={{ width: 1, height: 28, background: "var(--border)", flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: "var(--text-2)", fontStyle: "italic" }}>"{version.message}"</span>
          </>
        )}
      </div>

      {/* ── Tab bar ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border)" }}>
        {(["diff", "snapshot"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: "7px 18px", background: "transparent", border: "none", cursor: "pointer",
              fontSize: 12, fontWeight: tab === t ? 600 : 400,
              color: tab === t ? "var(--accent)" : "var(--text-3)",
              borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
              marginBottom: -1, transition: "all 0.15s" }}>
            {t === "diff" ? "變更差異" : "完整快照"}
          </button>
        ))}
      </div>

      {/* ── Diff tab ─────────────────────────────────────────────── */}
      {tab === "diff" && (
        diff ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

            {/* Added tables */}
            {diff.tables.added.map(name => {
              const t = snapshotTableMap.get(name);
              return (
                <div key={`add-${name}`} style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px",
                    background: "rgba(74,222,128,0.06)", borderBottom: "1px solid var(--border)" }}>
                    <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 8, fontWeight: 700,
                      background: "rgba(74,222,128,0.15)", color: "var(--success,#4ade80)", border: "1px solid rgba(74,222,128,0.3)" }}>新增</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--success,#4ade80)" }}>{name}</span>
                    {t && <span style={{ fontSize: 11, color: "var(--text-3)" }}>{t.fields.length} 欄位</span>}
                  </div>
                  {t && (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={{ ...TH, width: 180 }}>欄位名稱</th>
                          <th style={{ ...TH, width: 140 }}>型別</th>
                          <th style={{ ...TH, width: 100 }}>可空</th>
                          <th style={TH}>備註</th>
                          {entries.length > 0 && <th style={{ ...TH, width: 50, textAlign: "center" }}>命名</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {[...t.fields].sort((a, b) => a.position - b.position).map(f => {
                          const ns = entries.length > 0 ? checkName(f.name, entries) : null;
                          return (
                            <tr key={f.id} style={{ background: "rgba(74,222,128,0.03)" }}>
                              <td style={{ ...TD, fontFamily: "var(--font-mono)", color: "var(--accent)", fontSize: 12 }}>
                                {f.isPrimaryKey && <span style={{ fontSize: 10, marginRight: 4 }}>🔑</span>}{f.name}
                              </td>
                              <td style={{ ...TD, fontFamily: "var(--font-mono)", color: "var(--text-2)", fontSize: 11 }}>{f.dataType}</td>
                              <td style={{ ...TD, fontSize: 11, color: f.nullable ? "var(--success,#4ade80)" : "var(--text-3)" }}>{f.nullable ? "NULL" : "NOT NULL"}</td>
                              <td style={{ ...TD, fontSize: 11, color: "var(--text-2)" }}>{f.comment ?? "—"}</td>
                              {ns && <td style={{ ...TD, textAlign: "center" }}><span style={{ fontSize: 13, fontWeight: 700, color: NAMING_COLOR[ns] }}>{NAMING_ICON[ns]}</span></td>}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}

            {/* Removed tables */}
            {diff.tables.removed.map(name => (
              <div key={`rm-${name}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                border: "1px solid rgba(248,113,113,0.3)", borderRadius: 8,
                background: "rgba(248,113,113,0.05)" }}>
                <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 8, fontWeight: 700,
                  background: "rgba(248,113,113,0.15)", color: "var(--error,#f87171)", border: "1px solid rgba(248,113,113,0.3)" }}>刪除</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700,
                  color: "var(--error,#f87171)", textDecoration: "line-through" }}>{name}</span>
                <span style={{ fontSize: 11, color: "var(--text-3)" }}>此版本已移除</span>
              </div>
            ))}

            {/* Modified tables */}
            {diff.tables.modified.map(m => (
              <ModifiedTableDiff
                key={m.name}
                modified={m}
                snapshotTable={snapshotTableMap.get(m.name)}
                entries={entries}
              />
            ))}

            {!diff.tables.added.length && !diff.tables.removed.length && !diff.tables.modified.length && (
              <div style={{ color: "var(--text-3)", fontSize: 13, padding: "20px 0", textAlign: "center" }}>
                此版本無表結構變更
              </div>
            )}
          </div>
        ) : (
          <div style={{ color: "var(--text-3)", fontSize: 13, padding: "20px 0", textAlign: "center" }}>
            首個版本，無對比資料
          </div>
        )
      )}

      {/* ── Snapshot tab ─────────────────────────────────────────── */}
      {tab === "snapshot" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {version.snapshot.tables.length === 0 ? (
            <div style={{ color: "var(--text-3)", fontSize: 13, padding: "20px 0", textAlign: "center" }}>此快照無表資料</div>
          ) : (
            version.snapshot.tables.map(t => (
              <SnapshotTable key={t.id} table={t} entries={entries} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function VersionHistoryPage() {
  const qc = useQueryClient();
  const { selectedSchemaId, showToast } = useStore();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: versions } = useQuery({
    queryKey: ["versions", selectedSchemaId],
    queryFn: () => api.schemas.versions.list(selectedSchemaId!),
    enabled: !!selectedSchemaId,
  });

  const { data: schema } = useQuery({
    queryKey: ["schema", selectedSchemaId],
    queryFn: () => api.schemas.get(selectedSchemaId!),
    enabled: !!selectedSchemaId,
  });

  const { data: namingEntries = [] } = useQuery({
    queryKey: ["naming"],
    queryFn: () => api.naming.list(),
  });

  if (!selectedSchemaId) {
    return <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)" }}>← 從左側選擇一個 Schema</div>;
  }

  async function saveNow() {
    if (!selectedSchemaId) return;
    const v = await api.schemas.versions.save(selectedSchemaId);
    await qc.invalidateQueries({ queryKey: ["versions", selectedSchemaId] });
    showToast(`✓ v${v.versionNo} 已儲存`);
  }

  const cs = (w?: string | number): React.CSSProperties => ({
    padding: "10px 14px", textAlign: "left", fontSize: 12, whiteSpace: "nowrap",
    ...(w ? { width: w } : {}),
  });

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: 20, overflowY: "auto", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>版本歷史</div>
          {schema && <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>{schema.name} · {versions?.length ?? 0} 個版本</div>}
        </div>
        <button className="btn btn-primary" onClick={saveNow}>＋ 儲存目前版本</button>
      </div>

      {/* Version table */}
      {(!versions || versions.length === 0) ? (
        <div style={{ color: "var(--text-3)", fontSize: 13, padding: "48px 0", textAlign: "center" }}>
          尚無版本記錄，點擊「儲存目前版本」建立第一筆
        </div>
      ) : (
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", background: "var(--bg-2)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: 64 }} />
              <col style={{ width: 130 }} />
              <col />
              <col style={{ width: 64 }} />
              <col style={{ width: 64 }} />
              <col style={{ width: 80 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 200 }} />
              <col style={{ width: 36 }} />
            </colgroup>
            <thead>
              <tr style={{ background: "var(--bg-3)", borderBottom: "2px solid var(--border)" }}>
                {["版本", "時間", "備註", "表數", "欄位", "命名分數", "DDL 檢查", "變更摘要", ""].map(h => (
                  <th key={h} style={{ ...cs(), fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {versions.map((v, idx) => {
                const isExpanded = expandedId === v.id;
                const score = namingEntries.length > 0 ? namingScore(v.snapshot.tables, namingEntries) : null;
                const scoreColor = score === null ? "var(--text-3)"
                  : score >= 80 ? "var(--success,#4ade80)" : score >= 50 ? "var(--warning)" : "var(--error,#f87171)";
                const chg = diffSummary(v.diff as VersionDiff | null);
                const totalChg = chg.tablesAdded + chg.tablesRemoved + chg.tablesModified;
                const isLatest = idx === 0;
                const tableCount = v.snapshot.tables.length;
                const fieldCount = v.snapshot.tables.reduce((n, t) => n + t.fields.length, 0);

                return (
                  <>
                    <tr key={v.id}
                      onClick={() => setExpandedId(isExpanded ? null : v.id)}
                      style={{ borderTop: idx > 0 ? "1px solid var(--border)" : undefined, cursor: "pointer",
                        background: isExpanded ? "var(--accent-dim)" : "transparent", transition: "background 0.12s" }}
                      onMouseEnter={e => { if (!isExpanded) (e.currentTarget as HTMLTableRowElement).style.background = "var(--bg-3)"; }}
                      onMouseLeave={e => { if (!isExpanded) (e.currentTarget as HTMLTableRowElement).style.background = "transparent"; }}>

                      {/* 版本 */}
                      <td style={cs()}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700,
                          color: isLatest ? "var(--accent)" : "var(--text-2)",
                          padding: "2px 7px", borderRadius: 5,
                          background: isLatest ? "var(--accent-dim)" : "var(--bg-4)",
                          border: `1px solid ${isLatest ? "var(--accent)" : "var(--border)"}` }}>
                          v{v.versionNo}
                        </span>
                      </td>

                      {/* 時間 */}
                      <td style={{ ...cs(), color: "var(--text-2)", fontSize: 11 }}>
                        {new Date(v.createdAt).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </td>

                      {/* 備註 */}
                      <td style={{ ...cs(), color: v.message ? "var(--text-1)" : "var(--text-3)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 0 }}>
                        {v.message ?? "—"}
                      </td>

                      {/* 表數 */}
                      <td style={{ ...cs(), fontFamily: "var(--font-mono)", color: "var(--text-2)", textAlign: "right" }}>{tableCount}</td>

                      {/* 欄位 */}
                      <td style={{ ...cs(), fontFamily: "var(--font-mono)", color: "var(--text-2)", textAlign: "right" }}>{fieldCount}</td>

                      {/* 命名分數 */}
                      <td style={{ ...cs(), textAlign: "right" }}>
                        {score !== null
                          ? <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: scoreColor }}>{score}%</span>
                          : <span style={{ color: "var(--text-3)" }}>—</span>}
                      </td>

                      {/* DDL 檢查 */}
                      <td style={cs()}>
                        {v.ddlCheck === null || v.ddlCheck === undefined
                          ? <span style={{ color: "var(--text-3)" }}>—</span>
                          : v.ddlCheck.passed && v.ddlCheck.errors === 0
                            ? <span style={{ fontSize: 11, fontWeight: 700, color: "var(--success,#4ade80)" }}>✓ 無錯誤</span>
                            : v.ddlCheck.errors > 0
                              ? <span style={{ fontSize: 11, fontWeight: 700, color: "var(--error,#f87171)" }}>✕ {v.ddlCheck.errors} 錯誤</span>
                              : <span style={{ fontSize: 11, fontWeight: 700, color: "var(--warning)" }}>⚠ {v.ddlCheck.warnings} 警告</span>
                        }
                      </td>

                      {/* 變更摘要 */}
                      <td style={cs()}>
                        {v.diff === null ? (
                          <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, background: "var(--bg-4)", color: "var(--text-3)", border: "1px solid var(--border)" }}>首版本</span>
                        ) : totalChg === 0 ? (
                          <span style={{ fontSize: 11, color: "var(--text-3)" }}>無結構變更</span>
                        ) : (
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {chg.tablesAdded    > 0 && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, background: "rgba(74,222,128,0.12)",  color: "var(--success,#4ade80)",  border: "1px solid rgba(74,222,128,0.25)"  }}>+{chg.tablesAdded}表</span>}
                            {chg.tablesRemoved  > 0 && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, background: "rgba(248,113,113,0.12)", color: "var(--error,#f87171)",    border: "1px solid rgba(248,113,113,0.25)" }}>-{chg.tablesRemoved}表</span>}
                            {chg.tablesModified > 0 && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, background: "rgba(251,191,36,0.12)",  color: "var(--warning)",           border: "1px solid rgba(251,191,36,0.25)"  }}>~{chg.tablesModified}表</span>}
                            {chg.fieldsAdded    > 0 && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, background: "rgba(74,222,128,0.08)",  color: "var(--success,#4ade80)",  border: "1px solid rgba(74,222,128,0.2)"   }}>+{chg.fieldsAdded}欄</span>}
                            {chg.fieldsRemoved  > 0 && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, background: "rgba(248,113,113,0.08)", color: "var(--error,#f87171)",    border: "1px solid rgba(248,113,113,0.2)"  }}>-{chg.fieldsRemoved}欄</span>}
                            {chg.fieldsModified > 0 && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, background: "rgba(251,191,36,0.08)",  color: "var(--warning)",           border: "1px solid rgba(251,191,36,0.2)"   }}>~{chg.fieldsModified}欄</span>}
                          </div>
                        )}
                      </td>

                      {/* 展開箭頭 */}
                      <td style={{ ...cs(), textAlign: "center", padding: "10px 8px" }}>
                        <span style={{ color: "var(--text-3)", fontSize: 10, display: "inline-block",
                          transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
                      </td>
                    </tr>

                    {/* ── Expanded detail ── */}
                    {isExpanded && (
                      <tr key={`${v.id}-detail`} style={{ borderTop: "1px solid var(--border)" }}>
                        <td colSpan={9} style={{ padding: 0, background: "var(--bg-1)" }}>
                          <div style={{ maxHeight: 520, overflowY: "auto", padding: "20px 20px 24px" }}>
                            <VersionDetail version={v} entries={namingEntries} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
