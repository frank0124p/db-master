import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import type { LineageEdge, LineageQueryResult, LineageThinkingStep } from "@schema-studio/core";
import type { SchemaWithTables } from "../repositories/schemas.js";
import { MOCK_SCENARIOS, MOCK_FALLBACK } from "./lineage-mock-config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = path.resolve(__dirname, "../../../../prompts");

async function getLlmConfig() {
  const apiKey = process.env["LLM_API_KEY"] ?? process.env["ANTHROPIC_API_KEY"] ?? "";
  const provider = (process.env["LLM_PROVIDER"] ?? "anthropic") as "anthropic" | "openai";
  const baseUrl = process.env["LLM_BASE_URL"] ?? "";
  const model = process.env["LLM_MODEL"] ?? "claude-sonnet-4-6";
  try {
    const { getLlmSettings } = await import("../repositories/settings.js");
    const s = await getLlmSettings();
    return {
      provider: (s.provider ?? provider) as "anthropic" | "openai",
      apiKey: s.apiKey ?? apiKey,
      baseUrl: s.baseUrl ?? baseUrl,
      model: s.model ?? model,
    };
  } catch {
    return { provider, apiKey, baseUrl, model };
  }
}

export function buildLineageSummary(edges: LineageEdge[]): string {
  if (edges.length === 0) return "（尚未定義任何血緣關係）";
  return edges.map(e =>
    `[${e.id.slice(0, 8)}] ${e.fromDomain}/${e.fromSchemaName}.${e.fromTableName}(${e.fromKind}) --[${e.transformType}]--> ${e.toDomain}/${e.toSchemaName}.${e.toTableName}(${e.toKind})` +
    (e.description ? ` # ${e.description}` : "")
  ).join("\n");
}

export function buildSchemasSummary(schemas: SchemaWithTables[]): string {
  return schemas.map(s => {
    const tables = s.tables.map(t => {
      const fields = t.fields.slice(0, 12).map(f =>
        `    - ${f.name}: ${f.dataType}${f.isPrimaryKey ? " [PK]" : ""}${f.comment ? ` (${f.comment})` : ""}`
      ).join("\n");
      return `  Table: ${t.name}${t.comment ? ` — ${t.comment}` : ""}\n${fields}`;
    }).join("\n");
    return `Schema: ${s.name} (domain: ${s.domain ?? "未分類"}, id: ${s.id})\n${tables}`;
  }).join("\n\n");
}

function extractJson(text: string): unknown {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (match ? match[1] : text) ?? text;
  return JSON.parse(raw.trim());
}

// ── Non-streaming query (fallback) ────────────────────────────────────────────

export async function queryWithLineage(
  question: string,
  edges: LineageEdge[],
  schemas: SchemaWithTables[],
): Promise<LineageQueryResult> {
  const template = await fs.readFile(path.join(PROMPTS_DIR, "lineage-query.md"), "utf-8");
  const prompt = template
    .replace("{{lineage}}", buildLineageSummary(edges))
    .replace("{{schemas}}", buildSchemasSummary(schemas))
    .replace("{{question}}", question);

  const cfg = await getLlmConfig();
  let text: string;

  if (cfg.provider === "openai") {
    if (!cfg.baseUrl) throw new Error("LLM_BASE_URL required for openai provider");
    const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model, max_tokens: 2048, messages: [{ role: "user", content: prompt }] }),
    });
    const data = await res.json() as { choices: { message: { content: string } }[] };
    text = data.choices[0]?.message?.content ?? "";
  } else {
    const client = new Anthropic({ apiKey: cfg.apiKey });
    const msg = await client.messages.create({
      model: cfg.model, max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });
    const block = msg.content[0] ?? { type: "text" as const, text: "" };
    text = block.type === "text" ? (block as { type: "text"; text: string }).text : "";
  }

  const parsed = extractJson(text) as {
    relevantEdgeIds: string[];
    relevantTables: LineageQueryResult["relevantTables"];
    joinPath: string;
    sql: string;
    explanation: string;
  };

  return {
    question,
    relevantEdgeIds: parsed.relevantEdgeIds ?? [],
    relevantTables: parsed.relevantTables ?? [],
    joinPath: parsed.joinPath ?? "",
    sql: parsed.sql ?? "",
    explanation: parsed.explanation ?? "",
  };
}

// ── Mock streaming (LINEAGE_MOCK=true) ───────────────────────────────────────

