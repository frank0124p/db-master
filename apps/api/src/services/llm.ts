/**
 * LLM service — supports Anthropic (default) and any OpenAI-compatible API
 * (OpenRouter, Ollama, Together.ai, LM Studio, etc.)
 *
 * Env vars:
 *   LLM_PROVIDER      = "anthropic" | "openai"  (default: anthropic)
 *   LLM_BASE_URL      = https://...              (required for openai provider)
 *   LLM_API_KEY       = sk-...                   (overrides ANTHROPIC_API_KEY)
 *   LLM_MODEL         = model-name               (overrides per-operation defaults)
 */

import Anthropic from "@anthropic-ai/sdk";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = path.resolve(__dirname, "../../../../prompts");
const AUDIT_LOG = path.resolve(__dirname, "../../../../data/llm-audit-logs.jsonl");

// ── Provider config ────────────────────────────────────────────────────────────
// Priority: persisted settings (data/settings.json) > env vars

interface ResolvedConfig {
  provider: "anthropic" | "openai";
  apiKey: string;
  baseUrl: string;
  modelOverride: string | undefined;
}

let _configCache: ResolvedConfig | null = null;

async function getConfig(): Promise<ResolvedConfig> {
  if (_configCache) return _configCache;
  try {
    const { getLlmSettings } = await import("../repositories/settings.js");
    const s = await getLlmSettings();
    _configCache = {
      provider: (s.provider ?? process.env["LLM_PROVIDER"] ?? "anthropic") as "anthropic" | "openai",
      apiKey: s.apiKey ?? process.env["LLM_API_KEY"] ?? process.env["ANTHROPIC_API_KEY"] ?? "",
      baseUrl: s.baseUrl ?? process.env["LLM_BASE_URL"] ?? "",
      modelOverride: s.model ?? process.env["LLM_MODEL"],
    };
  } catch {
    _configCache = {
      provider: (process.env["LLM_PROVIDER"] ?? "anthropic") as "anthropic" | "openai",
      apiKey: process.env["LLM_API_KEY"] ?? process.env["ANTHROPIC_API_KEY"] ?? "",
      baseUrl: process.env["LLM_BASE_URL"] ?? "",
      modelOverride: process.env["LLM_MODEL"],
    };
  }
  return _configCache;
}

export function resetLlmConfig(): void {
  _configCache = null;
  _anthropic = null;
}

const DEFAULT_MODELS = {
  generate: "claude-sonnet-4-6",
  analyze:  "claude-sonnet-4-6",
  suggest:  "claude-haiku-4-5-20251001",
};

async function resolveModel(op: keyof typeof DEFAULT_MODELS): Promise<string> {
  const cfg = await getConfig();
  return cfg.modelOverride ?? DEFAULT_MODELS[op];
}

// ── Anthropic client (lazy) ────────────────────────────────────────────────────

let _anthropic: Anthropic | null = null;
async function getAnthropicClient(): Promise<Anthropic> {
  if (!_anthropic) {
    const cfg = await getConfig();
    _anthropic = new Anthropic({ apiKey: cfg.apiKey });
  }
  return _anthropic;
}

// ── Connection test ────────────────────────────────────────────────────────────

