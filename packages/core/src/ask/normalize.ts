/**
 * Ask Pipeline — Normalize
 *
 * Extends existing naming normalize capabilities with:
 * - Full-width to half-width (ASCII) conversion
 * - toLowerCase
 * - camelCase/PascalCase → snake_case
 * - removePunctuation
 * - Simple English plural restoration (whitelist, no external deps)
 * - Combined normalizeQuery entry-point
 */

// ── Full-width → half-width ───────────────────────────────────────────────────

/**
 * Convert full-width characters (U+FF01..U+FF5E, U+3000) to their half-width
 * ASCII equivalents.
 */
export function fullWidthToHalf(s: string): string {
  return s
    .replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/　/g, " ");
}

// ── Case helpers ──────────────────────────────────────────────────────────────

/** Lowercase without locale sensitivity. */
export function toLowerCase(s: string): string {
  return s.toLowerCase();
}

/**
 * camelCase / PascalCase → snake_case.
 * Examples:
 *   equipmentId → equipment_id
 *   LotId       → lot_id
 *   YieldRate   → yield_rate
 */
export function camelToSnake(s: string): string {
  return s
    // Insert underscore before uppercase letter following lowercase letter or digit
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    // Insert underscore before uppercase sequence followed by lowercase (XYZFoo → xyz_foo)
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();
}

/** Alias — same as camelToSnake (also handles PascalCase). */
export const pascalToSnake = camelToSnake;

// ── Punctuation removal ───────────────────────────────────────────────────────

/**
 * Remove punctuation characters (keep CJK characters, alphanumeric, underscores,
 * and spaces which are used as tokenisation boundaries).
 */
export function removePunctuation(s: string): string {
  // Keep: A-Z a-z 0-9 _ space, and CJK unified ideographs (U+4E00–U+9FFF),
  // CJK extension A/B, Katakana, Hiragana, etc.
  return s.replace(/[^\w\s一-鿿぀-ゟ゠-ヿ]/g, " ");
}

// ── English plural restoration ────────────────────────────────────────────────

/**
 * Simple whitelist-based plural restoration.
 * We only apply a few safe rules to avoid false positives.
 * No external stemming library is used.
 */
const IRREGULAR_PLURALS: Record<string, string> = {
  equipments: "equipment",
  statuses:   "status",
  processes:  "process",
  batches:    "batch",
  indices:    "index",
  analyses:   "analysis",
  matrices:   "matrix",
  vertices:   "vertex",
  anomalies:  "anomaly",
  entries:    "entry",
  factories:  "factory",
  copies:     "copy",
  queries:    "query",
  series:     "series",
  species:    "species",
};

/**
 * Restore simple English plurals:
 * - Irregular forms from whitelist
 * - -ies → -y  (quantities → quantity)
 * - -s suffix (not -ss, -us, -is, -as endings)  (lots → lot)
 */
export function restorePlural(word: string): string {
  const lower = word.toLowerCase();

  const irregular = IRREGULAR_PLURALS[lower];
  if (irregular) return irregular;

  // -ies → -y
  if (lower.endsWith("ies") && lower.length > 4) {
    return lower.slice(0, -3) + "y";
  }

  // -s but not -ss / -us / -is / -as / -os / -es that are already base forms
  if (
    lower.endsWith("s") &&
    !lower.endsWith("ss") &&
    !lower.endsWith("us") &&
    !lower.endsWith("is") &&
    !lower.endsWith("as") &&
    !lower.endsWith("os") &&
    lower.length > 3
  ) {
    return lower.slice(0, -1);
  }

  return lower;
}

// ── Combined normalizeQuery ───────────────────────────────────────────────────

/**
 * Master normalise function for NL queries in the Ask pipeline.
 *
 * Order of operations:
 * 1. Full-width → half-width
 * 2. camelCase / PascalCase → snake_case
 * 3. removePunctuation  (replaces with spaces)
 * 4. toLowerCase
 * 5. Collapse multiple spaces
 *
 * Note: plural restoration is intentionally NOT applied here globally.
 * It is applied token-by-token in the linking engine, where we can decide
 * whether to also test the de-pluralised form.
 */
export function normalizeQuery(q: string): string {
  return fullWidthToHalf(q)
    .split(/\s+/)
    .map(tok => camelToSnake(tok))
    .join(" ")
    .replace(/[^\w\s一-鿿぀-ゟ゠-ヿ]/g, " ")
    .toLowerCase()
    .replace(/\s{2,}/g, " ")
    .trim();
}
