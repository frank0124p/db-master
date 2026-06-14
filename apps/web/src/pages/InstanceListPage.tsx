import { useState, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api, type GovInstance, type GovStationId } from "../api.js";
import { useStore } from "../store.js";
import InstanceDetailPage from "./InstanceDetailPage.js";

const STATION_LABELS: Record<GovStationId, string> = {
  knowledge: "知識庫",
  classify: "分類",
  compose: "組裝",
  review: "審閱",
  validate: "發布",
};

const STATUS_COLOR: Record<GovInstance["status"], string> = {
  active: "#60a5fa",
  completed: "#4ade80",
  cancelled: "#f87171",
  "on-hold": "#fbbf24",
};

function StationProgress({ instance }: { instance: GovInstance }) {
  const stations: GovStationId[] = ["knowledge", "classify", "compose", "review", "validate"];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {stations.map((sid, i) => {
        const st = instance.stations.find(s => s.station === sid);
        const status = st?.status ?? "waiting";
        const isCurrentStation = instance.currentStation === sid;
        const color =
          status === "done" ? "#4ade80" :
          status === "bypassed" ? "#a78bfa" :
          status === "in-progress" ? "#60a5fa" :
          status === "blocked" ? "#f87171" :
          "var(--text-3)";
        const icon =
          status === "done" ? "✓" :
          status === "bypassed" ? "⤳" :
          status === "in-progress" ? "●" :
          status === "blocked" ? "✗" : "○";

        return (
          <div key={sid} style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
              <div style={{
                width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 700, color,
                border: `1.5px solid ${isCurrentStation ? "#60a5fa" : "transparent"}`,
                background: isCurrentStation ? "rgba(96,165,250,0.1)" : "transparent",
              }}>
                {icon}
              </div>
              <div style={{ fontSize: 8, color: "var(--text-3)", whiteSpace: "nowrap" }}>{STATION_LABELS[sid]}</div>
            </div>
            {i < stations.length - 1 && (
              <div style={{ width: 14, height: 1, background: status === "done" ? "#4ade80" : "var(--border)", marginBottom: 14, flexShrink: 0 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function NewInstanceModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { showToast } = useStore();
  const [form, setForm] = useState({ subject: "", blockKind: "small" });

  useEffect(() => {
    const handle = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [onClose]);
  const createMut = useMutation({
    mutationFn: () => api.instances.create({ subject: form.subject.trim(), blockKind: form.blockKind }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["gov-instances"] });
      showToast("✓ 工作流程已建立");
      onClose();
    },
  });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 700, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "var(--bg-2)", border: "1px solid var(--border-light)", borderRadius: 10, width: "min(480px, 92vw)", padding: 20 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>新增治理工作流程</div>
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 3, textTransform: "uppercase" }}>資料主題</label>
          <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
            style={{ width: "100%", background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text-1)", padding: "7px 10px", borderRadius: 6, fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
            placeholder="例：MES 在製品追蹤寬表" />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 3, textTransform: "uppercase" }}>Block 種類</label>
          <select value={form.blockKind} onChange={e => setForm(f => ({ ...f, blockKind: e.target.value }))}
            style={{ width: "100%", background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text-1)", padding: "7px 10px", borderRadius: 6, fontSize: 13, outline: "none", fontFamily: "inherit" }}>
            <option value="small">Small (單實體)</option>
            <option value="medium">Medium (跨實體 JOIN)</option>
          </select>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn btn-primary" disabled={!form.subject.trim() || createMut.isPending}
            onClick={() => createMut.mutate()}>建立</button>
        </div>
      </div>
    </div>
  );
}

export default function InstanceListPage() {
  const [showNew, setShowNew] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: instances = [] } = useQuery({ queryKey: ["gov-instances"], queryFn: api.instances.list });

  if (selectedId !== null) {
    return <InstanceDetailPage instanceId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  const active = instances.filter(i => i.status === "active");
  const completed = instances.filter(i => i.status === "completed");
  const others = instances.filter(i => i.status !== "active" && i.status !== "completed");

  function renderGroup(title: string, items: GovInstance[]) {
    if (items.length === 0) return null;
    return (
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 10 }}>
          {title} ({items.length})
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 10 }}>
          {items.map(inst => (
            <div key={inst.id} onClick={() => setSelectedId(inst.id)} style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8, padding: 14, borderLeft: `3px solid ${STATUS_COLOR[inst.status]}`, cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", marginBottom: 2 }}>{inst.subjectName}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: STATUS_COLOR[inst.status], background: `${STATUS_COLOR[inst.status]}20`, padding: "1px 5px", borderRadius: 3 }}>
                      {inst.status}
                    </span>
                    {inst.currentStation !== "completed" && inst.currentStation && (
                      <span style={{ fontSize: 10, color: "var(--text-3)" }}>→ {STATION_LABELS[inst.currentStation]}</span>
                    )}
                    {inst.currentStation === "completed" && (
                      <span style={{ fontSize: 10, color: "#4ade80" }}>✓ 已完成</span>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 10, color: "var(--text-3)", flexShrink: 0 }}>#{inst.id}</div>
              </div>
              <StationProgress instance={inst} />
              <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 8 }}>
                {new Date(inst.createdAt).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg-1)" }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>治理工作流程</div>
          <div style={{ fontSize: 11, color: "var(--text-3)" }}>{active.length} 進行中 · {completed.length} 已完成</div>
        </div>
        <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setShowNew(true)}>+ 新增</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        {instances.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-3)", fontSize: 13 }}>
            尚無工作流程 — 點「+ 新增」開始
          </div>
        )}
        {renderGroup("進行中", active)}
        {renderGroup("已完成", completed)}
        {renderGroup("其他", others)}
      </div>

      {showNew && <NewInstanceModal onClose={() => setShowNew(false)} />}
    </div>
  );
}
