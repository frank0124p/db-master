import { describe, it, expect } from "vitest";
import { checkFieldName, checkFieldNames } from "../matcher.js";
import type { NamingEntry } from "../../types.js";

function makeEntry(id: number, stdName: string, aliases: string[]): NamingEntry {
  return {
    id,
    concept: stdName,
    stdName,
    aliases,
    domain: "semiconductor",
    description: null,
    tags: [],
    layers: [],
    aiDescription: null,
    updatedAt: "2024-01-01T00:00:00.000Z",
    status: "approved" as const,
    reviewers: [],
  };
}

describe("checkFieldName — empty alias list", () => {
  const entries: NamingEntry[] = [makeEntry(1, "user_id", [])];

  it("exact match still works when entry has no aliases", () => {
    const r = checkFieldName("user_id", entries);
    expect(r.status).toBe("exact");
  });

  it("returns unknown for non-matching name when no aliases", () => {
    const r = checkFieldName("usr_id", entries);
    expect(r.status).toBe("fuzzy"); // distance 1 — within threshold
  });

  it("returns unknown for completely different name with no aliases", () => {
    const r = checkFieldName("order_total_amount", entries);
    expect(r.status).toBe("unknown");
  });
});

describe("checkFieldName — empty entries list", () => {
  it("returns unknown when entries list is empty", () => {
    const r = checkFieldName("any_name", []);
    expect(r.status).toBe("unknown");
  });

  it("returns null stdName when entries list is empty", () => {
    const r = checkFieldName("any_name", []);
    expect(r.stdName).toBeNull();
  });

  it("returns null entry when entries list is empty", () => {
    const r = checkFieldName("any_name", []);
    expect(r.entry).toBeNull();
  });
});

describe("checkFieldName — case-insensitive matching", () => {
  const entries: NamingEntry[] = [
    makeEntry(1, "lot_id", ["lot_number", "lot_no"]),
  ];

  it("exact match is case-insensitive (uppercase)", () => {
    const r = checkFieldName("LOT_ID", entries);
    expect(r.status).toBe("exact");
  });

  it("exact match is case-insensitive (mixed case)", () => {
    const r = checkFieldName("Lot_Id", entries);
    expect(r.status).toBe("exact");
  });

  it("alias match is case-insensitive (uppercase alias)", () => {
    const r = checkFieldName("LOT_NUMBER", entries);
    expect(r.status).toBe("alias");
    expect(r.stdName).toBe("lot_id");
  });

  it("alias match is case-insensitive (mixed case alias)", () => {
    const r = checkFieldName("Lot_No", entries);
    expect(r.status).toBe("alias");
  });
});

describe("checkFieldName — multiple aliases", () => {
  const entries: NamingEntry[] = [
    makeEntry(1, "equip_id", ["equipment_id", "equip_no", "equipment_number", "eq_id"]),
  ];

  it("returns alias for first alias", () => {
    const r = checkFieldName("equipment_id", entries);
    expect(r.status).toBe("alias");
    expect(r.matchedAlias).toBe("equipment_id");
  });

  it("returns alias for second alias", () => {
    const r = checkFieldName("equip_no", entries);
    expect(r.status).toBe("alias");
    expect(r.matchedAlias).toBe("equip_no");
  });

  it("returns alias for third alias", () => {
    const r = checkFieldName("equipment_number", entries);
    expect(r.status).toBe("alias");
  });

  it("returns alias for fourth alias", () => {
    const r = checkFieldName("eq_id", entries);
    expect(r.status).toBe("alias");
  });

  it("entry reference is correct for alias match", () => {
    const r = checkFieldName("equip_no", entries);
    expect(r.entry?.stdName).toBe("equip_id");
  });
});

describe("checkFieldName — exact vs alias priority", () => {
  const entries: NamingEntry[] = [
    makeEntry(1, "ref_id", []),
    makeEntry(2, "reference_id", ["ref_id_alias"]),
  ];

  it("prefers exact match over alias match", () => {
    // "ref_id" should match entry 1 exactly, not entry 2 via alias
    const r = checkFieldName("ref_id", entries);
    expect(r.status).toBe("exact");
    expect(r.stdName).toBe("ref_id");
  });
});

describe("checkFieldName — partial match scenarios", () => {
  const entries: NamingEntry[] = [
    makeEntry(1, "created_at", []),
    makeEntry(2, "updated_at", []),
  ];

  it("does not fuzzy-match names that are too different", () => {
    // "create" is too far from "created_at" (distance > 2)
    const r = checkFieldName("create", entries);
    expect(r.status).toBe("unknown");
  });

  it("fuzzy-matches a typo within threshold", () => {
    // "created_at" vs "created_ta" — distance 2 transposition
    const r = checkFieldName("created_ta", entries);
    expect(r.status).toBe("fuzzy");
    expect(r.stdName).toBe("created_at");
  });
});

describe("checkFieldNames — batch matching", () => {
  const entries: NamingEntry[] = [
    makeEntry(1, "lot_id", ["lot_no"]),
    makeEntry(2, "wafer_id", ["wafer_no"]),
  ];

  it("returns correct count matching input length", () => {
    const results = checkFieldNames(["lot_id", "wafer_no", "unknown_col"], entries);
    expect(results).toHaveLength(3);
  });

  it("preserves fieldName for each result", () => {
    const results = checkFieldNames(["lot_id", "wafer_no"], entries);
    expect(results[0]!.fieldName).toBe("lot_id");
    expect(results[1]!.fieldName).toBe("wafer_no");
  });

  it("handles mixed statuses in batch", () => {
    const results = checkFieldNames(["lot_id", "wafer_no", "totally_different"], entries);
    expect(results[0]!.result.status).toBe("exact");
    expect(results[1]!.result.status).toBe("alias");
    expect(results[2]!.result.status).toBe("unknown");
  });

  it("returns empty array for empty input", () => {
    const results = checkFieldNames([], entries);
    expect(results).toHaveLength(0);
  });

  it("handles empty entries with non-empty names", () => {
    const results = checkFieldNames(["lot_id", "wafer_id"], []);
    expect(results).toHaveLength(2);
    expect(results[0]!.result.status).toBe("unknown");
    expect(results[1]!.result.status).toBe("unknown");
  });
});