export async function testLlmConnection(): Promise<{ ok: boolean; message: string }> {
  const cfg = await getConfig();
  try {
    if (cfg.provider === "openai") {
      if (!cfg.baseUrl) return { ok: false, message: "baseUrl is required for openai provider" };
      const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/models`, {
        headers: { Authorization: `Bearer ${cfg.apiKey}` },
      });
      if (!res.ok) return { ok: false, message: `HTTP ${res.status}` };
      return { ok: true, message: "Connection successful" };
    } else {
      const client = await getAnthropicClient();
      await client.messages.create({
        model: cfg.modelOverride ?? DEFAULT_MODELS.suggest,
        max_tokens: 16,
        messages: [{ role: "user", content: "ping" }],
      });
      return { ok: true, message: "Connection successful" };
    }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Unknown error" };
  }
}

// ── OpenAI-compatible streaming helper ─────────────────────────────────────────

interface OaiDelta { content?: string }
interface OaiChunk { choices: { delta: OaiDelta; finish_reason: string | null }[] }

async function* streamOpenAI(
  prompt: string,
  model: string,
  maxTokens: number,
): AsyncGenerator<{ text?: string; inputTokens?: number; outputTokens?: number }> {
  const cfg = await getConfig();
  if (!cfg.baseUrl) throw new Error("LLM_BASE_URL must be set when LLM_PROVIDER=openai");

  const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      stream: true,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok || !res.body) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`OpenAI-compatible API error ${res.status}: ${err}`);
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let outputTokens = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const raw = trimmed.slice(5).trim();
      if (raw === "[DONE]") continue;
      try {
        const chunk = JSON.parse(raw) as OaiChunk;
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          outputTokens++;
          yield { text: delta.content };
        }
      } catch { /* skip malformed lines */ }
    }
  }

  yield { outputTokens };
}

async function completeOpenAI(prompt: string, model: string, maxTokens: number): Promise<string> {
  const cfg = await getConfig();
  if (!cfg.baseUrl) throw new Error("LLM_BASE_URL must be set when LLM_PROVIDER=openai");

  const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      stream: false,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`OpenAI-compatible API error ${res.status}: ${err}`);
  }

  const data = await res.json() as { choices: { message: { content: string } }[]; usage?: { prompt_tokens: number; completion_tokens: number } };
  return data.choices[0]?.message?.content ?? "";
}

// ── Audit log ──────────────────────────────────────────────────────────────────

interface AuditEntry {
  ts: string; provider: string; model: string; prompt: string;
  inputTokens: number; responseTokens: number; latencyMs: number;
  costUsd: number; operation: string;
}

async function writeAuditLog(entry: AuditEntry): Promise<void> {
  await fs.appendFile(AUDIT_LOG, JSON.stringify(entry) + "\n", "utf-8").catch(() => undefined);
}

// ── Schema generation types ───────────────────────────────────────────────────

export interface GeneratedField {
  name: string; dataType: string; nullable: boolean;
  defaultValue: string | null; isPrimaryKey: boolean; isUnique: boolean;
  comment: string | null;
}

export interface GeneratedTable {
  name: string; comment: string; fields: GeneratedField[];
}

export interface GenerateSchemaResult {
  name: string; description: string; tables: GeneratedTable[];
}

// ── Schema generation (streaming) ─────────────────────────────────────────────

export async function* generateSchemaStream(
  userPrompt: string,
  namingDict: string,
  skills: string,
): AsyncGenerator<{ type: "token"; text: string } | { type: "result"; schema: GenerateSchemaResult } | { type: "error"; message: string }> {
  const template = await fs.readFile(path.join(PROMPTS_DIR, "generate-schema.md"), "utf-8");
  const systemPrompt = template
    .replace("{{naming_dictionary}}", namingDict)
    .replace("{{skills}}", skills)
    .replace("{{user_prompt}}", userPrompt);

  const cfg = await getConfig();
  const model = await resolveModel("generate");
  const startMs = Date.now();
  let fullText = "";
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    if (cfg.provider === "openai") {
      for await (const chunk of streamOpenAI(systemPrompt, model, 4096)) {
        if (chunk.text) { fullText += chunk.text; yield { type: "token", text: chunk.text }; }
        if (chunk.outputTokens) outputTokens = chunk.outputTokens;
      }
    } else {
      const stream = await (await getAnthropicClient()).messages.stream({
        model, max_tokens: 4096,
        messages: [{ role: "user", content: systemPrompt }],
      });
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          fullText += event.delta.text;
          yield { type: "token", text: event.delta.text };
        }
        if (event.type === "message_delta" && "usage" in event)
          outputTokens = (event as { usage?: { output_tokens?: number } }).usage?.output_tokens ?? 0;
        if (event.type === "message_start" && "message" in event)
          inputTokens = (event as { message?: { usage?: { input_tokens?: number } } }).message?.usage?.input_tokens ?? 0;
      }
    }

    const jsonMatch = fullText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("LLM did not return valid JSON schema");
    const parsed = JSON.parse(jsonMatch[0]) as GenerateSchemaResult;

    await writeAuditLog({
      ts: new Date().toISOString(), provider: cfg.provider, model,
      prompt: userPrompt.slice(0, 200), inputTokens, responseTokens: outputTokens,
      latencyMs: Date.now() - startMs, costUsd: 0, operation: "generate-schema",
    });

    yield { type: "result", schema: parsed };
  } catch (err: unknown) {
    yield { type: "error", message: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ── Schema analysis (streaming) ───────────────────────────────────────────────

export interface AnalyzeIssue {
  severity: string; source: string; target: string; message: string; suggestion: string | null;
}

export async function* analyzeSchemaStream(
  schemaJson: string,
  ruleViolations: AnalyzeIssue[],
  namingIssues: AnalyzeIssue[],
  skills: string,
): AsyncGenerator<{ type: "token"; text: string } | { type: "done"; score: number } | { type: "error"; message: string }> {
  const template = await fs.readFile(path.join(PROMPTS_DIR, "analyze-schema-system.md"), "utf-8");

  const ruleText = ruleViolations.length
    ? ruleViolations.map(i => `- [${i.severity}] ${i.target}: ${i.message}`).join("\n")
    : "（無）";
  const namingText = namingIssues.length
    ? namingIssues.map(i => `- ${i.target}: ${i.message}${i.suggestion ? ` → ${i.suggestion}` : ""}`).join("\n")
    : "（無）";

  const systemPrompt = template
    .replace("{{skills}}", skills)
    .replace("{{rule_violations}}", ruleText)
    .replace("{{naming_issues}}", namingText)
    .replace("{{schema_json}}", schemaJson);

  const cfg = await getConfig();
  const model = await resolveModel("analyze");
  const startMs = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    if (cfg.provider === "openai") {
      for await (const chunk of streamOpenAI(systemPrompt, model, 2048)) {
        if (chunk.text) yield { type: "token", text: chunk.text };
        if (chunk.outputTokens) outputTokens = chunk.outputTokens;
      }
    } else {
      const stream = await (await getAnthropicClient()).messages.stream({
        model, max_tokens: 2048,
        messages: [{ role: "user", content: systemPrompt }],
      });
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta")
          yield { type: "token", text: event.delta.text };
        if (event.type === "message_delta" && "usage" in event)
          outputTokens = (event as { usage?: { output_tokens?: number } }).usage?.output_tokens ?? 0;
        if (event.type === "message_start" && "message" in event)
          inputTokens = (event as { message?: { usage?: { input_tokens?: number } } }).message?.usage?.input_tokens ?? 0;
      }
    }

    await writeAuditLog({
      ts: new Date().toISOString(), provider: cfg.provider, model,
      prompt: schemaJson.slice(0, 200), inputTokens, responseTokens: outputTokens,
      latencyMs: Date.now() - startMs, costUsd: 0, operation: "analyze-schema",
    });

    const score = Math.max(0, 100 - ruleViolations.filter(i => i.severity === "error").length * 20 - namingIssues.length * 5);
    yield { type: "done", score };
  } catch (err: unknown) {
    yield { type: "error", message: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ── Schema suggestion (streaming) ────────────────────────────────────────────

export async function* suggestSchemaStream(
  schemaJson: string,
): AsyncGenerator<{ type: "token"; text: string } | { type: "done" } | { type: "error"; message: string }> {
  const template = await fs.readFile(path.join(PROMPTS_DIR, "suggest-schema.md"), "utf-8");
  const systemPrompt = template.replace("{{schema_json}}", schemaJson);

  const cfg = await getConfig();
  const model = await resolveModel("analyze");
  const startMs = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    if (cfg.provider === "openai") {
      for await (const chunk of streamOpenAI(systemPrompt, model, 2048)) {
        if (chunk.text) yield { type: "token", text: chunk.text };
        if (chunk.outputTokens) outputTokens = chunk.outputTokens;
      }
    } else {
      const stream = await (await getAnthropicClient()).messages.stream({
        model, max_tokens: 2048,
        messages: [{ role: "user", content: systemPrompt }],
      });
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta")
          yield { type: "token", text: event.delta.text };
        if (event.type === "message_delta" && "usage" in event)
          outputTokens = (event as { usage?: { output_tokens?: number } }).usage?.output_tokens ?? 0;
        if (event.type === "message_start" && "message" in event)
          inputTokens = (event as { message?: { usage?: { input_tokens?: number } } }).message?.usage?.input_tokens ?? 0;
      }
    }

    await writeAuditLog({
      ts: new Date().toISOString(), provider: cfg.provider, model,
      prompt: schemaJson.slice(0, 200), inputTokens, responseTokens: outputTokens,
      latencyMs: Date.now() - startMs, costUsd: 0, operation: "suggest-schema",
    });

    yield { type: "done" };
  } catch (err: unknown) {
    yield { type: "error", message: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ── Naming suggestion ─────────────────────────────────────────────────────────

export interface NamingSuggestion {
  aiDescription: string;
  tags: string[];
}

const ALLOWED_TAGS = [
  "識別碼", "量測值", "時間戳", "狀態", "參考鍵",
  "數量", "文字描述", "布林旗標", "設備相關", "批次相關",
  "產品相關", "製程相關", "良率品質", "維護保養", "操作人員",
];

export async function suggestNamingDefinition(entry: {
  concept: string; stdName: string; aliases: string[]; domain: string;
}): Promise<NamingSuggestion> {
  const prompt = `你是半導體製造業資料庫命名字典的 AI 助理，專門為資料庫欄位提供清楚的中文定義與分類標籤。

請針對以下命名詞彙，提供：
1. 一段清楚的中文欄位定義（50-150字，說明此欄位的用途、資料意義、在製程中的角色）
2. 從以下預定義標籤中選 1-3 個最適合的分類標籤

預定義標籤清單：
${ALLOWED_TAGS.join("、")}

命名詞彙資訊：
- 中文概念：${entry.concept}
- 標準英文名：${entry.stdName}
- 常見別名：${entry.aliases.join(", ") || "（無）"}
- 領域：${entry.domain === "semiconductor" ? "半導體製造" : "通用"}

請以 JSON 格式回覆，格式如下：
{
  "description": "欄位定義文字",
  "tags": ["標籤1", "標籤2"]
}

只回覆 JSON，不要其他文字。`;

  const cfg = await getConfig();
  const model = await resolveModel("suggest");
  let text: string;

  if (cfg.provider === "openai") {
    text = await completeOpenAI(prompt, model, 512);
  } else {
    const client = await getAnthropicClient();
    const message = await client.messages.create({
      model, max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });
    text = message.content[0]?.type === "text" ? message.content[0].text.trim() : "{}";
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("LLM returned no valid JSON");

  const parsed = JSON.parse(jsonMatch[0]) as { description?: string; tags?: string[] };
  const validTags = (parsed.tags ?? []).filter((t) => ALLOWED_TAGS.includes(t));

  return {
    aiDescription: parsed.description ?? "",
    tags: validTags,
  };
}

export async function translateText(input: {
  text: string; context?: string; targetLang?: string;
}): Promise<{ translated: string; detectedLang: string; snakeCaseSuggestion?: string }> {
  const target = input.targetLang ?? "zh-TW（繁體中文）";
  const prompt = `你是多語言資料庫術語翻譯助理。請將以下文字翻譯為 ${target}，並保留技術術語的準確性。

${input.context ? `上下文：${input.context}\n` : ""}原文：
${input.text}

請以 JSON 格式回覆：
{
  "translated": "翻譯後的文字",
  "detectedLang": "偵測到的原文語言（如 German、English、Japanese 等）",
  "snakeCaseSuggestion": "若原文是欄位名稱，提供建議的 snake_case 英文標準名（否則留空字串）"
}

只回覆 JSON，不要其他文字。`;

  const cfg = await getConfig();
  const model = await resolveModel("suggest");
  let text: string;

  if (cfg.provider === "openai") {
    text = await completeOpenAI(prompt, model, 256);
  } else {
    const client = await getAnthropicClient();
    const message = await client.messages.create({
      model, max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    });
    text = message.content[0]?.type === "text" ? message.content[0].text.trim() : "{}";
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { translated: input.text, detectedLang: "unknown" };
  const parsed = JSON.parse(jsonMatch[0]) as { translated?: string; detectedLang?: string; snakeCaseSuggestion?: string };
  return {
    translated: parsed.translated ?? input.text,
    detectedLang: parsed.detectedLang ?? "unknown",
    snakeCaseSuggestion: parsed.snakeCaseSuggestion || undefined,
  };
}

export async function suggestFieldComment(input: {
  fieldName: string; dataType: string; tableName: string; tableComment?: string | null; domain: string;
}): Promise<{ comment: string }> {
  const prompt = `你是資料庫設計助理。請根據下方欄位資訊，以繁體中文寫一句簡潔的欄位用途說明（30-80字，說明欄位的業務含義與用途）。

資訊：
- 欄位名稱：${input.fieldName}
- 資料型態：${input.dataType}
- 所屬表格：${input.tableName}${input.tableComment ? `（${input.tableComment}）` : ""}
- 領域：${input.domain === "semiconductor" ? "半導體製造 / PLM" : "通用"}

請只回覆 JSON，格式：{"comment": "欄位說明文字"}，不要其他文字。`;

  const cfg = await getConfig();
  const model = await resolveModel("suggest");
  let text: string;

  if (cfg.provider === "openai") {
    text = await completeOpenAI(prompt, model, 256);
  } else {
    const client = await getAnthropicClient();
    const message = await client.messages.create({
      model, max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    });
    text = message.content[0]?.type === "text" ? message.content[0].text.trim() : "{}";
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { comment: "" };
  const parsed = JSON.parse(jsonMatch[0]) as { comment?: string };
  return { comment: parsed.comment ?? "" };
}
