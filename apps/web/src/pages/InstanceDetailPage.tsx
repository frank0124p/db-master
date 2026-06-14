import { useState, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api, type GovInstance, type GovStationId, type GovStationState } from "../api.js";
import { useStore, type Page } from "../store.js";

const STATION_ORDER: GovStationId[] = ["knowledge", "classify", "compose", "review", "validate"];

const STATION_TO_PAGE: Record<GovStationId, Page> = {
  knowledge: "knowledge",
  classify: "import-classify",
  compose: "compose",
  review: "workspace",
  validate: "catalog",
};

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

const STATUS_LABEL: Record<GovInstance["status"], string> = {
  active: "進行中",
  completed: "已完成",
  cancelled: "已取消",
  "on-hold": "暫停中",
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

// ── Reason modal (bypass / hold / cancel) ─────────────────────────────────────
function ReasonModal({ title, placeholder, onConfirm, onClose }: {
  title: string;
  placeholder: string;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    const handle = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [onClose]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 700, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "var(--bg-2)", border: "1px solid var(--border-light)", borderRadius: 10, width: "min(440px, 92vw)", padding: 20 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>{title}</div>
        <textarea value={reason} onChange={e => setReason(e.target.value)}
          style={{ width: "100%", height: 80, background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text-1)", padding: "8px 10px", borderRadius: 6, fontSize: 13, outline: "none", fontFamily: "inherit", resize: "none", boxSizing: "border-box" }}
          placeholder={placeholder} autoFocus />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn btn-primary" disabled={!reason.trim()} onClick={() => onConfirm(reason.trim())}>確認</button>
        </div>
      </div>
    </div>
  );
}

// ── Edit modal ────────────────────────────────────────────────────────────────
function EditModal({ instance, onClose }: { instance: GovInstance; onClose: () => void }) {
  const qc = useQueryClient();
  const { showToast } = useStore();
  const [subject, setSubject] = useState(instance.subjectName);
  const [desc, setDesc] = useState(instance.description ?? "");

  useEffect(() => {
    const handle = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [onClose]);

  const patchMut = useMutation({
    mutationFn: () => {
      const payload: { subject_name?: string; description?: string } = {
        subject_name: subject.trim(),
      };
      if (desc.trim()) payload.description = desc.trim();
      return api.instances.patch(instance.id, payload);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["gov-instance", instance.id] });
      await qc.invalidateQueries({ queryKey: ["gov-instances"] });
      showToast("✓ 已更新");
      onClose();
    },
  });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 700, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "var(--bg-2)", border: "1px solid var(--border-light)", borderRadius: 10, width: "min(480px, 92vw)", padding: 20 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>編輯工作流程</div>
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 3, textTransform: "uppercase" }}>資料主題</label>
          <input value={subject} onChange={e => setSubject(e.target.value)}
            style={{ width: "100%", background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text-1)", padding: "7px 10px", borderRadius: 6, fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 3, textTransform: "uppercase" }}>說明（選填）</label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)}
            style={{ width: "100%", height: 72, background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text-1)", padding: "7px 10px", borderRadius: 6, fontSize: 13, outline: "none", fontFamily: "inherit", resize: "none", boxSizing: "border-box" }} />
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn btn-primary" disabled={!subject.trim() || patchMut.isPending} onClick={() => patchMut.mutate()}>儲存</button>
        </div>
      </div>
    </div>
  );
}

