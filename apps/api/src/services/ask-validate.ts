/**
 * Ask Pipeline — Post-processing Validation
 *
 * Validates the LLM-produced AskResult against the unified graph:
 * 1. Check answerFields refs exist in graph → remove missing, confidence×0.6, add warnings
 * 2. Cross-check joinPath with graph join-path algorithm
 * 3. confidence < 0.4 → force abstain: true
 */

import { findJoinPath } from "@schema-studio/core";
import type { UnifiedGraph, JoinStep } from "@schema-studio/core";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AnswerField {
  ref: string;
  why: string;
  // T10.5 enrichment (optional — populated after graph lookup)
  sensitivity?: "public" | "internal" | "confidential" | "pii";
  ownerName?: string;
  refreshCycle?: string;
  dataPeriod?: string;
  deprecated?: boolean;
  deprecationNote?: string;
  replacedByRef?: string;
}

export interface AskResult {
  abstain: boolean;
  answerFields: AnswerField[];
  joinPath: JoinStep[];
  sql: string;
  explanation: string;
  confidence: number;
  missing: string[];
  reason?: string; // for abstain with reason (e.g. LLM_NOT_CONFIGURED)
}

export interface ValidatedAskResult extends AskResult {
  warnings: string[];
}

// ── Existence check (shared utility) ─────────────────────────────────────────

/**
 * Check if a ref exists in the unified graph.
 * Returns true if found.
 */
export function refExistsInGraph(ref: string, graph: UnifiedGraph): boolean {
  return graph.nodes.some(n => n.ref === ref);
}

/**
 * Check that all field refs in a list exist in the graph.
 * Returns { valid: string[], missing: string[] }
 */
export function checkRefsExist(
  refs: string[],
  graph: UnifiedGraph,
): { valid: string[]; missing: string[] } {
  const valid: string[] = [];
  const missing: string[] = [];
  for (const ref of refs) {
    if (refExistsInGraph(ref, graph)) {
      valid.push(ref);
    } else {
      missing.push(ref);
    }
  }
  return { valid, missing };
}

// ── Join path validation ──────────────────────────────────────────────────────

/**
 * Extract table-level ref from a field/gwc ref or return as-is if already
 * a table/gwt ref.
 */
function toTableRef(ref: string): string | null {
  if (ref.startsWith("tbl:") || ref.startsWith("gwt:")) return ref;
  if (ref.startsWith("fld:")) {
    // "fld:schemaSlug.tableName.fieldName" → "tbl:schemaSlug.tableName"
    const withoutPrefix = ref.slice(4);
    const lastDot = withoutPrefix.lastIndexOf(".");
    if (lastDot === -1) return null;
    return `tbl:${withoutPrefix.slice(0, lastDot)}`;
  }
  if (ref.startsWith("gwc:")) {
    // "gwc:slug.colName" → "gwt:slug"
    const withoutPrefix = ref.slice(4);
    const dot = withoutPrefix.indexOf(".");
    if (dot === -1) return `gwt:${withoutPrefix}`;
    return `gwt:${withoutPrefix.slice(0, dot)}`;
  }
  return null;
}

// ── Main validator ────────────────────────────────────────────────────────────

export function validateAskResult(
  result: AskResult,
  graph: UnifiedGraph,
): ValidatedAskResult {
  const warnings: string[] = [];
  let { abstain, answerFields, joinPath, sql, explanation, confidence, missing } = result;

  // ── 1. answerFields existence check ────────────────────────────────────────
  const fieldRefs = answerFields.map(f => f.ref);
  const { valid: validRefs, missing: phantomRefs } = checkRefsExist(fieldRefs, graph);

  if (phantomRefs.length > 0) {
    // Remove phantom fields
    answerFields = answerFields.filter(f => validRefs.includes(f.ref));
    confidence = confidence * 0.6;
    for (const ref of phantomRefs) {
      warnings.push(`Field ref not found in graph: ${ref} — removed from answer`);
    }
  }

  // ── 2. joinPath cross-check ────────────────────────────────────────────────
  if (joinPath.length > 0 && !abstain) {
    const correctedSteps: JoinStep[] = [];
    let joinPathCorrected = false;

    for (let i = 0; i < joinPath.length; i++) {
      const step = joinPath[i]!;
      const fromTbl = toTableRef(step.from);
      const toTbl = toTableRef(step.to);

      if (!fromTbl || !toTbl) {
        warnings.push(`Cannot resolve table refs in join step: ${step.from} → ${step.to}`);
        correctedSteps.push(step);
        continue;
      }

      // Verify that this edge exists in the graph
      const edgeExists = graph.edges.some(e => {
        if (e.kind !== "fk" && e.kind !== "joins_on" && e.kind !== "composed_from") return false;
        // Check bidirectionally
        const fromMatch =
          (e.from === fromTbl || toTableRef(e.from) === fromTbl) &&
          (e.to === toTbl || toTableRef(e.to) === toTbl);
        const toMatch =
          (e.from === toTbl || toTableRef(e.from) === toTbl) &&
          (e.to === fromTbl || toTableRef(e.to) === fromTbl);
        return fromMatch || toMatch;
      });

      if (!edgeExists) {
        // Try to find an alternative path via the graph algorithm
        const graphPath = findJoinPath(graph, fromTbl, toTbl, 4);
        if (graphPath && graphPath.steps.length > 0) {
          for (const graphStep of graphPath.steps) {
            correctedSteps.push(graphStep);
          }
          warnings.push(
            `Join step ${fromTbl} → ${toTbl} not directly in graph; replaced with computed path`,
          );
          joinPathCorrected = true;
        } else {
          warnings.push(
            `Join step ${fromTbl} → ${toTbl} has no path in graph; step retained but may be incorrect`,
          );
          correctedSteps.push(step);
        }
      } else {
        correctedSteps.push(step);
      }
    }

    if (joinPathCorrected) {
      joinPath = correctedSteps;
    }
  }

  // ── 3. confidence < 0.4 → force abstain ────────────────────────────────────
  if (confidence < 0.4 && !abstain) {
    abstain = true;
    warnings.push(`Confidence ${confidence.toFixed(2)} < 0.4 threshold — forced abstain`);
    missing.push("低信心度，無法確認正確答案");
  }

  return {
    abstain,
    answerFields,
    joinPath,
    sql,
    explanation,
    confidence,
    missing,
    reason: result.reason,
    warnings,
  };
}
