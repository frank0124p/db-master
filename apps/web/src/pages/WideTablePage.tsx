import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "../store.js";
import { api, type PreviewColumn, type PreviewSource, type WideTablePreview, type JoinType } from "../api.js";

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function WideTablePage() {
  const { selectedSchemaId } = useStore();
  const [view, setView] = useState<"list" | "builder" | "detail">("list");
  const [detailId, setDetailId] = useState<number | null>(null);

  if (!selectedSchemaId) {
    return <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)" }}>← 從左側選擇一個 Schema</div>;
  }

  if (view === "builder") return <WideTableBuilder schemaId={selectedSchemaId} onDone={() => setView("list")} />;
  if (view === "detail" && detailId) return <WideTableDetailView schemaId={selectedSchemaId} id={detailId} onBack={() => setView("list")} />;
  return <WideTableList schemaId={selectedSchemaId} onNew={() => setView("builder")} onOpen={id => { setDetailId(id); setView("detail"); }} />;
}

// ── List ──────────────────────────────────────────────────────────────────────

function WideTableList({ schemaId, onNew, onOpen }: { schemaId: number; onNew: () => void; onOpen: (id: number) => void }) {
  const qc = useQueryClient();
  const { showToast } = useStore();
  const { data: schema } = useQuery({ queryKey: ["schema", schemaId], queryFn: () => api.schemas.get(schemaId) });
  const { data: wideTables } = useQuery({ queryKey: ["wideTables", schemaId], queryFn: () => api.wideTables.list(schemaId) });

  async function del(id: number, name: string) {
    await api.wideTables.delete(schemaId, id);
    await qc.invalidateQueries({ queryKey: ["wideTables", schemaId] });
    showToast(`已刪除「${name}」`);
  }

  async function downloadDdl(id: number, name: string) {
    const sql = await api.wideTables.ddl(schemaId, id);
    const blob = new Blob([sql], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `${name}.sql`; a.click();
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, background: "var(--bg-2)" }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>Wide Tables — {schema?.name}</span>
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>{wideTables?.length ?? 0} 個合併寬表</span>
        <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={onNew}>＋ 新建寬表</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        {wideTables?.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-3)" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⊞</div>
            <div style={{ fontSize: 13, marginBottom: 6 }}>尚無寬表定義</div>
            <div style={{ fontSize: 12 }}>勾選多張 Table，系統自動分析 FK 關係並產生 VIEW</div>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
          {wideTables?.map(wt => (
            <div key={wt.id} onClick={() => onOpen(wt.id)}
              style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8, padding: 16, cursor: "pointer", transition: "border-color 0.15s" }}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = "var(--accent)"}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)"}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--accent)", fontWeight: 600, marginBottom: 4 }}>{wt.name}</div>
                  {wt.description && <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 8 }}>{wt.description}</div>}
                  <div style={{ fontSize: 11, color: "var(--text-3)" }}>{new Date(wt.createdAt).toLocaleString("zh-TW")}</div>
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  <button className="btn btn-ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => downloadDdl(wt.id, wt.name)}>↓ DDL</button>
                  <button className="btn btn-danger" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => del(wt.id, wt.name)}>刪除</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── JOIN Flow Diagram (pure React, no Mermaid) ────────────────────────────────

