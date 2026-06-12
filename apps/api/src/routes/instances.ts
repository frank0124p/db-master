import { Router } from "express";
import { z } from "zod";
import * as instanceRepo from "../repositories/instances.js";
import type { StationId, GovernanceInstance } from "@schema-studio/core";

const router = Router();

const STATION_IDS: StationId[] = ["knowledge", "classify", "compose", "review", "validate"];

// ── POST /api/v1/instances ────────────────────────────────────────────────────

const CreateInstanceInput = z.object({
  subject_name: z.string().min(1).max(255),
  description: z.string().optional(),
  suite_id: z.number().int().optional(),
  owner_user_id: z.number().int().default(0),
  owner_name: z.string().default("system"),
});

router.post("/", async (req, res, next) => {
  try {
    const body = CreateInstanceInput.parse(req.body);
    const instance = await instanceRepo.createInstance({
      subjectName: body.subject_name,
      description: body.description,
      suiteId: body.suite_id,
      owner: { userId: body.owner_user_id, name: body.owner_name },
      routeTemplate: "default-5",
      status: "active",
    });
    res.status(201).json(instance);
  } catch (e) { next(e); }
});

// ── GET /api/v1/instances ─────────────────────────────────────────────────────

router.get("/", async (req, res, next) => {
  try {
    const status = req.query["status"] as GovernanceInstance["status"] | undefined;
    const suiteId = req.query["suite_id"] ? Number(req.query["suite_id"]) : undefined;
    const station = req.query["station"] as StationId | "completed" | undefined;
    const instances = await instanceRepo.listInstances({ status, suiteId, station });
    res.json(instances);
  } catch (e) { next(e); }
});

// ── GET /api/v1/instances/:id ─────────────────────────────────────────────────

router.get("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params["id"]);
    const instance = await instanceRepo.getInstance(id);
    if (!instance) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Instance not found" } });
    return res.json(instance);
  } catch (e) { next(e); }
});

// ── PATCH /api/v1/instances/:id ───────────────────────────────────────────────

router.patch("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params["id"]);
    const { subject_name, description, owner_name } = req.body as {
      subject_name?: string; description?: string; owner_name?: string;
    };
    const existing = await instanceRepo.getInstance(id);
    if (!existing) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Instance not found" } });

    const patch: Partial<GovernanceInstance> = {};
    if (subject_name) patch.subjectName = subject_name;
    if (description !== undefined) patch.description = description;
    if (owner_name) patch.owner = { ...existing.owner, name: owner_name };

    const updated = await instanceRepo.updateInstance(id, patch);
    return res.json(updated);
  } catch (e) { next(e); }
});

// ── Station operations ────────────────────────────────────────────────────────

router.post("/:id/stations/:station/start", async (req, res, next) => {
  try {
    const id = Number(req.params["id"]);
    const station = req.params["station"] as StationId;
    if (!STATION_IDS.includes(station)) return res.status(400).json({ error: { code: "BAD_REQUEST", message: "Invalid station" } });

    const instance = await instanceRepo.getInstance(id);
    if (!instance) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Instance not found" } });

    const now = new Date().toISOString();
    const user = (req as { user?: { name?: string } }).user;
    const updatedStations = instance.stations.map(s =>
      s.station === station && s.status === "not-started"
        ? { ...s, status: "in-progress" as const, enteredAt: now }
        : s,
    );

    const updated = await instanceRepo.updateInstance(id, { stations: updatedStations });
    await instanceRepo.appendEvent(id, {
      at: now, by: user?.name ?? "system", type: "station-started", detail: `Station ${station} started`,
    });
    return res.json(updated);
  } catch (e) { next(e); }
});

