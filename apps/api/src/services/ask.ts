/**
 * Ask Pipeline — Service
 *
 * Orchestrates: Linking → Subgraph → LLM Reasoning → Validation
 *
 * SSE event sequence:
 *   { type: "linking", hits: [...], matchedConcepts: [...] }
 *   { type: "subgraph", nodeCount: N, edgeCount: M }
 *   { type: "token", text: "..." }   (LLM streaming tokens)
 *   { type: "result", ...ValidatedAskResult }
 *   { type: "done" }
 *
 * No LLM configured → linking + subgraph fire normally, result is LLM_NOT_CONFIGURED abstain.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import {
  linkQuery,
  extractSubgraph,
  compileSynonyms,
} from "@schema-studio/core";
import type { UnifiedGraph } from "@schema-studio/core";
import { readUnifiedGraph, rebuildFor } from "./graph-builder.js";
import { validateAskResult, type AskResult } from "./ask-validate.js";
import * as namingRepo from "../repositories/naming.js";
import * as knowledgeRepo from "../repositories/knowledge.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = path.resolve(__dirname, "../../../../prompts");

// ── SSE event types ────────────────────────────────────────────────────────────

export type AskSSEEvent =
  | { type: "linking"; hits: Array<{ ref: string; score: number; reasons: string[] }>; matchedConcepts: string[] }
  | { type: "subgraph"; nodeCount: number; edgeCount: number }
  | { type: "token"; text: string }
  | { type: "result"; result: ReturnType<typeof validateAskResult> }
  | { type: "done" }
  | { type: "error"; message: string };

// ── Load graph (with fallback rebuild) ────────────────────────────────────────

async function getGraph(): Promise<UnifiedGraph> {
  const existing = await readUnifiedGraph();
  if (existing) return existing;
  return rebuildFor();
}

// ── LLM config check ──────────────────────────────────────────────────────────

async function getLlmApiKey(): Promise<string> {
  try {
    const { getLlmSettings } = await import("../repositories/settings.js");
    const s = await getLlmSettings();
    return s.apiKey ?? process.env["LLM_API_KEY"] ?? process.env["ANTHROPIC_API_KEY"] ?? "";
  } catch {
    return process.env["LLM_API_KEY"] ?? process.env["ANTHROPIC_API_KEY"] ?? "";
  }
}

// ── Parse LLM JSON response ────────────────────────────────────────────────────

function parseAskResult(text: string): AskResult | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const raw = JSON.parse(jsonMatch[0]) as {
      abstain?: boolean;
      answerFields?: Array<{ ref?: string; why?: string }>;
      joinPath?: unknown[];
      sql?: string;
      explanation?: string;
      confidence?: number;
      missing?: string[];
    };
    return {
      abstain: raw.abstain ?? false,
      answerFields: (raw.answerFields ?? []).map(f => ({
        ref: String(f.ref ?? ""),
        why: String(f.why ?? ""),
      })),
      joinPath: (raw.joinPath ?? []) as AskResult["joinPath"],
      sql: raw.sql ?? "",
      explanation: raw.explanation ?? "",
      confidence: typeof raw.confidence === "number" ? raw.confidence : 0.5,
      missing: raw.missing ?? [],
    };
  } catch {
    return null;
  }
}

// ── Main streaming service ────────────────────────────────────────────────────

export interface AskInput {
  question: string;
  topK?: number;
  scope?: string; // reserved for future domain/suite scoping
}

export async function* runAskPipeline(
  input: AskInput,
): AsyncGenerator<AskSSEEvent> {
  const { question, topK = 12 } = input;

  // ── Load data ──────────────────────────────────────────────────────────────
  let graph: UnifiedGraph;
  try {
    graph = await getGraph();
  } catch (err) {
    yield { type: "error", message: `Failed to load graph: ${String(err)}` };
    return;
  }

  const [dictEntries, concepts] = await Promise.all([
    namingRepo.listNamingEntries(undefined, "approved").catch(() => []),
    knowledgeRepo.listConcepts({ status: "approved" }).catch(() => []),
  ]);

  // ── Compile synonyms ───────────────────────────────────────────────────────
  const synonyms = compileSynonyms(dictEntries, concepts);

  // ── Phase 1: Linking ───────────────────────────────────────────────────────
  const linkResult = linkQuery(question, graph, synonyms, 30);
  yield {
    type: "linking",
    hits: linkResult.hits,
    matchedConcepts: linkResult.matchedConcepts,
  };

  // ── Phase 2: Subgraph extraction ───────────────────────────────────────────
  const subgraph = extractSubgraph(linkResult.hits, graph, 6000, topK);
  yield {
    type: "subgraph",
    nodeCount: subgraph.nodes.length,
    edgeCount: subgraph.edges.length,
  };

  // ── Phase 3: LLM Reasoning ────────────────────────────────────────────────
  const apiKey = await getLlmApiKey();
  if (!apiKey) {
    const abstainResult: AskResult = {
      abstain: true,
      answerFields: [],
      joinPath: [],
      sql: "",
      explanation: "",
      confidence: 0,
      missing: [],
      reason: "LLM_NOT_CONFIGURED",
    };
    yield {
      type: "result",
      result: { ...abstainResult, warnings: [] },
    };
    yield { type: "done" };
    return;
  }

  let promptTemplate: string;
  try {
    promptTemplate = await fs.readFile(
      path.join(PROMPTS_DIR, "ask-pipeline.md"),
      "utf-8",
    );
  } catch {
    yield { type: "error", message: "Failed to load ask-pipeline.md prompt template" };
    return;
  }

  const prompt = promptTemplate
    .replace("{{subgraph_context}}", subgraph.serialized)
    .replace("{{question}}", question);

  const model = process.env["LLM_MODEL"] ?? "claude-sonnet-4-6";
  const client = new Anthropic({ apiKey });

  let fullText = "";
  try {
    const stream = client.messages.stream({
      model,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        const text = event.delta.text;
        fullText += text;
        yield { type: "token", text };
      }
    }
  } catch (err) {
    yield { type: "error", message: `LLM error: ${String(err)}` };
    return;
  }

  // ── Phase 4: Validation ────────────────────────────────────────────────────
  const parsed = parseAskResult(fullText);
  if (!parsed) {
    const abstainResult: AskResult = {
      abstain: true,
      answerFields: [],
      joinPath: [],
      sql: "",
      explanation: "",
      confidence: 0,
      missing: ["LLM 回應無法解析為有效 JSON"],
    };
    yield { type: "result", result: { ...abstainResult, warnings: ["LLM response was not valid JSON"] } };
    yield { type: "done" };
    return;
  }

  const validated = validateAskResult(parsed, graph);
  yield { type: "result", result: validated };
  yield { type: "done" };
}

// ── Link-only (sync, no LLM) ───────────────────────────────────────────────────

export interface LinkOnlyResult {
  hits: Array<{ ref: string; score: number; reasons: string[] }>;
  matchedConcepts: string[];
  matchedValues: Array<{ token: string; ref: string }>;
  subgraph: {
    nodeCount: number;
    edgeCount: number;
    serialized: string;
  };
}

export async function runLinkOnly(input: AskInput): Promise<LinkOnlyResult> {
  const { question, topK = 12 } = input;

  const graph = await getGraph();
  const [dictEntries, concepts] = await Promise.all([
    namingRepo.listNamingEntries(undefined, "approved").catch(() => []),
    knowledgeRepo.listConcepts({ status: "approved" }).catch(() => []),
  ]);

  const synonyms = compileSynonyms(dictEntries, concepts);
  const linkResult = linkQuery(question, graph, synonyms, 30);
  const subgraph = extractSubgraph(linkResult.hits, graph, 6000, topK);

  return {
    hits: linkResult.hits,
    matchedConcepts: linkResult.matchedConcepts,
    matchedValues: linkResult.matchedValues,
    subgraph: {
      nodeCount: subgraph.nodes.length,
      edgeCount: subgraph.edges.length,
      serialized: subgraph.serialized,
    },
  };
}
