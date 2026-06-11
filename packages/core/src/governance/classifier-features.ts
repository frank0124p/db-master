import { levenshtein } from "../naming/levenshtein.js";
import type { ConceptCard } from "./types.js";

export interface TableFeature {
  tableName: string;
  fields: string[];
}

export interface SimilarTable {
  schemaId: number;
  tableName: string;
  score: number;
  reason: string;
}

export interface ClassifierFeatures {
  conceptHitScore: number;
  dictCoverage: number;
  similarTableScore: number;
  similarTables: SimilarTable[];
  matchedConceptIds: number[];
  matchedDictIds: number[];
}

/** Jaccard similarity between two sets of strings */
function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a.map(s => s.toLowerCase()));
  const setB = new Set(b.map(s => s.toLowerCase()));
  const intersection = [...setA].filter(x => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

/** Normalize Levenshtein distance to a 0-1 similarity score */
function nameSimilarity(a: string, b: string): number {
  const dist = levenshtein(a.toLowerCase(), b.toLowerCase());
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - dist / maxLen;
}

export function computeClassifierFeatures(
  table: TableFeature,
  opts: {
    concepts: ConceptCard[];
    dictEntries: Array<{ id: number; stdName: string; aliases: string[] }>;
    existingTables: Array<{ schemaId: number; tableName: string; fields: string[] }>;
  },
): ClassifierFeatures {
  const tableNameLower = table.tableName.toLowerCase();
  const tableFieldsLower = table.fields.map(f => f.toLowerCase());

  // ── Concept hit score ──────────────────────────────────────────────────────
  let conceptHitScore = 0;
  const matchedConceptIds: number[] = [];

  for (const concept of opts.concepts) {
    const names = [
      concept.name.toLowerCase(),
      concept.stdName.toLowerCase(),
      ...concept.aliases.map(a => a.toLowerCase()),
    ];

    // Check table name vs concept names/aliases
    const tableNameHit = names.some(
      n =>
        tableNameLower.includes(n) ||
        n.includes(tableNameLower) ||
        nameSimilarity(tableNameLower, n) > 0.7,
    );

    // Check if concept has a tableHint pointing to this table
    const tableHintHit = concept.tableHints.some(
      h => h.tableName.toLowerCase() === tableNameLower,
    );

    if (tableNameHit || tableHintHit) {
      const bonus = tableHintHit ? 1.5 : 1;
      conceptHitScore = Math.min(1, conceptHitScore + 0.3 * bonus);
      matchedConceptIds.push(concept.id);
    }
  }

  // ── Dictionary coverage ────────────────────────────────────────────────────
  const matchedDictIds: number[] = [];
  let dictMatchCount = 0;

  for (const field of tableFieldsLower) {
    for (const entry of opts.dictEntries) {
      const dictNames = [
        entry.stdName.toLowerCase(),
        ...entry.aliases.map(a => a.toLowerCase()),
      ];
      if (dictNames.some(dn => field === dn || field.includes(dn))) {
        dictMatchCount++;
        if (!matchedDictIds.includes(entry.id)) matchedDictIds.push(entry.id);
        break;
      }
    }
  }

  const dictCoverage =
    table.fields.length === 0 ? 0 : dictMatchCount / table.fields.length;

  // ── Similar existing table score ───────────────────────────────────────────
  const similarTables: SimilarTable[] = [];

  for (const existing of opts.existingTables) {
    const fieldJaccard = jaccard(tableFieldsLower, existing.fields.map(f => f.toLowerCase()));
    const nameScore = nameSimilarity(tableNameLower, existing.tableName.toLowerCase());
    const combinedScore = 0.6 * fieldJaccard + 0.4 * nameScore;

    if (combinedScore > 0.3) {
      similarTables.push({
        schemaId: existing.schemaId,
        tableName: existing.tableName,
        score: combinedScore,
        reason: `欄位 Jaccard=${fieldJaccard.toFixed(2)}, 名稱相似度=${nameScore.toFixed(2)}`,
      });
    }
  }

  similarTables.sort((a, b) => b.score - a.score);
  const top3 = similarTables.slice(0, 3);
  const similarTableScore = top3[0]?.score ?? 0;

  const confidence =
    0.5 * conceptHitScore + 0.3 * similarTableScore + 0.2 * dictCoverage;

  return {
    conceptHitScore,
    dictCoverage,
    similarTableScore,
    similarTables: top3,
    matchedConceptIds,
    matchedDictIds,
  };

  void confidence; // used by caller for proposal
}

export function computeConfidence(features: ClassifierFeatures): number {
  return Math.min(
    1,
    0.5 * features.conceptHitScore +
      0.3 * features.similarTableScore +
      0.2 * features.dictCoverage,
  );
}
