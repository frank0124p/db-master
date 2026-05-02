/**
 * Wagner-Fischer algorithm for Levenshtein edit distance.
 *
 * Returns the minimum number of single-character edits (insert, delete, replace)
 * needed to transform string `a` into string `b`.
 *
 * Examples:
 *   levenshtein("lot_id", "lot_id")   → 0  (identical)
 *   levenshtein("lt_id",  "lot_id")   → 1  (insert "o")
 *   levenshtein("lot_no", "lot_id")   → 2  (replace "n","o" → "i","d")
 *
 * Used by the naming matcher with threshold=3: if distance ≤ 3, the field name
 * is considered a "fuzzy" match and the user is prompted with a suggestion.
 *
 * Time complexity:  O(m × n)
 * Space complexity: O(m × n)  — a rolling-row optimisation is possible but
 *                               the input strings are short (field names), so
 *                               readability is preferred over micro-optimisation.
 */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  // dp[i][j] = edit distance between a[0..i-1] and b[0..j-1]
  // Base cases: converting empty string → n deletions (row 0), or m insertions (col 0)
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1]![j - 1]!                                          // characters match — no extra cost
          : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!); // min(delete, insert, replace)
    }
  }

  return dp[m]![n]!;
}
