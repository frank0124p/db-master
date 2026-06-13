/**
 * MCP tool: list_concepts
 * Maps to GET /api/v1/knowledge/concepts (read-only)
 */

import type { DbMasterClient, ConceptCard } from "../client.js";

export const LIST_CONCEPTS_NAME = "list_concepts";

export const LIST_CONCEPTS_DESCRIPTION =
  "列出業務概念詞彙表（glossary）：概念定義、同義詞、SSOT 來源表。" +
  "用於理解業務術語對應到哪些資料。在 search_assets 找不到結果時，可先用此工具確認業務術語的標準命名。";

export const LIST_CONCEPTS_SCHEMA: {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
} = {
  type: "object",
  properties: {
    domain: {
      type: "string",
      description: "按領域篩選（如 mes、quality、equipment），不填則列出全部",
    },
    query: {
      type: "string",
      description: "關鍵詞搜尋概念名稱或定義",
    },
  },
  required: [],
};

function formatConcept(concept: ConceptCard, index: number): string {
  const lines: string[] = [];
  lines.push(`[${index + 1}] ${concept.name} (${concept.stdName})`);
  if (concept.domain) lines.push(`  領域：${concept.domain}`);
  lines.push(`  定義：${concept.definition}`);
  if (concept.aliases.length > 0) {
    lines.push(`  別名：${concept.aliases.join("、")}`);
  }
  if (concept.tableHints?.length) {
    const hints = concept.tableHints
      .map(h => `${h.tableName}（${h.role}）${h.note ? `: ${h.note}` : ""}`)
      .join("；");
    lines.push(`  SSOT 來源表：${hints}`);
  }
  lines.push(`  狀態：${concept.status}`);
  return lines.join("\n");
}

export async function handleListConcepts(
  client: DbMasterClient,
  args: { domain?: string; query?: string },
): Promise<string> {
  const { domain, query } = args;

  const concepts = await client.listConcepts(domain, query);

  // Filter to approved only (respect governance workflow)
  const approved = concepts.filter(c => c.status === "approved");

  if (approved.length === 0) {
    const filterDesc = domain || query
      ? `${domain ? `領域="${domain}"` : ""}${query ? ` 關鍵詞="${query}"` : ""}`
      : "全部";
    return `未找到符合條件的業務概念（${filterDesc}）。請嘗試不同關鍵詞或聯繫治理管理員新增概念。`;
  }

  const header = domain || query
    ? `業務概念詞彙表（${domain ? `領域=${domain}` : ""}${query ? ` 搜尋=${query}` : ""}）：共 ${approved.length} 筆`
    : `業務概念詞彙表：共 ${approved.length} 筆`;

  return [
    header,
    "",
    approved.map((c, i) => formatConcept(c, i)).join("\n\n"),
  ].join("\n");
}
