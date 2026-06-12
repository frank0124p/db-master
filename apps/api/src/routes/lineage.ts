import { Router } from "express";
import * as lineageRepo from "../repositories/lineage.js";
import type { LineageTransformType } from "@schema-studio/core";
import { queryWithLineage } from "../services/lineage-query.js";
import { listSchemas, getSchemaById } from "../repositories/schemas.js";

const router = Router();

// GET /api/v1/lineage
router.get("/", async (_req, res, next) => {
  try {
    res.json(await lineageRepo.listEdges());
  } catch (e) { next(e); }
});

// POST /api/v1/lineage
router.post("/", async (req, res, next) => {
  try {
    const body = req.body as {
      fromSchemaId: number; fromSchemaName: string; fromDomain: string;
      fromTableId: number; fromTableName: string;
      toSchemaId: number; toSchemaName: string; toDomain: string;
      toTableId: number; toTableName: string;
      transformType: string; description?: string;
    };
    const edge = await lineageRepo.addEdge({
      fromSchemaId: Number(body.fromSchemaId),
      fromSchemaName: String(body.fromSchemaName),
      fromDomain: String(body.fromDomain),
      fromTableId: Number(body.fromTableId),
      fromTableName: String(body.fromTableName),
      toSchemaId: Number(body.toSchemaId),
      toSchemaName: String(body.toSchemaName),
      toDomain: String(body.toDomain),
      toTableId: Number(body.toTableId),
      toTableName: String(body.toTableName),
      transformType: (body.transformType ?? "direct") as LineageTransformType,
      description: body.description ?? "",
    });
    res.status(201).json(edge);
  } catch (e) { next(e); }
});

// DELETE /api/v1/lineage/:id
router.delete("/:id", async (req, res, next) => {
  try {
    const ok = await lineageRepo.removeEdge(req.params["id"] as string);
    if (!ok) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Edge not found" } });
    return res.status(204).send();
  } catch (e) { next(e); }
});

// POST /api/v1/lineage/query  — NL query using lineage graph
router.post("/query", async (req, res, next) => {
  try {
    const { question } = req.body as { question: string };
    if (!question?.trim()) return res.status(400).json({ error: { code: "INVALID", message: "question required" } });

    const [edges, schemaMetas] = await Promise.all([
      lineageRepo.listEdges(),
      listSchemas(),
    ]);
    const schemas = await Promise.all(schemaMetas.map(m => getSchemaById(m.id)));

    const result = await queryWithLineage(question.trim(), edges, schemas);
    return res.json(result);
  } catch (e) { next(e); }
});

export default router;
