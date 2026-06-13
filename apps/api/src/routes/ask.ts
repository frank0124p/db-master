/**
 * Ask Pipeline — Routes
 *
 * POST /api/v1/ask           — SSE streaming (linking → subgraph → LLM → result)
 * POST /api/v1/ask/link-only — Sync, returns LinkingResult + subgraph (no LLM)
 */

import { Router } from "express";
import { z } from "zod";
import { runAskPipeline, runLinkOnly } from "../services/ask.js";

const router = Router();

const AskBody = z.object({
  question: z.string().min(1).max(2000),
  top_k: z.number().int().min(1).max(30).optional(),
  scope: z.string().optional(),
});

// ── POST /api/v1/ask — SSE streaming ─────────────────────────────────────────

router.post("/", async (req, res) => {
  const parse = AskBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: { code: "INVALID_INPUT", message: parse.error.message } });
    return;
  }

  const { question, top_k: topK, scope } = parse.data;

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  function send(data: unknown): void {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  try {
    for await (const event of runAskPipeline({ question, topK, scope })) {
      send(event);
      if (event.type === "done" || event.type === "error") break;
    }
  } catch (err) {
    send({ type: "error", message: err instanceof Error ? err.message : "Unknown error" });
  } finally {
    res.end();
  }
});

// ── POST /api/v1/ask/link-only — Sync (no LLM) ───────────────────────────────

router.post("/link-only", async (req, res, next) => {
  const parse = AskBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: { code: "INVALID_INPUT", message: parse.error.message } });
    return;
  }

  const { question, top_k: topK, scope } = parse.data;

  try {
    const result = await runLinkOnly({ question, topK, scope });
    res.json(result);
  } catch (e) {
    next(e);
  }
});

export default router;
