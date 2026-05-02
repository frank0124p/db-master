import { Router, type Router as ExpressRouter } from "express";
import { CreateFieldInput } from "@schema-studio/core";
import * as repo from "../repositories/fields.js";

const router: ExpressRouter = Router({ mergeParams: true });

router.post("/", async (req, res, next) => {
  try {
    const input = CreateFieldInput.parse(req.body);
    const tableId = Number((req.params as Record<string, string>)["tableId"]);
    res.status(201).json(await repo.createField(tableId, input));
  } catch (e) { next(e); }
});

router.patch("/:fieldId", async (req, res, next) => {
  try {
    const input = CreateFieldInput.partial().strip().parse(req.body);
    await repo.updateField(Number((req.params as Record<string, string>)["fieldId"]), input);
    res.status(204).end();
  } catch (e) { next(e); }
});

router.delete("/:fieldId", async (req, res, next) => {
  try {
    await repo.deleteField(Number((req.params as Record<string, string>)["fieldId"]));
    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;
