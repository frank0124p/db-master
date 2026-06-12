import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type LineageEdge, type LineageTransformType, type LineageNodeKind } from "../api.js";
import { useStore } from "../store.js";
import { LineageSvgGraph, LineageLegend, nodeKey, type GraphNode } from "./LineageGraph.js";

// ── Add Edge Panel ─────────────────────────────────────────────────────────────

function AddEdgePanel({
  schemas,
  onClose,
  onAdd,
}: {
  schemas: { id: number; name: string; domain: string; tables: { id: number; name: string }[] }[];
  onClose: () => void;
  onAdd: (edge: Omit<LineageEdge, "id" | "createdAt">) => void;
}) {
  const [fromSchemaId, setFromSchemaId] = useState<number | "">(schemas[0]?.id ?? "");
  const [fromTableId, setFromTableId] = useState<number | "">("");
  const [toSchemaId, setToSchemaId] = useState<number | "">(schemas[1]?.id ?? schemas[0]?.id ?? "");
  const [toTableId, setToTableId] = useState<number | "">("");
  const [transformType, setTransformType] = useState<LineageTransformType>("direct");
  const [description, setDescription] = useState("");

  const fromSchema = schemas.find(s => s.id === fromSchemaId);
  const toSchema = schemas.find(s => s.id === toSchemaId);

  const sel: React.CSSProperties = {
    background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text-1)",
    padding: "5px 8px", borderRadius: 5, fontSize: 12, fontFamily: "inherit", width: "100%",
  };
  const inp: React.CSSProperties = { ...sel, outline: "none" };
  const lbl: React.CSSProperties = { fontSize: 10, color: "var(--text-3)", display: "block", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.4px" };

  function canSubmit() { return fromSchemaId !== "" && fromTableId !== "" && toSchemaId !== "" && toTableId !== ""; }

  function handleSubmit() {
    if (!canSubmit()) return;
    const fS = schemas.find(s => s.id === fromSchemaId)!;
    const tS = schemas.find(s => s.id === toSchemaId)!;
    const fT = fS.tables.find(t => t.id === fromTableId)!;
    const tT = tS.tables.find(t => t.id === toTableId)!;
    onAdd({
      fromSchemaId: fS.id, fromSchemaName: fS.name, fromDomain: fS.domain || "未分類",
      fromTableId: fT.id, fromTableName: fT.name, fromKind: "table",
      toSchemaId: tS.id, toSchemaName: tS.name, toDomain: tS.domain || "未分類",
      toTableId: tT.id, toTableName: tT.name, toKind: "table",
      transformType, description, source: "manual",
    });
  }

  return (
    <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg-2)", flexShrink: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10, color: "var(--text-1)" }}>新增血緣關係</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
        <div>
          <label style={lbl}>來源 Schema</label>
          <select style={sel} value={fromSchemaId} onChange={e => { setFromSchemaId(Number(e.target.value)); setFromTableId(""); }}>
            {schemas.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>來源 Table</label>
          <select style={sel} value={fromTableId} onChange={e => setFromTableId(Number(e.target.value))}>
            <option value="">— 選擇 —</option>
            {(fromSchema?.tables ?? []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>目標 Schema</label>
          <select style={sel} value={toSchemaId} onChange={e => { setToSchemaId(Number(e.target.value)); setToTableId(""); }}>
            {schemas.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>目標 Table</label>
          <select style={sel} value={toTableId} onChange={e => setToTableId(Number(e.target.value))}>
            <option value="">— 選擇 —</option>
            {(toSchema?.tables ?? []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8, marginBottom: 10 }}>
        <div>
          <label style={lbl}>轉換類型</label>
          <select style={sel} value={transformType} onChange={e => setTransformType(e.target.value as LineageTransformType)}>
            <option value="direct">direct — 直接搬移</option>
            <option value="join">join — JOIN 合併</option>
            <option value="aggregate">aggregate — 聚合計算</option>
            <option value="derived">derived — 衍生欄位</option>
            <option value="filter">filter — 篩選子集</option>
          </select>
        </div>
        <div>
          <label style={lbl}>說明（選填）</label>
          <input style={inp} value={description} onChange={e => setDescription(e.target.value)} placeholder="例：每日 ETL 批次彙整" />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={onClose}>取消</button>
        <button className="btn btn-primary" style={{ fontSize: 11 }} disabled={!canSubmit()} onClick={handleSubmit}>新增</button>
      </div>
    </div>
  );
}

// ── Node detail sidebar ───────────────────────────────────────────────────────

function NodeDetailSidebar({
  nodeK, edges, schemas, onClose,
}: {
  nodeK: string;
  edges: LineageEdge[];
  schemas: { id: number; name: string; domain: string; tables: { id: number; name: string; comment?: string | null }[] }[];
  onClose: () => void;
}) {
  const [, schemaIdStr, tableIdStr] = nodeK.split(":");
  const schemaId = Number(schemaIdStr);
  const tableId = Number(tableIdStr);
  const schema = schemas.find(s => s.id === schemaId);
  const table = schema?.tables.find(t => t.id === tableId);
  const upstream = edges.filter(e => e.toSchemaId === schemaId && e.toTableId === tableId);
  const downstream = edges.filter(e => e.fromSchemaId === schemaId && e.fromTableId === tableId);

  if (!schema || !table) return null;

  return (
    <div style={{ width: 260, flexShrink: 0, borderLeft: "1px solid var(--border)", background: "var(--bg-2)", padding: 14, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1)" }}>{table.name}</div>
        <button style={{ background: "transparent", border: "none", color: "var(--text-3)", cursor: "pointer", fontSize: 14 }} onClick={onClose}>✕</button>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-2)" }}>{schema.name} · {schema.domain || "未分類"}</div>

      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>上游 ({upstream.length})</div>
        {upstream.length === 0
          ? <div style={{ fontSize: 11, color: "var(--text-3)" }}>— 無上游（源頭）</div>
          : upstream.map(e => (
            <div key={e.id} style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 4, padding: "4px 8px", background: "var(--bg-3)", borderRadius: 4 }}>
              ↑ {e.fromDomain}/{e.fromSchemaName}.{e.fromTableName}
              <span style={{ fontSize: 10, color: "var(--text-3)", marginLeft: 6 }}>[{e.transformType}]</span>
            </div>
          ))
        }
      </div>

      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>下游 ({downstream.length})</div>
        {downstream.length === 0
          ? <div style={{ fontSize: 11, color: "var(--text-3)" }}>— 無下游（終點）</div>
          : downstream.map(e => (
            <div key={e.id} style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 4, padding: "4px 8px", background: "var(--bg-3)", borderRadius: 4 }}>
              ↓ {e.toDomain}/{e.toSchemaName}.{e.toTableName}
              <span style={{ fontSize: 10, color: "var(--text-3)", marginLeft: 6 }}>[{e.transformType}]</span>
            </div>
          ))
        }
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function GlobalGraphPage() {
  const qc = useQueryClient();
  const { showToast, setPage } = useStore();
  const [showAdd, setShowAdd] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [filterDomain, setFilterDomain] = useState("all");

  const { data: edges = [] } = useQuery({ queryKey: ["lineage"], queryFn: api.lineage.list });
  const { data: schemaMetas = [] } = useQuery({ queryKey: ["schemas"], queryFn: () => api.schemas.list() });
  const { data: schemaDetails = [] } = useQuery({
    queryKey: ["schemas-full-lineage"],
    queryFn: async () => Promise.all(schemaMetas.map(m => api.schemas.get(m.id))),
    enabled: schemaMetas.length > 0,
  });

  // Build all graph nodes from schemas + unique wide-table/governed targets from edges
  const allNodes = useMemo((): GraphNode[] => {
    const result: GraphNode[] = [];
    const seen = new Set<string>();

    // Regular tables
    for (const s of schemaDetails) {
      for (const t of s.tables) {
        const k = nodeKey(s.id, t.id, "table");
        if (!seen.has(k)) { seen.add(k); result.push({ schemaId: s.id, schemaName: s.name, domain: s.domain || "未分類", tableId: t.id, tableName: t.name, kind: "table" }); }
      }
    }

    // Virtual nodes from edges (wide-tables, governed)
    for (const e of edges) {
      const fromK = nodeKey(e.fromSchemaId, e.fromTableId, e.fromKind ?? "table");
      if (!seen.has(fromK)) {
        seen.add(fromK);
        result.push({ schemaId: e.fromSchemaId, schemaName: e.fromSchemaName, domain: e.fromDomain, tableId: e.fromTableId, tableName: e.fromTableName, kind: e.fromKind ?? "table" });
      }
      const toK = nodeKey(e.toSchemaId, e.toTableId, e.toKind ?? "table");
      if (!seen.has(toK)) {
        seen.add(toK);
        result.push({ schemaId: e.toSchemaId, schemaName: e.toSchemaName, domain: e.toDomain, tableId: e.toTableId, tableName: e.toTableName, kind: e.toKind ?? "table" });
      }
    }

    return result;
  }, [schemaDetails, edges]);

  const domains = useMemo(() => ["all", ...new Set(allNodes.map(n => n.domain)).values()], [allNodes]);

  const visibleNodes = useMemo(() =>
    filterDomain === "all" ? allNodes : allNodes.filter(n => n.domain === filterDomain),
    [allNodes, filterDomain]
  );

  const visibleEdges = useMemo(() =>
    edges.filter(e => {
      if (filterDomain === "all") return true;
      return e.fromDomain === filterDomain || e.toDomain === filterDomain;
    }),
    [edges, filterDomain]
  );

  const addMut = useMutation({
    mutationFn: (e: Omit<LineageEdge, "id" | "createdAt">) => api.lineage.add(e),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["lineage"] }); setShowAdd(false); showToast("✓ 血緣關係已新增"); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.lineage.remove(id),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["lineage"] }); showToast("✓ 已刪除"); },
  });

  // Stats
  const autoEdges = edges.filter(e => e.source !== "manual").length;
  const schemaForNodes = schemaDetails.map(s => ({ id: s.id, name: s.name, domain: s.domain || "未分類", tables: s.tables.map(t => ({ id: t.id, name: t.name })) }));

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", background: "var(--bg-1)" }}>
      {/* Toolbar */}
      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0, display: "flex", alignItems: "center", gap: 10, background: "var(--bg-2)" }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>全局血緣圖</span>
        <span style={{ fontSize: 11, color: "var(--text-3)" }}>{edges.length} 條關係（{autoEdges} 自動 · {edges.length - autoEdges} 手動）</span>

        {/* Domain filter */}
        <select
          style={{ background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text-1)", padding: "4px 8px", borderRadius: 5, fontSize: 11, fontFamily: "inherit" }}
          value={filterDomain} onChange={e => setFilterDomain(e.target.value)}>
          {domains.map(d => <option key={d} value={d}>{d === "all" ? "所有 Domain" : d}</option>)}
        </select>

        <div style={{ flex: 1 }} />
        <LineageLegend showSource />
        <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setPage("lineage")}>
          ⇝ 切換查詢模式
        </button>
        <button className={showAdd ? "btn btn-ghost" : "btn btn-primary"} style={{ fontSize: 12 }}
          onClick={() => setShowAdd(v => !v)}>
          {showAdd ? "取消" : "+ 新增關係"}
        </button>
      </div>

      {showAdd && schemaDetails.length > 0 && (
        <AddEdgePanel
          schemas={schemaForNodes}
          onClose={() => setShowAdd(false)}
          onAdd={e => addMut.mutate(e)}
        />
      )}

      {/* Graph + optional node detail */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <LineageSvgGraph
          nodes={visibleNodes}
          edges={visibleEdges}
          selectedNodeKey={selectedKey}
          onSelectNode={setSelectedKey}
          onDeleteEdge={id => deleteMut.mutate(id)}
        />
        {selectedKey && (
          <NodeDetailSidebar
            nodeK={selectedKey}
            edges={edges}
            schemas={schemaForNodes}
            onClose={() => setSelectedKey(null)}
          />
        )}
      </div>
    </div>
  );
}
