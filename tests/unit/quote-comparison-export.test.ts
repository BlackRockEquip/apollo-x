import { describe, expect, it } from "vitest";
import { buildQuoteComparisonRows } from "@/lib/jobs/quote-comparison-export";
import { buildXlsx, crc32, xlsxColumnLetter, xlsxEscape, xlsxSheetXml } from "@/lib/files/xlsx-lite";

const quotes = [
  { quoteId: "qa", supplierName: "Alpha Parts", lines: { p1: { unitPrice: "10", available: true, leadTime: "2 days" }, p2: { unitPrice: "5.5", available: true, leadTime: "" } } },
  { quoteId: "qb", supplierName: "Beta & Co", lines: { p1: { unitPrice: "9", available: true, leadTime: "1 week" }, p2: { unitPrice: null, available: false, leadTime: "" } } },
];
const parts = [
  { id: "p1", partNumber: "A-1", description: "Seal", quantity: 2, quantityText: "2" },
  { id: "p2", partNumber: "B-2", description: "Gasket", quantity: 4, quantityText: "4" },
];

describe("quote comparison export", () => {
  it("adds a Preferred supplier column and highlights that supplier's cells", () => {
    const out = buildQuoteComparisonRows({ quotes, parts, pickedQuoteIdByLine: { p1: "qb", p2: "qa" } });
    expect(out.header.at(-1)).toBe("Preferred supplier");
    expect(out.csvRows[0]).toEqual(["A-1", "Seal", "2", "10.00", "20.00", "2 days", "9.00", "18.00", "1 week", "Beta & Co"]);
    expect(out.csvRows[1].at(-1)).toBe("Alpha Parts");
    expect(out.anyPreferred).toBe(true);
    const line1 = out.xlsxRows[0];
    expect(line1.slice(3, 6).every((c) => !c.highlight)).toBe(true);
    expect(line1.slice(6, 9).every((c) => c.highlight)).toBe(true);
    expect(line1.at(-1)?.highlight).toBe(true);
    const line2 = out.xlsxRows[1];
    expect(line2.slice(3, 6).every((c) => c.highlight)).toBe(true);
    expect(line2.slice(6, 9).every((c) => !c.highlight)).toBe(true);
  });

  it("leaves a line with no choice unhighlighted", () => {
    const out = buildQuoteComparisonRows({ quotes, parts, pickedQuoteIdByLine: { p1: null } });
    expect(out.anyPreferred).toBe(false);
    expect(out.xlsxRows.flat().some((c) => c.highlight)).toBe(false);
    expect(out.csvRows[0].at(-1)).toBe("");
  });

  it("keeps an unavailable preferred price highlighted but blank", () => {
    const out = buildQuoteComparisonRows({ quotes, parts, pickedQuoteIdByLine: { p2: "qb" } });
    expect(out.csvRows[1].slice(6, 10)).toEqual(["", "", "", "Beta & Co"]);
    expect(out.xlsxRows[1].slice(6, 9).every((c) => c.highlight)).toBe(true);
  });
});

describe("xlsx-lite", () => {
  it("names columns and escapes text", () => {
    expect(xlsxColumnLetter(0)).toBe("A");
    expect(xlsxColumnLetter(25)).toBe("Z");
    expect(xlsxColumnLetter(26)).toBe("AA");
    expect(xlsxColumnLetter(701)).toBe("ZZ");
    expect(xlsxColumnLetter(702)).toBe("AAA");
    expect(xlsxEscape("a & <b> \"c\"")).toBe("a &amp; &lt;b&gt; &quot;c&quot;");
  });

  it("styles highlighted and money cells", () => {
    const xml = xlsxSheetXml({ name: "S", rows: [[{ v: "H", header: true }], [{ v: 1.5, money: true, highlight: true }, { v: 2, money: true }, { v: "x", highlight: true }]] });
    expect(xml).toContain('<c r="A1" s="1" t="inlineStr">');
    expect(xml).toContain('<c r="A2" s="3"><v>1.5</v></c>');
    expect(xml).toContain('<c r="B2" s="4"><v>2</v></c>');
    expect(xml).toContain('<c r="C2" s="2" t="inlineStr">');
  });

  it("computes the standard CRC32 and writes a zip", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    const bytes = buildXlsx({ name: "Quote comparison", rows: [[{ v: "a" }]] });
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });
});
