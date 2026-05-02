import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "../store.js";
import { api, type SchemaDetail } from "../api.js";

function buildMermaid(schema: SchemaDetail, visible: Set<number>): string {
  const lines = ["erDiagram"];
  const relations: string[] = [];

  for (const table of schema.tables) {
    if (!visible.has(table.id)) continue;
    lines.push(`  ${table.name} {`);
    for (const f of [...table.fields].sort((a, b) => a.position - b.position)) {
      const pkMark = f.isPrimaryKey ? " PK" : "";
      const safeType = f.dataType.replace(/[()]/g, "_").replace(/,/g, "").replace(/\s/g, "_");
      lines.push(`    ${safeType} ${f.name}${pkMark}`);
    }
    lines.push("  }");

    // Detect FK-like fields (_id suffix matching another table)
    for (const f of table.fields) {
      if (!f.name.endsWith("_id") || f.isPrimaryKey) continue;
      const refName = f.name.slice(0, -3); // remove _id
      const ref = schema.tables.find(t => t.name === refName || t.name === `${refName}s` || t.name === `${refName}es`);
      if (ref && visible.has(ref.id)) {
        const rel = f.nullable ? "||--o{" : "||--||";
        relations.push(`  ${ref.name} ${rel} ${table.name} : "${f.name}"`);
      }
    }
  }

  lines.push("");
  for (const r of relations) lines.push(r);
  return lines.join("\n");
}

export default function ErDiagramPage() {
  const { selectedSchemaId, showToast } = useStore();
  const [visible, setVisible] = useState<Set<number>>(new Set());
  const [mermaidCode, setMermaidCode] = useState("");
  const diagramRef = useRef<HTMLDivElement>(null);
  const mermaidLoadedRef = useRef(false);

  const { data: schema } = useQuery({
    queryKey: ["schema", selectedSchemaId],
    queryFn: () => api.schemas.get(selectedSchemaId!),
    enabled: !!selectedSchemaId,
  });

  // Init visible when schema loads
  useEffect(() => {
    if (schema && visible.size === 0) {
      setVisible(new Set(schema.tables.map(t => t.id)));
    }
  }, [schema]);

  useEffect(() => {
    if (!schema || visible.size === 0) return;
    const code = buildMermaid(schema, visible);
    setMermaidCode(code);
    renderDiagram(code);
  }, [schema, visible]);

  async function renderDiagram(code: string) {
    if (!diagramRef.current) return;
    try {
      const mermaid = (await import("mermaid")).default;
      if (!mermaidLoadedRef.current) {
        mermaid.initialize({
          startOnLoad: false, theme: "dark",
          themeVariables: {
            primaryColor: "#1f1f28", primaryTextColor: "#e4e4f0",
            primaryBorderColor: "#7b8cff", lineColor: "#555568",
            secondaryColor: "#27272f", tertiaryColor: "#17171d",
            fontFamily: "JetBrains Mono, Fira Code, monospace", fontSize: "12px",
          },
          er: { diagramPadding: 20, layoutDirection: "TB", minEntityWidth: 100, minEntityHeight: 75, entityPadding: 15, useMaxWidth: true },
        });
        mermaidLoadedRef.current = true;
      }
      const id = `mermaid-${Date.now()}`;
      const { svg } = await mermaid.render(id, code);
      diagramRef.current.innerHTML = svg;
    } catch (e) {
      if (diagramRef.current) diagramRef.current.innerHTML = `<pre style="color:var(--error);font-size:11px;padding:12px">${String(e)}</pre>`;
    }
  }

  function toggleTable(id: number) {
    setVisible(prev => {
      const next = new Set(prev);
      if (next.has(id)) { if (next.size <= 1) return prev; next.delete(id); }
      else next.add(id);
      return next;
    });
  }

  function copyMermaid() {
    navigator.clipboard.writeText(mermaidCode).then(() => showToast("✓ Mermaid 原始碼已複製"));
  }

  if (!selectedSchemaId) {
    return <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)" }}>← 從左側選擇一個 Schema</div>;
  }

  const relCount = (mermaidCode.match(/\|\|/g) ?? []).length / 2;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, background: "var(--bg-2)" }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>ER Diagram — {schema?.name}</span>
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>{schema ? `${[...visible].length} 張表 · ${relCount} 個關係` : ""}</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={copyMermaid}>複製 Mermaid</button>
          <button className="btn btn-primary" onClick={() => schema && renderDiagram(buildMermaid(schema, visible))}>↻ 重新整理</button>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar toggles */}
        <div style={{ width: 220, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", background: "var(--bg-2)" }}>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.5px" }}>顯示的 Tables</div>
          <div style={{ padding: 8, flex: 1, overflowY: "auto" }}>
            {schema?.tables.map(t => (
              <div key={t.id} onClick={() => toggleTable(t.id)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 6px", borderRadius: "var(--radius)", cursor: "pointer", transition: "all 0.15s" }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "var(--bg-3)"}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "transparent"}>
                <div style={{ width: 14, height: 14, borderRadius: 3, border: `1px solid ${visible.has(t.id) ? "var(--accent)" : "var(--border-light)"}`, background: visible.has(t.id) ? "var(--accent)" : "var(--bg-4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, flexShrink: 0, transition: "all 0.15s", color: "#fff" }}>
                  {visible.has(t.id) ? "✓" : ""}
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-2)" }}>{t.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Canvas */}
        <div style={{ flex: 1, overflowY: "auto", overflowX: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Diagram */}
          <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8, padding: 24, minWidth: 600 }}>
            <div ref={diagramRef} style={{ display: "flex", justifyContent: "center" }}>
              <span style={{ color: "var(--text-3)", fontSize: 12 }}>載入圖表中...</span>
            </div>
          </div>

          {/* Mermaid source */}
          <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
            <div style={{ padding: "8px 14px", background: "var(--bg-3)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              <span>Mermaid 原始碼</span>
              <button onClick={copyMermaid} style={{ padding: "3px 8px", borderRadius: 3, border: "none", fontSize: 11, cursor: "pointer", background: "var(--bg-4)", color: "var(--text-2)" }}>複製</button>
            </div>
            <pre style={{ padding: 14, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-2)", whiteSpace: "pre", overflowX: "auto", lineHeight: 1.6, margin: 0 }}>{mermaidCode}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}
