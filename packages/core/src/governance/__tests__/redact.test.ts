import { describe, it, expect } from "vitest";
import { redactGraphNodes } from "../redact.js";
import type { GraphNode } from "../../graph/types.js";
import type { RedactPolicy } from "../redact.js";

function makeNode(ref: string, sensitivity?: GraphNode["meta"]["sensitivity"], definition?: string): GraphNode {
  const meta: GraphNode["meta"] = { dataType: "VARCHAR(64)" };
  if (sensitivity !== undefined) meta.sensitivity = sensitivity;
  if (definition !== undefined) meta.definition = definition;
  return { ref, kind: "field", label: ref, meta };
}

const maskPolicy: RedactPolicy = {
  enabled: true,
  hideLevels: ["pii"],
  mode: "mask-definition",
};

const excludePolicy: RedactPolicy = {
  enabled: true,
  hideLevels: ["pii", "confidential"],
  mode: "exclude",
};

const disabledPolicy: RedactPolicy = {
  enabled: false,
  hideLevels: ["pii"],
  mode: "mask-definition",
};

describe("redactGraphNodes", () => {
  it("returns nodes unchanged when policy is disabled", () => {
    const nodes = [
      makeNode("fld:schema.t.name", "pii", "Employee full name"),
    ];
    const result = redactGraphNodes(nodes, disabledPolicy);
    expect(result).toHaveLength(1);
    expect(result[0]?.meta.definition).toBe("Employee full name");
    expect(result[0]?.meta.sensitivity).toBe("pii");
  });

  it("mask-definition: replaces definition of pii node with redact marker", () => {
    const nodes = [
      makeNode("fld:schema.t.customer_name", "pii", "Customer full name"),
      makeNode("fld:schema.t.order_id", "internal", "Order identifier"),
    ];
    const result = redactGraphNodes(nodes, maskPolicy);
    expect(result).toHaveLength(2);

    const piiNode = result.find(n => n.ref === "fld:schema.t.customer_name");
    const internalNode = result.find(n => n.ref === "fld:schema.t.order_id");

    expect(piiNode?.meta.definition).toBe("🔒 [redacted]");
    // ref/label/kind are preserved
    expect(piiNode?.ref).toBe("fld:schema.t.customer_name");
    expect(piiNode?.kind).toBe("field");
    // sensitivity itself is still in meta (for UI badge display)
    expect(piiNode?.meta.sensitivity).toBe("pii");

    // non-pii node is untouched
    expect(internalNode?.meta.definition).toBe("Order identifier");
  });

  it("mask-definition: does not touch nodes with no sensitivity", () => {
    const nodes = [
      makeNode("fld:schema.t.quantity", undefined, "Quantity of items"),
    ];
    const result = redactGraphNodes(nodes, maskPolicy);
    expect(result[0]?.meta.definition).toBe("Quantity of items");
  });

  it("exclude: removes nodes matching hideLevels", () => {
    const nodes = [
      makeNode("fld:schema.t.customer_name", "pii", "Customer name"),
      makeNode("fld:schema.t.notes", "confidential", "Notes"),
      makeNode("fld:schema.t.order_id", "internal", "Order id"),
      makeNode("fld:schema.t.quantity", undefined, "Quantity"),
    ];
    const result = redactGraphNodes(nodes, excludePolicy);
    expect(result).toHaveLength(2);
    const refs = result.map(n => n.ref);
    expect(refs).not.toContain("fld:schema.t.customer_name");
    expect(refs).not.toContain("fld:schema.t.notes");
    expect(refs).toContain("fld:schema.t.order_id");
    expect(refs).toContain("fld:schema.t.quantity");
  });

  it("exclude: keeps all nodes when hideLevels is empty", () => {
    const policy: RedactPolicy = { enabled: true, hideLevels: [], mode: "exclude" };
    const nodes = [
      makeNode("fld:schema.t.customer_name", "pii", "Customer name"),
    ];
    const result = redactGraphNodes(nodes, policy);
    expect(result).toHaveLength(1);
  });

  it("mask-definition: only masks nodes in hideLevels, not public nodes", () => {
    const nodes = [
      makeNode("fld:schema.t.pub_data", "public", "Public data field"),
      makeNode("fld:schema.t.phone", "pii", "Phone number"),
    ];
    const result = redactGraphNodes(nodes, maskPolicy);
    const pubNode = result.find(n => n.ref === "fld:schema.t.pub_data");
    const phoneNode = result.find(n => n.ref === "fld:schema.t.phone");
    expect(pubNode?.meta.definition).toBe("Public data field");
    expect(phoneNode?.meta.definition).toBe("🔒 [redacted]");
  });
});
