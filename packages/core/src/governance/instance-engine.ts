import type {
  GovernanceInstance,
  StationId,
  StationState,
  StationStatus,
} from "./types.js";

// ── Artifact shapes passed in from callers ────────────────────────────────────

export interface RecomputeArtifacts {
  concepts?: Array<{ status: string }>;
  batches?: Array<{ proposals: Array<{ status: string }> }>;
  proposals?: Array<{ status: string }>;
  drafts?: Array<{ status: string }>;
  reports?: Array<{ summary: { passed: boolean } }>;
  governed?: unknown[];
}

// ── Exit-criteria helpers ─────────────────────────────────────────────────────

function isKnowledgeDone(artifacts: RecomputeArtifacts): boolean {
  const { concepts = [] } = artifacts;
  return concepts.some((c) => c.status === "approved");
}

function isClassifyDone(artifacts: RecomputeArtifacts): boolean {
  const { batches = [] } = artifacts;
  if (batches.length === 0) return false;
  // All proposals across all batches must be accepted / overridden / rejected
  const allowedStatuses = new Set(["accepted", "overridden", "rejected"]);
  return batches.every((batch) =>
    batch.proposals.every((p) => allowedStatuses.has(p.status))
  );
}

function isComposeDone(artifacts: RecomputeArtifacts): boolean {
  const { proposals = [] } = artifacts;
  return proposals.some((p) => p.status === "drafted");
}

function isReviewDone(artifacts: RecomputeArtifacts): boolean {
  const { drafts = [] } = artifacts;
  const advancedStatuses = new Set([
    "validating",
    "passed",
    "failed",
    "published",
  ]);
  return drafts.some((d) => advancedStatuses.has(d.status));
}

function isValidateDone(artifacts: RecomputeArtifacts): boolean {
  const { reports = [], governed = [] } = artifacts;
  const hasGoverned = governed.length > 0;
  const hasPassedReport = reports.some((r) => r.summary.passed);
  const { drafts = [] } = artifacts;
  const hasPublishedDraft = drafts.some((d) => d.status === "published");
  return hasGoverned || (hasPassedReport && hasPublishedDraft);
}

/** Returns true if the station has at least one artifact associated with it. */
function hasAnyArtifact(
  stationId: StationId,
  instanceArtifacts: GovernanceInstance["artifacts"],
  artifacts: RecomputeArtifacts
): boolean {
  switch (stationId) {
    case "knowledge":
      return (
        instanceArtifacts.sourceDocIds.length > 0 ||
        instanceArtifacts.conceptIds.length > 0 ||
        instanceArtifacts.businessRuleIds.length > 0 ||
        (artifacts.concepts ?? []).length > 0
      );
    case "classify":
      return (
        instanceArtifacts.importBatchIds.length > 0 ||
        (artifacts.batches ?? []).length > 0
      );
    case "compose":
      return (
        instanceArtifacts.wtProposalIds.length > 0 ||
        (artifacts.proposals ?? []).length > 0
      );
    case "review":
      return (
        instanceArtifacts.draftIds.length > 0 ||
        (artifacts.drafts ?? []).length > 0
      );
    case "validate":
      return (
        instanceArtifacts.reportIds.length > 0 ||
        instanceArtifacts.governedIds.length > 0 ||
        (artifacts.reports ?? []).length > 0 ||
        (artifacts.governed ?? []).length > 0
      );
  }
}

// ── Exit-criteria check dispatch ──────────────────────────────────────────────

const EXIT_CRITERIA: Record<
  StationId,
  (artifacts: RecomputeArtifacts) => boolean
> = {
  knowledge: isKnowledgeDone,
  classify: isClassifyDone,
  compose: isComposeDone,
  review: isReviewDone,
  validate: isValidateDone,
};

// ── Station order ─────────────────────────────────────────────────────────────

const STATION_ORDER: StationId[] = [
  "knowledge",
  "classify",
  "compose",
  "review",
  "validate",
];

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Pure function: recomputes every station's status from live artifacts.
 *
 * Rules:
 * - Bypassed stations are NOT recomputed — their bypass state is preserved.
 * - Manually-completed stations stay "done".
 * - For all other stations the status is derived from exit criteria + whether
 *   any artifacts exist (in-progress) or not (not-started).
 * - Returns a new GovernanceInstance with updated stations, currentStation,
 *   and top-level status.
 */
export function recomputeStations(
  instance: GovernanceInstance,
  artifacts: RecomputeArtifacts
): GovernanceInstance {
  const now = new Date().toISOString();

  const updatedStations: StationState[] = instance.stations.map(
    (stationState) => {
      const { station, status, manualComplete } = stationState;

      // Preserve bypass state.
      if (status === "bypassed") {
        return stationState;
      }

      // Preserve manual-complete state.
      if (status === "done" && manualComplete != null) {
        return stationState;
      }

      // Recompute from exit criteria.
      const exitMet = EXIT_CRITERIA[station](artifacts);

      let newStatus: StationStatus;
      if (exitMet) {
        newStatus = "done";
      } else if (
        hasAnyArtifact(station, instance.artifacts, artifacts)
      ) {
        newStatus = "in-progress";
      } else {
        newStatus = "not-started";
      }

      const updatedExitCheck = {
        met: exitMet,
        detail: exitMet
          ? "Exit criteria satisfied."
          : "Exit criteria not yet met.",
        checkedAt: now,
      };

      // Only set completedAt when transitioning to done; clear it otherwise.
      // exactOptionalPropertyTypes requires we omit the key rather than set undefined.
      const wasAlreadyDone = status === "done";
      const completedAt: string | undefined =
        newStatus === "done"
          ? wasAlreadyDone
            ? stationState.completedAt
            : now
          : undefined;

      const base = {
        ...stationState,
        status: newStatus,
        exitCheck: updatedExitCheck,
      };

      if (completedAt !== undefined) {
        return { ...base, completedAt };
      }
      // Remove completedAt key entirely to satisfy exactOptionalPropertyTypes.
      const { completedAt: _removed, ...rest } = base;
      void _removed;
      return rest as StationState;
    }
  );

  // Derive currentStation: first station that is not done or bypassed.
  const allFinished = updatedStations.every(
    (s) => s.status === "done" || s.status === "bypassed"
  );

  let currentStation: StationId | "completed";
  if (allFinished) {
    currentStation = "completed";
  } else {
    const firstIncomplete = updatedStations.find(
      (s) => s.status !== "done" && s.status !== "bypassed"
    );
    // firstIncomplete is guaranteed to exist since !allFinished.
    // The non-null assertion is safe here: we already checked !allFinished.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    currentStation = firstIncomplete!.station;
  }

  // Derive top-level status.
  const instanceStatus: GovernanceInstance["status"] =
    instance.status === "on-hold" || instance.status === "cancelled"
      ? instance.status
      : currentStation === "completed"
      ? "completed"
      : "active";

  return {
    ...instance,
    stations: updatedStations,
    currentStation,
    status: instanceStatus,
    updatedAt: now,
  };
}
