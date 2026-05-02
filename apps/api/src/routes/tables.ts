import { Router, type Router as ExpressRouter } from "express";
import { CreateTableInput } from "@schema-studio/core";
import * as repo from "../repositories/tables.js";

const router: ExpressRouter = Router({ mergeParams: true });

router.post("/", async (req, res, next) => {
  try {
    const input = CreateTableInput.parse(req.body);
    const schemaId = Number((req.params as Record<string, string>)["schemaId"]);
    res.status(201).json(await repo.createTable(schemaId, input));
  } catch (e) { next(e); }
});

router.patch("/:tableId", async (req, res, next) => {
  try {
    const input = CreateTableInput.partial().strip().parse(req.body);
    await repo.updateTable(Number((req.params as Record<string, string>)["tableId"]), input);
    res.status(204).end();
  } catch (e) { next(e); }
});

router.delete("/:tableId", async (req, res, next) => {
  try {
    await repo.deleteTable(Number((req.params as Record<string, string>)["tableId"]));
    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;