router.post("/:id/stations/:station/bypass", async (req, res, next) => {
  try {
    const id = Number(req.params["id"]);
    const station = req.params["station"] as StationId;
    const { reason } = req.body as { reason: string };
    if (!reason) return res.status(400).json({ error: { code: "BAD_REQUEST", message: "reason is required for bypass" } });

    const instance = await instanceRepo.getInstance(id);
    if (!instance) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Instance not found" } });

    const stationState = instance.stations.find(s => s.station === station);
    if (!stationState) return res.status(400).json({ error: { code: "BAD_REQUEST", message: "Invalid station" } });

    // Gate check: required stations cannot be bypassed
    if (stationState.gate.required) {
      return res.status(409).json({
        error: {
          code: "GATE_REQUIRED",
          message: `Station ${station} is required and cannot be bypassed. Disable the gate policy first.`,
        },
      });
    }

    const user = (req as { user?: { name?: string; role?: string } }).user;
    const policy = await instanceRepo.getGatePolicy();
    if (!policy.bypassRoles.includes(user?.role as "admin" | "suite_owner" | "maintainer")) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "Insufficient role to bypass" } });
    }

    const now = new Date().toISOString();
    const updatedStations = instance.stations.map(s =>
      s.station === station
        ? { ...s, status: "bypassed" as const, bypass: { by: user?.name ?? "system", at: now, reason } }
        : s,
    );

    const updated = await instanceRepo.updateInstance(id, { stations: updatedStations });
    await instanceRepo.appendEvent(id, {
      at: now, by: user?.name ?? "system", type: "station-bypassed",
      detail: `Station ${station} bypassed: ${reason}`,
    });
    return res.json(updated);
  } catch (e) { next(e); }
});

router.post("/:id/stations/:station/reopen", async (req, res, next) => {
  try {
    const id = Number(req.params["id"]);
    const station = req.params["station"] as StationId;

    const instance = await instanceRepo.getInstance(id);
    if (!instance) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Instance not found" } });

    const now = new Date().toISOString();
    const user = (req as { user?: { name?: string } }).user;
    const updatedStations = instance.stations.map(s =>
      s.station === station
        ? { ...s, status: "in-progress" as const, bypass: undefined, completedAt: undefined }
        : s,
    );

    const updated = await instanceRepo.updateInstance(id, { stations: updatedStations });
    await instanceRepo.appendEvent(id, {
      at: now, by: user?.name ?? "system", type: "station-reopened",
      detail: `Station ${station} reopened`,
    });
    return res.json(updated);
  } catch (e) { next(e); }
});

router.post("/:id/stations/:station/complete", async (req, res, next) => {
  try {
    const id = Number(req.params["id"]);
    const station = req.params["station"] as StationId;
    const { reason } = req.body as { reason: string };

    const instance = await instanceRepo.getInstance(id);
    if (!instance) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Instance not found" } });

    const user = (req as { user?: { name?: string; role?: string } }).user;
    const policy = await instanceRepo.getGatePolicy();
    if (!policy.manualCompleteRoles.includes(user?.role as "admin" | "suite_owner")) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "Insufficient role to manually complete" } });
    }

    const now = new Date().toISOString();
    const updatedStations = instance.stations.map(s =>
      s.station === station
        ? {
            ...s,
            status: "done" as const,
            completedAt: now,
            manualComplete: { by: user?.name ?? "system", at: now, reason: reason ?? "manual" },
          }
        : s,
    );

    const updated = await instanceRepo.updateInstance(id, { stations: updatedStations });
    await instanceRepo.appendEvent(id, {
      at: now, by: user?.name ?? "system", type: "station-completed",
      detail: `Station ${station} manually completed: ${reason}`,
    });
    return res.json(updated);
  } catch (e) { next(e); }
});

// ── Artifact management ───────────────────────────────────────────────────────

const AttachInput = z.object({
  kind: z.enum(["source_doc", "concept", "business_rule", "import_batch", "proposal", "draft", "report", "governed"]),
  ref_id: z.number().int(),
});

