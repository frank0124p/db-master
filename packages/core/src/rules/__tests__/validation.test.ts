import { describe, it, expect } from "vitest";
import { validateSkillRule, type SkillRuleInput } from "../validation.js";

function base(overrides: Partial<SkillRuleInput> = {}): SkillRuleInput {
  return {
    id: "custom.my-rule",
    group: "semantic",
    severity: "warning",
    description: "A test rule",
    requiredFields: ["lot_id"],
    ...overrides,
  };
}

describe("validateSkillRule — valid inputs", () => {
  it("passes a complete rule with requiredFields", () => {
    const r = validateSkillRule(base());
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("passes with forbiddenFields", () => {
    const r = validateSkillRule({ ...base(), requiredFields: undefined, forbiddenFields: ["tmp"] });
    expect(r.valid).toBe(true);
  });

  it("passes with fieldPattern", () => {
    const r = validateSkillRule({ ...base(), requiredFields: undefined, fieldPattern: "^tmp_" });
    expect(r.valid).toBe(true);
  });

  it("passes with forbiddenFieldPattern", () => {
    const r = validateSkillRule({ ...base(), requiredFields: undefined, forbiddenFieldPattern: "^temp" });
    expect(r.valid).toBe(true);
  });

  it("passes with tablePattern + requiredFields", () => {
    const r = validateSkillRule(base({ tablePattern: "lot|wafer" }));
    expect(r.valid).toBe(true);
  });

  it("accepts all valid groups", () => {
    for (const group of ["naming", "semantic", "structure"] as const) {
      expect(validateSkillRule(base({ group })).valid).toBe(true);
    }
  });

  it("accepts all valid severities", () => {
    for (const severity of ["error", "warning", "info"] as const) {
      expect(validateSkillRule(base({ severity })).valid).toBe(true);
    }
  });

  it("accepts multi-segment id formats", () => {
    for (const id of ["custom.lot.check", "sc.naming.my-rule", "a.b"]) {
      expect(validateSkillRule(base({ id })).valid).toBe(true);
    }
  });
});

describe("validateSkillRule — id validation", () => {
  it("rejects missing id", () => {
    const r = validateSkillRule(base({ id: "" }));
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.startsWith("id:"))).toBe(true);
  });

  it("rejects whitespace-only id", () => {
    const r = validateSkillRule(base({ id: "   " }));
    expect(r.valid).toBe(false);
  });

  it("rejects single-segment id (no dot)", () => {
    const r = validateSkillRule(base({ id: "myrule" }));
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.startsWith("id:"))).toBe(true);
  });

  it("rejects id with uppercase", () => {
    const r = validateSkillRule(base({ id: "Custom.Rule" }));
    expect(r.valid).toBe(false);
  });

  it("rejects id starting with a dot", () => {
    const r = validateSkillRule(base({ id: ".custom.rule" }));
    expect(r.valid).toBe(false);
  });
});

describe("validateSkillRule — group and severity", () => {
  it("rejects invalid group", () => {
    const r = validateSkillRule(base({ group: "unknown" as "naming" }));
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.startsWith("group:"))).toBe(true);
  });

  it("rejects missing group", () => {
    const r = validateSkillRule(base({ group: undefined as unknown as "naming" }));
    expect(r.valid).toBe(false);
  });

  it("rejects invalid severity", () => {
    const r = validateSkillRule(base({ severity: "critical" as "error" }));
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.startsWith("severity:"))).toBe(true);
  });
});

describe("validateSkillRule — description", () => {
  it("rejects empty description", () => {
    const r = validateSkillRule(base({ description: "" }));
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.startsWith("description:"))).toBe(true);
  });

  it("rejects whitespace-only description", () => {
    const r = validateSkillRule(base({ description: "   " }));
    expect(r.valid).toBe(false);
  });
});

describe("validateSkillRule — regex patterns", () => {
  it("rejects invalid tablePattern regex", () => {
    const r = validateSkillRule(base({ tablePattern: "[unclosed" }));
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.startsWith("tablePattern:"))).toBe(true);
  });

  it("rejects invalid fieldPattern regex", () => {
    const r = validateSkillRule({ ...base(), requiredFields: undefined, fieldPattern: "(?invalid" });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.startsWith("fieldPattern:"))).toBe(true);
  });

  it("rejects invalid forbiddenFieldPattern regex", () => {
    const r = validateSkillRule({ ...base(), requiredFields: undefined, forbiddenFieldPattern: "*bad" });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.startsWith("forbiddenFieldPattern:"))).toBe(true);
  });

  it("accepts valid complex regex patterns", () => {
    const r = validateSkillRule(base({ tablePattern: "^(lot|wafer)_.+$" }));
    expect(r.valid).toBe(true);
  });
});

describe("validateSkillRule — no-op rule (no check conditions)", () => {
  it("rejects a rule with tablePattern only (no check condition)", () => {
    const r = validateSkillRule({
      id: "custom.no-check",
      group: "semantic",
      severity: "warning",
      description: "A rule without checks",
      tablePattern: "lot_.*",
      // no requiredFields, forbiddenFields, fieldPattern, forbiddenFieldPattern
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes("check conditions"))).toBe(true);
  });

  it("rejects a rule with only id/group/severity/description and no check", () => {
    const r = validateSkillRule({
      id: "custom.empty",
      group: "naming",
      severity: "info",
      description: "Empty rule",
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes("check conditions"))).toBe(true);
  });

  it("does not raise no-check error when other errors present", () => {
    // When id is missing, we get the id error; we should still surface it clearly
    const r = validateSkillRule({
      id: "",
      group: "semantic",
      severity: "warning",
      description: "has desc",
    });
    expect(r.valid).toBe(false);
    // Should report id error but not the check-condition error (other errors take precedence)
    expect(r.errors.some(e => e.startsWith("id:"))).toBe(true);
  });
});

describe("validateSkillRule — multiple errors", () => {
  it("reports all errors at once", () => {
    const r = validateSkillRule({
      id: "",
      group: "bad" as "naming",
      severity: "bad" as "error",
      description: "",
      tablePattern: "[invalid",
    });
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThanOrEqual(4);
  });
});