function JoinFlowDiagram({ sources, columns }: { sources: PreviewSource[]; columns: PreviewColumn[] }) {
  if (sources.length === 0) return null;

  return (
    <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8 }}>
      <div style={{ padding: "8px 14px", background: "var(--bg-3)", borderBottom: "1px solid var(--border)", borderRadius: "8px 8px 0 0", fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
        JOIN 關聯圖
      </div>
      <div style={{ padding: "16px 20px", overflowX: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 0, width: "max-content", minWidth: "100%" }}>
          {sources.map((src, i) => {
            const isBase = src.position === 0;
            const colCount = columns.filter(c => c.sourcePosition === src.position && c.included).length;
            const onClause = src.joinCondition
              ? src.joinCondition.replace(/`/g, "").replace(/\s+/g, " ")
              : null;
            return (
              <div key={src.position} style={{ display: "flex", alignItems: "center" }}>
                {/* Arrow + labels between tables */}
                {i > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 8px", minWidth: 140, maxWidth: 220 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--warning)", fontFamily: "var(--font-mono)", marginBottom: 4, whiteSpace: "nowrap" }}>
                      {src.joinType} JOIN
                    </div>
                    {/* Arrow line */}
                    <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
                      <div style={{ flex: 1, height: 1, background: "var(--border-light)" }} />
                      <div style={{ fontSize: 16, color: "var(--accent)", lineHeight: 1, flexShrink: 0 }}>▶</div>
                    </div>
                    {onClause ? (
                      <div style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "var(--font-mono)", marginTop: 4, textAlign: "center", wordBreak: "break-all", lineHeight: 1.4, maxWidth: 200 }}>
                        ON {onClause}
                      </div>
                    ) : (
                      <div style={{ fontSize: 10, color: "var(--error, #f87171)", marginTop: 4 }}>⚠ 無條件</div>
                    )}
                  </div>
                )}
                {/* Table node */}
                <div style={{
                  padding: "10px 16px", borderRadius: 8, minWidth: 120, textAlign: "center", flexShrink: 0,
                  background: isBase ? "rgba(251,191,36,0.08)" : "rgba(123,140,255,0.08)",
                  border: `2px solid ${isBase ? "var(--warning)" : "var(--accent)"}`,
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 4, letterSpacing: "0.5px",
                    color: isBase ? "var(--warning)" : "var(--accent)" }}>
                    {isBase ? "BASE" : `JOIN ${i}`}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: "var(--text-1)", marginBottom: 2 }}>
                    {src.tableName}
                  </div>
                  {src.schemaName && (
                    <div style={{ fontSize: 9, color: "var(--text-3)", fontFamily: "var(--font-mono)", marginBottom: colCount > 0 ? 2 : 0 }}>{src.schemaName}</div>
                  )}
                  {colCount > 0 && (
                    <div style={{ fontSize: 10, color: "var(--text-3)" }}>{colCount} cols</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── JOIN Diagram Modal ────────────────────────────────────────────────────────

function JoinDiagramModal({ sources, columns, name, onClose }: {
  sources: PreviewSource[]; columns: PreviewColumn[]; name: string; onClose: () => void;
}) {
  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
      onClick={onClose}
    >
      <div
        style={{ background: "var(--bg-1)", border: "1px solid var(--border-light)", borderRadius: 12, width: "min(1100px, 94vw)", maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal header */}
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-2)" }}>JOIN 關聯圖</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--accent)", fontWeight: 600 }}>{name}</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>
              {sources.length} tables · {sources.filter(s => s.position > 0).length} joins
            </span>
            <button onClick={onClose}
              style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-2)", cursor: "pointer", fontSize: 13, padding: "3px 10px" }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--text-2)")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}>
              ✕ 關閉
            </button>
          </div>
        </div>

        {/* Diagram area — scrollable both ways */}
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "32px 40px", display: "flex", alignItems: "flex-start", justifyContent: "center" }}>
          {/* Horizontal flow */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 0, width: "max-content" }}>
            {sources.map((src, i) => {
              const isBase = src.position === 0;
              const colCount = columns.filter(c => c.sourcePosition === src.position && c.included).length;
              const onClause = src.joinCondition?.replace(/`/g, "").replace(/\s+/g, " ") ?? null;
              const srcCols = columns.filter(c => c.sourcePosition === src.position && c.included);
              return (
                <div key={src.position} style={{ display: "flex", alignItems: "flex-start" }}>
                  {/* Connector */}
                  {i > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "28px 12px 0" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--warning)", fontFamily: "var(--font-mono)", marginBottom: 6, whiteSpace: "nowrap" }}>
                        {src.joinType} JOIN
                      </div>
                      <div style={{ display: "flex", alignItems: "center", width: "100%", minWidth: 100 }}>
                        <div style={{ flex: 1, height: 2, background: "var(--border-light)" }} />
                        <div style={{ fontSize: 18, color: "var(--accent)", lineHeight: 1, flexShrink: 0 }}>▶</div>
                      </div>
                      {onClause ? (
                        <div style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "var(--font-mono)", marginTop: 6, textAlign: "center", lineHeight: 1.5, maxWidth: 180, wordBreak: "break-all" }}>
                          ON {onClause}
                        </div>
                      ) : (
                        <div style={{ fontSize: 10, color: "var(--error, #f87171)", marginTop: 6 }}>⚠ 無 ON 條件</div>
                      )}
                    </div>
                  )}

                  {/* Table card */}
                  <div style={{
                    borderRadius: 10, minWidth: 160,
                    border: `2px solid ${isBase ? "var(--warning)" : "var(--accent)"}`,
                    background: isBase ? "rgba(251,191,36,0.07)" : "rgba(123,140,255,0.07)",
                    overflow: "hidden",
                  }}>
                    {/* Card header */}
                    <div style={{ padding: "8px 14px", background: isBase ? "rgba(251,191,36,0.12)" : "rgba(123,140,255,0.12)", borderBottom: `1px solid ${isBase ? "rgba(251,191,36,0.2)" : "rgba(123,140,255,0.2)"}`, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: isBase ? "rgba(251,191,36,0.2)" : "rgba(123,140,255,0.2)", color: isBase ? "var(--warning)" : "var(--accent)" }}>
                        {isBase ? "BASE" : `JOIN ${i}`}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>{src.tableName}</div>
                        {src.schemaName && <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-3)", marginTop: 1 }}>{src.schemaName}</div>}
                      </div>
                    </div>
                    {/* Column list */}
                    {srcCols.length > 0 && (
                      <div style={{ padding: "6px 0", maxHeight: 220, overflowY: "auto" }}>
                        {srcCols.map(col => (
                          <div key={col.fieldId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 14px" }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-2)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{col.fieldName}</span>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)", flexShrink: 0 }}>{col.dataType.split("(")[0]}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {colCount > 0 && (
                      <div style={{ padding: "4px 14px 8px", fontSize: 10, color: "var(--text-3)", borderTop: "1px solid var(--border)" }}>
                        {colCount} 欄位已選入
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer hint */}
        <div style={{ padding: "8px 20px", borderTop: "1px solid var(--border)", fontSize: 11, color: "var(--text-3)", flexShrink: 0 }}>
          點擊背景或按 Esc 關閉
        </div>
      </div>
    </div>
  );
}

// ── Detail View ───────────────────────────────────────────────────────────────

function WideTableDetailView({ schemaId, id, onBack }: { schemaId: number; id: number; onBack: () => void }) {
  const { showToast } = useStore();
  const [showDiagram, setShowDiagram] = useState(false);
  const { data: wt } = useQuery({ queryKey: ["wideTable", schemaId, id], queryFn: () => api.wideTables.get(schemaId, id) });
  if (!wt) return <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ color: "var(--text-3)" }}>載入中...</span></div>;

  const sources: PreviewSource[] = wt.sources.map(s => ({ ...s, schemaId: s.schemaId ?? wt.schemaId, schemaName: String(s.schemaId ?? wt.schemaId), colPrefix: s.colPrefix ?? "" }));
  const columns: PreviewColumn[] = wt.columns.map(c => ({
    sourcePosition: wt.sources.find(s => s.id === c.sourceId)?.position ?? 0,
    tableId: wt.sources.find(s => s.id === c.sourceId)?.tableId ?? 0,
    tableName: c.tableName, fieldId: c.fieldId, fieldName: c.fieldName,
    dataType: c.fieldType, outputName: c.outputName, included: c.included, hasConflict: false,
  }));

  async function downloadDdl() {
    const sql = await api.wideTables.ddl(schemaId, id);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([sql], { type: "text/plain" }));
    a.download = `${wt!.name}.sql`; a.click();
  }

  const sql = buildViewSqlClient(wt.name, sources, columns);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, background: "var(--bg-2)" }}>
        <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={onBack}>← 返回</button>
        <span style={{ fontSize: 14, fontWeight: 600, fontFamily: "var(--font-mono)", color: "var(--accent)" }}>{wt.name}</span>
        {wt.description && <span style={{ fontSize: 12, color: "var(--text-3)" }}>{wt.description}</span>}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setShowDiagram(true)}>⊞ 關聯圖</button>
          <button className="btn btn-ghost" onClick={() => navigator.clipboard.writeText(sql).then(() => showToast("✓ SQL 已複製"))}>複製 SQL</button>
          <button className="btn btn-primary" onClick={downloadDdl}>↓ 下載 DDL</button>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        <JoinGraph sources={sources} />
        <ColumnTable columns={columns} readOnly />
        <SqlPreview sql={sql} />
      </div>

      {showDiagram && (
        <JoinDiagramModal
          sources={sources}
          columns={columns}
          name={wt.name}
          onClose={() => setShowDiagram(false)}
        />
      )}
    </div>
  );
}

