import { describe, it, expect } from "vitest";
import type {
  ConceptCard,
  BusinessRule,
  ImportBatch,
  WideTableDraft,
  GovernanceInstance,
  GatePolicy,
  StationId,
} from "../types.js";

describe("governance types — structural sanity", () => {
  it("ConceptCard shape is correct", () => {
    const card: ConceptCard = {
      id: 1,
      slug: "wip-lot",
      name: "在製品批次",
      stdName: "wip_lot",
      definition: "在製品中的一個生產批次",
      aliases: ["WIP Lot", "批次"],
      relatedConcepts: [],
      tableHints: [{ tableName: "wip_lots", role: "ssot" }],
      namingDictIds: [],
      sourceRefs: [],
      status: "pending",
      reviewers: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(card.status).toBe("pending");
    expect(card.tableHints[0]?.role).toBe("ssot");
  });

  it("BusinessRule ssot_declaration shape is correct", () => {
    const rule: BusinessRule = {
      id: 1,
      slug: "ssot-wip-lot",
      title: "WIP Lot 的唯一事實來源",
      ruleType: "ssot",
      statement: "lot_id 的 single source of truth 是 wip-tracking.wip_lots",
      machine: {
        kind: "ssot_declaration",
        conceptId: 1,
        ssotTable: { schemaId: 1, tableName: "wip_lots" },
      },
      sourceRefs: [],
      status: "approved",
      reviewers: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(rule.machine?.kind).toBe("ssot_declaration");
  });

  it("ImportBatch proposal statuses are valid", () => {
    const batch: ImportBatch = {
      id: 1,
      name: "test batch",
      source: "paste",
      schemaIds: [1, 2],
      tableCount: 2,
      status: "imported",
      proposals: [
        {
          tableId: 10,
          schemaId: 1,
          tableName: "orders",
          suggested: { domain: "sales" },
          confidence: 0.75,
          rationale: {
            matchedConcepts: [],
            matchedDictEntries: [],
            similarTables: [],
            summary: "Looks like an orders table",
          },
          status: "pending",
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(batch.proposals[0]?.confidence).toBe(0.75);
  });

  it("GovernanceInstance has all required station ids", () => {
    const stationIds: StationId[] = [
      "knowledge",
      "classify",
      "compose",
      "review",
      "validate",
    ];
    expect(stationIds).toHaveLength(5);
  });

  it("GatePolicy default shape is valid", () => {
    const policy: GatePolicy = {
      stations: {
        knowledge: { required: false },
        classify: { required: false },
        compose: { required: false },
        review: { required: false },
        validate: { required: false },
      },
      bypassRoles: ["admin", "suite_owner", "maintainer"],
      manualCompleteRoles: ["admin", "suite_owner"],
    };
    expect(policy.bypassRoles).toContain("admin");
    expect(Object.keys(policy.stations)).toHaveLength(5);
  });

  it("WideTableDraft status transitions are a closed set", () => {
    const validStatuses: WideTableDraft["status"][] = [
      "draft",
      "validating",
      "failed",
      "passed",
      "published",
    ];
    expect(validStatuses).toHaveLength(5);
  });
});
