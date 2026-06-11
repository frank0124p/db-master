import * as store from "../db/fileStore.js";
import type {
  GovernanceInstance,
  GatePolicy,
  StationId,
  StationState,
  StationStatus,
} from "@schema-studio/core";

// ── Gate Policy ───────────────────────────────────────────────────────────────

const DEFAULT_GATE_POLICY: GatePolicy = {
  stations: {
    knowledge: { required: false },
    classify: { required: false },
    compose: { required: false },
    review: { required: false },
    validate: { required: false },
  },
  bypassRoles: ["admin", "suite_owner", "maintainer"],
  manualCompleteRoles: ["admin", "suite_owner"],
};

function gatePolicyPath(): string {
  return store.dataPath("settings", "gate-policy.json");
}

export async function getGatePolicy(): Promise<GatePolicy> {
  return (await store.readJson<GatePolicy>(gatePolicyPath())) ?? DEFAULT_GATE_POLICY;
}

export async function saveGatePolicy(policy: GatePolicy): Promise<void> {
  await store.writeJson(gatePolicyPath(), policy);
}

// ── Instance ──────────────────────────────────────────────────────────────────

function instancePath(id: number): string {
  return store.dataPath("instances", `${id}.json`);
}

const STATION_ORDER: StationId[] = [
  "knowledge",
  "classify",
  "compose",
  "review",
  "validate",
];

export function buildInitialStations(policy: GatePolicy): StationState[] {
  return STATION_ORDER.map(station => ({
    station,
    status: "not-started" as StationStatus,
    gate: {
      required: policy.stations[station]?.required ?? false,
      source: "policy" as const,
    },
  }));
}

export function computeCurrentStation(
  stations: StationState[],
): GovernanceInstance["currentStation"] {
  const ordered = STATION_ORDER.map(
    id => stations.find(s => s.station === id)!,
  ).filter(Boolean);
  const pending = ordered.find(
    s => s.status !== "done" && s.status !== "bypassed",
  );
  return pending ? pending.station : "completed";
}

export async function listInstances(opts?: {
  status?: GovernanceInstance["status"];
  suiteId?: number;
  station?: StationId | "completed";
}): Promise<GovernanceInstance[]> {
  const ids = await store.listJsonFileIds(store.dataPath("instances"));
  const results: GovernanceInstance[] = [];
  for (const id of ids) {
    const inst = await store.readJson<GovernanceInstance>(instancePath(id));
    if (!inst) continue;
    if (opts?.status && inst.status !== opts.status) continue;
    if (opts?.suiteId !== undefined && inst.suiteId !== opts.suiteId) continue;
    if (opts?.station && inst.currentStation !== opts.station) continue;
    results.push(inst);
  }
  return results.sort((a, b) => b.id - a.id);
}

export async function getInstance(id: number): Promise<GovernanceInstance | null> {
  return store.readJson<GovernanceInstance>(instancePath(id));
}

export async function createInstance(
  data: Omit<GovernanceInstance, "id" | "slug" | "stations" | "currentStation" | "artifacts" | "events" | "createdAt" | "updatedAt">,
): Promise<GovernanceInstance> {
  const id = await store.nextId("instance");
  const policy = await getGatePolicy();
  const now = new Date().toISOString();
  const slug = `inst-${id}`;
  const stations = buildInitialStations(policy);
  const inst: GovernanceInstance = {
    id,
    slug,
    ...data,
    stations,
    currentStation: "knowledge",
    artifacts: {
      sourceDocIds: [],
      conceptIds: [],
      businessRuleIds: [],
      importBatchIds: [],
      wtProposalIds: [],
      draftIds: [],
      reportIds: [],
      governedIds: [],
    },
    status: "active",
    events: [
      {
        at: now,
        by: typeof data.owner === "object" ? data.owner.name : "system",
        type: "created",
        detail: `Instance created for subject: ${data.subjectName}`,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
  await store.writeJson(instancePath(id), inst);
  return inst;
}

export async function updateInstance(
  id: number,
  patch: Partial<Omit<GovernanceInstance, "id" | "createdAt">>,
): Promise<GovernanceInstance | null> {
  const existing = await getInstance(id);
  if (!existing) return null;
  const updated: GovernanceInstance = {
    ...existing,
    ...patch,
    id,
    updatedAt: new Date().toISOString(),
  };
  updated.currentStation = computeCurrentStation(updated.stations);
  await store.writeJson(instancePath(id), updated);
  return updated;
}

export async function appendEvent(
  id: number,
  event: GovernanceInstance["events"][number],
): Promise<GovernanceInstance | null> {
  const inst = await getInstance(id);
  if (!inst) return null;
  return updateInstance(id, { events: [...inst.events, event] });
}
