import { describe, expect, it } from "vitest";
import { isHeaderRow, parsePartsPaste, parseQuantity } from "@/lib/jobs/parts-paste";

// 2026-10-27, user request: parts are added to a job by typing or pasting only, so a pasted list has to be read
// whatever way it was written, with no need to check spreadsheet columns or headings first.
const one = (line: string) => parsePartsPaste(line).rows[0];

describe("parseQuantity", () => {
  it("reads the ways a quantity is written", () => {
    expect(parseQuantity("2")).toBe(2);
    expect(parseQuantity("2.5")).toBe(2.5);
    expect(parseQuantity("2,5")).toBe(2.5);
    expect(parseQuantity("x2")).toBe(2);
    expect(parseQuantity("2x")).toBe(2);
    expect(parseQuantity("2 pcs")).toBe(2);
    expect(parseQuantity("qty 4")).toBe(4);
    expect(parseQuantity("12 off")).toBe(12);
  });

  it("says null for words and 0 for an unusable number", () => {
    expect(parseQuantity("Hydraulic")).toBeNull();
    expect(parseQuantity("100mm")).toBeNull();
    expect(parseQuantity("")).toBeNull();
    expect(parseQuantity("0")).toBe(0);
    expect(parseQuantity("-3")).toBe(0);
  });
});

describe("parsePartsPaste", () => {
  it("reads comma lines: part number, quantity, description", () => {
    expect(one("PN-1001, 2, Hydraulic seal kit")).toEqual({ partNumber: "PN-1001", quantity: 2, description: "Hydraulic seal kit" });
    expect(one("PN-2044,4,")).toEqual({ partNumber: "PN-2044", quantity: 4, description: null });
    expect(one("PN-2044, 4")).toEqual({ partNumber: "PN-2044", quantity: 4, description: null });
  });

  it("keeps commas inside a description", () => {
    expect(one("PN-1001, 2, Seal kit, large")).toEqual({ partNumber: "PN-1001", quantity: 2, description: "Seal kit, large" });
  });

  it("reads tab lines pasted from Excel, with quotes and extra columns", () => {
    expect(one("1512939\t7\tMAIN BEARING STD.")).toEqual({ partNumber: "1512939", quantity: 7, description: "MAIN BEARING STD." });
    expect(one('"9Y0810"\t"1"\t"BUSHING"')).toEqual({ partNumber: "9Y0810", quantity: 1, description: "BUSHING" });
    expect(one("1512939\t7.000\tBEARING\tR224.00")).toEqual({ partNumber: "1512939", quantity: 7, description: "BEARING, R224.00" });
  });

  it("reads semicolon and pipe lines", () => {
    expect(one("PN-1;3;Seal")).toEqual({ partNumber: "PN-1", quantity: 3, description: "Seal" });
    expect(one("PN-1 | 3 | Seal")).toEqual({ partNumber: "PN-1", quantity: 3, description: "Seal" });
  });

  it("reads plain space lines and the ways people type a quantity", () => {
    expect(one("PN-1001 2 Hydraulic seal kit")).toEqual({ partNumber: "PN-1001", quantity: 2, description: "Hydraulic seal kit" });
    expect(one("1077694 7")).toEqual({ partNumber: "1077694", quantity: 7, description: null });
    expect(one("PN-1001 x2")).toEqual({ partNumber: "PN-1001", quantity: 2, description: null });
    expect(one("PN-1001 x 2")).toEqual({ partNumber: "PN-1001", quantity: 2, description: null });
    expect(one("PN-1001 - 2")).toEqual({ partNumber: "PN-1001", quantity: 2, description: null });
    expect(one("PN-1001 2 pcs")).toEqual({ partNumber: "PN-1001", quantity: 2, description: null });
    expect(one("PN-1001 2 pcs seal kit")).toEqual({ partNumber: "PN-1001", quantity: 2, description: "seal kit" });
    expect(one("PN-1001 Hydraulic seal kit x2")).toEqual({ partNumber: "PN-1001", quantity: 2, description: "Hydraulic seal kit" });
  });

  it("treats a missing quantity as 1, and does not mistake a size for a quantity", () => {
    expect(one("PN-1001")).toEqual({ partNumber: "PN-1001", quantity: 1, description: null });
    expect(one("PN-1001, Hydraulic seal kit")).toEqual({ partNumber: "PN-1001", quantity: 1, description: "Hydraulic seal kit" });
    expect(one("PN-1001 Hydraulic seal 10")).toEqual({ partNumber: "PN-1001", quantity: 1, description: "Hydraulic seal 10" });
    expect(one("PN-1001, Pump 100mm")).toEqual({ partNumber: "PN-1001", quantity: 1, description: "Pump 100mm" });
  });

  it("reads a quantity written after the description", () => {
    expect(one("PN-1001, Hydraulic seal kit, 3")).toEqual({ partNumber: "PN-1001", quantity: 3, description: "Hydraulic seal kit" });
  });

  it("ignores bullets, blank lines and pasted header rows", () => {
    const result = parsePartsPaste(["Part number, Qty, Description", "", "- PN-1, 2", "* PN-2, 3, Seal", "Part No\tQuantity"].join("\n"));
    expect(result.rows).toEqual([
      { partNumber: "PN-1", quantity: 2, description: null },
      { partNumber: "PN-2", quantity: 3, description: "Seal" },
    ]);
    expect(result.skipped).toEqual([]);
  });

  it("handles Windows line endings and a mixed list", () => {
    const result = parsePartsPaste("PN-1, 2\r\nPN-2 3\r\nPN-3\r\n");
    expect(result.rows.map((r) => [r.partNumber, r.quantity])).toEqual([["PN-1", 2], ["PN-2", 3], ["PN-3", 1]]);
  });

  it("skips and reports lines that cannot be used", () => {
    const result = parsePartsPaste(["PN-1, 0", "PN-2, -4", "PN-3, 2", `${"X".repeat(70)}, 1`].join("\n"));
    expect(result.rows).toEqual([{ partNumber: "PN-3", quantity: 2, description: null }]);
    expect(result.skipped).toEqual(["PN-1, 0", "PN-2, -4", `${"X".repeat(70)}, 1`]);
  });

  it("returns nothing for empty input", () => {
    expect(parsePartsPaste("")).toEqual({ rows: [], skipped: [] });
    expect(parsePartsPaste("  \n \n")).toEqual({ rows: [], skipped: [] });
  });
});

describe("isHeaderRow", () => {
  it("recognises heading rows only", () => {
    expect(isHeaderRow("Part number, Qty, Description")).toBe(true);
    expect(isHeaderRow("Part No\tQuantity")).toBe(true);
    expect(isHeaderRow("Item\tDescription\tQty")).toBe(true);
    expect(isHeaderRow("PN-1001, 2")).toBe(false);
    expect(isHeaderRow("Part")).toBe(false);
  });
});
