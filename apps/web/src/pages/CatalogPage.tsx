import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type GovGovernedWideTable } from "../api.js";

const S = {
  page: { flex: 1, display: "flex", overflow: "hidden", background: "var(--bg-1)" } as const,
  list: { width: 280, flexShrink: 0, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", overflow: "hidden" } as const,
  listHead: { padding: "12px 14px", borderBottom: "1px solid var(--border)", flexShrink: 0 } as const,
  searchBox: { padding: "8px 10px", borderBottom: "1px solid var(--border)", flexShrink: 0 } as const,
  items: { flex: 1, overflowY: "auto" } as const,
  item: (active: boolean) => ({
    padding: "10px 14px", borderBottom: "1px solid var(--border)", cursor: "pointer",
    background: active ? "var(--accent-dim)" : "transparent",
    borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
  } as const),
  main: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" } as const,
  detail: { flex: 1, overflowY: "auto", padding: 20 } as const,
};

function GwtDetail({ gwt }: { gwt: GovGovernedWideTable }) {
  const [activeTab, setActiveTab] = useState<"columns" | "lineage" | "markdown">("columns");
  const { data: mdData } = useQuery({
    queryKey: ["gov-gwt-md", gwt.slug],
    queryFn: () => api.catalog.getMarkdown(gwt.slug),
    enabled: activeTab === "markdown",
  });

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>{gwt.name}</span>
          <span style={{ fontSize: 9, background: gwt.blockKind === "small" ? "rgba(52,211,153,0.15)" : "rgba(167,139,250,0.15)", color: gwt.blockKind === "small" ? "#34d399" : "#a78bfa", padding: "1px 5px", borderRadius: 3, fontWeight: 700, border: `1px solid ${gwt.blockKind === "small" ? "rgba(52,211,153,0.3)" : "rgba(167,139,250,0.3)"}` }}>
            {gwt.blockKind}
          </span>
          <span style={{ fontSize: 9, background: "rgba(96,165,250,0.15)", color: "#60a5fa", padding: "1px 5px", borderRadius: 3, fontWeight: 700, border: "1px solid rgba(96,165,250,0.3)" }}>
            v{gwt.version}
          </span>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 2 }}>{gwt.description}</div>
        <div style={{ fontSize: 11, color: "var(--text-3)" }}>
          Published by {gwt.publishedBy} · {new Date(gwt.publishedAt).toLocaleString()}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, padding: "0 20px", borderBottom: "1px solid var(--border)", flexShrink: 0, background: "var(--bg-2)" }}>
        {(["columns", "lineage", "markdown"] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{ padding: "7px 12px", fontSize: 12, cursor: "pointer", border: "none", background: "transparent", fontFamily: "inherit",
              borderBottom: activeTab === tab ? "2px solid var(--accent)" : "2px solid transparent",
              color: activeTab === tab ? "var(--accent)" : "var(--text-2)" }}>
            {tab === "columns" ? "欄位定義" : tab === "lineage" ? "血緣關係" : "Markdown"}
          </button>
        ))}
      </div>

      <div style={S.detail}>
        {activeTab === "columns" && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "var(--bg-2)", borderBottom: "1px solid var(--border)" }}>
                {["column", "type", "source", "definition"].map(h => (
                  <th key={h} style={{ padding: "7px 14px", textAlign: "left", color: "var(--text-3)", fontWeight: 600, fontSize: 10, textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gwt.columns.map(col => (
                <tr key={col.name} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "7px 14px", fontFamily: "var(--font-mono)", color: "var(--text-1)" }}>{col.name}</td>
                  <td style={{ padding: "7px 14px", fontFamily: "var(--font-mono)", color: "var(--text-3)" }}>{col.dataType}</td>
                  <td style={{ padding: "7px 14px", fontFamily: "var(--font-mono)", color: "var(--text-3)", fontSize: 11 }}>{col.source.tableName}.{col.source.fieldName}</td>
                  <td style={{ padding: "7px 14px", color: "var(--text-2)" }}>{col.definition}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {activeTab === "lineage" && (
          <div>
            {gwt.joinGraph.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>JOIN 關係</div>
                {gwt.joinGraph.map((j, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "var(--bg-2)", borderRadius: 6, border: "1px solid var(--border)", marginBottom: 6, fontFamily: "var(--font-mono)", fontSize: 12 }}>
                    <span style={{ color: "var(--text-1)" }}>{j.leftRef}</span>
                    <span style={{ color: "var(--accent)", fontWeight: 700 }}>{j.type.toUpperCase()} JOIN</span>
                    <span style={{ color: "var(--text-1)" }}>{j.rightRef}</span>
                    <span style={{ color: "var(--text-3)", fontSize: 11 }}>ON {j.on.map(o => `${o.leftField}=${o.rightField}`).join(", ")}</span>
                  </div>
                ))}
              </div>
            )}

            {gwt.relationships.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>相關表</div>
                {gwt.relationships.map((r, i) => (
                  <div key={i} style={{ padding: "8px 12px", background: "var(--bg-2)", borderRadius: 6, border: "1px solid var(--border)", marginBottom: 6, fontSize: 12 }}>
                    <span style={{ fontWeight: 600, color: "var(--accent)" }}>{r.relation}</span>
                    {" → "}
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-1)" }}>{r.targetRef}</span>
                    <span style={{ fontSize: 11, color: "var(--text-3)", marginLeft: 8 }}>{r.note}</span>
                  </div>
                ))}
              </div>
            )}

            {gwt.joinGraph.length === 0 && gwt.relationships.length === 0 && (
              <div style={{ color: "var(--text-3)", fontSize: 12, textAlign: "center", padding: "24px 0" }}>無血緣資訊</div>
            )}
          </div>
        )}

        {activeTab === "markdown" && (
          <div>
            {mdData ? (
              <pre style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-1)", whiteSpace: "pre-wrap", margin: 0 }}>
                {mdData.markdown}
              </pre>
            ) : (
              <div style={{ color: "var(--text-3)", fontSize: 12 }}>載入中…</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CatalogPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { data: tables = [] } = useQuery({ queryKey: ["gov-catalog"], queryFn: api.catalog.list });

  const filtered = tables.filter(t =>
    !search.trim() ||
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.description.toLowerCase().includes(search.toLowerCase())
  );

  const selectedTable = tables.find(t => t.slug === selected) ?? null;

  return (
    <div style={S.page}>
      <div style={S.list}>
        <div style={S.listHead}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>治理目錄</div>
          <div style={{ fontSize: 11, color: "var(--text-3)" }}>{tables.length} 張已治理寬表</div>
        </div>
        <div style={S.searchBox}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋名稱、描述…"
            style={{ width: "100%", background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--text-1)", padding: "5px 8px", borderRadius: 5, fontSize: 12, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
        </div>
        <div style={S.items}>
          {filtered.length === 0 && (
            <div style={{ padding: "24px 14px", fontSize: 12, color: "var(--text-3)", textAlign: "center" }}>
              {tables.length === 0 ? "尚無已發布的寬表" : "無符合搜尋結果"}
            </div>
          )}
          {filtered.map(t => (
            <div key={t.slug} style={S.item(selected === t.slug)} onClick={() => setSelected(t.slug)}>
              <div style={{ fontSize: 12, fontWeight: 600, color: selected === t.slug ? "var(--accent)" : "var(--text-1)", marginBottom: 3 }}>{t.name}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: t.blockKind === "small" ? "rgba(52,211,153,0.15)" : "rgba(167,139,250,0.15)", color: t.blockKind === "small" ? "#34d399" : "#a78bfa" }}>
                  {t.blockKind}
                </span>
                <span style={{ fontSize: 9, color: "var(--text-3)" }}>v{t.version} · {t.columns.length} 欄</span>
              </div>
              <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t.description}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={S.main}>
        {selectedTable ? (
          <GwtDetail key={selectedTable.slug} gwt={selectedTable} />
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)", fontSize: 13 }}>
            選擇左側寬表查看詳情
          </div>
        )}
      </div>
    </div>
  );
}
