import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import type {
  WideTableProposal,
  ProposedColumn,
  ProposedJoin,
  ConceptCard,
  BusinessRule,
} from "@schema-studio/core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = path.resolve(__dirname, "../../../../prompts");

export interface CandidateTable {
  schemaId: number;
  schemaSlug: string;
  tableName: string;
  fields: Array<{
    name: string;
    dataType: string;
    isPrimaryKey: boolean;
    isUnique: boolean;
    comment: string | null;
  }>;
  fromBatchId?: number;
}

export interface ComposeCtx {
  concepts: ConceptCard[];
  businessRules: BusinessRule[];
  dictEntries: Array<{ id: number; stdName: string; aliases: string[] }>;
  candidatePool: CandidateTable[];
}

interface RawColumn {
  name: string;
  data_type: string;
  definition: string;
  source: { schema_id: number; table_name: string; field_name: string };
  concept_std_name?: string;
  transform?: string;
}

interface RawJoin {
  left_ref: string;
  right_ref: string;
  type: "inner" | "left";
  on: Array<{ left_field: string; right_field: string }>;
}

interface RawRelationship {
  target_kind: "table" | "wide-table" | "governed-wide-table";
  target_ref: string;
  relation: "shares_key" | "upstream_of" | "subset_of" | "joins_with";
  on_fields: string[];
  note: string;
}

interface RawTraceStep {
  step: string;
  detail: string;
  refs?: { concept_std_names?: string[]; table_refs?: string[] };
}

interface RawProposal {
  name: string;
  description: string;
  block_kind: "small" | "medium";
  columns: RawColumn[];
  join_graph: RawJoin[];
  relationships: RawRelationship[];
  reasoning_trace: RawTraceStep[];
}

/** Check that every column source exists in the candidate pool */
function validateSources(
  columns: RawColumn[],
  candidatePool: CandidateTable[],
): { valid: boolean; phantomCols: string[] } {
  const tableIndex = new Map<string, Set<string>>();
  for (const ct of candidatePool) {
    const ref1 = `${ct.schemaSlug}.${ct.tableName}`;
    const ref2 = ct.tableName;
    const fieldSet = new Set(ct.fields.map(f => f.name));
    tableIndex.set(ref1, fieldSet);
    tableIndex.set(ref2, fieldSet);
    tableIndex.set(String(ct.schemaId), fieldSet);
  }

  const phantomCols: string[] = [];
  for (const col of columns) {
    const tableRef =
      tableIndex.get(`${col.source.schema_id}.${col.source.table_name}`) ??
      tableIndex.get(col.source.table_name);
    if (!tableRef || !tableRef.has(col.source.field_name)) {
      phantomCols.push(col.name);
    }
  }
  return { valid: phantomCols.length === 0, phantomCols };
}

/** Retrieve candidates matching the scenario via concept aliases */
function retrieveRelevantCandidates(
  scenario: string,
  concepts: ConceptCard[],
  candidatePool: CandidateTable[],
): CandidateTable[] {
  const scenarioLower = scenario.toLowerCase();
  const matchedConcepts = concepts.filter(c => {
    const names = [c.name.toLowerCase(), c.stdName.toLowerCase(), ...c.aliases.map(a => a.toLowerCase())];
    return names.some(n => scenarioLower.includes(n));
  });

  if (matchedConcepts.length === 0) return candidatePool;

  const hintedTables = new Set(
    matchedConcepts.flatMap(c => c.tableHints.map(h => h.tableName.toLowerCase())),
  );

  return candidatePool.sort((a, b) => {
    const aHinted = hintedTables.has(a.tableName.toLowerCase()) ? -1 : 0;
    const bHinted = hintedTables.has(b.tableName.toLowerCase()) ? -1 : 0;
    return aHinted - bHinted;
  });
}

export async function* composeWideTable(
  scenario: string,
  blockKind: "small" | "medium" | undefined,
  ctx: ComposeCtx,
): AsyncGenerator<
  | { type: "trace"; step: string; detail: string }
  | { type: "token"; text: string }
  | { type: "proposal"; proposal: WideTableProposal }
  | { type: "done"; proposalCount: number }
  | { type: "error"; message: string }
