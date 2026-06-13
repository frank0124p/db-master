/**
 * MCP tool: get_join_path
 * Maps to GET /api/v1/graph/join-path (read-only)
 */

import type { DbMasterClient, JoinStep } from "../client.js";

export const GET_JOIN_PATH_NAME = "get_join_path";

export const GET_JOIN_PATH_DESCRIPTION =
  "計算兩個資料表之間的可靠 JOIN 路徑（基於外鍵與治理寬表的既定關聯，非猜測）。" +
  "撰寫跨表 SQL 前必須呼叫此工具，JOIN 條件一律以回傳的 steps.on 為準，不可自行推測。" +
  "找不到路徑時會明確告知，請改用 search_assets 找中介概念或回報缺少的關聯。";

export const GET_JOIN_PATH_SCHEMA: {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
} = {
  type: "object",
  properties: {
    from: {
      type: "string",
      description: "起點資料表或治理寬表的 ref（如 tbl:mes.lots 或 gwt:quality_wide）",
    },
    to: {
      type: "string",
      description: "終點資料表或治理寬表的 ref（如 tbl:test.results 或 gwt:equipment_wide）",
    },
    max_hops: {
      type: "number",
      description: "最大跳數，預設 6。增大值可找到更遠的路徑但可能較慢",
      minimum: 1,
      maximum: 10,
    },
  },
  required: ["from", "to"],
};

const NOT_CONNECTED_MESSAGE =
  "圖上無已知路徑，請改用 search_assets 找中介概念，或回報缺少的關聯。";

function formatStep(step: JoinStep, index: number): string {
  const lines: string[] = [];
  lines.push(`  步驟 ${index + 1}：${step.from} → ${step.to}`);
  lines.push(`    JOIN 條件：${step.on}`);
  if (step.via) lines.push(`    經由：${step.via}`);
  if (step.edgeKind) lines.push(`    關係類型：${step.edgeKind}`);
  return lines.join("\n");
}

export async function handleGetJoinPath(
  client: DbMasterClient,
  args: { from: string; to: string; max_hops?: number },
): Promise<string> {
  const { from, to, max_hops: maxHops } = args;

  const result = await client.getJoinPath(from, to, maxHops);

  if (!result) {
    return `從 ${from} 到 ${to}：${NOT_CONNECTED_MESSAGE}`;
  }

  const sections: string[] = [];

  sections.push(`JOIN 路徑：${result.from} → ${result.to}`);
  sections.push(`總跳數：${result.steps.length}，路徑成本：${result.totalCost.toFixed(3)}`);

  if (result.steps.length === 0) {
    sections.push("（起點與終點為同一節點，無需 JOIN）");
  } else {
    sections.push("");
    sections.push("路徑步驟（使用 steps.on 作為 JOIN 條件）：");
    for (const [i, step] of result.steps.entries()) {
      sections.push(formatStep(step, i));
    }
  }

  if (result.caveats?.length) {
    sections.push("");
    sections.push("注意事項：");
    for (const caveat of result.caveats) {
      sections.push(`  - ${caveat}`);
    }
  }

  // Generate example SQL
  if (result.steps.length > 0) {
    sections.push("");
    sections.push("SQL 範例（JOIN 條件以上方 steps.on 為準）：");
    const tables = [result.steps[0]?.from ?? from];
    const joins: string[] = [];
    for (const step of result.steps) {
      tables.push(step.to);
      joins.push(`  JOIN ${step.to} ON ${step.on}`);
    }
    sections.push(`SELECT *\nFROM ${tables[0] ?? from}\n${joins.join("\n")}`);
  }

  return sections.join("\n");
}
