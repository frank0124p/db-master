import type { NamingEntry } from "../types.js";
import { levenshtein } from "./levenshtein.js";

export type MatchStatus = "exact" | "alias" | "fuzzy" | "unknown";

export interface MatchResult {
  status: MatchStatus;
  stdName: string | null;
  matchedAlias: string | null;
  distance: number | null;
  entry: NamingEntry | null;
}

const FUZZY_THRESHOLD = 2;

export function checkFieldName(name: string, entries: NamingEntry[]): MatchResult {
  const lower = name.toLowerCase();

  for (const entry of entries) {
    if (entry.stdName === lower) {
      return { status: "exact", stdName: entry.stdName, matchedAlias: null, distance: 0, entry };
    }
  }

  for (const entry of entries) {
    const aliases = entry.aliases.map((a) => a.toLowerCase());
    const hit = aliases.find((a) => a === lower);
    if (hit !== undefined) {
      return { status: "alias", stdName: entry.stdName, matchedAlias: hit, distance: 0, entry };
    }
  }

  let best: { entry: NamingEntry; distance: number; candidate: string } | null = null;
  for (const entry of entries) {
    const candidates = [entry.stdName, ...entry.aliases.map((a) => a.toLowerCase())];
    for (const c of candidates) {
      const d = levenshtein(lower, c);
      if (d <= FUZZY_THRESHOLD && (best === null || d < best.distance)) {
        best = { entry, distance: d, candidate: c };
      }
    }
  }

  if (best !== null) {
    return {
      status: "fuzzy",
      stdName: best.entry.stdName,
      matchedAlias: best.candidate !== best.entry.stdName ? best.candidate : null,
      distance: best.distance,
      entry: best.entry,
    };
  }

  return { status: "unknown", stdName: null, matchedAlias: null, distance: null, entry: null };
}

export interface FieldCheckResult {
  fieldName: string;
  result: MatchResult;
}

export function checkFieldNames(names: string[], entries: NamingEntry[]): FieldCheckResult[] {
  return names.map((name) => ({ fieldName: name, result: checkFieldName(name, entries) }));
}
