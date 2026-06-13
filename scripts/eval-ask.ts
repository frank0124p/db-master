#!/usr/bin/env node
/**
 * Ask Pipeline Evaluation Script
 *
 * Mode A (link-only, no LLM — default, CI-safe):
 *   npx tsx scripts/eval-ask.ts
 *   → Calls POST /api/v1/ask/link-only for each question
 *   → Computes recall@10, recall@30, MRR per question and in aggregate
 *   → Exits 1 if recall@30 < _config.recall30Threshold
 *
 * Mode B (full, requires LLM):
 *   npx tsx scripts/eval-ask.ts --full
 *   → Calls POST /api/v1/ask (SSE) for each question
 *   → Compares answerFields with expect.fields
 *   → Checks abstain traps (shouldAbstain questions)
 *
 * Options:
 *   --api-base=URL    API base URL (default: http://localhost:3005)
 *   --out=PATH        Report output path (default: data/eval/reports/{date}.md)
 *   --full            Run mode B (full LLM pipeline)
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const QUESTIONS_FILE = path.join(ROOT, "data/eval/questions.json");
const REPORTS_DIR = path.join(ROOT, "data/eval/reports");

// ── Argument parsing ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const isFull = args.includes("--full");
const apiBaseArg = args.find(a => a.startsWith("--api-base="));
const outArg = args.find(a => a.startsWith("--out="));
const API_BASE = apiBaseArg
  ? apiBaseArg.slice("--api-base=".length)
  : (process.env["API_BASE"] ?? "http://localhost:3005");
const dateStr = new Date().toISOString().slice(0, 10);
const REPORT_PATH = outArg
  ? outArg.slice("--out=".length)
  : path.join(REPORTS_DIR, `${dateStr}.md`);

// ── Types ─────────────────────────────────────────────────────────────────────

interface QuestionExpect {
  fields: string[];
  anyOfTables: string[];
  joinPathContains: string[];
  shouldAbstain?: boolean;
  absentConcept?: string;
  tableOrGwtHit?: string;
}

interface Question {
  id: string;
  question: string;
  expect: QuestionExpect;
  tags: string[];
}

interface QuestionsFile {
  _config: {
    recall30Threshold: number;
    description?: string;
  };
  questions: Question[];
}

interface LinkOnlyResult {
  hits: Array<{ ref: string; score: number; reasons: string[] }>;
  matchedConcepts: string[];
  matchedValues: Array<{ token: string; ref: string }>;
  subgraph: {
    nodeCount: number;
    edgeCount: number;
    serialized: string;
  };
}

interface AskSSEResult {
  abstain: boolean;
  answerFields: Array<{ ref: string; why: string }>;
  joinPath: unknown[];
  sql: string;
  explanation: string;
  confidence: number;
  missing: string[];
  warnings: string[];
  reason?: string;
}

// ── API calls ─────────────────────────────────────────────────────────────────

async function callLinkOnly(question: string): Promise<LinkOnlyResult> {
  const res = await fetch(`${API_BASE}/api/v1/ask/link-only`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) {
    throw new Error(`link-only HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<LinkOnlyResult>;
}

async function callAskFull(question: string): Promise<AskSSEResult | null> {
  const res = await fetch(`${API_BASE}/api/v1/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) {
    throw new Error(`ask HTTP ${res.status}: ${await res.text()}`);
  }

  // Parse SSE stream
  const text = await res.text();
  const lines = text.split("\n");
  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;
    const data = JSON.parse(line.slice(6)) as { type: string; result?: AskSSEResult };
    if (data.type === "result" && data.result) {
      return data.result;
    }
  }
  return null;
}

// ── Metrics ───────────────────────────────────────────────────────────────────

/**
 * Compute recall@K: fraction of expected fields found in hits[:K]
 */
function recallAtK(
  hits: Array<{ ref: string }>,
  expectedFields: string[],
  k: number,
): number {
  if (expectedFields.length === 0) return 1.0; // no expected = vacuously true
  const hitRefs = new Set(hits.slice(0, k).map(h => h.ref));
  const found = expectedFields.filter(f => hitRefs.has(f)).length;
  return found / expectedFields.length;
}

