import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api, type GovInstance, type GovStationId, type GovStationState } from "../api.js";
import { useStore } from "../store.js";

const STATION_ORDER: GovStationId[] = ["knowledge", "classify", "compose", "review", "validate"];

const STATION_LABELS: Record<GovStationId, string> = {
  knowledge: "知識庫",
  classify: "分類",
  compose: "組裝",
  review: "審閱",
  validate: "發布",
};

const STATION_ICONS: Record<GovStationId, string> = {
  knowledge: "⊕",
  classify: "⊟",
  compose: "✦",
  review: "⊗",
  validate: "⊞",
};

const STATUS_COLOR: Record<GovInstance["status"], string> = {
  active: "#60a5fa",
  completed: "#4ade80",
  cancelled: "#f87171",
  "on-hold": "#fbbf24",
};

function getArtifactCount(instance: GovInstance, stationId: GovStationId): number {
  const a = instance.artifacts;
  switch (stationId) {
    case "knowledge": return a.sourceDocIds.length + a.conceptIds.length + a.businessRuleIds.length;
    case "classify": return a.importBatchIds.length;
    case "compose": return a.wtProposalIds.length;
    case "review": return a.draftIds.length;
    case "validate": return a.reportIds.length + a.governedIds.length;
  }
}

function stationStatusIcon(st: GovStationState | undefined): string {
  if (!st) return "○";
  switch (st.status) {
    case "done": return "✓";
    case "bypassed": return "⤳";
    case "in-progress": return "●";
    case "blocked": return "✗";
    default: return "○";
  }
}

function stationStatusColor(st: GovStationState | undefined): string {
  if (!st) return "var(--text-3)";
  switch (st.status) {
    case "done": return "#4ade80";
    case "bypassed": return "#a78bfa";
    case "in-progress": return "#60a5fa";
    case "blocked": return "#f87171";
    default: return "var(--text-3)";
  }
}

interface BypassModalProps {
  instanceId: number;
  stationId: GovStationId;
  onClose: () => void;
}

function BypassModal({ instanceId, stationId, onClose }: BypassModalProps) {
  const qc = useQueryClient();
  const { showToast } = useStore();
  const [reason, setReason] = useState("");

  const bypassMut = useMutation({
    mutationFn: () => api.instances.bypassStation(instanceId, stationId, { reason: reason.trim() }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["gov-instance", instanceId] });
      await qc.invalidateQueries({ queryKey: ["gov-instances"] });
      showToast(`✓ ${STATION_LABELS[stationId]} 已略過`);
      onClose();
    },
  });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 700, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "var(--bg-2)", border: "1px solid var(--border-light)", borderRadius: 10, width: "min(440px, 92vw)", padding: 20 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>略過站點：{STATION_LABELS[stationId]}</div>
        <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 12 }}>請輸入略過原因（必填）</div>
        <textarea value={reason} onChange={e => setReason(e.target.value)}
          style={{ width: "100%", height: 80, background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text-1)", padding: "8px 10px", borderRadius: 6, fontSize: 13, outline: "none", fontFamily: "inherit", resize: "none", boxSizing: "border-box" }}
          placeholder="例：此批次不需要分類步驟" />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn btn-primary" disabled={!reason.trim() || bypassMut.isPending}
            onClick={() => bypassMut.mutate()}>確認略過</button>
        </div>
      </div>
    </div>
  );
}

interface ActiveStationPanelProps {
  instance: GovInstance;
  stationId: GovStationId;
}

function ActiveStationPanel({ instance, stationId }: ActiveStationPanelProps) {
  const [showBypass, setShowBypass] = useState(false);
  const st = instance.stations.find(s => s.station === stationId);
  const artifactCount = getArtifactCount(instance, stationId);
  const isDone = st?.status === "done";
  const isBypassed = st?.status === "bypassed";
  const isRequired = st?.gate.required ?? false;

  const canBypass = !isRequired && !isDone && !isBypassed;

  return (
    <div style={{ background: "var(--bg-2)", border: "1px solid var(--border-light)", borderRadius: 8, padding: 14, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 16 }}>{STATION_ICONS[stationId]}</span>
        <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-1)" }}>{STATION_LABELS[stationId]}</div>
        {isRequired && (
          <span style={{ fontSize: 9, fontWeight: 700, color: "#f87171", background: "#f8717120", padding: "1px 5px", borderRadius: 3, border: "1px solid #f8717140" }}>REQUIRED</span>
        )}
      </div>

      {st?.exitCheck && (
        <div style={{ background: st.exitCheck.met ? "rgba(74,222,128,0.08)" : "rgba(248,113,113,0.08)", border: `1px solid ${st.exitCheck.met ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}`, borderRadius: 6, padding: "8px 10px", marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: st.exitCheck.met ? "#4ade80" : "#f87171", marginBottom: 2 }}>
            {st.exitCheck.met ? "✓ Exit Check 通過" : "✗ Exit Check 未通過"}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-2)" }}>{st.exitCheck.detail}</div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 12, color: "var(--text-2)", marginBottom: 10 }}>
        <span>Artifacts: <strong style={{ color: artifactCount > 0 ? "#60a5fa" : "var(--text-3)" }}>{artifactCount}</strong></span>
        {st?.enteredAt && <span style={{ fontSize: 10, color: "var(--text-3)" }}>進入：{new Date(st.enteredAt).toLocaleString()}</span>}
        {st?.completedAt && <span style={{ fontSize: 10, color: "var(--text-3)" }}>完成：{new Date(st.completedAt).toLocaleString()}</span>}
      </div>

      {st?.bypass && (
        <div style={{ fontSize: 11, color: "#a78bfa", background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.2)", borderRadius: 5, padding: "5px 8px", marginBottom: 8 }}>
          略過原因：{st.bypass.reason}（{st.bypass.by} · {new Date(st.bypass.at).toLocaleString()}）
        </div>
      )}

      {canBypass && (
        <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setShowBypass(true)}>
          略過此站點
        </button>
      )}

      {showBypass && (
        <BypassModal instanceId={instance.id} stationId={stationId} onClose={() => setShowBypass(false)} />
      )}
    </div>
  );
}

