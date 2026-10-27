import { describe, expect, it } from "vitest";
import {
  bestMix, draftToCell, entryCompare, formatNumber, formatRand, isSuspiciouslyLow, joinList, lowestOfRow, parseDraftPrice, percentOver,
  pickInsights, pickLowestPatch, pickSummary, pickSupplierPatch, quoteLineToCell, sanitizePriceInput, shortSupplierName, supplierStats, togglePickPatch,
  type PickRow, type PriceCell,
} from "@/components/quote-compare/compare-model";

const NBSP = " ";
const p = (unit: number): PriceCell => ({ kind: "price", unit });
const NA: PriceCell = { kind: "na" };
const NONE: PriceCell = { kind: "none" };

// The ten-line, five-supplier example the redesign was drawn from.
const SUPPLIERS = ["q1", "q2", "q3", "q4", "q5"];
const raw: [string, number, (number | "na" | null)[]][] = [
  ["4695312", 6, [1508.97, 1189.0, 1031.29, "na", 218]],
  ["5P0597", 1, [158.1, 4210.5, 4535.05, 21.02, 22]],
  ["2132410", 1, [741.65, 455.0, 441.94, 421.61, 280]],
  ["2400041", 1, [2498.82, null, "na", 1005.19, 432]],
  ["9F4446", 1, [156.39, 98.75, 104.94, 8.53, 6]],
  ["2646156", 12, [773.42, null, "na", "na", 249]],
  ["5474475", 1, [13288.46, null, "na", "na", "na"]],
  ["1632459", 6, [130.24, null, "na", "na", "na"]],
  ["1R0749", 1, [643.16, 305.2, 318.59, 203.57, "na"]],
  ["1375541", 1, [3960.22, 265.9, 279.54, 481.46, 230]],
];
const rows: PickRow[] = raw.map(([id, qty, cells]) => ({ id, qty, cells: cells.map((c) => (typeof c === "number" ? p(c) : c === "na" ? NA : NONE)) }));
const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(0.005);

describe("formatting and parsing", () => {
  it("formats rand the South African way", () => {
    expect(formatNumber(1508.97)).toBe(`1${NBSP}508,97`);
    expect(formatNumber(6)).toBe("6,00");
    expect(formatNumber(1234567.5)).toBe(`1${NBSP}234${NBSP}567,50`);
    expect(formatRand(21.02)).toBe(`R${NBSP}21,02`);
    expect(formatRand(0)).toBe(`R${NBSP}0,00`);
  });

  it("reads typed prices with a comma or a point and rejects junk", () => {
    expect(parseDraftPrice("12,5")).toBe(12.5);
    expect(parseDraftPrice("1 508,97")).toBe(1508.97);
    expect(parseDraftPrice("0")).toBe(0);
    expect(parseDraftPrice("")).toBeNull();
    expect(parseDraftPrice("abc")).toBeNull();
    expect(parseDraftPrice("-3")).toBeNull();
  });

  it("keeps the price box to digits and one decimal point", () => {
    expect(sanitizePriceInput("12,5")).toBe("12.5");
    expect(sanitizePriceInput("R 1 508,97")).toBe("1508.97");
    expect(sanitizePriceInput("1.2.3")).toBe("1.23");
    expect(sanitizePriceInput("12,")).toBe("12.");
    expect(sanitizePriceInput("abc")).toBe("");
  });

  it("turns drafts and saved quote lines into cells", () => {
    expect(draftToCell(undefined)).toEqual(NONE);
    expect(draftToCell({ unitPrice: "", available: true })).toEqual(NONE);
    expect(draftToCell({ unitPrice: "10.5", available: true })).toEqual(p(10.5));
    expect(draftToCell({ unitPrice: "10.5", available: false })).toEqual(NA);
    expect(quoteLineToCell(undefined)).toEqual(NONE);
    expect(quoteLineToCell({ available: false, unitPrice: "5" })).toEqual(NA);
    expect(quoteLineToCell({ available: true, unitPrice: null })).toEqual(NONE);
    expect(quoteLineToCell({ available: true, unitPrice: "1031.29" })).toEqual(p(1031.29));
    expect(quoteLineToCell({ unitPrice: "oops" })).toEqual(NONE);
  });
});

