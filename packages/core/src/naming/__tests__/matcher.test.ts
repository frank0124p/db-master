import { describe, it, expect } from "vitest";
import { checkFieldName, checkFieldNames } from "../matcher.js";
import type { NamingEntry } from "../../types.js";

const entries: NamingEntry[] = [
  { id: 1, concept: "Equipment ID", stdName: "equip_id", aliases: ["equipment_id", "equip_no"], domain: "semiconductor", description: null, tags: [], aiDescription: null, updatedAt: "2024-01-01T00:00:00.000Z" },
  { id: 2, concept: "Lot ID", stdName: "lot_id", aliases: ["lot_number", "lot_no"], domain: "semiconductor", description: null, tags: [], aiDescription: null, updatedAt: "2024-01-01T00:00:00.000Z" },
  { id: 3, concept: "Wafer ID", stdName: "wafer_id", aliases: ["wafer_no"], domain: "semiconductor", description: null, tags: [], aiDescription: null, updatedAt: "2024-01-01T00:00:00.000Z" },
  { id: 4, concept: "Measured Value", stdName: "meas_value", aliases: ["measured_value", "measure_val"], domain: "semiconductor", description: null, tags: [], aiDescription: null, updatedAt: "2024-01-01T00:00:00.000Z" },
];

describe("checkFieldName", () => {
  describe("exact match", () => {
    it("returns exact for std_name match", () => {
      const r = checkFieldName("equip_id", entries);
      expect(r.status).toBe("exact");
      expect(r.stdName).toBe("equip_id");
      expect(r.distance).toBe(0);
    });

    it("is case-insensitive for exact match", () => {
      const r = checkFieldName("EQUIP_ID", entries);
      expect(r.status).toBe("exact");
    });

    it("returns exact for lot_id", () => {
      expect(checkFieldName("lot_id", entries).status).toBe("exact");
    });
  });

  describe("alias match", () => {
    it("returns alias for known alias", () => {
      const r = checkFieldName("equipment_id", entries);
      expect(r.status).toBe("alias");
      expect(r.stdName).toBe("equip_id");
      expect(r.matchedAlias).toBe("equipment_id");
    });

    it("returns alias for lot_number", () => {
      const r = checkFieldName("lot_number", entries);
      expect(r.status).toBe("alias");
      expect(r.stdName).toBe("lot_id");
    });

    it("returns alias for wafer_no", () => {
      expect(checkFieldName("wafer_no", entries).status).toBe("alias");
    });
  });

  describe("fuzzy match", () => {
    it("returns fuzzy for close misspelling of std_name", () => {
      const r = checkFieldName("equip_idd", entries);
      expect(r.status).toBe("fuzzy");
      expect(r.stdName).toBe("equip_id");
      expect(r.distance).toBeGreaterThan(0);
      expect(r.distance).toBeLessThanOrEqual(3);
    });

    it("returns fuzzy for lot_idd (distance 1)", () => {
      const r = checkFieldName("lot_idd", entries);
      expect(r.status).toBe("fuzzy");
    });

    it("returns fuzzy for meas_valeu (typo)", () => {
      const r = checkFieldName("meas_valeu", entries);
      expect(r.status).toBe("fuzzy");
      expect(r.stdName).toBe("meas_value");
    });
  });

  describe("unknown", () => {
    it("returns unknown for completely unrelated name", () => {
      const r = checkFieldName("customer_address", entries);
      expect(r.status).toBe("unknown");
      expect(r.stdName).toBeNull();
    });

    it("returns unknown for empty string", () => {
      const r = checkFieldName("", entries);
      expect(r.status).toBe("unknown");
    });

    it("returns unknown with empty entries", () => {
      expect(checkFieldName("equip_id", []).status).toBe("unknown");
    });
  });
});

describe("checkFieldNames", () => {
  it("returns a result per input name", () => {
    const names = ["equip_id", "lot_number", "customer_name"];
    const results = checkFieldNames(names, entries);
    expect(results).toHaveLength(3);
    expect(results[0]!.fieldName).toBe("equip_id");
    expect(results[0]!.result.status).toBe("exact");
    expect(results[1]!.result.status).toBe("alias");
    expect(results[2]!.result.status).toBe("unknown");
  });

  it("returns empty array for empty names", () => {
    expect(checkFieldNames([], entries)).toHaveLength(0);
  });
});
