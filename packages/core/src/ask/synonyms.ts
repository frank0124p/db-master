/**
 * Ask Pipeline — Synonyms Compilation
 *
 * Builds a compiled lookup table from:
 * - NamingEntry (dict): aliases + concept → stdName (weight 1.0 exact, 0.9 aliases)
 * - ConceptCard: name + aliases → stdName (weight 0.9)
 *
 * The resulting CompiledSynonyms.entries map is keyed by the alias/concept text
 * (normalised), and values are arrays of {stdName, weight, conceptId?} targets.
 * One query token can expand to multiple stdNames (multi-to-multi).
 */

import type { NamingEntry } from "../types.js";
import type { ConceptCard } from "../governance/types.js";
import { normalizeQuery } from "./normalize.js";

// ── Public types ──────────────────────────────────────────────────────────────

export interface SynonymTarget {
  stdName: string;
  weight: number;
  conceptId?: number;
}

export interface CompiledSynonyms {
  /** key: normalised alias/concept text; value: targets with weights */
  entries: Map<string, SynonymTarget[]>;
}

// ── Build helpers ─────────────────────────────────────────────────────────────

function addEntry(
  map: Map<string, SynonymTarget[]>,
  key: string,
  target: SynonymTarget,
): void {
  const normKey = normalizeQuery(key);
  if (!normKey) return;
  const existing = map.get(normKey);
  if (existing) {
    // Avoid duplicate stdName entries for the same key
    if (!existing.some(e => e.stdName === target.stdName)) {
      existing.push(target);
    }
  } else {
    map.set(normKey, [{ ...target }]);
  }
}

// ── Main compiler ─────────────────────────────────────────────────────────────

/**
 * Compile a synonym lookup table from dict entries and concept cards.
 *
 * @param dict  - Approved NamingEntry rows (aliases, concept → stdName)
 * @param concepts - Approved ConceptCard rows (name, aliases → stdName)
 */
export function compileSynonyms(
  dict: NamingEntry[],
  concepts: ConceptCard[],
): CompiledSynonyms {
  const entries = new Map<string, SynonymTarget[]>();

  // ── NamingEntry ──────────────────────────────────────────────────────────
  for (const entry of dict) {
    // stdName itself → exact (weight 1.0)
    addEntry(entries, entry.stdName, { stdName: entry.stdName, weight: 1.0 });

    // concept (Chinese label) → alias-level (weight 0.9)
    if (entry.concept) {
      addEntry(entries, entry.concept, { stdName: entry.stdName, weight: 0.9 });
    }

    // Each alias → weight 0.9
    for (const alias of entry.aliases) {
      addEntry(entries, alias, { stdName: entry.stdName, weight: 0.9 });
    }
  }

  // ── ConceptCard ──────────────────────────────────────────────────────────
  for (const concept of concepts) {
    const target: SynonymTarget = {
      stdName: concept.stdName,
      weight: 0.9,
      conceptId: concept.id,
    };

    // concept.name (Chinese) → weight 0.9
    addEntry(entries, concept.name, target);

    // concept.stdName → weight 1.0 (exact)
    addEntry(entries, concept.stdName, { ...target, weight: 1.0 });

    // aliases → weight 0.9
    for (const alias of concept.aliases) {
      addEntry(entries, alias, target);
    }
  }

  return { entries };
}