describe("row comparisons", () => {
  it("finds the lowest price and its ties", () => {
    expect(lowestOfRow([p(5), NA, p(3), p(3), NONE])).toEqual({ min: 3, indexes: [2, 3] });
    expect(lowestOfRow([NA, NONE])).toBeNull();
  });

  it("compares a supplier with the others on the line", () => {
    expect(entryCompare([p(10), p(12)], 0)).toEqual({ kind: "best", otherIndex: 1, otherUnit: 12 });
    expect(entryCompare([p(10), p(10)], 1)).toEqual({ kind: "best", otherIndex: 0, otherUnit: 10 });
    expect(entryCompare([p(10), NA], 0)).toEqual({ kind: "best", otherIndex: null, otherUnit: null });
    expect(entryCompare([p(15), p(10), p(12)], 0)).toEqual({ kind: "behind", percent: 50, bestIndex: 1, bestUnit: 10 });
    expect(entryCompare([NA, p(1)], 0)).toEqual({ kind: "na" });
    expect(entryCompare([NONE, p(1)], 0)).toEqual({ kind: "none" });
    expect(entryCompare([p(5), p(0)], 0)).toEqual({ kind: "behind", percent: null, bestIndex: 1, bestUnit: 0 });
  });

  it("works out percentages over the lowest", () => {
    expect(percentOver(1189, 1031.29)).toBe(15);
    expect(percentOver(5, 0)).toBeNull();
  });

  it("flags a lowest price far below the rest, but only with three quotes", () => {
    expect(isSuspiciouslyLow(rows[1].cells, 3)).toBe(true); // 5P0597 at 21,02
    expect(isSuspiciouslyLow(rows[4].cells, 4)).toBe(true); // 9F4446 at 6,00
    expect(isSuspiciouslyLow(rows[2].cells, 3)).toBe(false); // a normal lowest price
    expect(isSuspiciouslyLow(rows[1].cells, 0)).toBe(false); // not the lowest
    expect(isSuspiciouslyLow([p(1), p(500)], 0)).toBe(false); // only two quotes
  });
});

describe("supplier totals and the best mix", () => {
  const stats = supplierStats(rows, 5);

  it("totals each supplier's priced lines", () => {
    near(stats[0].total, 40563.1);
    near(stats[1].total, 12469.35);
    near(stats[2].total, 11867.8);
    near(stats[3].total, 2141.38);
    near(stats[4].total, 5266);
  });

  it("counts priced, answered and lowest-on lines", () => {
    expect(stats.map((s) => s.priced)).toEqual([10, 6, 6, 6, 7]);
    expect(stats.map((s) => s.answered)).toEqual([10, 6, 10, 10, 10]);
    expect(stats.map((s) => s.lowestOn)).toEqual([0, 0, 0, 2, 6]);
  });

  it("does not count a single quote as the lowest", () => {
    const only = supplierStats([{ qty: 1, cells: [p(5), NA] }], 2);
    expect(only[0].lowestOn).toBe(0);
  });

  it("buys every line from the cheapest supplier", () => {
    const mix = bestMix(rows);
    near(mix.total, 19538.49);
    expect(mix.pricedLines).toBe(10);
    expect(mix.supplierCount).toBe(3);
    expect(bestMix([{ qty: 1, cells: [NA, NONE] }])).toEqual({ total: 0, pricedLines: 0, supplierCount: 0 });
  });
});

