/**
 * MCP tool: get_asset
 * Maps to GET /api/v1/graph/node/:ref (read-only)
 */

import type { DbMasterClient, GraphEdge } from "../client.js";

export const GET_ASSET_NAME = "get_asset";

export const GET_ASSET_DESCRIPTION =
  "取得單一資料資產的完整詳情：欄位定義、型別、樣本值、血緣（上游來源 / 下游使用）、關聯表、owner、更新頻率。" +
  "輸入 search_assets 回傳的 ref（如 fld:table_name.field_name 或 tbl:schema.table_name）。";

export const GET_ASSET_SCHEMA: {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
} = {
  type: "object",
  properties: {
    ref: {
      type: "string",
      description: "資產的唯一識別符，由 search_assets 回傳（如 fld:lots.yield_rate 或 tbl:mes.lots）",
    },
  },
  required: ["ref"],
};

function groupEdges(edges: GraphEdge[], centerRef: string): {
  upstream: GraphEdge[];
  downstream: GraphEdge[];
  joins: GraphEdge[];
  concepts: GraphEdge[];
  other: GraphEdge[];
} {
  const upstream: GraphEdge[] = [];
  const downstream: GraphEdge[] = [];
  const joins: GraphEdge[] = [];
  const concepts: GraphEdge[] = [];
  const other: GraphEdge[] = [];

  for (const edge of edges) {
    const isSource = edge.from === centerRef;
    const upstreamKinds = new Set(["composed_from", "flows_to"]);
    const joinKinds = new Set(["joins_on", "fk", "has_field"]);
    const conceptKinds = new Set(["has_concept", "related_to", "ssot_for"]);

    if (joinKinds.has(edge.kind)) {
      joins.push(edge);
    } else if (conceptKinds.has(edge.kind)) {
      concepts.push(edge);
    } else if (edge.kind === "flows_to") {
      if (isSource) downstream.push(edge);
      else upstream.push(edge);
    } else if (edge.kind === "composed_from") {
      if (isSource) upstream.push(edge);
      else downstream.push(edge);
    } else if (upstreamKinds.has(edge.kind)) {
      if (isSource) downstream.push(edge);
      else upstream.push(edge);
    } else {
      other.push(edge);
    }
  }

  return { upstream, downstream, joins, concepts, other };
}

function formatEdge(edge: GraphEdge, label: string): string {
  const parts = [`  ${label}: ${edge.from} → ${edge.to} (${edge.kind})`];
  if (edge.meta?.["on"]) parts.push(`    on: ${edge.meta["on"]}`);
  if (edge.meta?.["description"]) parts.push(`    description: ${edge.meta["description"]}`);
  if (edge.meta?.["broken"]) parts.push(`    [BROKEN EDGE]`);
  return parts.join("\n");
}

function formatMeta(meta: Record<string, unknown>): string {
  const interesting = [
    "type", "dataType", "definition", "description",
    "sampleValues", "ownerUserId", "sensitivity",
    "deprecated", "replacedBy", "refreshCycle",
    "domain", "layerType", "stdName",
  ];
  const lines: string[] = [];
  for (const key of interesting) {
    if (meta[key] !== undefined && meta[key] !== null && meta[key] !== "") {
      const val = Array.isArray(meta[key])
        ? (meta[key] as unknown[]).join(", ")
        : String(meta[key]);
      lines.push(`  ${key}: ${val}`);
    }
  }
  return lines.join("\n");
}

export async function handleGetAsset(
  client: DbMasterClient,
  args: { ref: string },
): Promise<string> {
  const { ref } = args;
  const result = await client.getAsset(ref);

  const { node, edges } = result;
  const grouped = groupEdges(edges, ref);

  const sections: string[] = [];

  // Header
  sections.push(`資產：${node.label} (${node.ref})`);
  sections.push(`類型：${node.kind}`);

  // Meta details
  if (node.meta && Object.keys(node.meta).length > 0) {
    const metaStr = formatMeta(node.meta as Record<string, unknown>);
    if (metaStr) {
      sections.push("");
      sections.push("詳情：");
      sections.push(metaStr);
    }
  }

  // Upstream lineage
  if (grouped.upstream.length > 0) {
    sections.push("");
    sections.push("上游（來源）：");
    for (const e of grouped.upstream) {
      sections.push(formatEdge(e, "↑"));
    }
  }

  // Downstream lineage
  if (grouped.downstream.length > 0) {
    sections.push("");
    sections.push("下游（使用）：");
    for (const e of grouped.downstream) {
      sections.push(formatEdge(e, "↓"));
    }
  }

  // Join relationships
  if (grouped.joins.length > 0) {
    sections.push("");
    sections.push("關聯（JOIN）：");
    for (const e of grouped.joins) {
      sections.push(formatEdge(e, "↔"));
    }
  }

  // Concepts
  if (grouped.concepts.length > 0) {
    sections.push("");
    sections.push("業務概念：");
    for (const e of grouped.concepts) {
      sections.push(formatEdge(e, "≡"));
    }
  }

  // Other edges
  if (grouped.other.length > 0) {
    sections.push("");
    sections.push("其他關係：");
    for (const e of grouped.other) {
      sections.push(formatEdge(e, "-"));
    }
  }

  return sections.join("\n");
}
