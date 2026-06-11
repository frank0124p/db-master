import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import type { ConceptCard, BusinessRule, SourceDoc } from "@schema-studio/core";
import * as repo from "../repositories/knowledge.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = path.resolve(__dirname, "../../../../prompts");

interface ExtractCtx {
  existingConcepts: ConceptCard[];
  dictStdNames?: string[];
}

interface RawExtractedConcept {
  name: string;
  std_name: string;
  definition: string;
  aliases?: string[];
  table_hints?: Array<{ table_name: string; role: "ssot" | "replica" | "reference" }>;
  source_refs?: Array<{ chunk_idx: number }>;
}

interface RawExtractedRule {
  title: string;
  rule_type: "ssot" | "constraint" | "relationship" | "process";
  statement: string;
  machine?: {
    kind: "ssot_declaration";
    concept_std_name: string;
    ssot_table_name: string;
  } | {
    kind: "field_constraint";
    field_pattern: string;
    requirement: string;
  };
  source_refs?: Array<{ chunk_idx: number }>;
}

interface ExtractedBatch {
  concepts: RawExtractedConcept[];
  business_rules: RawExtractedRule[];
}

async function callLLM(prompt: string): Promise<string> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const apiKey = process.env["LLM_API_KEY"] ?? process.env["ANTHROPIC_API_KEY"] ?? "";
  if (!apiKey) throw new Error("No LLM API key configured");

  const client = new Anthropic({ apiKey });
  const resp = await client.messages.create({
    model: process.env["LLM_MODEL"] ?? "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const content = resp.content[0];
  return content?.type === "text" ? content.text : "";
}

function slugify(stdName: string): string {
  return stdName.replace(/_/g, "-");
}

/** Dedup merge: if stdName collision, merge aliases and sourceRefs */
function mergeOrAdd(
  acc: RawExtractedConcept[],
  incoming: RawExtractedConcept,
): RawExtractedConcept[] {
  const existing = acc.find(c => c.std_name === incoming.std_name);
  if (existing) {
    const newAliases = incoming.aliases ?? [];
    existing.aliases = [
      ...new Set([...(existing.aliases ?? []), ...newAliases]),
    ];
    existing.source_refs = [
      ...(existing.source_refs ?? []),
      ...(incoming.source_refs ?? []),
    ];
    return acc;
  }
  return [...acc, incoming];
}

export async function* extractKnowledge(
  doc: SourceDoc,
  ctx: ExtractCtx,
): AsyncGenerator<
  | { type: "chunk-progress"; done: number; total: number }
  | { type: "concept-draft"; concept: ConceptCard }
  | { type: "rule-draft"; rule: BusinessRule }
  | { type: "error"; message: string }
> {
  const template = await fs.readFile(
    path.join(PROMPTS_DIR, "extract-knowledge.md"),
    "utf-8",
  );

  const existingStdNames = ctx.existingConcepts.map(c => c.stdName).join(", ");
  const dictStdNames = (ctx.dictStdNames ?? []).join(", ");

  const allConceptDrafts: RawExtractedConcept[] = [];
  const allRuleDrafts: RawExtractedRule[] = [];

  // Sliding window: 3 chunks at a time to preserve context
  const chunks = doc.chunks;
  const WINDOW = 3;
  let done = 0;

  for (let i = 0; i < chunks.length; i += WINDOW) {
    const window = chunks.slice(i, i + WINDOW);
    const windowText = window.map(c => c.text).join("\n\n---\n\n");
    const chunkIdxBase = window[0]?.idx ?? i;

    const userPrompt = `${template}

---

## Chunk(s) to process (idx ${chunkIdxBase}–${(window[window.length - 1]?.idx ?? i + WINDOW - 1)}):

\`\`\`
${windowText}
\`\`\`

## Context
- existing_concepts (avoid creating duplicates): [${existingStdNames}]
- dict_std_names (prefer these for std_name): [${dictStdNames}]
- chunk_idx for source_refs: ${chunkIdxBase}

Respond with ONLY the JSON object. No markdown fences, no explanation.`;

    try {
      const raw = await callLLM(userPrompt);
      // Extract JSON from potential markdown fences
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        done += window.length;
        yield { type: "chunk-progress", done, total: chunks.length };
        continue;
      }

      const batch = JSON.parse(jsonMatch[0]) as ExtractedBatch;

      // Process concepts
      for (const rawConcept of batch.concepts ?? []) {
        if (!rawConcept.std_name || !rawConcept.definition) continue;
        // Check if already in existing approved concepts
        const alreadyExists = ctx.existingConcepts.some(
          c => c.stdName === rawConcept.std_name,
        );
        const slug = slugify(rawConcept.std_name);

        // Dedup across this extraction run
        const merged = mergeOrAdd(allConceptDrafts, rawConcept);
        if (merged !== allConceptDrafts) allConceptDrafts.push(rawConcept);

        if (!alreadyExists) {
          const now = new Date().toISOString();
          const card = await repo.createConcept({
            slug,
            name: rawConcept.name,
            stdName: rawConcept.std_name,
            definition: rawConcept.definition,
            aliases: rawConcept.aliases ?? [],
            tableHints: (rawConcept.table_hints ?? []).map(h => ({
              schemaId: undefined,
              tableName: h.table_name,
              role: h.role,
            })),
            namingDictIds: [],
            relatedConcepts: [],
            sourceRefs: (rawConcept.source_refs ?? []).map(r => ({
              docId: doc.id,
              chunkIdx: r.chunk_idx,
            })),
            status: "pending" as const,
            reviewers: [],
          });
          yield { type: "concept-draft", concept: card };
        }
      }

      // Process business rules
      for (const rawRule of batch.business_rules ?? []) {
        if (!rawRule.title || !rawRule.statement) continue;
        allRuleDrafts.push(rawRule);

        let machine: BusinessRule["machine"];
        if (rawRule.machine?.kind === "ssot_declaration") {
          const ssotM = rawRule.machine as { kind: "ssot_declaration"; concept_std_name: string; ssot_table_name: string };
          // Try to find the concept to get its schemaId
          const concept = ctx.existingConcepts.find(
            c => c.stdName === ssotM.concept_std_name,
          );
          machine = {
            kind: "ssot_declaration",
            conceptId: concept?.id ?? 0,
            ssotTable: { schemaId: 0, tableName: ssotM.ssot_table_name },
          };
        } else if (rawRule.machine?.kind === "field_constraint") {
          const fcM = rawRule.machine as { kind: "field_constraint"; field_pattern: string; requirement: string };
          machine = {
            kind: "field_constraint",
            fieldPattern: fcM.field_pattern,
            requirement: fcM.requirement,
          };
        }

        const ruleslug = `rule-${Date.now()}-${rawRule.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .slice(0, 40)}`;

        const rule = await repo.createBusinessRule({
          slug: ruleslug,
          title: rawRule.title,
          ruleType: rawRule.rule_type,
          statement: rawRule.statement,
          machine,
          sourceRefs: (rawRule.source_refs ?? []).map(r => ({
            docId: doc.id,
            chunkIdx: r.chunk_idx,
          })),
          status: "pending",
          reviewers: [],
        });
        yield { type: "rule-draft", rule };
      }
    } catch (err) {
      yield { type: "error", message: String(err) };
    }

    done += window.length;
    yield { type: "chunk-progress", done, total: chunks.length };
  }
}