export default function InstanceDetailPage({ instanceId, onBack }: { instanceId: number; onBack: () => void }) {
  const [activeStation, setActiveStation] = useState<GovStationId | null>(null);

  const { data: instance, isLoading, error } = useQuery({
    queryKey: ["gov-instance", instanceId],
    queryFn: () => api.instances.get(instanceId),
    refetchInterval: 5000,
  });

  if (isLoading) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)", fontSize: 13 }}>
        載入中…
      </div>
    );
  }

  if (error || !instance) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <div style={{ color: "var(--error)", fontSize: 13 }}>無法載入工作流程詳情</div>
        <button className="btn btn-ghost" onClick={onBack}>← 返回列表</button>
      </div>
    );
  }

  const displayStation = activeStation ?? (
    instance.currentStation !== "completed" ? instance.currentStation as GovStationId : null
  );

  const recentEvents = [...instance.events].reverse().slice(0, 20);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg-1)" }}>
      {/* Header */}
      <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", flexShrink: 0, display: "flex", alignItems: "center", gap: 12 }}>
        <button className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 10px" }} onClick={onBack}>← 返回</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            #{instance.id} · {instance.subjectName}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: STATUS_COLOR[instance.status], background: `${STATUS_COLOR[instance.status]}20`, padding: "1px 5px", borderRadius: 3, border: `1px solid ${STATUS_COLOR[instance.status]}40` }}>
              {instance.status}
            </span>
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>{instance.owner.name}</span>
            {instance.description && <span style={{ fontSize: 11, color: "var(--text-3)" }}>{instance.description}</span>}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        {/* Station track */}
        <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8, padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 12 }}>站點進度</div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {STATION_ORDER.map((sid, i) => {
              const st = instance.stations.find(s => s.station === sid);
              const icon = stationStatusIcon(st);
              const color = stationStatusColor(st);
              const isActive = displayStation === sid;
              const isCurrentStation = instance.currentStation === sid;

              return (
                <div key={sid} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <button onClick={() => setActiveStation(sid === activeStation ? null : sid)}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                      background: isActive ? "rgba(167,139,250,0.12)" : "transparent",
                      border: `1.5px solid ${isActive ? "#a78bfa" : isCurrentStation ? "#60a5fa" : "transparent"}`,
                      borderRadius: 8, padding: "6px 10px", cursor: "pointer", transition: "all 0.12s",
                    }}
                    onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-3)"; }}
                    onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}>
                    <div style={{ fontSize: 14, color }}>{icon}</div>
                    <div style={{ fontSize: 9, color: isActive ? "#a78bfa" : "var(--text-3)", whiteSpace: "nowrap" }}>{STATION_LABELS[sid]}</div>
                    <div style={{ fontSize: 10, color }}>{STATION_ICONS[sid]}</div>
                  </button>
                  {i < STATION_ORDER.length - 1 && (
                    <div style={{ width: 20, height: 1, background: st?.status === "done" ? "#4ade80" : "var(--border)", flexShrink: 0 }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Active station panel */}
        {displayStation && (
          <ActiveStationPanel instance={instance} stationId={displayStation} />
        )}

        {/* Events timeline */}
        <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 10 }}>事件記錄（最近 {recentEvents.length} 筆）</div>
          {recentEvents.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--text-3)", padding: "8px 0" }}>尚無事件</div>
          )}
          {recentEvents.map((ev, i) => (
            <div key={i} style={{ display: "flex", gap: 10, padding: "7px 0", borderBottom: i < recentEvents.length - 1 ? "1px solid var(--border)" : "none" }}>
              <div style={{ fontSize: 10, color: "var(--text-3)", flexShrink: 0, minWidth: 130 }}>
                {new Date(ev.at).toLocaleString()}
              </div>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#a78bfa", background: "rgba(167,139,250,0.1)", padding: "0 4px", borderRadius: 3, marginRight: 6 }}>
                  {ev.type}
                </span>
                <span style={{ fontSize: 12, color: "var(--text-2)" }}>{ev.detail}</span>
              </div>
              <div style={{ fontSize: 10, color: "var(--text-3)", flexShrink: 0 }}>{ev.by}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
