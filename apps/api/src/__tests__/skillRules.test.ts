import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

// ── serializeRule ─────────────────────────────────────────────────────────────
// Replicate the function under test (rules.ts is a route module with Express
// deps; we test the pure logic directly here rather than importing the module).

interface SerializableRule {
  id: string;
  group: string;
  severity: string;
  description: string;
  tablePattern?: string;
  requiredFields?: string[];
  forbiddenFields?: string[];
  fieldPattern?: string;
  forbiddenFieldPattern?: string;
}

function serializeRule(r: SerializableRule): string {
  const lines = [
    `- id: ${r.id}`,
    `  group: ${r.group}`,
    `  severity: ${r.severity}`,
    `  description: ${r.description}`,
  ];
  if (r.tablePattern) lines.push(`  tablePattern: ${r.tablePattern}`);
  if (r.requiredFields?.length) lines.push(`  requiredFields: [${r.requiredFields.join(", ")}]`);
  if (r.forbiddenFields?.length) lines.push(`  forbiddenFields: [${r.forbiddenFields.join(", ")}]`);
  if (r.fieldPattern) lines.push(`  fieldPattern: ${r.fieldPattern}`);
  if (r.forbiddenFieldPattern) lines.push(`  forbiddenFieldPattern: ${r.forbiddenFieldPattern}`);
  return lines.join("\n");
}

function parseEntryId(entry: string): string | null {
  return entry.match(/^- id:\s*(.+)/m)?.[1]?.trim() ?? null;
}

async function mutateSkillRules(
  filePath: string,
  fn: (entries: string[]) => string[],
): Promise<void> {
  const text = await fs.readFile(filePath, "utf-8");
  const blockMatch = text.match(/(```rules\n)([\s\S]*?)(```)/);
  if (!blockMatch) throw new Error("No rules block found in skill file");
  const rawBlock = blockMatch[2]!;
  const entries = rawBlock.split(/(?=^- id:)/m).map(e => e.trim()).filter(Boolean);
  const updated = fn(entries);
  const newBlock = blockMatch[1] + (updated.length ? updated.join("\n\n") + "\n" : "") + blockMatch[3];
  const newText = text.replace(blockMatch[0], newBlock);
  await fs.writeFile(filePath, newText, "utf-8");
}

// ── serializeRule tests ───────────────────────────────────────────────────────

describe("serializeRule", () => {
  it("serializes a minimal rule", () => {
    const r = serializeRule({
      id: "custom.test",
      group: "semantic",
      severity: "warning",
      description: "A test rule",
      requiredFields: ["lot_id"],
    });
    expect(r).toContain("- id: custom.test");
    expect(r).toContain("  group: semantic");
    expect(r).toContain("  severity: warning");
    expect(r).toContain("  description: A test rule");
    expect(r).toContain("  requiredFields: [lot_id]");
    expect(r).not.toContain("tablePattern");
  });

  it("includes tablePattern when present", () => {
    const r = serializeRule({
      id: "custom.t",
      group: "naming",
      severity: "error",
      description: "desc",
      tablePattern: "lot|wafer",
      forbiddenFields: ["tmp"],
    });
    expect(r).toContain("  tablePattern: lot|wafer");
    expect(r).toContain("  forbiddenFields: [tmp]");
  });

  it("serializes multiple requiredFields", () => {
    const r = serializeRule({
      id: "custom.multi",
      group: "structure",
      severity: "info",
      description: "desc",
      requiredFields: ["id", "created_at", "updated_at"],
    });
    expect(r).toContain("  requiredFields: [id, created_at, updated_at]");
  });

  it("omits empty lists", () => {
    const r = serializeRule({
      id: "custom.empty-lists",
      group: "semantic",
      severity: "warning",
      description: "desc",
      requiredFields: [],
      forbiddenFields: [],
      fieldPattern: "^tmp_",
    });
    expect(r).not.toContain("requiredFields");
    expect(r).not.toContain("forbiddenFields");
    expect(r).toContain("  fieldPattern: ^tmp_");
  });

  it("preserves order: tablePattern → requiredFields → forbiddenFields → fieldPattern → forbiddenFieldPattern", () => {
    const r = serializeRule({
      id: "custom.order",
      group: "semantic",
      severity: "warning",
      description: "desc",
      tablePattern: ".*",
      requiredFields: ["a"],
      forbiddenFields: ["b"],
      fieldPattern: "c",
      forbiddenFieldPattern: "d",
    });
    const lines = r.split("\n");
    const idx = (key: string) => lines.findIndex(l => l.trimStart().startsWith(key));
    expect(idx("tablePattern")).toBeLessThan(idx("requiredFields"));
    expect(idx("requiredFields")).toBeLessThan(idx("forbiddenFields"));
    expect(idx("forbiddenFields")).toBeLessThan(idx("fieldPattern"));
    expect(idx("fieldPattern")).toBeLessThan(idx("forbiddenFieldPattern"));
  });
});

