/**
 * Ask Pipeline — Linking Engine
 *
 * Pure deterministic function: no I/O, no LLM.
 *
 * Algorithm:
 * 1. Normalise query
 * 2. Extract tokens (split by whitespace/punctuation), generate 2-grams + 3-grams
 * 3. For each gram: contains-match against synonym keys (both directions)
 * 4. Score each graph node (field/table/governed/concept)
 * 5. Concept-hit propagation: +SCORE_CONCEPT_HIT to all nodes on maps_to_concept edges
 * 6. Apply layer multipliers (gwc×1.3, gwt×1.2, deprecated×0.3)
 * 7. Sort desc, return top topN (default 30)
 * 8. Value-based linking for quoted / ALL-CAPS / alphanumeric tokens
 */

import type { UnifiedGraph, GraphNode } from "../graph/types.js";
import type { CompiledSynonyms } from "./synonyms.js";
import {
  normalizeQuery,
  restorePlural,
} from "./normalize.js";
import {
  SCORE_EXACT,
  SCORE_PREFIX,
  SCORE_GRAM,
  SCORE_DEFINITION,
  SCORE_VALUE,
  SCORE_CONCEPT_HIT,
  MULT_GWC,
  MULT_GWT,
  MULT_DEPRECATED,
} from "./scoring.js";

// ── Public types ──────────────────────────────────────────────────────────────

export interface LinkingHit {
  ref: string;
  score: number;
  reasons: string[];
}

export interface LinkingResult {
  /** Sorted top-N hits, descending by score. */
  hits: LinkingHit[];
  /** Matched concept stdNames. */
  matchedConcepts: string[];
  /** Value-based hits: which token matched which node. */
  matchedValues: Array<{ token: string; ref: string }>;
}

// ── Tokenisation helpers ──────────────────────────────────────────────────────

/**
 * Extract "segments" from a query by splitting on whitespace and ASCII
 * punctuation, preserving CJK runs as single segments.
 */
function extractSegments(normalised: string): string[] {
  return normalised
    .split(/[\s\p{P}]+/u)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * Generate n-grams (by character) from a string.
 * E.g. ngrams("設備保養", 2) → ["設備", "備保", "保養"]
 */
function ngrams(s: string, n: number): string[] {
  if (s.length < n) return [];
  const result: string[] = [];
  for (let i = 0; i <= s.length - n; i++) {
    result.push(s.slice(i, i + n));
  }
  return result;
}

/**
 * Collect all grams to try: the segment itself plus all 2-grams and 3-grams.
 * For English segments (ASCII), also add plural-restored variant.
 */
function allGramsForSegment(seg: string): string[] {
  const grams = new Set<string>();
  grams.add(seg);

  // Plural restoration (only for ASCII tokens)
  if (/^[a-z_]+$/.test(seg)) {
    const depluralised = restorePlural(seg);
    if (depluralised !== seg) grams.add(depluralised);
  }

  // Character n-grams (useful for CJK)
  if (seg.length >= 2) {
    for (const g of ngrams(seg, 2)) grams.add(g);
  }
  if (seg.length >= 3) {
    for (const g of ngrams(seg, 3)) grams.add(g);
  }

  return Array.from(grams);
}

// ── Value token detection ─────────────────────────────────────────────────────

const QUOTED_RE = /"([^"]+)"|'([^']+)'/g;
const ALLCAPS_RE = /\b[A-Z]{2,}\b/g;
const ALPHANUM_RE = /\b[A-Za-z0-9]{2,}[0-9][A-Za-z0-9]*\b/g; // has digit component

/**
 * Extract candidate "value tokens" from the raw (un-normalised) query.
 */
function extractValueTokens(rawQuery: string): string[] {
  const tokens = new Set<string>();

  let m: RegExpExecArray | null;

  // Quoted strings
  const qRe = new RegExp(QUOTED_RE.source, "g");
  while ((m = qRe.exec(rawQuery)) !== null) {
    const v = m[1] ?? m[2];
    if (v) tokens.add(v.trim());
  }

  // ALL-CAPS tokens
  const acRe = new RegExp(ALLCAPS_RE.source, "g");
  while ((m = acRe.exec(rawQuery)) !== null) {
    tokens.add(m[0]);
  }

  // Alphanumeric-with-digit tokens (e.g. LOT001, EQP002)
  const anRe = new RegExp(ALPHANUM_RE.source, "g");
  while ((m = anRe.exec(rawQuery)) !== null) {
    tokens.add(m[0]);
  }

  return Array.from(tokens);
}

// ── Synonym matching ──────────────────────────────────────────────────────────

interface SynonymHit {
  gram: string;
  key: string;
  stdName: string;
  weight: number;
  conceptId: number | undefined;
  /** length(hitString) / length(key) — longer match is stronger */
  lengthWeight: number;
}

/**
 * Given a gram and the compiled synonym map, find all matching stdNames.
 * Uses contains-match in both directions:
 *   - gram ⊆ key  (gram is substring of key)
 *   - key ⊆ gram  (key is substring of gram)
 */
