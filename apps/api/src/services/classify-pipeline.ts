import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import {
  computeClassifierFeatures,
  computeConfidence,
} from "@schema-studio/core";
import type {
  ClassificationProposal,
  ImportBatch,
  ConceptCard,
} from "@schema-studio/core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = path.resolve(__dirname, "../../../../prompts");

const RULE_CONFIDENCE_THRESHOLD = 0.7;

interface ClassifyCtx {
  concepts: ConceptCard[];
  dictEntries: Array<{ id: number; stdName: string; aliases: string[] }>;
  existingTables: Array<{
    schemaId: number;
    tableName: string;
    fields: string[];
    domain?: string;
    layerType?: string | null;
    suiteId?: number | null;
  }>;
  availableDomains: string[];
}

async function callLLMForClassification(
  tableName: string,
  fields: string[],
  features: ReturnType<typeof computeClassifierFeatures>,
  ctx: ClassifyCtx,
): Promise<{ domain: string | null; layerType: string | null; confidence: number; summary: string }> {
  const template = await fs.readFile(
    path.join(PROMPTS_DIR, "classify-table.md"),
    "utf-8",
  );

  const similarExamples = features.similarTables.slice(0, 3).map(s => {
    const existing = ctx.existingTables.find(
      e => e.schemaId === s.schemaId && e.tableName === s.tableName,
    );
    return {
      tableName: s.tableName,
      score: s.score,
      domain: existing?.domain,
      layerType: existing?.layerType,
    };
  });

  const prompt = `${template}

---

## Input

table_name: ${tableName}
fields: [${fields.join(", ")}]

features:
- conceptHitScore: ${features.conceptHitScore.toFixed(2)}
- dictCoverage: ${features.dictCoverage.toFixed(2)}
- similarTableScore: ${features.similarTableScore.toFixed(2)}

candidate_domains: [${ctx.availableDomains.join(", ")}]

similar_table_examples:
${similarExamples.map(e => `  - ${e.tableName} (score=${e.score.toFixed(2)}, domain=${e.domain ?? "?"}, layer=${e.layerType ?? "?"})`).join("\n")}

Respond with ONLY the JSON object. No markdown fences, no explanation.`;

  const apiKey = process.env["LLM_API_KEY"] ?? process.env["ANTHROPIC_API_KEY"] ?? "";
  if (!apiKey) throw new Error("No LLM API key");

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });
  const resp = await client.messages.create({
    model: process.env["LLM_MODEL"] ?? "claude-haiku-4-5-20251001",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  const content = resp.content[0];
  const text = content?.type === "text" ? content.text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in LLM response");

  const parsed = JSON.parse(jsonMatch[0]) as {
    suggested?: { domain?: string; layer_type?: string };
    confidence?: number;
    summary?: string;
  };

  return {
    domain: parsed.suggested?.domain ?? null,
    layerType: parsed.suggested?.layer_type ?? null,
    confidence: parsed.confidence ?? 0.5,
    summary: parsed.summary ?? "",
  };
}

export async function* classifyBatch(
  batch: ImportBatch,
  tableDetails: Array<{
    tableId: number;
    tableName: string;
    fields: string[];
  }>,
  ctx: ClassifyCtx,
): AsyncGenerator<
  | { type: "table-classified"; proposal: ClassificationProposal }
  | { type: "done"; total: number; avgConfidence: number }
  | { type: "error"; message: string }
> {
  let total = 0;
  let confidenceSum = 0;
  const hasLLM = !!(process.env["LLM_API_KEY"] ?? process.env["ANTHROPIC_API_KEY"]);

  for (const detail of tableDetails) {
    try {
      const features = computeClassifierFeatures(
        { tableName: detail.tableName, fields: detail.fields },
        {
          concepts: ctx.concepts,
          dictEntries: ctx.dictEntries,
          existingTables: ctx.existingTables,
        },
      );

      const ruleConfidence = computeConfidence(features);
      let finalConfidence = ruleConfidence;
      let domain: string | null = null;
      let layerType: string | null = null;
      let summary = "";

      // Determine domain from top similar table
      if (features.similarTables[0] && features.similarTables[0].score > 0) {
        const topSimilar = features.similarTables[0];
        const existing = ctx.existingTables.find(
          e => e.schemaId === topSimilar.schemaId && e.tableName === topSimilar.tableName,
        );
        if (existing) {
          domain = existing.domain ?? null;
          layerType = existing.layerType ?? null;
        }
        summary = `Based on similarity to ${topSimilar.tableName} (score=${topSimilar.score.toFixed(2)})`;
      }

      // Use LLM for ambiguous cases
      if (hasLLM && ruleConfidence < RULE_CONFIDENCE_THRESHOLD) {
        try {
          const llmResult = await callLLMForClassification(
            detail.tableName,
            detail.fields,
            features,
            ctx,
          );
          // Take the more conservative confidence
          finalConfidence = Math.min(ruleConfidence + 0.1, llmResult.confidence);
          domain = llmResult.domain ?? domain;
          layerType = llmResult.layerType ?? layerType;
          summary = llmResult.summary;
        } catch {
          // LLM failed — stick with rule-based
        }
      }

      const proposal: ClassificationProposal = {
        tableId: detail.tableId,
        schemaId: batch.schemaIds.find(() => true) ?? 0,
        tableName: detail.tableName,
        suggested: {
          domain: domain ?? undefined,
          layerType: layerType ?? undefined,
        },
        confidence: finalConfidence,
        rationale: {
          matchedConcepts: features.matchedConceptIds,
          matchedDictEntries: features.matchedDictIds,
          similarTables: features.similarTables,
          summary,
        },
        status: "pending",
      };

      total++;
      confidenceSum += finalConfidence;
      yield { type: "table-classified", proposal };
    } catch (err) {
      yield { type: "error", message: `Error classifying ${detail.tableName}: ${String(err)}` };
    }
  }

  yield { type: "done", total, avgConfidence: total > 0 ? confidenceSum / total : 0 };
}
