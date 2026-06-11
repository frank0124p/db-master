import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api, type GovImportBatch } from "../api.js";
import { useStore } from "../store.js";

const S = {
  page: { flex: 1, display: "flex", overflow: "hidden", background: "var(--bg-1)" } as const,
  left: { width: 280, flexShrink: 0, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", overflow: "hidden" } as const,
  right: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" } as const,
  listHead: { padding: "12px 14px", borderBottom: "1px solid var(--border)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" } as const,
  list: { flex: 1, overflowY: "auto" } as const,
  item: (active: boolean) => ({
    padding: "10px 14px", borderBottom: "1px solid var(--border)", cursor: "pointer",
    background: active ? "var(--accent-dim)" : "transparent",
    borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
  } as const),
  badge: (status: string) => ({
    fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3,
    background: status === "accepted" ? "rgba(74,222,128,0.15)" : status === "classified" ? "rgba(96,165,250,0.15)" : "rgba(251,191,36,0.15)",
    color: status === "accepted" ? "#4ade80" : status === "classified" ? "#60a5fa" : "#fbbf24",
    border: `1px solid ${status === "accepted" ? "rgba(74,222,128,0.3)" : status === "classified" ? "rgba(96,165,250,0.3)" : "rgba(251,191,36,0.3)"}`,
  } as const),
  confidence: (score: number) => ({
    fontSize: 11, fontWeight: 700,
    color: score >= 0.8 ? "#4ade80" : score >= 0.6 ? "#fbbf24" : "#f87171",
  } as const),
};

function NewBatchModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { showToast } = useStore();
  const [form, setForm] = useState({ name: "", ddl: "" });
  const createMut = useMutation({
    mutationFn: () => api.importBatches.create({ name: form.name.trim(), ddl: form.ddl.trim() }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["gov-batches"] });
      showToast("✓ 匯入批次已建立");
      onClose();
    },
  });
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 700, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "var(--bg-2)", border: "1px solid var(--border-light)", borderRadius: 10, width: "min(640px, 92vw)", padding: 20 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>新增匯入批次</div>
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 3, textTransform: "uppercase" }}>批次名稱</label>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            style={{ width: "100%", background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text-1)", padding: "7px 10px", borderRadius: 6, fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
            placeholder="例：MES WIP 模組 DDL" />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 3, textTransform: "uppercase" }}>DDL (SQL)</label>
          <textarea value={form.ddl} onChange={e => setForm(f => ({ ...f, ddl: e.target.value }))}
            style={{ width: "100%", background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text-1)", padding: "7px 10px", borderRadius: 6, fontSize: 12, outline: "none", fontFamily: "var(--font-mono)", height: 240, resize: "vertical", boxSizing: "border-box" } as React.CSSProperties}
            placeholder="CREATE TABLE ..." />
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn btn-primary" disabled={!form.name.trim() || !form.ddl.trim() || createMut.isPending}
            onClick={() => createMut.mutate()}>建立</button>
        </div>
      </div>
    </div>
  );
}