function isMockEnabled(): boolean {
  const flag = process.env["LINEAGE_MOCK"] ?? "";
  return flag === "true" || flag === "1";
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Step delays (ms) — simulate LLM thinking cadence
const STEP_DELAYS = [400, 550, 650, 500, 700];

async function* mockLineageStream(
  question: string,
  edges: LineageEdge[],
  schemas: SchemaWithTables[],
): AsyncGenerator<StreamEvent> {
  const scenario =
    MOCK_SCENARIOS.find(s => s.match.test(question)) ?? MOCK_FALLBACK;

  for (let i = 0; i < scenario.steps.length; i++) {
    await sleep(STEP_DELAYS[i] ?? 400);
    yield { type: "thinking", step: scenario.steps[i]! };
  }

  await sleep(300);
  yield { type: "done", result: scenario.buildResult(question, edges, schemas) };
}

// ── Streaming query with thinking steps ──────────────────────────────────────

export type StreamEvent =
  | { type: "thinking"; step: LineageThinkingStep }
  | { type: "done"; result: LineageQueryResult }
  | { type: "error"; message: string };

export async function* queryWithLineageStream(
  question: string,
  edges: LineageEdge[],
  schemas: SchemaWithTables[],
): AsyncGenerator<StreamEvent> {
  if (isMockEnabled()) {
    yield* mockLineageStream(question, edges, schemas);
    return;
  }

  const template = await fs.readFile(path.join(PROMPTS_DIR, "lineage-query-stream.md"), "utf-8");
  const prompt = template
    .replace("{{lineage}}", buildLineageSummary(edges))
    .replace("{{schemas}}", buildSchemasSummary(schemas))
    .replace("{{question}}", question);

  const cfg = await getLlmConfig();

  let accumulated = "";

  // ── Helper: parse accumulated buffer for events ─────────────────────────────
  // Returns { events: StreamEvent[], remainingBuffer: string, resultDone: boolean }
  function parseBuffer(buf: string): { events: StreamEvent[]; remaining: string; resultDone: boolean } {
    const events: StreamEvent[] = [];
    const lines = buf.split("\n");
    const remaining: string[] = [];
    let resultMode = false;
    let resultLines: string[] = [];
    let resultDone = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      if (resultMode) {
        resultLines.push(line);
        // Try to parse accumulated JSON
        const candidate = resultLines.join("\n").trim();
        if (candidate) {
          try {
            const parsed = extractJson(candidate) as {
              relevantEdgeIds: string[];
              relevantTables: LineageQueryResult["relevantTables"];
              joinPath: string;
              sql: string;
              explanation: string;
            };
            events.push({
              type: "done",
              result: {
                question,
                relevantEdgeIds: parsed.relevantEdgeIds ?? [],
                relevantTables: parsed.relevantTables ?? [],
                joinPath: parsed.joinPath ?? "",
                sql: parsed.sql ?? "",
                explanation: parsed.explanation ?? "",
              },
            });
            resultDone = true;
            resultLines = [];
          } catch {
            // JSON not complete yet — keep accumulating
          }
        }
        continue;
      }

      const stepMatch = line.match(/^STEP\[(.+?)\]:\s*(.+)/);
      if (stepMatch) {
        events.push({ type: "thinking", step: { step: stepMatch[1]!, text: stepMatch[2]! } });
      } else if (line.startsWith("RESULT:")) {
        resultMode = true;
        const inlineJson = line.slice(7).trim();
        if (inlineJson) resultLines.push(inlineJson);
      } else if (i === lines.length - 1 && !resultMode) {
        // Possibly incomplete last line — keep in buffer
        remaining.push(line);
      }
    }

    // If result still accumulating, keep those lines
    if (resultMode && !resultDone) {
      remaining.push("RESULT:");
      remaining.push(...resultLines);
    }

    return { events, remaining: remaining.join("\n"), resultDone };
  }

  if (cfg.provider === "openai") {
    // OpenAI streaming
    if (!cfg.baseUrl) throw new Error("LLM_BASE_URL required");
    const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model, max_tokens: 2048, stream: true, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok || !res.body) throw new Error(`OpenAI error ${res.status}`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let streamBuf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      streamBuf += dec.decode(value, { stream: true });
      const rawLines = streamBuf.split("\n");
      streamBuf = rawLines.pop() ?? "";
      for (const rawLine of rawLines) {
        const t = rawLine.trim();
        if (!t.startsWith("data:")) continue;
        const raw = t.slice(5).trim();
        if (raw === "[DONE]") continue;
        try {
          const chunk = JSON.parse(raw) as { choices: { delta: { content?: string } }[] };
          const delta = chunk.choices[0]?.delta?.content ?? "";
          accumulated += delta;
          const { events, remaining, resultDone } = parseBuffer(accumulated);
          accumulated = remaining;
          for (const ev of events) yield ev;
          if (resultDone) return;
        } catch { /* skip */ }
      }
    }
  } else {
    // Anthropic streaming
    const client = new Anthropic({ apiKey: cfg.apiKey });
    const stream = await client.messages.stream({
      model: cfg.model,
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        accumulated += event.delta.text;
        const { events, remaining, resultDone } = parseBuffer(accumulated);
        accumulated = remaining;
        for (const ev of events) yield ev;
        if (resultDone) return;
      }
    }
  }

  // Final flush — try to parse whatever remains
  if (accumulated.trim()) {
    const { events } = parseBuffer(accumulated + "\n");
    for (const ev of events) yield ev;
  }
}