describe("choosing suppliers", () => {
  it("toggles a single pick", () => {
    expect(togglePickPatch(null, "a", "q1")).toEqual({ a: "q1" });
    expect(togglePickPatch("q2", "a", "q1")).toEqual({ a: "q1" });
    expect(togglePickPatch("q1", "a", "q1")).toEqual({ a: null });
  });

  it("picks every line a supplier priced, then clears them", () => {
    const first = pickSupplierPatch(rows, 4, SUPPLIERS, {});
    expect(Object.keys(first)).toHaveLength(7);
    expect(first["5474475"]).toBeUndefined(); // Blumaq gave N/A there
    expect(first["4695312"]).toBe("q5");
    const cleared = pickSupplierPatch(rows, 4, SUPPLIERS, first);
    expect(Object.values(cleared).every((v) => v === null)).toBe(true);
    expect(pickSupplierPatch([{ id: "x", qty: 1, cells: [NA] }], 0, ["q1"], {})).toEqual({});
  });

  it("picks the lowest on every priced line, first supplier winning ties", () => {
    const patch = pickLowestPatch(rows, SUPPLIERS);
    expect(patch["4695312"]).toBe("q5");
    expect(patch["5474475"]).toBe("q1");
    expect(patch["9F4446"]).toBe("q5");
    expect(pickLowestPatch([{ id: "t", qty: 1, cells: [p(2), p(2)] }], ["a", "b"])).toEqual({ t: "a" });
    expect(pickLowestPatch([{ id: "n", qty: 1, cells: [NA, NONE] }], ["a", "b"])).toEqual({});
  });

  it("summarises the lowest on every line against the one supplier that priced everything", () => {
    const lowest = pickLowestPatch(rows, SUPPLIERS);
    const picks = rows.map((r) => SUPPLIERS.indexOf(lowest[r.id] as string));
    const s = pickSummary(rows, picks);
    near(s.total, 19538.49);
    expect(s.pickedLines).toBe(10);
    expect(s.baseline?.index).toBe(0);
    near(s.baseline!.total, 40563.1);
    near(s.saving!, 21024.61);
    expect(s.savingPercent).toBe(52);
    expect(s.allocation.reduce((n, a) => n + a.lines, 0)).toBe(10);
    expect(s.allocation[0].amount).toBeGreaterThanOrEqual(s.allocation[1].amount);
  });

  it("follows a manual override and skips the saving until every line is chosen", () => {
    const lowest = pickLowestPatch(rows, SUPPLIERS);
    const picks: (number | null)[] = rows.map((r) => SUPPLIERS.indexOf(lowest[r.id] as string));
    picks[4] = 2; // 9F4446 from the third supplier instead of the R 6,00
    near(pickSummary(rows, picks).total, 19637.43);
    picks[0] = null;
    const partial = pickSummary(rows, picks);
    expect(partial.pickedLines).toBe(9);
    expect(partial.saving).toBeNull();
    expect(partial.savingPercent).toBeNull();
  });

  it("ignores a pick that points at a cell with no price", () => {
    const s = pickSummary([{ id: "a", qty: 2, cells: [NA, p(5)] }], [0]);
    expect(s.pickedLines).toBe(0);
    expect(s.total).toBe(0);
  });

  it("has no baseline when nobody priced every line", () => {
    const s = pickSummary([{ id: "a", qty: 1, cells: [p(1), NA] }, { id: "b", qty: 1, cells: [NA, p(2)] }], [0, 1]);
    expect(s.baseline).toBeNull();
    expect(s.saving).toBeNull();
    expect(s.total).toBe(3);
  });

  it("finds single-quote and too-good-to-be-true lines", () => {
    const { singleQuote, lowToConfirm } = pickInsights(rows);
    expect(singleQuote.map((i) => rows[i].id)).toEqual(["5474475", "1632459"]);
    expect(lowToConfirm.map((i) => rows[i].id)).toEqual(["5P0597", "9F4446"]);
  });
});

describe("joinList", () => {
  it("reads naturally", () => {
    expect(joinList([])).toBe("");
    expect(joinList(["A"])).toBe("A");
    expect(joinList(["A", "B"])).toBe("A and B");
    expect(joinList(["A", "B", "C"])).toBe("A, B and C");
    expect(joinList(["A", "B", "C", "D", "E"])).toBe("A, B, C and 2 more");
  });
});

describe("shortSupplierName", () => {
  it("drops legal suffixes only", () => {
    expect(shortSupplierName("Diesel Parts Direct (Pty) Ltd")).toBe("Diesel Parts Direct");
    expect(shortSupplierName("Blumaq South Africa (Pty) Ltd")).toBe("Blumaq South Africa");
    expect(shortSupplierName("Barloworld")).toBe("Barloworld");
    expect(shortSupplierName("Acme Pty Ltd")).toBe("Acme");
    expect(shortSupplierName("Tractor & Grader Supplies")).toBe("Tractor & Grader Supplies");
    expect(shortSupplierName("Ltd")).toBe("Ltd");
  });
});