// ── mutateSkillRules tests ────────────────────────────────────────────────────

const TEMPLATE = `---
name: Test Skill
domain: general
tags: []
---

## Rules

\`\`\`rules
- id: custom.existing
  group: semantic
  severity: warning
  description: Existing rule
  requiredFields: [lot_id]
\`\`\`
`;

let tmpDir: string;
let tmpFile: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-test-"));
  tmpFile = path.join(tmpDir, "test.md");
  await fs.writeFile(tmpFile, TEMPLATE, "utf-8");
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("mutateSkillRules — append", () => {
  it("appends a new rule entry", async () => {
    await mutateSkillRules(tmpFile, entries => [
      ...entries,
      serializeRule({ id: "custom.new", group: "naming", severity: "error", description: "New rule", fieldPattern: "^bad_" }),
    ]);
    const text = await fs.readFile(tmpFile, "utf-8");
    expect(text).toContain("- id: custom.new");
    expect(text).toContain("  fieldPattern: ^bad_");
    expect(text).toContain("- id: custom.existing"); // original preserved
  });
});

describe("mutateSkillRules — delete", () => {
  it("removes an existing entry", async () => {
    await mutateSkillRules(tmpFile, entries =>
      entries.filter(e => parseEntryId(e) !== "custom.existing")
    );
    const text = await fs.readFile(tmpFile, "utf-8");
    expect(text).not.toContain("- id: custom.existing");
    expect(text).toContain("```rules");
    expect(text).toContain("```");
  });

  it("leaves an empty rules block when all entries removed", async () => {
    await mutateSkillRules(tmpFile, () => []);
    const text = await fs.readFile(tmpFile, "utf-8");
    expect(text).toContain("```rules\n```");
  });
});

describe("mutateSkillRules — update (replace)", () => {
  it("replaces an entry in place", async () => {
    await mutateSkillRules(tmpFile, entries =>
      entries.map(e => {
        if (parseEntryId(e) !== "custom.existing") return e;
        return serializeRule({
          id: "custom.existing",
          group: "structure",
          severity: "error",
          description: "Updated rule",
          forbiddenFields: ["deprecated_col"],
        });
      })
    );
    const text = await fs.readFile(tmpFile, "utf-8");
    expect(text).toContain("  group: structure");
    expect(text).toContain("  severity: error");
    expect(text).toContain("  description: Updated rule");
    expect(text).toContain("  forbiddenFields: [deprecated_col]");
    expect(text).not.toContain("requiredFields");
  });
});

describe("mutateSkillRules — error handling", () => {
  it("throws when file has no rules block", async () => {
    const noBlock = path.join(tmpDir, "no-block.md");
    await fs.writeFile(noBlock, "---\nname: X\n---\n\nNo rules here.\n", "utf-8");
    await expect(mutateSkillRules(noBlock, e => e)).rejects.toThrow("No rules block");
  });
});

describe("mutateSkillRules — multi-rule file", () => {
  it("handles files with multiple existing rules", async () => {
    const multi = `---
name: Multi
domain: general
tags: []
---

\`\`\`rules
- id: custom.rule-a
  group: naming
  severity: warning
  description: Rule A
  fieldPattern: ^a_

- id: custom.rule-b
  group: semantic
  severity: error
  description: Rule B
  requiredFields: [b_id]

- id: custom.rule-c
  group: structure
  severity: info
  description: Rule C
  forbiddenFields: [c_col]
\`\`\`
`;
    const multiFile = path.join(tmpDir, "multi.md");
    await fs.writeFile(multiFile, multi, "utf-8");

    // Delete rule-b
    await mutateSkillRules(multiFile, entries =>
      entries.filter(e => parseEntryId(e) !== "custom.rule-b")
    );
    const text = await fs.readFile(multiFile, "utf-8");
    expect(text).toContain("- id: custom.rule-a");
    expect(text).not.toContain("- id: custom.rule-b");
    expect(text).toContain("- id: custom.rule-c");
  });
});
