/** Split markdown/text content into chunks for LLM extraction.
 * Rules: split on H1/H2/H3 headings or double-blank-lines,
 * keep each chunk ≤ ~1500 chars; force-split if still over. */
export function chunkContent(content: string): Array<{ idx: number; text: string }> {
  // Split on markdown headings or consecutive blank lines
  const parts = content
    .split(/(?=\n#{1,3} |\n{2,})/g)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  const MAX = 1500;
  const raw: string[] = [];
  for (const part of parts) {
    if (part.length <= MAX) {
      raw.push(part);
    } else {
      // Force split by sentences / newlines
      let remaining = part;
      while (remaining.length > MAX) {
        // Try to split at a newline near MAX boundary
        const cutAt = remaining.lastIndexOf("\n", MAX);
        const split = cutAt > MAX / 2 ? cutAt : MAX;
        raw.push(remaining.slice(0, split).trim());
        remaining = remaining.slice(split).trim();
      }
      if (remaining.length > 0) raw.push(remaining);
    }
  }

  return raw.map((text, idx) => ({ idx, text }));
}