router.post("/:id/attach", async (req, res, next) => {
  try {
    const id = Number(req.params["id"]);
    const body = AttachInput.parse(req.body);
    const instance = await instanceRepo.getInstance(id);
    if (!instance) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Instance not found" } });

    const artifacts = { ...instance.artifacts };
    const kindMap: Record<string, keyof typeof artifacts> = {
      source_doc: "sourceDocIds",
      concept: "conceptIds",
      business_rule: "businessRuleIds",
      import_batch: "importBatchIds",
      proposal: "wtProposalIds",
      draft: "draftIds",
      report: "reportIds",
      governed: "governedIds",
    };
    const key = kindMap[body.kind];
    if (key && !artifacts[key].includes(body.ref_id)) {
      (artifacts[key] as number[]).push(body.ref_id);
    }

    const updated = await instanceRepo.updateInstance(id, { artifacts });
    await instanceRepo.appendEvent(id, {
      at: new Date().toISOString(),
      by: (req as { user?: { name?: string } }).user?.name ?? "system",
      type: "artifact-attached",
      detail: `${body.kind}#${body.ref_id} attached`,
    });
    return res.json(updated);
  } catch (e) { next(e); }
});

router.post("/:id/detach", async (req, res, next) => {
  try {
    const id = Number(req.params["id"]);
    const body = AttachInput.parse(req.body);
    const instance = await instanceRepo.getInstance(id);
    if (!instance) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Instance not found" } });

    const artifacts = { ...instance.artifacts };
    const kindMap: Record<string, keyof typeof artifacts> = {
      source_doc: "sourceDocIds",
      concept: "conceptIds",
      business_rule: "businessRuleIds",
      import_batch: "importBatchIds",
      proposal: "wtProposalIds",
      draft: "draftIds",
      report: "reportIds",
      governed: "governedIds",
    };
    const key = kindMap[body.kind];
    if (key) {
      (artifacts[key] as number[]) = (artifacts[key] as number[]).filter(refId => refId !== body.ref_id);
    }

    const updated = await instanceRepo.updateInstance(id, { artifacts });
    return res.json(updated);
  } catch (e) { next(e); }
});

// ── Lifecycle ─────────────────────────────────────────────────────────────────

router.post("/:id/hold", async (req, res, next) => {
  try {
    const id = Number(req.params["id"]);
    const { reason } = req.body as { reason?: string };
    const instance = await instanceRepo.getInstance(id);
    if (!instance) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Instance not found" } });
    const updated = await instanceRepo.updateInstance(id, { status: "on-hold", holdReason: reason });
    await instanceRepo.appendEvent(id, {
      at: new Date().toISOString(),
      by: (req as { user?: { name?: string } }).user?.name ?? "system",
      type: "hold", detail: reason ?? "put on hold",
    });
    return res.json(updated);
  } catch (e) { next(e); }
});

router.post("/:id/resume", async (req, res, next) => {
  try {
    const id = Number(req.params["id"]);
    const instance = await instanceRepo.getInstance(id);
    if (!instance) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Instance not found" } });
    const updated = await instanceRepo.updateInstance(id, { status: "active", holdReason: undefined });
    await instanceRepo.appendEvent(id, {
      at: new Date().toISOString(),
      by: (req as { user?: { name?: string } }).user?.name ?? "system",
      type: "resume", detail: "resumed from hold",
    });
    return res.json(updated);
  } catch (e) { next(e); }
});

router.post("/:id/cancel", async (req, res, next) => {
  try {
    const id = Number(req.params["id"]);
    const instance = await instanceRepo.getInstance(id);
    if (!instance) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Instance not found" } });
    const updated = await instanceRepo.updateInstance(id, { status: "cancelled" });
    await instanceRepo.appendEvent(id, {
      at: new Date().toISOString(),
      by: (req as { user?: { name?: string } }).user?.name ?? "system",
      type: "cancel", detail: "cancelled",
    });
    return res.json(updated);
  } catch (e) { next(e); }
});

