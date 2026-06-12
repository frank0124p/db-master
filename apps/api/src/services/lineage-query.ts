import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import type { LineageEdge, LineageQueryResult } from "@schema-studio/core";
import type { SchemaWithTables } from "../repositories/schemas.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = path.resolve(__dirname, "../../../../prompts");

// We re-use the provider config from llm.ts via dynamic import to avoid duplication
async function getLlmConfig() {
  const apiKey = process.env["LLM_API_KEY"] ?? process.env["ANTHROPIC_API_KEY"] ?? "";
  const provider = (process.env["LLM_PROVIDER"] ?? "anthropic") as "anthropic" | "openai";
  const baseUrl = process.env["LLM_BASE_URL"] ?? "";
  const model = process.env["LLM_MODEL"] ?? "claude-sonnet-4-6";

  // Try to load persisted settings
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

function buildLineageSummary(edges: LineageEdge[]): string {
  if (edges.length === 0) return "（尚未定義任何血緣關係）";
  return edges.map(e =>
    `[${e.id.slice(0, 8)}] ${e.fromDomain}/${e.fromSchemaName}.${e.fromTableName} --[${e.transformType}]--> ${e.toDomain}/${e.toSchemaName}.${e.toTableName}` +
    (e.description ? ` # ${e.description}` : "")
  ).join("\n");
}

function buildSchemasSummary(schemas: SchemaWithTables[]): string {
  return schemas.map(s => {
    const tables = s.tables.map(t => {
      const fields = t.fields.slice(0, 12).map(f => `    - ${f.name}: ${f.dataType}${f.isPrimaryKey ? " [PK]" : ""}${f.comment ? ` (${f.comment})` : ""}`).join("\n");
      return `  Table: ${t.name}${t.comment ? ` — ${t.comment}` : ""}\n${fields}`;
    }).join("\n");
    return `Schema: ${s.name} (domain: ${s.domain ?? "未分類"}, id: ${s.id})\n${tables}`;
  }).join("\n\n");
}

function parseJson(text: string): unknown {
  // Strip markdown code fences if present
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (match ? match[1] : text) ?? text;
  return JSON.parse(raw.trim());
}

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
      model: cfg.model,
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });
    const block = msg.content[0] ?? { type: "text" as const, text: "" };
    text = block.type === "text" ? (block as { type: "text"; text: string }).text : "";
  }

  const parsed = parseJson(text) as {
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