function matchGramInSynonyms(
  gram: string,
  synonyms: CompiledSynonyms,
): SynonymHit[] {
  const hits: SynonymHit[] = [];
  for (const [key, targets] of synonyms.entries) {
    let hitLen = 0;
    if (key === gram) {
      hitLen = gram.length;
    } else if (key.includes(gram)) {
      hitLen = gram.length;
    } else if (gram.includes(key)) {
      hitLen = key.length;
    }
    if (hitLen === 0) continue;

    const denominator = Math.max(gram.length, key.length);
    const lengthWeight = hitLen / denominator;

    for (const target of targets) {
      hits.push({
        gram,
        key,
        stdName: target.stdName,
        weight: target.weight,
        conceptId: target.conceptId,
        lengthWeight,
      });
    }
  }
  return hits;
}

// ── Node label normalisation ──────────────────────────────────────────────────

/**
 * Return the "label" tokens for a node that should participate in scoring.
 * For field nodes, the last segment of the ref is the field name.
 */
function nodeTokens(node: GraphNode): string[] {
  const tokens: string[] = [];
  const label = normalizeQuery(node.label);
  if (label) tokens.push(label);

  // For fld/gwc nodes, also include the bare field name
  const refParts = node.ref.split(".");
  const lastName = refParts.at(-1);
  if (lastName) {
    const normed = normalizeQuery(lastName);
    if (normed && normed !== label) tokens.push(normed);
  }

  return tokens;
}

// ── Main linking function ─────────────────────────────────────────────────────

/**
 * Link a natural-language query to graph nodes.
 *
 * @param query     Raw NL query (zh-TW or EN)
 * @param graph     Unified semantic graph
 * @param synonyms  Pre-compiled synonym table
 * @param topN      Return at most this many hits (default 30)
 */
