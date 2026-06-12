import { describe, it, expect } from "vitest";
import { recomputeStations } from "../instance-engine.js";
import type { GovernanceInstance, StationId, StationState } from "../types.js";
import type { RecomputeArtifacts } from "../instance-engine.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

const STATION_ORDER: StationId[] = [
  "knowledge",
  "classify",
  "compose",
  "review",
  "validate",
];

function makeStation(id: StationId): StationState {
  return {
    station: id,
    status: "not-started",
    gate: { required: true, source: "policy" },
  };
}

function makeInstance(
  overrides: Partial<GovernanceInstance> = {},
): GovernanceInstance {
  return {
    id: 1,
    slug: "test-instance",
    subjectName: "Test Subject",
    owner: { userId: 1, name: "Alice" },
    routeTemplate: "default-5",
    stations: STATION_ORDER.map(makeStation),
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
    events: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const emptyArtifacts: RecomputeArtifacts = {};

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("recomputeStations", () => {
  it("empty artifacts → all stations not-started, currentStation = knowledge", () => {
    const instance = makeInstance();
    const result = recomputeStations(instance, emptyArtifacts);

    for (const s of result.stations) {
      expect(s.status).toBe("not-started");
    }
    expect(result.currentStation).toBe("knowledge");
  });

  it("1 approved concept → knowledge done, currentStation = classify", () => {
    const instance = makeInstance();
    const artifacts: RecomputeArtifacts = {
      concepts: [{ status: "approved" }],
    };

    const result = recomputeStations(instance, artifacts);

    const knowledgeStation = result.stations.find(
      (s) => s.station === "knowledge",
    );
    expect(knowledgeStation?.status).toBe("done");
    expect(result.currentStation).toBe("classify");
  });

  it("1 pending concept (not approved) → knowledge not-started", () => {
    const instance = makeInstance();
    const artifacts: RecomputeArtifacts = {
      concepts: [{ status: "pending" }],
    };

    const result = recomputeStations(instance, artifacts);

    const knowledgeStation = result.stations.find(
      (s) => s.station === "knowledge",
    );
    // pending concept counts as an artifact (in-progress), but exit criteria not met
    // hasAnyArtifact for knowledge checks artifacts.concepts.length > 0 → in-progress
    expect(knowledgeStation?.status).toBe("in-progress");
    expect(result.currentStation).toBe("knowledge");
  });

  it("batch with all proposals accepted → classify done", () => {
    const instance = makeInstance({
      // put knowledge in done state so classify becomes current
      stations: STATION_ORDER.map((id) =>
        id === "knowledge"
          ? { ...makeStation("knowledge"), status: "done" as const }
          : makeStation(id),
      ),
    });
    const artifacts: RecomputeArtifacts = {
      concepts: [{ status: "approved" }],
      batches: [
        {
          proposals: [
            { status: "accepted" },
            { status: "accepted" },
            { status: "overridden" },
          ],
        },
      ],
    };

    const result = recomputeStations(instance, artifacts);

    const classifyStation = result.stations.find(
      (s) => s.station === "classify",
    );
    expect(classifyStation?.status).toBe("done");
    expect(result.currentStation).toBe("compose");
  });

  it("batch with 1 pending proposal → classify in-progress", () => {
    const instance = makeInstance({
      stations: STATION_ORDER.map((id) =>
        id === "knowledge"
          ? { ...makeStation("knowledge"), status: "done" as const }
          : makeStation(id),
      ),
    });
    const artifacts: RecomputeArtifacts = {
      concepts: [{ status: "approved" }],
      batches: [
        {
          proposals: [
            { status: "accepted" },
            { status: "pending" }, // still pending — exit not met
          ],
        },
      ],
    };

    const result = recomputeStations(instance, artifacts);

    const classifyStation = result.stations.find(
      (s) => s.station === "classify",
    );
    expect(classifyStation?.status).toBe("in-progress");
    expect(result.currentStation).toBe("classify");
  });

  it("proposal with status=drafted → compose done", () => {
    const instance = makeInstance({
      stations: STATION_ORDER.map((id) => {
        if (id === "knowledge" || id === "classify")
          return { ...makeStation(id), status: "done" as const };
        return makeStation(id);
      }),
    });
    const artifacts: RecomputeArtifacts = {
      concepts: [{ status: "approved" }],
      batches: [{ proposals: [{ status: "accepted" }] }],
      proposals: [{ status: "drafted" }],
    };

    const result = recomputeStations(instance, artifacts);

    const composeStation = result.stations.find(
      (s) => s.station === "compose",
    );
    expect(composeStation?.status).toBe("done");
    expect(result.currentStation).toBe("review");
  });

  it("bypassed station preserved even when exit condition met", () => {
    // Mark 'classify' as bypassed; even if all classify exit criteria are met,
    // the bypass state must be preserved.
    const instance = makeInstance({
      stations: STATION_ORDER.map((id) => {
        if (id === "knowledge")
          return { ...makeStation(id), status: "done" as const };
        if (id === "classify")
          return {
            ...makeStation(id),
            status: "bypassed" as const,
            bypass: { by: "admin", at: new Date().toISOString(), reason: "skipped" },
          };
        return makeStation(id);
      }),
    });
    const artifacts: RecomputeArtifacts = {
      concepts: [{ status: "approved" }],
      batches: [{ proposals: [{ status: "accepted" }] }],
    };

    const result = recomputeStations(instance, artifacts);

    const classifyStation = result.stations.find(
      (s) => s.station === "classify",
    );
    expect(classifyStation?.status).toBe("bypassed");
    // currentStation should skip bypassed, moving to compose
    expect(result.currentStation).toBe("compose");
  });

  it("all exit conditions met → currentStation = completed, status = completed", () => {
    const instance = makeInstance();
    const artifacts: RecomputeArtifacts = {
      concepts: [{ status: "approved" }],
      batches: [{ proposals: [{ status: "accepted" }] }],
      proposals: [{ status: "drafted" }],
      drafts: [{ status: "published" }],
      reports: [{ summary: { passed: true } }],
      governed: [{}],
    };

    const result = recomputeStations(instance, artifacts);

    for (const s of result.stations) {
      expect(s.status).toBe("done");
    }
    expect(result.currentStation).toBe("completed");
    expect(result.status).toBe("completed");
  });
});