// ── Station panel ─────────────────────────────────────────────────────────────
function StationPanel({ instance, stationId }: { instance: GovInstance; stationId: GovStationId }) {
  const qc = useQueryClient();
  const { showToast, setPage, setActiveInstanceId } = useStore();
  const [modal, setModal] = useState<"bypass" | "complete" | null>(null);

  const st = instance.stations.find(s => s.station === stationId);
  const artifactCount = getArtifactCount(instance, stationId);
  const isRequired = st?.gate.required ?? false;

  const startMut = useMutation({
    mutationFn: () => api.instances.startStation(instance.id, stationId),
    onSuccess: async (updated) => {
      await qc.invalidateQueries({ queryKey: ["gov-instance", instance.id] });
      await qc.invalidateQueries({ queryKey: ["gov-instances"] });
      showToast(`✓ ${STATION_LABELS[stationId]} 已開始`);
      return updated;
    },
    onError: (err: Error) => showToast(`✗ ${err.message}`),
  });

  const reopenMut = useMutation({
    mutationFn: () => api.instances.reopenStation(instance.id, stationId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["gov-instance", instance.id] });
      await qc.invalidateQueries({ queryKey: ["gov-instances"] });
      showToast(`✓ ${STATION_LABELS[stationId]} 已重開`);
    },
    onError: (err: Error) => showToast(`✗ ${err.message}`),
  });

  const completeMut = useMutation({
    mutationFn: (reason: string) => api.instances.completeStation(instance.id, stationId, { reason }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["gov-instance", instance.id] });
      await qc.invalidateQueries({ queryKey: ["gov-instances"] });
      showToast(`✓ ${STATION_LABELS[stationId]} 已標記完成`);
    },
    onError: (err: Error) => showToast(`✗ ${err.message}`),
  });

  const bypassMut = useMutation({
    mutationFn: (reason: string) => api.instances.bypassStation(instance.id, stationId, { reason }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["gov-instance", instance.id] });
      await qc.invalidateQueries({ queryKey: ["gov-instances"] });
      showToast(`✓ ${STATION_LABELS[stationId]} 已略過`);
    },
    onError: (err: Error) => showToast(`✗ ${err.message}`),
  });

  return (
    <div style={{ background: "var(--bg-2)", border: "1px solid var(--border-light)", borderRadius: 8, padding: 14, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 16 }}>{STATION_ICONS[stationId]}</span>
        <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-1)" }}>{STATION_LABELS[stationId]}</div>
        {isRequired && (
          <span style={{ fontSize: 9, fontWeight: 700, color: "#f87171", background: "#f8717120", padding: "1px 5px", borderRadius: 3, border: "1px solid #f8717140" }}>REQUIRED</span>
        )}
        {st && (
          <span style={{
            fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3,
            background: st.status === "done" ? "rgba(74,222,128,0.15)" : st.status === "in-progress" ? "rgba(96,165,250,0.15)" : st.status === "bypassed" ? "rgba(167,139,250,0.15)" : "var(--bg-3)",
            color: st.status === "done" ? "#4ade80" : st.status === "in-progress" ? "#60a5fa" : st.status === "bypassed" ? "#a78bfa" : "var(--text-3)",
            border: `1px solid ${st.status === "done" ? "rgba(74,222,128,0.3)" : st.status === "in-progress" ? "rgba(96,165,250,0.3)" : st.status === "bypassed" ? "rgba(167,139,250,0.3)" : "var(--border)"}`,
          }}>
            {st.status === "done" ? "完成" : st.status === "in-progress" ? "進行中" : st.status === "bypassed" ? "已略過" : st.status === "blocked" ? "已阻塞" : "未開始"}
          </span>
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
        <div style={{ fontSize: 11, color: "#a78bfa", background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.2)", borderRadius: 5, padding: "5px 8px", marginBottom: 10 }}>
          略過原因：{st.bypass.reason}（{st.bypass.by} · {new Date(st.bypass.at).toLocaleString()}）
        </div>
      )}
      {st?.manualComplete && (
        <div style={{ fontSize: 11, color: "#4ade80", background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 5, padding: "5px 8px", marginBottom: 10 }}>
          手動完成：{st.manualComplete.reason}（{st.manualComplete.by} · {new Date(st.manualComplete.at).toLocaleString()}）
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {(!st || st.status === "not-started") && (
          <button className="btn btn-primary" style={{ fontSize: 11 }}
            disabled={startMut.isPending}
            onClick={() => startMut.mutate()}>
            ▶ 開始站點
          </button>
        )}
        {st?.status === "in-progress" && (
          <>
            <button className="btn btn-success" style={{ fontSize: 11 }}
              disabled={completeMut.isPending}
              onClick={() => setModal("complete")}>
              ✓ 標記完成
            </button>
            {!isRequired && (
              <button className="btn btn-ghost" style={{ fontSize: 11 }}
                disabled={bypassMut.isPending}
                onClick={() => setModal("bypass")}>
                略過站點
              </button>
            )}
          </>
        )}
        {(st?.status === "done" || st?.status === "bypassed") && (
          <button className="btn btn-ghost" style={{ fontSize: 11 }}
            disabled={reopenMut.isPending}
            onClick={() => reopenMut.mutate()}>
            ↩ 重開站點
          </button>
        )}
        {st?.status === "not-started" && !isRequired && (
          <button className="btn btn-ghost" style={{ fontSize: 11 }}
            disabled={bypassMut.isPending}
            onClick={() => setModal("bypass")}>
            略過站點
          </button>
        )}
        {/* Navigate to the corresponding governance step page */}
        <button className="btn btn-ghost" style={{ fontSize: 11, marginLeft: "auto", color: "#a78bfa", borderColor: "rgba(167,139,250,0.4)" }}
          onClick={() => {
            setActiveInstanceId(instance.id);
            setPage(STATION_TO_PAGE[stationId]);
          }}>
          前往步驟 →
        </button>
      </div>

      {modal === "bypass" && (
        <ReasonModal
          title={`略過站點：${STATION_LABELS[stationId]}`}
          placeholder="例：此批次不需要分類步驟"
          onConfirm={(reason) => { bypassMut.mutate(reason); setModal(null); }}
          onClose={() => setModal(null)} />
      )}
      {modal === "complete" && (
        <ReasonModal
          title={`手動完成：${STATION_LABELS[stationId]}`}
          placeholder="例：文件審閱已在外部完成"
          onConfirm={(reason) => { completeMut.mutate(reason); setModal(null); }}
          onClose={() => setModal(null)} />
      )}
    </div>
  );
}

// ── Main detail page ──────────────────────────────────────────────────────────
export default function InstanceDetailPage({ instanceId, onBack }: { instanceId: number; onBack: () => void }) {
  const qc = useQueryClient();
  const { showToast, activeInstanceId, setActiveInstanceId } = useStore();
  const [activeStation, setActiveStation] = useState<GovStationId | null>(null);
  const [modal, setModal] = useState<"edit" | "hold" | "cancel" | null>(null);

  const { data: instance, isLoading, error } = useQuery({
    queryKey: ["gov-instance", instanceId],
    queryFn: () => api.instances.get(instanceId),
    refetchInterval: 8000,
  });

  const holdMut = useMutation({
    mutationFn: (reason: string) => api.instances.hold(instanceId, { reason }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["gov-instance", instanceId] });
      await qc.invalidateQueries({ queryKey: ["gov-instances"] });
      showToast("✓ 工作流程已暫停");
    },
    onError: (err: Error) => showToast(`✗ ${err.message}`),
  });

  const resumeMut = useMutation({
    mutationFn: () => api.instances.resume(instanceId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["gov-instance", instanceId] });
      await qc.invalidateQueries({ queryKey: ["gov-instances"] });
      showToast("✓ 工作流程已恢復");
    },
    onError: (err: Error) => showToast(`✗ ${err.message}`),
  });

  const cancelMut = useMutation({
    mutationFn: () => api.instances.cancel(instanceId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["gov-instance", instanceId] });
      await qc.invalidateQueries({ queryKey: ["gov-instances"] });
      showToast("✓ 工作流程已取消");
    },
    onError: (err: Error) => showToast(`✗ ${err.message}`),
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
    instance.currentStation !== "completed" ? instance.currentStation as GovStationId : STATION_ORDER[0]
  );

  const recentEvents = [...instance.events].reverse().slice(0, 30);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg-1)" }}>
      {/* Header */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <button className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 10px" }} onClick={onBack}>← 返回</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              #{instance.id} · {instance.subjectName}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: STATUS_COLOR[instance.status], background: `${STATUS_COLOR[instance.status]}20`, padding: "1px 6px", borderRadius: 3, border: `1px solid ${STATUS_COLOR[instance.status]}40` }}>
                {STATUS_LABEL[instance.status]}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-3)" }}>{instance.owner.name}</span>
              {instance.holdReason && (
                <span style={{ fontSize: 10, color: "#fbbf24", background: "rgba(251,191,36,0.1)", padding: "1px 6px", borderRadius: 3 }}>
                  暫停原因：{instance.holdReason}
                </span>
              )}
            </div>
          </div>
          {/* Lifecycle actions */}
          <div style={{ display: "flex", gap: 6 }}>
            {/* Track toggle */}
            {(() => {
              const isTracked = activeInstanceId === instance.id;
              return (
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 11, color: isTracked ? "#a78bfa" : "var(--text-2)", borderColor: isTracked ? "rgba(167,139,250,0.5)" : undefined }}
                  title={isTracked ? "取消追蹤此上線單" : "設為工作中上線單，步驟圓圈同步進度"}
                  onClick={() => setActiveInstanceId(isTracked ? null : instance.id)}>
                  {isTracked ? "◈ 追蹤中" : "◈ 追蹤"}
                </button>
              );
            })()}
            <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setModal("edit")}>編輯</button>
            {instance.status === "active" && (
              <button className="btn btn-ghost" style={{ fontSize: 11, color: "#fbbf24" }}
                disabled={holdMut.isPending}
                onClick={() => setModal("hold")}>
                ⏸ 暫停
              </button>
            )}
            {instance.status === "on-hold" && (
              <button className="btn btn-primary" style={{ fontSize: 11 }}
                disabled={resumeMut.isPending}
                onClick={() => resumeMut.mutate()}>
                ▶ 恢復
              </button>
            )}
            {(instance.status === "active" || instance.status === "on-hold") && (
              <button className="btn btn-danger" style={{ fontSize: 11 }}
                disabled={cancelMut.isPending}
                onClick={() => setModal("cancel")}>
                ✕ 取消
              </button>
            )}
          </div>
        </div>
        {instance.description && (
          <div style={{ fontSize: 12, color: "var(--text-3)", paddingLeft: 2 }}>{instance.description}</div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        {/* Station track */}
        <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8, padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 12 }}>
            站點進度 · 點擊切換
          </div>
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
                      borderRadius: 8, padding: "6px 12px", cursor: "pointer", transition: "all 0.12s",
                    }}
                    onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-3)"; }}
                    onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}>
                    <div style={{ fontSize: 16, color }}>{icon}</div>
                    <div style={{ fontSize: 9, color: isActive ? "#a78bfa" : "var(--text-3)", whiteSpace: "nowrap" }}>{STATION_LABELS[sid]}</div>
                    <div style={{ fontSize: 11, color }}>{STATION_ICONS[sid]}</div>
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
          <StationPanel instance={instance} stationId={displayStation} />
        )}

        {/* Events timeline */}
        <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 10 }}>
            事件記錄（最近 {recentEvents.length} 筆）
          </div>
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

      {/* Modals */}
      {modal === "edit" && <EditModal instance={instance} onClose={() => setModal(null)} />}
      {modal === "hold" && (
        <ReasonModal
          title="暫停工作流程"
          placeholder="例：等待外部審核"
          onConfirm={(reason) => { holdMut.mutate(reason); setModal(null); }}
          onClose={() => setModal(null)} />
      )}
      {modal === "cancel" && (
        <ReasonModal
          title="取消工作流程"
          placeholder="例：需求已變更，不再執行"
          onConfirm={() => { cancelMut.mutate(); setModal(null); }}
          onClose={() => setModal(null)} />
      )}
    </div>
  );
}