export function linkQuery(
  query: string,
  graph: UnifiedGraph,
  synonyms: CompiledSynonyms,
  topN = 30,
): LinkingResult {
  const rawQuery = query;
  const normQuery = normalizeQuery(query);

  // ── 1. Extract segments and grams ───────────────────────────────────────
  const segments = extractSegments(normQuery);
  const allGrams = new Set<string>();
  for (const seg of segments) {
    for (const g of allGramsForSegment(seg)) {
      allGrams.add(g);
    }
  }

  // ── 2. Synonym matching: gram → stdNames ─────────────────────────────────
  // Aggregate: stdName → best syn hit info (used for reason construction)
  const synHitsByStdName = new Map<string, { weight: number; gram: string; conceptId: number | undefined }>();
  const matchedConceptIds = new Set<number>();

  for (const gram of allGrams) {
    const hits = matchGramInSynonyms(gram, synonyms);
    for (const hit of hits) {
      const effective = hit.weight * hit.lengthWeight;
      const prev = synHitsByStdName.get(hit.stdName);
      if (!prev || effective > prev.weight) {
        synHitsByStdName.set(hit.stdName, {
          weight: effective,
          gram: hit.gram,
          conceptId: hit.conceptId ?? undefined,
        });
      }
      if (hit.conceptId !== undefined) matchedConceptIds.add(hit.conceptId);
    }
  }

  // ── 3. Score each node ────────────────────────────────────────────────────
  const scoreMap = new Map<string, number>();
  const reasonMap = new Map<string, string[]>();

  function addScore(ref: string, delta: number, reason: string): void {
    scoreMap.set(ref, (scoreMap.get(ref) ?? 0) + delta);
    const reasons = reasonMap.get(ref);
    if (reasons) {
      reasons.push(reason);
    } else {
      reasonMap.set(ref, [reason]);
    }
  }

  for (const node of graph.nodes) {
    const kind = node.kind;
    if (kind === "domain" || kind === "suite") continue; // skip infrastructure nodes

    const nodeLabels = nodeTokens(node);
    const nodeRef = node.ref;

    // --- Synonym hits (via stdName) ---
    for (const [stdName, synHit] of synHitsByStdName) {
      // Check if this node's label normalises to the stdName
      const matchLabel = nodeLabels.find(l => l === stdName || l.includes(stdName) || stdName.includes(l));
      if (matchLabel) {
        const hitLen = Math.min(matchLabel.length, stdName.length);
        const denom = Math.max(matchLabel.length, stdName.length);
        const lw = hitLen / denom;

        // Determine if exact or gram
        if (matchLabel === stdName) {
          addScore(nodeRef, SCORE_EXACT * synHit.weight, `exact:${stdName}`);
        } else if (matchLabel.startsWith(stdName) || stdName.startsWith(matchLabel)) {
          addScore(nodeRef, SCORE_PREFIX * synHit.weight, `prefix:${stdName}`);
        } else {
          addScore(nodeRef, SCORE_GRAM * lw * synHit.weight, `gram:${stdName}`);
        }
      }
    }

    // --- Direct label matching (without synonym expansion) ---
    for (const gram of allGrams) {
      for (const lbl of nodeLabels) {
        if (lbl === gram) {
          addScore(nodeRef, SCORE_EXACT, `direct-exact:${gram}`);
        } else if (lbl.startsWith(gram) || gram.startsWith(lbl)) {
          addScore(nodeRef, SCORE_PREFIX, `direct-prefix:${gram}`);
        } else if (lbl.includes(gram) || gram.includes(lbl)) {
          const hitLen = Math.min(lbl.length, gram.length);
          const denom = Math.max(lbl.length, gram.length);
          addScore(nodeRef, SCORE_GRAM * (hitLen / denom), `direct-gram:${gram}`);
        }
      }
    }

    // --- Definition/description text match ---
    const defText = normalizeQuery(
      (node.meta.definition ?? "") + " " + (node.meta.description ?? ""),
    );
    for (const gram of allGrams) {
      if (gram.length >= 2 && defText.includes(gram)) {
        addScore(nodeRef, SCORE_DEFINITION, `def:${gram}`);
        break; // one definition hit per node is enough
      }
    }
  }

  // ── 4. Value-based linking ────────────────────────────────────────────────
  const valueTokens = extractValueTokens(rawQuery);
  const matchedValues: Array<{ token: string; ref: string }> = [];

  if (valueTokens.length > 0) {
    for (const node of graph.nodes) {
      const sampleValues = node.meta.sampleValues;
      if (!Array.isArray(sampleValues) || sampleValues.length === 0) continue;

      for (const vToken of valueTokens) {
        const vLower = vToken.toLowerCase();
        const hit = sampleValues.some(sv => {
          const svStr = String(sv).toLowerCase();
          return svStr === vLower || svStr.includes(vLower);
        });
        if (hit) {
          addScore(node.ref, SCORE_VALUE, `value:${vToken}`);
          matchedValues.push({ token: vToken, ref: node.ref });
        }
      }
    }
  }

  // ── 5. Concept-hit propagation ────────────────────────────────────────────
  const matchedConcepts: string[] = [];

  if (matchedConceptIds.size > 0) {
    // Find concept nodes that were matched
    const conceptRefsByCptId = new Map<number, string[]>();
    for (const node of graph.nodes) {
      if (node.kind === "concept") {
        // concept node ref: "cpt:{stdName}"
        // We need to find which conceptId this maps to
        // We stored conceptId in synonyms; cross-reference via stdName
      }
    }

    // Walk maps_to_concept edges: find nodes that map to matched concepts
    for (const edge of graph.edges) {
      if (edge.kind !== "maps_to_concept") continue;
      // edge.to should be "cpt:..."
      const cptRef = edge.to;
      // Lookup whether any matched conceptId corresponds to this concept node
      // by checking concept node label or ref
      const cptNode = graph.nodes.find(n => n.ref === cptRef && n.kind === "concept");
      if (!cptNode) continue;

      // Check if this concept stdName was matched via synonyms
      let conceptMatched = false;
      for (const [stdName, synHit] of synHitsByStdName) {
        if (synHit.conceptId !== undefined) {
          // We check if cptNode's label or ref matches
          if (
            normalizeQuery(cptNode.label) === normalizeQuery(stdName) ||
            cptRef === `cpt:${stdName}` ||
            cptNode.label === stdName
          ) {
            conceptMatched = true;
            break;
          }
        }
      }

      if (conceptMatched) {
        addScore(edge.from, SCORE_CONCEPT_HIT, `concept-hit:${cptRef}`);
        if (!matchedConcepts.includes(cptNode.label)) {
          matchedConcepts.push(cptNode.label);
        }
      }
    }
  }

  // Also propagate from concept nodes that scored (via direct label match)
  for (const edge of graph.edges) {
    if (edge.kind !== "maps_to_concept") continue;
    const cptScore = scoreMap.get(edge.to) ?? 0;
    if (cptScore > 0) {
      addScore(edge.from, SCORE_CONCEPT_HIT, `concept-prop:${edge.to}`);
      const cptNode = graph.nodes.find(n => n.ref === edge.to);
      if (cptNode && !matchedConcepts.includes(cptNode.label)) {
        matchedConcepts.push(cptNode.label);
      }
    }
  }

  // ── 6. Apply layer multipliers ────────────────────────────────────────────
  for (const node of graph.nodes) {
    const score = scoreMap.get(node.ref);
    if (score === undefined || score === 0) continue;

    let mult = 1.0;
    if (node.kind === "governed-column") mult *= MULT_GWC;
    if (node.kind === "governed") mult *= MULT_GWT;
    if (node.meta.deprecated === true) mult *= MULT_DEPRECATED;

    if (mult !== 1.0) {
      scoreMap.set(node.ref, score * mult);
    }
  }

  // ── 7. Sort and return top-N hits ─────────────────────────────────────────
  const allHits: LinkingHit[] = [];
  for (const [ref, score] of scoreMap) {
    if (score <= 0) continue;
    allHits.push({
      ref,
      score,
      reasons: reasonMap.get(ref) ?? [],
    });
  }

  allHits.sort((a, b) => b.score - a.score);
  const hits = allHits.slice(0, topN);

  return { hits, matchedConcepts, matchedValues };
}