> {
  const apiKey = process.env["LLM_API_KEY"] ?? process.env["ANTHROPIC_API_KEY"] ?? "";
  if (!apiKey) {
    yield {
      type: "error",
      message: "LLM not configured. Set ANTHROPIC_API_KEY to use the compose pipeline.",
    };
    return;
  }

  // ① Knowledge retrieval trace
  const relevantCandidates = retrieveRelevantCandidates(
    scenario,
    ctx.concepts,
    ctx.candidatePool,
  );
  const scenarioLower = scenario.toLowerCase();
  const matchedConcepts = ctx.concepts.filter(c => {
    const names = [c.name.toLowerCase(), c.stdName.toLowerCase(), ...c.aliases.map(a => a.toLowerCase())];
    return names.some(n => scenarioLower.includes(n));
  });

  yield {
    type: "trace",
    step: "concept-retrieval",
    detail: matchedConcepts.length > 0
      ? `命中 ${matchedConcepts.length} 個概念: ${matchedConcepts.map(c => c.stdName).join(", ")}`
      : "未命中任何概念，使用全候選池",
  };

  // ② Candidate selection trace
  const topCandidates = relevantCandidates.slice(0, 10);
  yield {
    type: "trace",
    step: "candidate-selection",
    detail: `候選 ${topCandidates.length} 張表: ${topCandidates.map(t => t.tableName).join(", ")}`,
  };

  // ③ Build the LLM prompt
  const template = await fs.readFile(
    path.join(PROMPTS_DIR, "compose-wide-table.md"),
    "utf-8",
  );

  const ssotRules = ctx.businessRules.filter(
    r => r.machine?.kind === "ssot_declaration" && r.status === "approved",
  );

  const candidatePoolText = topCandidates.map(ct => {
    const fields = ct.fields.map(f =>
      `  - ${f.name} (${f.dataType})${f.isPrimaryKey ? " PK" : ""}${f.isUnique ? " UNIQUE" : ""}${f.comment ? ` -- ${f.comment}` : ""}`,
    ).join("\n");
    return `Table: ${ct.schemaSlug}.${ct.tableName} (schemaId=${ct.schemaId})\n${fields}`;
  }).join("\n\n");

  const conceptsText = matchedConcepts.map(c =>
    `- ${c.stdName} (${c.name}): ${c.definition}\n  tableHints: ${c.tableHints.map(h => `${h.tableName} (${h.role})`).join(", ")}`,
  ).join("\n");

  const ssotText = ssotRules.map(r => {
    const m = r.machine as { kind: "ssot_declaration"; conceptId: number; ssotTable: { schemaId: number; tableName: string } };
    return `- ${r.title}: SSOT for conceptId=${m.conceptId} is ${m.ssotTable.tableName}`;
  }).join("\n");

  const prompt = `${template}

---

## Input

scenario: ${scenario}
block_kind: ${blockKind ?? "auto"}

### Candidate Pool
${candidatePoolText}

### Concepts
${conceptsText || "(none matched)"}

### SSOT Rules
${ssotText || "(none)"}

### Naming Dictionary (top entries)
${ctx.dictEntries.slice(0, 20).map(d => `- ${d.stdName}`).join("\n")}

Respond with ONLY the JSON array. No markdown fences, no explanation.`;

  // ④ LLM call
  yield { type: "trace", step: "compose", detail: "LLM 組裝中…" };

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });

  let fullText = "";
  const stream = client.messages.stream({
    model: process.env["LLM_MODEL"] ?? "claude-sonnet-4-6",
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      const text = event.delta.text;
      fullText += text;
      yield { type: "token", text };
    }
  }

  // ④ Post-process & validate
  const jsonMatch = fullText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    yield { type: "error", message: "LLM did not return a valid JSON array" };
    return;
  }

  let rawProposals: RawProposal[];
  try {
    rawProposals = JSON.parse(jsonMatch[0]) as RawProposal[];
  } catch (e) {
    yield { type: "error", message: `JSON parse error: ${String(e)}` };
    return;
  }

  const { createWtProposal } = await import("../repositories/wt-proposals.js");

  let proposalCount = 0;
  for (const raw of rawProposals) {
    // Validate sources
    const { phantomCols } = validateSources(raw.columns ?? [], ctx.candidatePool);

    // Map concept stdName to id
    const conceptMap = new Map(ctx.concepts.map(c => [c.stdName, c.id]));
    const dictMap = new Map(ctx.dictEntries.map(d => [d.stdName, d.id]));

    const columns: ProposedColumn[] = (raw.columns ?? []).map(col => ({
      name: col.name,
      dataType: col.data_type,
      definition: col.definition,
      source: {
        schemaId: col.source.schema_id,
        tableName: col.source.table_name,
        fieldName: col.source.field_name,
      },
      conceptId: col.concept_std_name ? conceptMap.get(col.concept_std_name) : undefined,
      namingDictId: dictMap.get(col.name),
      transform: col.transform,
      ...(phantomCols.includes(col.name) ? { _phantom: true } : {}),
    })) as ProposedColumn[];

    const joinGraph: ProposedJoin[] = (raw.join_graph ?? []).map(j => ({
      leftRef: j.left_ref,
      rightRef: j.right_ref,
      type: j.type,
      on: j.on.map(o => ({ leftField: o.left_field, rightField: o.right_field })),
    }));

    const relationships: WideTableProposal["relationships"] = (raw.relationships ?? []).map(r => ({
      targetKind: r.target_kind,
      targetRef: r.target_ref,
      relation: r.relation,
      onFields: r.on_fields,
      note: r.note,
    }));

    const reasoningTrace: WideTableProposal["reasoningTrace"] = (raw.reasoning_trace ?? []).map(t => ({
      step: t.step,
      detail: t.detail,
      refs: t.refs ? {
        conceptIds: (t.refs.concept_std_names ?? []).map((sn: string) => conceptMap.get(sn) ?? 0).filter(Boolean),
        tableRefs: t.refs.table_refs,
      } : undefined,
    }));

    const proposal = await createWtProposal({
      scenario,
      blockKind: raw.block_kind ?? blockKind ?? "medium",
      name: raw.name,
      description: raw.description,
      columns,
      joinGraph,
      relationships,
      reasoningTrace,
      candidatePool: topCandidates.map(ct => ({
        schemaId: ct.schemaId,
        tableName: ct.tableName,
        fromBatchId: ct.fromBatchId,
      })),
      status: "proposed",
    });

    yield { type: "proposal", proposal };
    proposalCount++;
  }

  yield { type: "done", proposalCount };
}
