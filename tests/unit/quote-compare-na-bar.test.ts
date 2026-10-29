import { describe, expect, it } from "vitest";
import { naBarCounts, type PriceCell } from "@/components/quote-compare/compare-model";

const p = (unit: number): PriceCell => ({ kind: "price", unit });
const NA: PriceCell = { kind: "na" };
const NONE: PriceCell = { kind: "none" };

describe("naBarCounts", () => {
  it("counts every line as blank when the supplier has not been priced", () => {
    expect(naBarCounts([NONE, NONE, NONE])).toEqual({ blank: 3, na: 0, priced: 0 });
  });

  it("splits blank, N/A and priced lines", () => {
    expect(naBarCounts([p(10), NA, NONE, NA, p(5)])).toEqual({ blank: 1, na: 2, priced: 2 });
  });

  it("handles an empty list", () => {
    expect(naBarCounts([])).toEqual({ blank: 0, na: 0, priced: 0 });
  });

  it("reports nothing left to mark once every line is N/A", () => {
    expect(naBarCounts([NA, NA])).toEqual({ blank: 0, na: 2, priced: 0 });
  });
});