// ── SQL JOIN parser ───────────────────────────────────────────────────────────

interface ParsedSqlJoin { tableName: string; joinType: "LEFT" | "INNER"; joinCondition: string | null; position: number; }

function parseSqlJoins(sql: string): ParsedSqlJoin[] {
  const norm = sql.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
  const result: ParsedSqlJoin[] = [];
  const fromMatch = norm.match(/\bFROM\s+`?(\w+)`?(?:\s+(?:AS\s+)?`?\w+`?)?/i);
  if (!fromMatch) return [];
  result.push({ tableName: fromMatch[1]!, joinType: "LEFT", joinCondition: null, position: 0 });
  const joinRe = /\b(?:(LEFT|INNER|RIGHT|CROSS|FULL)\s+)?(?:OUTER\s+)?JOIN\s+`?(\w+)`?(?:\s+(?:AS\s+)?`?\w+`?)?\s+ON\s+((?:(?!\b(?:LEFT|INNER|RIGHT|CROSS|FULL)\s+JOIN\b|\bJOIN\b|\bWHERE\b|\bGROUP\b|\bORDER\b|\bLIMIT\b).)+)/gi;
  let m: RegExpExecArray | null;
  let pos = 1;
  while ((m = joinRe.exec(norm)) !== null) {
    const jt = m[1]?.toUpperCase();
    result.push({ tableName: m[2]!, joinType: jt === "INNER" ? "INNER" : "LEFT", joinCondition: m[3]!.trim().replace(/\s+/g, " "), position: pos++ });
  }
  return result;
}

// ── Cross-Schema Table Picker ─────────────────────────────────────────────────