function BatchDetail({ batch }: { batch: GovImportBatch }) {
  const qc = useQueryClient();
  const { showToast } = useStore();
  const [classifying, setClassifying] = useState(false);
  const [classifyLog, setClassifyLog] = useState<string[]>([]);
  const [threshold, setThreshold] = useState("0.7");

  const acceptAllMut = useMutation({
    mutationFn: () => api.importBatches.acceptAll(batch.id, parseFloat(threshold)),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["gov-batches"] }); showToast("✓ 批次接受完成"); },
  });

  const acceptMut = useMutation({
    mutationFn: (tableIdx: number) => api.importBatches.accept(batch.id, tableIdx),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["gov-batches"] }); },
  });

  async function runClassify() {
    if (classifying) return;
    setClassifying(true); setClassifyLog(["開始分類..."]);
    try {
      const res = await api.importBatches.classifySSE(batch.id);
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const ev = JSON.parse(line.slice(6)) as { type: string; tableName?: string; blockKind?: string; confidence?: number };
          if (ev.type === "table-classified") setClassifyLog(prev => [...prev, `✓ ${ev.tableName}: ${ev.blockKind} (${((ev.confidence ?? 0) * 100).toFixed(0)}%)`]);
          if (ev.type === "done") {
            setClassifyLog(prev => [...prev, "✓ 分類完成"]);
            await qc.invalidateQueries({ queryKey: ["gov-batches"] });
          }
          if (ev.type === "error") setClassifyLog(prev => [...prev, `✗ 錯誤`]);
        }
      }
    } catch { setClassifyLog(prev => [...prev, "✗ 連線失敗"]); }
    finally { setClassifying(false); }
  }

  const classified = batch.tables.filter(t => t.classification !== null);
  const accepted = batch.tables.filter(t => t.accepted);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", flexShrink: 0, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{batch.name}</div>
          <div style={{ fontSize: 11, color: "var(--text-3)" }}>
            {batch.tables.length} 張表 · {classified.length} 已分類 · {accepted.length} 已接受
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn btn-primary" style={{ fontSize: 11 }} disabled={classifying} onClick={() => void runClassify()}>
            {classifying ? "分類中…" : "✦ 執行分類"}
          </button>
          <input value={threshold} onChange={e => setThreshold(e.target.value)}
            style={{ width: 56, background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text-1)", padding: "5px 6px", borderRadius: 5, fontSize: 12, outline: "none", textAlign: "center" }}
            title="批次接受信心度閾值" />
          <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => acceptAllMut.mutate()}>
            批次接受
          </button>
        </div>
      </div>

      {classifyLog.length > 0 && (
        <div style={{ padding: "8px 20px", background: "var(--bg-2)", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <div style={{ background: "var(--bg-3)", borderRadius: 6, padding: 8, maxHeight: 100, overflowY: "auto" }}>
            {classifyLog.map((l, i) => (
              <div key={i} style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-2)", marginBottom: 1 }}>{l}</div>
            ))}
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "var(--bg-2)", borderBottom: "1px solid var(--border)" }}>
              <th style={{ padding: "8px 16px", textAlign: "left", color: "var(--text-3)", fontWeight: 600, fontSize: 10, textTransform: "uppercase" }}>表名</th>
              <th style={{ padding: "8px 12px", textAlign: "center", color: "var(--text-3)", fontWeight: 600, fontSize: 10, textTransform: "uppercase" }}>欄位數</th>
              <th style={{ padding: "8px 12px", textAlign: "center", color: "var(--text-3)", fontWeight: 600, fontSize: 10, textTransform: "uppercase" }}>分類</th>
              <th style={{ padding: "8px 12px", textAlign: "center", color: "var(--text-3)", fontWeight: 600, fontSize: 10, textTransform: "uppercase" }}>信心度</th>
              <th style={{ padding: "8px 16px", textAlign: "left", color: "var(--text-3)", fontWeight: 600, fontSize: 10, textTransform: "uppercase" }}>依據</th>
              <th style={{ padding: "8px 12px", textAlign: "center", color: "var(--text-3)", fontWeight: 600, fontSize: 10, textTransform: "uppercase" }}>動作</th>
            </tr>
          </thead>
          <tbody>
            {batch.tables.map(table => (
              <tr key={table.tableName} style={{ borderBottom: "1px solid var(--border)", background: table.accepted ? "rgba(74,222,128,0.04)" : "transparent" }}>
                <td style={{ padding: "8px 16px", fontFamily: "var(--font-mono)", color: "var(--text-1)" }}>
                  {table.tableName}
                  {table.accepted && <span style={{ marginLeft: 6, fontSize: 9, color: "#4ade80" }}>✓ accepted</span>}
                </td>
                <td style={{ padding: "8px 12px", textAlign: "center", color: "var(--text-3)" }}>{table.fieldCount}</td>
                <td style={{ padding: "8px 12px", textAlign: "center" }}>
                  {table.override ? (
                    <span style={{ fontSize: 11, color: "#a78bfa", fontWeight: 700 }}>{table.override.blockKind} (override)</span>
                  ) : table.classification ? (
                    <span style={{ fontSize: 11, fontWeight: 600, color: table.classification.blockKind === "small" ? "#34d399" : "#a78bfa" }}>
                      {table.classification.blockKind}
                    </span>
                  ) : (
                    <span style={{ fontSize: 10, color: "var(--text-3)" }}>-</span>
                  )}
                </td>
                <td style={{ padding: "8px 12px", textAlign: "center" }}>
                  {table.classification && (
                    <span style={S.confidence(table.classification.confidence)}>
                      {(table.classification.confidence * 100).toFixed(0)}%
                    </span>
                  )}
                </td>
                <td style={{ padding: "8px 16px", color: "var(--text-3)", fontSize: 11, maxWidth: 300 }}>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {table.override?.rationale ?? table.classification?.rationale ?? ""}
                  </div>
                </td>
                <td style={{ padding: "8px 12px", textAlign: "center" }}>
                  {!table.accepted && table.classification && (
                    <button className="btn btn-ghost" style={{ fontSize: 10, padding: "2px 8px" }}
                      onClick={() => acceptMut.mutate(batch.tables.indexOf(table))}>
                      接受
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ImportBatchPage() {
  const [selected, setSelected] = useState<number | null>(null);
  const [showNew, setShowNew] = useState(false);
  const { data: batches = [] } = useQuery({ queryKey: ["gov-batches"], queryFn: api.importBatches.list });
  const selectedBatch = batches.find(b => b.id === selected) ?? null;

  return (
    <div style={S.page}>
      <div style={S.left}>
        <div style={S.listHead}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>匯入批次</span>
          <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={() => setShowNew(true)}>+ 新增</button>
        </div>
        <div style={S.list}>
          {batches.length === 0 && (
            <div style={{ padding: "24px 14px", fontSize: 12, color: "var(--text-3)", textAlign: "center" }}>尚無批次</div>
          )}
          {batches.map(b => (
            <div key={b.id} style={S.item(selected === b.id)} onClick={() => setSelected(b.id)}>
              <div style={{ fontSize: 12, fontWeight: 600, color: selected === b.id ? "var(--accent)" : "var(--text-1)", marginBottom: 3 }}>{b.name}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={S.badge(b.status)}>{b.status}</span>
                <span style={{ fontSize: 10, color: "var(--text-3)" }}>{b.tables.length} 張表</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={S.right}>
        {selectedBatch ? (
          <BatchDetail batch={selectedBatch} />
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)", fontSize: 13 }}>
            選擇左側批次查看分類結果
          </div>
        )}
      </div>

      {showNew && <NewBatchModal onClose={() => setShowNew(false)} />}
    </div>
  );
}