/**
 * Compute MRR (Mean Reciprocal Rank): 1 / rank of first expected field in hits
 */
function mrr(
  hits: Array<{ ref: string }>,
  expectedFields: string[],
): number {
  if (expectedFields.length === 0) return 1.0;
  const expectedSet = new Set(expectedFields);
  for (let i = 0; i < hits.length; i++) {
    if (expectedSet.has(hits[i]!.ref)) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

/**
 * Check if anyOfTables are present: at least one table node ref from expect.anyOfTables
 * appears in hits
 */
function anyOfTablesHit(
  hits: Array<{ ref: string }>,
  anyOfTables: string[],
): boolean {
  if (anyOfTables.length === 0) return true;
  const hitRefs = new Set(hits.map(h => h.ref));
  return anyOfTables.some(t => hitRefs.has(t));
}

// ── Mode A: Link-only evaluation ──────────────────────────���───────────────────

interface QuestionResult {
  id: string;
  question: string;
  recall10: number;
  recall30: number;
  mrr: number;
  anyOfTablesHit: boolean;
  hitCount: number;
  tags: string[];
  error?: string;
}

async function runModeA(questions: Question[]): Promise<QuestionResult[]> {
  const results: QuestionResult[] = [];

  for (const q of questions) {
    // Skip abstain traps in mode A (they have no expected fields to recall)
    if (q.expect.shouldAbstain) {
      results.push({
        id: q.id,
        question: q.question,
        recall10: 1.0, // skip, considered pass
        recall30: 1.0,
        mrr: 1.0,
        anyOfTablesHit: true,
        hitCount: 0,
        tags: q.tags,
        error: "ABSTAIN_TRAP_SKIPPED",
      });
      continue;
    }

    try {
      const linkResult = await callLinkOnly(q.question);
      const { hits } = linkResult;

      // Also check tableOrGwtHit if specified
      const tableGwtHitOk = q.expect.tableOrGwtHit
        ? hits.some(h => h.ref === q.expect.tableOrGwtHit)
        : true;

      const r10 = recallAtK(hits, q.expect.fields, 10);
      const r30 = recallAtK(hits, q.expect.fields, 30);
      const mrrVal = mrr(hits, q.expect.fields);
      const aotHit = anyOfTablesHit(hits, q.expect.anyOfTables) && tableGwtHitOk;

      results.push({
        id: q.id,
        question: q.question,
        recall10: r10,
        recall30: r30,
        mrr: mrrVal,
        anyOfTablesHit: aotHit,
        hitCount: hits.length,
        tags: q.tags,
      });
    } catch (err) {
      results.push({
        id: q.id,
        question: q.question,
        recall10: 0,
        recall30: 0,
        mrr: 0,
        anyOfTablesHit: false,
        hitCount: 0,
        tags: q.tags,
        error: String(err),
      });
    }
  }

  return results;
}

// ── Mode B: Full pipeline evaluation ─────────────────────────────────────────

interface FullQuestionResult extends QuestionResult {
  abstainCorrect?: boolean;
  fieldHitRate?: number;
  confidence?: number;
  warnings?: string[];
}

async function runModeB(questions: Question[]): Promise<FullQuestionResult[]> {
  const results: FullQuestionResult[] = [];

  for (const q of questions) {
    try {
      const result = await callAskFull(q.question);
      if (!result) {
        results.push({
          id: q.id,
          question: q.question,
          recall10: 0,
          recall30: 0,
          mrr: 0,
          anyOfTablesHit: false,
          hitCount: 0,
          tags: q.tags,
          error: "NO_RESULT",
        });
        continue;
      }

      if (q.expect.shouldAbstain) {
        // Check abstain trap: result.abstain should be true
        const abstainCorrect = result.abstain === true;
        results.push({
          id: q.id,
          question: q.question,
          recall10: abstainCorrect ? 1 : 0,
          recall30: abstainCorrect ? 1 : 0,
          mrr: abstainCorrect ? 1 : 0,
          anyOfTablesHit: true,
          hitCount: 0,
          tags: q.tags,
          abstainCorrect,
          confidence: result.confidence,
          warnings: result.warnings,
        });
        continue;
      }

      // Non-abstain question
      const answerRefs = result.answerFields.map((f) => f.ref);
      const fieldHitRate =
        q.expect.fields.length > 0
          ? q.expect.fields.filter((f) => answerRefs.includes(f)).length /
            q.expect.fields.length
          : 1.0;

      // For link-only metrics, run link-only too
      let r10 = 0;
      let r30 = 0;
      let mrrVal = 0;
      let aotHit = false;
      let hitCount = 0;

      try {
        const linkResult = await callLinkOnly(q.question);
        const { hits } = linkResult;
        r10 = recallAtK(hits, q.expect.fields, 10);
        r30 = recallAtK(hits, q.expect.fields, 30);
        mrrVal = mrr(hits, q.expect.fields);
        aotHit = anyOfTablesHit(hits, q.expect.anyOfTables);
        hitCount = hits.length;
      } catch { /* continue without link metrics */ }

      results.push({
        id: q.id,
        question: q.question,
        recall10: r10,
        recall30: r30,
        mrr: mrrVal,
        anyOfTablesHit: aotHit,
        hitCount,
        tags: q.tags,
        fieldHitRate,
        confidence: result.confidence,
        warnings: result.warnings,
      });
    } catch (err) {
      results.push({
        id: q.id,
        question: q.question,
        recall10: 0,
        recall30: 0,
        mrr: 0,
        anyOfTablesHit: false,
        hitCount: 0,
        tags: q.tags,
        error: String(err),
      });
    }
  }

  return results;
}

// ── Report generation ─────────────────────────────────────────────────────────

function generateReport(
  results: QuestionResult[],
  threshold: number,
  mode: "A" | "B",
): string {
  const nonAbstainResults = results.filter(r => r.error !== "ABSTAIN_TRAP_SKIPPED");
  const abstainResults = results.filter(r => r.tags.includes("abstain-trap"));

  const avgR10 = nonAbstainResults.reduce((s, r) => s + r.recall10, 0) / (nonAbstainResults.length || 1);
  const avgR30 = nonAbstainResults.reduce((s, r) => s + r.recall30, 0) / (nonAbstainResults.length || 1);
  const avgMrr = nonAbstainResults.reduce((s, r) => s + r.mrr, 0) / (nonAbstainResults.length || 1);

  const lines: string[] = [];
  lines.push(`# Ask Pipeline Evaluation Report`);
  lines.push(`**Date**: ${new Date().toISOString().slice(0, 19).replace("T", " ")}`);
  lines.push(`**Mode**: ${mode === "A" ? "A (link-only, no LLM)" : "B (full pipeline)"}`);
  lines.push(`**Threshold**: recall@30 ≥ ${threshold}`);
  lines.push("");

  lines.push("## Aggregate Metrics");
  lines.push(`| Metric | Value | Pass? |`);
  lines.push(`|---|---|---|`);
  lines.push(`| recall@10 | ${(avgR10 * 100).toFixed(1)}% | ${avgR10 >= threshold ? "✓" : "✗"} |`);
  lines.push(`| recall@30 | ${(avgR30 * 100).toFixed(1)}% | ${avgR30 >= threshold ? "✓" : "✗"} |`);
  lines.push(`| MRR | ${avgMrr.toFixed(3)} | — |`);
  lines.push(`| Questions evaluated | ${nonAbstainResults.length} | — |`);
  lines.push("");

  if (mode === "B") {
    const fullResults = results as FullQuestionResult[];
    const abstainTraps = fullResults.filter(r => r.tags.includes("abstain-trap"));
    const abstainCorrectCount = abstainTraps.filter(r => r.abstainCorrect === true).length;
    lines.push(`| Abstain trap accuracy | ${abstainTraps.length > 0 ? Math.round(abstainCorrectCount / abstainTraps.length * 100) : "N/A"}% | — |`);
    lines.push("");
  }

  lines.push("## Per-Question Results");
  lines.push(`| ID | Question | recall@10 | recall@30 | MRR | AnyOfTables | Error |`);
  lines.push(`|---|---|---|---|---|---|---|`);

  for (const r of results) {
    const qShort = r.question.length > 30 ? r.question.slice(0, 27) + "..." : r.question;
    const abstainTrap = r.tags.includes("abstain-trap");

    if (abstainTrap && mode === "A") {
      lines.push(`| ${r.id} | ${qShort} | (trap) | (trap) | (trap) | (trap) | — |`);
    } else if (abstainTrap && mode === "B") {
      const fr = r as FullQuestionResult;
      const ok = fr.abstainCorrect ? "✓ abstained" : "✗ did not abstain";
      lines.push(`| ${r.id} | ${qShort} | ${ok} | — | — | — | — |`);
    } else {
      lines.push(
        `| ${r.id} | ${qShort} | ${(r.recall10 * 100).toFixed(0)}% | ${(r.recall30 * 100).toFixed(0)}% | ${r.mrr.toFixed(2)} | ${r.anyOfTablesHit ? "✓" : "✗"} | ${r.error ?? "—"} |`,
      );
    }
  }
  lines.push("");

  // CI pass/fail summary
  const passed = avgR30 >= threshold;
  lines.push(`## CI Result: ${passed ? "PASS" : "FAIL"}`);
  lines.push(
    passed
      ? `recall@30 = ${(avgR30 * 100).toFixed(1)}% ≥ threshold ${(threshold * 100).toFixed(0)}%`
      : `recall@30 = ${(avgR30 * 100).toFixed(1)}% < threshold ${(threshold * 100).toFixed(0)}%`,
  );

  return lines.join("\n");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`[eval-ask] Loading questions from ${QUESTIONS_FILE}`);
  const raw = await fs.readFile(QUESTIONS_FILE, "utf-8");
  const qFile = JSON.parse(raw) as QuestionsFile;
  const threshold = qFile._config.recall30Threshold;
  const questions = qFile.questions;

  console.log(`[eval-ask] ${questions.length} questions, threshold ${threshold}`);
  console.log(`[eval-ask] Mode: ${isFull ? "B (full)" : "A (link-only)"}`);
  console.log(`[eval-ask] API: ${API_BASE}`);

  let results: QuestionResult[];
  if (isFull) {
    results = await runModeB(questions);
  } else {
    results = await runModeA(questions);
  }

  const report = generateReport(results, threshold, isFull ? "B" : "A");

  // Write report
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, report, "utf-8");
  console.log(`[eval-ask] Report written to ${REPORT_PATH}`);

  // Print summary
  const nonAbstain = results.filter(r => r.error !== "ABSTAIN_TRAP_SKIPPED");
  const avgR30 = nonAbstain.reduce((s, r) => s + r.recall30, 0) / (nonAbstain.length || 1);
  const avgR10 = nonAbstain.reduce((s, r) => s + r.recall10, 0) / (nonAbstain.length || 1);
  const avgMrr = nonAbstain.reduce((s, r) => s + r.mrr, 0) / (nonAbstain.length || 1);

  console.log(`\n[eval-ask] Results:`);
  console.log(`  recall@10 = ${(avgR10 * 100).toFixed(1)}%`);
  console.log(`  recall@30 = ${(avgR30 * 100).toFixed(1)}%`);
  console.log(`  MRR       = ${avgMrr.toFixed(3)}`);

  if (avgR30 < threshold) {
    console.error(`[eval-ask] FAIL: recall@30 ${(avgR30 * 100).toFixed(1)}% < threshold ${(threshold * 100).toFixed(0)}%`);
    process.exit(1);
  } else {
    console.log(`[eval-ask] PASS: recall@30 ${(avgR30 * 100).toFixed(1)}% >= threshold ${(threshold * 100).toFixed(0)}%`);
  }
}

main().catch(err => {
  console.error("[eval-ask] Fatal error:", err);
  process.exit(1);
});