router.post("/:id/resync-gate", async (req, res, next) => {
  try {
    const id = Number(req.params["id"]);
    const instance = await instanceRepo.getInstance(id);
    if (!instance) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Instance not found" } });

    const policy = await instanceRepo.getGatePolicy();
    const updatedStations = instance.stations.map(s => ({
      ...s,
      gate: {
        required: policy.stations[s.station]?.required ?? false,
        source: "policy" as const,
      },
    }));

    const updated = await instanceRepo.updateInstance(id, { stations: updatedStations });
    await instanceRepo.appendEvent(id, {
      at: new Date().toISOString(),
      by: (req as { user?: { name?: string } }).user?.name ?? "system",
      type: "gate-resynced", detail: "Gate policy resynced to current policy",
    });
    return res.json(updated);
  } catch (e) { next(e); }
});

// ── Artifact attach/detach ────────────────────────────────────────────────────

const KIND_MAP: Record<string, keyof import("@schema-studio/core").GovernanceInstance["artifacts"]> = {
  sourceDoc: "sourceDocIds",
  concept: "conceptIds",
  businessRule: "businessRuleIds",
  importBatch: "importBatchIds",
  wtProposal: "wtProposalIds",
  draft: "draftIds",
  report: "reportIds",
  governed: "governedIds",
};

const ArtifactMutateInput = z.object({
  kind: z.string(),
  artifact_id: z.number().int(),
});

router.post("/:id/artifacts/attach", async (req, res, next) => {
  try {
    const id = Number(req.params["id"]);
    const body = ArtifactMutateInput.parse(req.body);
    const instance = await instanceRepo.getInstance(id);
    if (!instance) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Instance not found" } });

    const key = KIND_MAP[body.kind];
    if (!key) return res.status(400).json({ error: { code: "BAD_REQUEST", message: `Unknown artifact kind: ${body.kind}` } });

    const artifacts = { ...instance.artifacts };
    if (!(artifacts[key] as number[]).includes(body.artifact_id)) {
      (artifacts[key] as number[]) = [...(artifacts[key] as number[]), body.artifact_id];
    }
    const upd = await instanceRepo.updateInstance(id, { artifacts });
    if (upd) await instanceRepo.updateInstance(id, { currentStation: instanceRepo.computeCurrentStation(upd.stations) });
    return res.json(await instanceRepo.getInstance(id));
  } catch (e) { next(e); }
});

router.post("/:id/artifacts/detach", async (req, res, next) => {
  try {
    const id = Number(req.params["id"]);
    const body = ArtifactMutateInput.parse(req.body);
    const instance = await instanceRepo.getInstance(id);
    if (!instance) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Instance not found" } });

    const key = KIND_MAP[body.kind];
    if (!key) return res.status(400).json({ error: { code: "BAD_REQUEST", message: `Unknown artifact kind: ${body.kind}` } });

    const artifacts = { ...instance.artifacts };
    (artifacts[key] as number[]) = (artifacts[key] as number[]).filter((x: number) => x !== body.artifact_id);
    const upd = await instanceRepo.updateInstance(id, { artifacts });
    if (upd) await instanceRepo.updateInstance(id, { currentStation: instanceRepo.computeCurrentStation(upd.stations) });
    return res.json(await instanceRepo.getInstance(id));
  } catch (e) { next(e); }
});

// ── Gate Policy ───────────────────────────────────────────────────────────────

router.get("/settings/gate-policy", async (_req, res, next) => {
  try {
    const policy = await instanceRepo.getGatePolicy();
    res.json(policy);
  } catch (e) { next(e); }
});

router.patch("/settings/gate-policy", async (req, res, next) => {
  try {
    const user = (req as { user?: { role?: string } }).user;
    if (!user || user.role !== "admin") {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "Only admin can update gate policy" } });
    }
    const current = await instanceRepo.getGatePolicy();
    const body = req.body as Partial<typeof current>;
    const updated = { ...current, ...body };
    await instanceRepo.saveGatePolicy(updated);
    return res.json(updated);
  } catch (e) { next(e); }
});

export default router;
