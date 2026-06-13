/**
 * MCP tool: ask
 * Only enabled if MCP_ENABLE_ASK=true env var is set.
 * Maps to POST /api/v1/ask (read-only, non-streaming wrapper)
 *
 * NOTE: For LLM clients with reasoning capabilities, prefer using
 * search_assets + get_asset + get_join_path to assemble your own answer.
 * The ask tool is intended for thin clients without reasoning capabilities.
 */

import type { DbMasterClient } from "../client.js";

export const ASK_NAME = "ask";

export const ASK_DESCRIPTION =
  "直接以自然語言問問題，回傳相關欄位、JOIN 路徑與 SQL 範例（含信心度與警告）。" +
  "注意：具推理能力的客戶端建議改用 search_assets + get_asset + get_join_path 自行組裝，以避免雙層不確定性。" +
  "此工具僅供無推理能力的薄客戶端使用，預設關閉（需設定 MCP_ENABLE_ASK=true）。";

export const ASK_SCHEMA: {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
} = {
  type: "object",
  properties: {
    question: {
      type: "string",
      description: "業務問題（中英皆可），例如：批次良率資料存在哪張表？",
    },
  },
  required: ["question"],
};

export async function handleAsk(
  client: DbMasterClient,
  args: { question: string },
): Promise<string> {
  const { question } = args;

  const result = await client.askQuestion(question);

  if (result.abstain) {
    const sections = [`問題：${question}`, "", "無法回答（Abstain）"];
    if (result.abstainReason) sections.push(`原因：${result.abstainReason}`);
    sections.push("");
    sections.push("建議：請嘗試 search_assets 或 list_concepts 手動探索相關資產。");
    return sections.join("\n");
  }

  const sections: string[] = [];
  sections.push(`問題：${question}`);

  if (result.confidence !== undefined) {
    sections.push(`信心度：${(result.confidence * 100).toFixed(1)}%`);
  }

  if (result.answerFields && Array.isArray(result.answerFields) && result.answerFields.length > 0) {
    sections.push("");
    sections.push("相關欄位：");
    for (const field of result.answerFields) {
      const f = field as Record<string, unknown>;
      sections.push(`  - ${String(f["ref"] ?? "")} ${f["label"] ? `(${String(f["label"])})` : ""}`);
      if (f["definition"]) sections.push(`    定義：${String(f["definition"])}`);
    }
  }

  if (result.joinPath) {
    sections.push("");
    sections.push("JOIN 路徑：");
    for (const [i, step] of result.joinPath.steps.entries()) {
      sections.push(`  步驟 ${i + 1}：${step.from} → ${step.to} ON ${step.on}`);
    }
  }

  if (result.sql) {
    sections.push("");
    sections.push("SQL：");
    sections.push(result.sql);
  }

  if (result.warnings?.length) {
    sections.push("");
    sections.push("警告：");
    for (const w of result.warnings) {
      sections.push(`  - ${w}`);
    }
  }

  return sections.join("\n");
}
