import { describe, it, expect } from "vitest";
import { levenshtein } from "../levenshtein.js";

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("equip_id", "equip_id")).toBe(0);
  });

  it("returns length of b when a is empty", () => {
    expect(levenshtein("", "abc")).toBe(3);
  });

  it("returns length of a when b is empty", () => {
    expect(levenshtein("abc", "")).toBe(3);
  });

  it("counts single substitution", () => {
    expect(levenshtein("cat", "bat")).toBe(1);
  });

  it("counts single insertion", () => {
    expect(levenshtein("lot_id", "lots_id")).toBe(1);
  });

  it("counts single deletion", () => {
    expect(levenshtein("wafer_id", "wafer_d")).toBe(1);
  });

  it("handles transposition as 2 ops", () => {
    expect(levenshtein("ab", "ba")).toBe(2);
  });

  it("equip_id vs equip_no is 2 (two substitutions)", () => {
    expect(levenshtein("equip_id", "equip_no")).toBe(2);
  });
});
