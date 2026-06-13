/**
 * MCP tool: search_assets
 * Maps to POST /api/v1/ask/link-only (read-only)
 */

import type { DbMasterClient, SearchHit } from "../client.js";

export const SEARCH_ASSETS_NAME = "search_assets";

export const SEARCH_ASSETS_DESCRIPTION =
  "在資料治理目錄中搜尋資料資產。輸入業務問題或關鍵詞（中英皆可），回傳最相關的欄位、資料表、治理寬表與業務概念，含定義與來源。" +
  "當你需要知道「某個業務資料存在哪張表的哪個欄位」時優先使用此工具。" +
  " | kinds 可選過濾：fld=欄位, tbl=資料表, gwt=治理寬表, gwc=寬表欄位, cpt=概念。";

export const SEARCH_ASSETS_SCHEMA: {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
} = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "業務問題或搜尋關鍵詞（中英皆可）",
    },
    top_k: {
      type: "number",
      description: "回傳最多幾筆結果，預設 10，最大 30",
      minimum: 1,
      maximum: 30,
    },
    kinds: {
      type: "array",
      items: { type: "string", enum: ["fld", "tbl", "gwt", "gwc", "cpt"] },
      description: "限定資產類型（可選），不填則搜尋全部類型",
    },
  },
  required: ["query"],
};

function formatHit(hit: SearchHit): string {
  const lines: string[] = [];
  lines.push(`ref: ${hit.ref}`);
  lines.push(`kind: ${hit.kind}`);
  lines.push(`label: ${hit.label}`);
  if (hit.definition) lines.push(`definition: ${hit.definition}`);
  if (hit.score !== undefined) lines.push(`score: ${hit.score.toFixed(3)}`);
  if (hit.owner) lines.push(`owner: ${hit.owner}`);
  if (hit.sensitivity) lines.push(`sensitivity: ${hit.sensitivity}`);
  if (hit.deprecated) {
    lines.push(`[DEPRECATED]${hit.replacedBy ? ` → replacedBy: ${hit.replacedBy}` : ""}`);
  }
  if (hit.reasons?.length) lines.push(`reasons: ${hit.reasons.join(", ")}`);
  return lines.join("\n");
}

export async function handleSearchAssets(
  client: DbMasterClient,
  args: { query: string; top_k?: number; kinds?: string[] },
): Promise<string> {
  const { query, top_k: topK = 10, kinds } = args;

  const result = await client.searchAssets(query, topK, kinds);

  if (!result.hits.length) {
    return `搜尋「${query}」未找到任何結果。請嘗試不同關鍵詞或移除 kinds 過濾條件。`;
  }

  const sections = result.hits.map((hit, i) => {
    return `[${i + 1}] ${formatHit(hit)}`;
  });

  return [
    `搜尋「${query}」找到 ${result.hits.length} 筆結果：`,
    "",
    sections.join("\n\n"),
  ].join("\n");
}