function SchemaTablePicker({ primarySchemaId, checked, onToggle }: {
  primarySchemaId: number;
  checked: Set<string>;
  onToggle: (schemaId: number, tableId: number) => void;
}) {
  const { data: allSchemas } = useQuery({ queryKey: ["schemas"], queryFn: () => api.schemas.list() });
  const [expanded, setExpanded] = useState<Set<number>>(new Set([primarySchemaId]));

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 8px" }}>
      <div style={{ padding: "6px 4px 6px", fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>
        已選 {checked.size} 張 table（可跨 Schema）
      </div>
      {allSchemas?.map(sc => (
        <SchemaSection
          key={sc.id}
          schema={sc}
          isPrimary={sc.id === primarySchemaId}
          expanded={expanded.has(sc.id)}
          onToggleExpand={() => setExpanded(prev => {
            const n = new Set(prev);
            if (n.has(sc.id)) n.delete(sc.id); else n.add(sc.id);
            return n;
          })}
          checked={checked}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}

function SchemaSection({ schema, isPrimary, expanded, onToggleExpand, checked, onToggle }: {
  schema: import("../api.js").Schema;
  isPrimary: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  checked: Set<string>;
  onToggle: (schemaId: number, tableId: number) => void;
}) {
  const { data: detail } = useQuery({
    queryKey: ["schema", schema.id],
    queryFn: () => api.schemas.get(schema.id),
    enabled: expanded,
  });
  const selectedCount = detail?.tables.filter(t => checked.has(`${schema.id}:${t.id}`)).length ?? 0;

  return (
    <div style={{ marginBottom: 4 }}>
      <div onClick={onToggleExpand}
        style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 8px", borderRadius: 6, cursor: "pointer",
          background: isPrimary ? "rgba(123,140,255,0.06)" : "transparent",
          border: `1px solid ${isPrimary ? "var(--accent)" : "transparent"}` }}
        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = isPrimary ? "rgba(123,140,255,0.1)" : "var(--bg-3)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = isPrimary ? "rgba(123,140,255,0.06)" : "transparent"; }}>
        <span style={{ fontSize: 10, color: "var(--text-3)", flexShrink: 0, transition: "transform 0.15s", display: "inline-block", transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: isPrimary ? "var(--accent)" : "var(--text-1)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{schema.name}</span>
        {selectedCount > 0 && (
          <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, background: "var(--accent-dim)", color: "var(--accent)", fontWeight: 700, flexShrink: 0 }}>{selectedCount}</span>
        )}
        {isPrimary && (
          <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: "var(--accent)", color: "#fff", fontWeight: 700, flexShrink: 0 }}>主</span>
        )}
      </div>
      {expanded && detail && (
        <div style={{ paddingLeft: 12, marginTop: 2 }}>
          {detail.tables.length === 0 && (
            <div style={{ padding: "6px 8px", fontSize: 11, color: "var(--text-3)" }}>此 Schema 無 Tables</div>
          )}
          {detail.tables.map(t => {
            const key = `${schema.id}:${t.id}`;
            const active = checked.has(key);
            return (
              <div key={t.id} onClick={() => onToggle(schema.id, t.id)}
                style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "7px 8px", borderRadius: 5, cursor: "pointer", marginBottom: 1,
                  background: active ? "var(--accent-dim)" : "transparent",
                  border: `1px solid ${active ? "var(--accent)" : "transparent"}`,
                  transition: "all 0.15s" }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLDivElement).style.background = "var(--bg-3)"; }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}>
                <div style={{ width: 13, height: 13, borderRadius: 3, flexShrink: 0, marginTop: 2,
                  border: `1px solid ${active ? "var(--accent)" : "var(--border-light)"}`,
                  background: active ? "var(--accent)" : "var(--bg-4)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#fff" }}>
                  {active ? "✓" : ""}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: active ? "var(--accent)" : "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</div>
                  {t.comment && <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 1, lineHeight: 1.3 }}>{t.comment}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {expanded && !detail && (
        <div style={{ paddingLeft: 20, padding: "6px 20px", fontSize: 11, color: "var(--text-3)" }}>載入中...</div>
      )}
    </div>
  );
}

// ── Builder ───────────────────────────────────────────────────────────────────

type Step = "select" | "columns" | "save";
type InputMode = "check" | "sql";

function WideTableBuilder({ schemaId, onDone }: { schemaId: number; onDone: () => void }) {
  const qc = useQueryClient();
  const { showToast } = useStore();
  const { data: schema } = useQuery({ queryKey: ["schema", schemaId], queryFn: () => api.schemas.get(schemaId) });

  const [step, setStep] = useState<Step>("select");
  const [inputMode, setInputMode] = useState<InputMode>("check");
  // checked: Set<"${schemaId}:${tableId}"> — supports cross-schema
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<WideTablePreview | null>(null);
  const [sources, setSources] = useState<PreviewSource[]>([]);
  const [columns, setColumns] = useState<PreviewColumn[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [sqlInput, setSqlInput] = useState("");
  const [sqlError, setSqlError] = useState<string | null>(null);
  const [sqlParsing, setSqlParsing] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function tableRefs() {
    return [...checked].map(key => {
      const [s, t] = key.split(":").map(Number);
      return { schemaId: s!, tableId: t! };
    });
  }

  // Auto-trigger analysis whenever checked set changes (debounced) — check mode only
  useEffect(() => {
    if (inputMode !== "check") return;
    if (checked.size < 2) { setPreview(null); setSources([]); setColumns([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setAnalyzing(true);
      try {
        const p = await api.wideTables.preview(schemaId, tableRefs());
        setPreview(p);
        setSources(p.sources);
        setColumns(p.columns);
      } catch { /* ignore */ } finally {
        setAnalyzing(false);
      }
    }, 350);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked, inputMode]);

  function toggle(sid: number, tid: number) {
    const key = `${sid}:${tid}`;
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function handleParseSql() {
    if (!sqlInput.trim() || !schema) return;
    setSqlError(null);
    setSqlParsing(true);
    try {
      const parsed = parseSqlJoins(sqlInput);
      if (parsed.length === 0) { setSqlError("無法從 SQL 解析出 FROM / JOIN，請確認語法"); return; }

      // Match table names to current schema's tables (SQL mode remains single-schema)
      const matched: Array<ParsedSqlJoin & { tableId: number }> = [];
      for (const p of parsed) {
        const t = schema.tables.find(t => t.name.toLowerCase() === p.tableName.toLowerCase());
        if (!t) { setSqlError(`找不到 Table：${p.tableName}（此 Schema 中不存在）`); return; }
        matched.push({ ...p, tableId: t.id });
      }

      const refs = matched.map(m => ({ schemaId, tableId: m.tableId }));
      const p = await api.wideTables.preview(schemaId, refs);
      setPreview(p);
      setColumns(p.columns);

      // Override sources with SQL-derived join conditions
      const overridden: PreviewSource[] = p.sources.map(s => {
        const sqlSrc = matched.find(m => m.tableId === s.tableId);
        if (!sqlSrc) return s;
        return {
          ...s,
          joinType: sqlSrc.joinType,
          joinCondition: sqlSrc.joinCondition ?? s.joinCondition,
          colPrefix: s.colPrefix ?? "",
        };
      });
      setSources(overridden);
      setChecked(new Set(refs.map(r => `${r.schemaId}:${r.tableId}`)));
    } catch (e) {
      setSqlError(String(e));
    } finally {
      setSqlParsing(false);
    }
  }

  function updateJoin(pos: number, field: "joinType" | "joinCondition" | "colPrefix", value: string) {
    setSources(prev => prev.map(s => s.position === pos ? { ...s, [field]: value } : s));
  }

  function toggleColumn(srcPos: number, fieldId: number) {
    setColumns(prev => prev.map(c => c.sourcePosition === srcPos && c.fieldId === fieldId ? { ...c, included: !c.included } : c));
  }

  function renameColumn(srcPos: number, fieldId: number, val: string) {
    setColumns(prev => prev.map(c => c.sourcePosition === srcPos && c.fieldId === fieldId ? { ...c, outputName: val } : c));
  }

  async function save() {
    if (!name.trim()) { showToast("請填寫寬表名稱"); return; }
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        sources: sources.map(s => ({ schemaId: s.schemaId, tableId: s.tableId, colPrefix: s.colPrefix || null, joinType: s.joinType, joinCondition: s.joinCondition || null, position: s.position })),
        columns: columns.map((c, i) => ({ sourcePosition: c.sourcePosition, fieldId: c.fieldId, outputName: c.outputName, included: c.included, position: i })),
      };
      await api.wideTables.create(schemaId, body);
      await qc.invalidateQueries({ queryKey: ["wideTables", schemaId] });
      showToast(`✓ 寬表「${name}」已儲存`);
      onDone();
    } finally {
      setSaving(false);
    }
  }

  function switchMode(m: InputMode) {
    setInputMode(m);
    setPreview(null); setSources([]); setColumns([]);
    setChecked(new Set()); setSqlError(null);
  }

  const unresolved = sources.filter(s => s.position > 0 && !s.joinCondition).length;
  const sql = preview && sources.length > 0 ? buildViewSqlClient(name || "(view_name)", sources, columns) : "";

  const steps: { id: Step; label: string }[] = [
    { id: "select", label: "1. 選擇 Tables" },
    { id: "columns", label: "2. 選擇欄位" },
    { id: "save", label: "3. 命名儲存" },
  ];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, background: "var(--bg-2)", flexShrink: 0 }}>
        <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={onDone}>← 取消</button>
        <span style={{ fontSize: 14, fontWeight: 600 }}>新建寬表 — {schema?.name}</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 2, alignItems: "center" }}>
          {steps.map((s, i) => (
            <span key={s.id} style={{ display: "flex", alignItems: "center", gap: 2 }}>
              {i > 0 && <span style={{ color: "var(--text-3)", fontSize: 12, padding: "0 2px" }}>›</span>}
              <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 10, cursor: "pointer",
                background: step === s.id ? "var(--accent-dim)" : "transparent",
                color: step === s.id ? "var(--accent)" : "var(--text-3)" }}
                onClick={() => { if (s.id !== "select" && !preview) return; setStep(s.id); }}>
                {s.label}
              </span>
            </span>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* ── Step 1: Select + auto-compose ─────────────────────────────────── */}
        {step === "select" && (
          <>
            {/* Left: input panel */}
            <div style={{ width: 280, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", overflow: "hidden", flexShrink: 0 }}>
              {/* Mode toggle */}
              <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", display: "flex", gap: 0 }}>
                <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: "1px solid var(--border)", width: "100%" }}>
                  {([["check", "勾選 Tables"], ["sql", "SQL 解析"]] as [InputMode, string][]).map(([m, label]) => (
                    <button key={m} onClick={() => switchMode(m)}
                      style={{ flex: 1, padding: "4px 0", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, transition: "all 0.15s",
                        background: inputMode === m ? "var(--accent)" : "var(--bg-3)",
                        color: inputMode === m ? "#fff" : "var(--text-3)" }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Check mode: cross-schema table picker */}
              {inputMode === "check" && (
                <SchemaTablePicker
                  primarySchemaId={schemaId}
                  checked={checked}
                  onToggle={toggle}
                />
              )}

              {/* SQL mode: input area (single-schema) */}
              {inputMode === "sql" && (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: 10, gap: 8, overflow: "hidden" }}>
                  <div style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.5 }}>貼入含 JOIN 的 SQL 語句，系統自動解析 Table 與 JOIN 條件：</div>
                  <textarea
                    value={sqlInput}
                    onChange={e => { setSqlInput(e.target.value); setSqlError(null); }}
                    placeholder={"SELECT *\nFROM lots\nLEFT JOIN wafers\n  ON wafers.lot_id = lots.lot_id\nLEFT JOIN process_steps\n  ON process_steps.lot_id = lots.lot_id"}
                    spellCheck={false}
                    style={{ flex: 1, resize: "none", fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.6, background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text-1)", borderRadius: 6, padding: "8px 10px", outline: "none", tabSize: 2 }}
                  />
                  {sqlError && (
                    <div style={{ padding: "6px 8px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 4, fontSize: 11, color: "var(--error, #f87171)" }}>
                      {sqlError}
                    </div>
                  )}
                  <button className="btn btn-primary" onClick={handleParseSql} disabled={!sqlInput.trim() || sqlParsing} style={{ width: "100%" }}>
                    {sqlParsing ? "解析中..." : "解析 SQL →"}
                  </button>
                  <div style={{ fontSize: 10, color: "var(--text-3)", lineHeight: 1.5 }}>
                    SQL 模式限目前 Schema 的 Tables。跨 Schema 請使用「勾選」模式。
                  </div>
                </div>
              )}
            </div>

            {/* Right: live preview + flow diagram */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
              {!preview && !analyzing && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, color: "var(--text-3)", gap: 8 }}>
                  <div style={{ fontSize: 28 }}>⊞</div>
                  <div style={{ fontSize: 13 }}>
                    {inputMode === "check" ? "勾選 2 張以上 Table（可跨 Schema），系統將自動分析 FK 關係" : "貼入 SQL，點擊「解析 SQL」查看關聯圖"}
                  </div>
                </div>
              )}

              {analyzing && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-3)", fontSize: 12 }}>
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", animation: "blink 1s infinite" }} />
                  分析 FK 關係中...
                </div>
              )}

              {preview && !analyzing && (
                <>
                  <JoinFlowDiagram sources={sources} columns={columns} />

                  <SectionHeader title="Join 關係設定" badge={`${sources.filter(s => s.position > 0 && s.joinCondition).length} / ${sources.length - 1} 已解析`} badgeColor={unresolved > 0 ? "var(--warning)" : "var(--success)"} />
                  <JoinGraph sources={sources} editable onUpdate={updateJoin} />

                  {unresolved > 0 && (
                    <div style={{ padding: "10px 12px", background: "rgba(251,191,36,0.08)", border: "1px solid var(--warning)", borderRadius: 6, fontSize: 12, color: "var(--warning)" }}>
                      ⚠ {unresolved} 個 Join 條件未能自動偵測，請手動填寫 ON 條件後再繼續
                    </div>
                  )}

                  <SectionHeader title="欄位預覽" badge={`${columns.length} 個欄位`} />
                  <ColumnSummary sources={sources} columns={columns} />

                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-primary" onClick={() => setStep("columns")}>下一步：選擇欄位 →</button>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* ── Step 2: Column selection ─────────────────────────────────────── */}
        {step === "columns" && (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 13, color: "var(--text-2)" }}>勾選要納入寬表的欄位，並可修改輸出名稱。橘色標記表示名稱衝突已自動加前綴。</div>
            <ColumnTable columns={columns} onToggle={toggleColumn} onRename={renameColumn} />
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setStep("select")}>← 上一步</button>
              <button className="btn btn-primary" onClick={() => setStep("save")}>下一步：命名儲存 →</button>
            </div>
          </div>
        )}

        {/* ── Step 3: Save ─────────────────────────────────────────────────── */}
        {step === "save" && (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ maxWidth: 520, display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: "var(--text-2)", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>寬表名稱（將作為 VIEW 名稱）</label>
                <input className="form-input" placeholder="例：parts_with_suppliers" value={name}
                  onChange={e => setName(e.target.value)} style={{ fontFamily: "var(--font-mono)" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "var(--text-2)", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>說明（可選）</label>
                <input className="form-input" placeholder="這個寬表的用途" value={description} onChange={e => setDescription(e.target.value)} />
              </div>
              <div style={{ padding: "10px 12px", background: "var(--bg-3)", borderRadius: 6, fontSize: 12, color: "var(--text-2)" }}>
                {sources.length} 張 Table · {columns.filter(c => c.included).length} 個欄位（共 {columns.length} 個）
                <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                  {sources.map((s, i) => (
                    <span key={s.tableId} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      {i > 0 && <span style={{ color: "var(--text-3)" }}>›</span>}
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: i === 0 ? "var(--warning)" : "var(--accent)" }}>{s.tableName}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <SqlPreview sql={sql} />
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setStep("columns")}>← 上一步</button>
              <button className="btn btn-primary" onClick={save} disabled={saving || !name.trim()}>
                {saving ? "儲存中..." : "✓ 儲存寬表"}
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes blink { 0%,100% { opacity:1 } 50% { opacity:0.3 } }`}</style>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ title, badge, badgeColor }: { title: string; badge?: string; badgeColor?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)" }}>{title}</span>
      {badge && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, background: "var(--bg-4)", color: badgeColor ?? "var(--text-3)", fontWeight: 600 }}>{badge}</span>}
    </div>
  );
}

// Quick column count summary per table (used in step 1 preview)
function ColumnSummary({ sources, columns }: { sources: PreviewSource[]; columns: PreviewColumn[] }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {sources.map(src => {
        const cols = columns.filter(c => c.sourcePosition === src.position);
        return (
          <div key={src.tableId} style={{ padding: "6px 10px", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 11 }}>
            <span style={{ fontFamily: "var(--font-mono)", color: src.position === 0 ? "var(--warning)" : "var(--accent)" }}>{src.tableName}</span>
            <span style={{ color: "var(--text-3)", marginLeft: 6 }}>{cols.length} 欄</span>
          </div>
        );
      })}
    </div>
  );
}

function JoinGraph({ sources, editable, onUpdate }: {
  sources: PreviewSource[];
  editable?: boolean;
  onUpdate?: (pos: number, field: "joinType" | "joinCondition" | "colPrefix", value: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {sources.map((src, i) => (
        <div key={src.tableId}>
          {i > 0 && (
            <div style={{ display: "flex", gap: 8, padding: "4px 0 4px 20px", alignItems: "center" }}>
              <div style={{ width: 1, height: 20, background: "var(--border)", marginLeft: 8, flexShrink: 0 }} />
              <div style={{ display: "flex", gap: 6, alignItems: "center", flex: 1 }}>
                {editable ? (
                  <select value={src.joinType} onChange={e => onUpdate?.(src.position, "joinType", e.target.value as JoinType)}
                    style={{ background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text-2)", borderRadius: 4, padding: "2px 6px", fontSize: 11, fontFamily: "var(--font-mono)", cursor: "pointer" }}>
                    <option value="LEFT">LEFT JOIN</option>
                    <option value="INNER">INNER JOIN</option>
                  </select>
                ) : (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--warning)", whiteSpace: "nowrap" }}>{src.joinType} JOIN</span>
                )}
                {editable ? (
                  <input value={src.joinCondition ?? ""} placeholder="ON …"
                    onChange={e => onUpdate?.(src.position, "joinCondition", e.target.value)}
                    style={{ flex: 1, background: "var(--bg-3)", border: `1px solid ${src.joinCondition ? "var(--border)" : "var(--warning)"}`, color: src.joinCondition ? "var(--text-1)" : "var(--text-3)", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontFamily: "var(--font-mono)", outline: "none" }} />
                ) : (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: src.joinCondition ? "var(--text-3)" : "var(--error)", flex: 1 }}>
                    {src.joinCondition ? `ON ${src.joinCondition}` : "⚠ 無 JOIN 條件"}
                  </span>
                )}
              </div>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px",
            background: "var(--bg-2)", border: `1px solid ${i === 0 ? "var(--warning)" : "var(--border)"}`,
            borderLeft: `3px solid ${i === 0 ? "var(--warning)" : "var(--accent)"}`,
            borderRadius: 6 }}>
            <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 8, fontWeight: 700, flexShrink: 0,
              background: i === 0 ? "rgba(251,191,36,0.15)" : "var(--accent-dim)",
              color: i === 0 ? "var(--warning)" : "var(--accent)" }}>
              {i === 0 ? "BASE" : `JOIN ${i}`}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-1)" }}>{src.tableName}</div>
              {src.schemaName && <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>{src.schemaName}</div>}
            </div>
            {editable && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                <span style={{ fontSize: 10, color: "var(--text-3)" }}>前綴:</span>
                <input value={src.colPrefix} placeholder={i === 0 ? "—" : `${src.tableName}_`}
                  onChange={e => onUpdate?.(src.position, "colPrefix", e.target.value)}
                  style={{ width: 120, background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text-2)", borderRadius: 4, padding: "2px 6px", fontSize: 11, fontFamily: "var(--font-mono)", outline: "none" }} />
              </div>
            )}
            {!editable && src.colPrefix && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>前綴: {src.colPrefix}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ColumnTable({ columns, readOnly, onToggle, onRename }: {
  columns: PreviewColumn[]; readOnly?: boolean;
  onToggle?: (srcPos: number, fieldId: number) => void;
  onRename?: (srcPos: number, fieldId: number, val: string) => void;
}) {
  const grouped = [...new Map(columns.map(c => [c.sourcePosition, c.tableName])).entries()]
    .sort((a, b) => a[0] - b[0]);

  return (
    <div>
      {!readOnly && (
        <div style={{ marginBottom: 8, fontSize: 12, color: "var(--text-3)" }}>
          已選 {columns.filter(c => c.included).length} / {columns.length} 個欄位
        </div>
      )}
      {grouped.map(([srcPos, tableName]) => {
        const cols = columns.filter(c => c.sourcePosition === srcPos);
        return (
          <div key={srcPos} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ padding: "1px 6px", borderRadius: 8, fontWeight: 700, fontSize: 10,
                background: srcPos === 0 ? "rgba(251,191,36,0.15)" : "var(--accent-dim)",
                color: srcPos === 0 ? "var(--warning)" : "var(--accent)" }}>
                {srcPos === 0 ? "BASE" : `JOIN ${srcPos}`}
              </span>
              {tableName}
            </div>
            <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "28px 160px 110px 1fr 70px", padding: "5px 12px", background: "var(--bg-3)", fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", fontWeight: 600, gap: 8, borderBottom: "1px solid var(--border)" }}>
                <div /><div>來源欄位</div><div>類型</div><div>輸出名稱</div><div>衝突</div>
              </div>
              {cols.map(col => (
                <div key={col.fieldId} style={{ display: "grid", gridTemplateColumns: "28px 160px 110px 1fr 70px", padding: "6px 12px", alignItems: "center", gap: 8, borderTop: "1px solid var(--border)", background: col.hasConflict ? "rgba(251,191,36,0.04)" : "transparent", opacity: col.included ? 1 : 0.4, transition: "opacity 0.15s" }}>
                  <div>
                    {!readOnly && (
                      <div onClick={() => onToggle?.(col.sourcePosition, col.fieldId)}
                        style={{ width: 13, height: 13, borderRadius: 3, cursor: "pointer",
                          border: `1px solid ${col.included ? "var(--accent)" : "var(--border-light)"}`,
                          background: col.included ? "var(--accent)" : "var(--bg-4)",
                          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#fff" }}>
                        {col.included ? "✓" : ""}
                      </div>
                    )}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-2)" }}>{col.fieldName}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>{col.dataType}</div>
                  <div>
                    {!readOnly ? (
                      <input value={col.outputName} onChange={e => onRename?.(col.sourcePosition, col.fieldId, e.target.value)}
                        style={{ width: "100%", background: "transparent", border: "none", borderBottom: "1px solid var(--border)", color: "var(--text-1)", fontSize: 11, fontFamily: "var(--font-mono)", outline: "none", padding: "1px 0" }} />
                    ) : (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-1)" }}>{col.outputName}</span>
                    )}
                  </div>
                  <div>{col.hasConflict && <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 3, background: "rgba(251,191,36,0.2)", color: "var(--warning)" }}>已加前綴</span>}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SqlPreview({ sql }: { sql: string }) {
  const { showToast } = useStore();
  return (
    <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8, minWidth: 0 }}>
      <div style={{ padding: "8px 14px", background: "var(--bg-3)", borderBottom: "1px solid var(--border)", borderRadius: "8px 8px 0 0", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
        <span>SQL VIEW 預覽</span>
        <button onClick={() => navigator.clipboard.writeText(sql).then(() => showToast("✓ SQL 已複製"))}
          style={{ padding: "3px 8px", borderRadius: 3, border: "none", fontSize: 11, cursor: "pointer", background: "var(--bg-4)", color: "var(--text-2)" }}>複製</button>
      </div>
      <pre style={{ padding: 14, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-2)", whiteSpace: "pre", overflowX: "auto", lineHeight: 1.6, margin: 0, borderRadius: "0 0 8px 8px" }}>{sql}</pre>
    </div>
  );
}

function buildViewSqlClient(viewName: string, sources: PreviewSource[], columns: PreviewColumn[]): string {
  const included = columns.filter(c => c.included);
  const selects = included.map(c => `  \`${c.tableName}\`.\`${c.fieldName}\` AS \`${c.outputName}\``);
  const base = sources.find(s => s.position === 0);
  if (!base) return "";
  const joins = sources.filter(s => s.position > 0).map(s => {
    const jt = s.joinType === "INNER" ? "INNER JOIN" : "LEFT JOIN";
    const on = s.joinCondition ? ` ON ${s.joinCondition}` : "";
    return `${jt} \`${s.tableName}\`${on}`;
  });
  return [`CREATE OR REPLACE VIEW \`${viewName}\` AS`, `SELECT`, selects.join(",\n"), `FROM \`${base.tableName}\``, ...joins, ";"].join("\n");
}
