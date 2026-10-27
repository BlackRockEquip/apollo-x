import { describe, expect, it } from "vitest";
import { guessFromText, rowsFromTextItems } from "@/lib/rfq/quote-extraction";

// 2026-10-27, user report: a Capital Equipment Parts PDF quote imported no prices. That PDF stores every character as
// its own text item. These tests lay a quote row out the same way (one item per character) and as whole cells.
type Item = { str: string; transform: number[]; width: number };
const SIZE = 8.4;
const CHAR_W = 4.15;

// One item per character, characters touching, starting at x.
function chars(text: string, x: number, y: number): Item[] {
  return [...text].map((c, i) => ({ str: c, transform: [SIZE, 0, 0, SIZE, x + i * CHAR_W, y], width: CHAR_W }));
}
function row(y: number, cells: Array<[string, number]>): Item[] {
  return cells.flatMap(([text, x]) => chars(text, x, y));
}

const header = row(520, [["PART NO", 35], ["MASTER NO", 75], ["DESCRIPTION", 130], ["QTY", 460], ["UNIT PRICE", 480], ["TOTAL", 523]]);
const quoteItems: Item[] = [
  ...header,
  ...row(502, [["4695312", 35], ["4695312", 75], ["LINER-CYLI", 130], ["UNK", 310], ["NEW", 350], ["10-14 Days", 386], ["0.00", 433], ["1", 461], ["R 1,764.00", 479], ["R 1,764.00", 523]]),
  ...row(491, [["1077694", 35], ["1077694", 75], ["PLATE THRUST", 130], ["CEP", 310], ["NEW", 350], ["Unavailable", 386], ["0.09", 433], ["0", 461], ["R 0.00", 479], ["R 0.00", 523]]),
  ...row(480, [["1512939", 35], ["1512939", 75], ["BEARING MAIN STD C9", 130], ["INTER", 310], ["NEW", 350], ["STOCK", 386], ["0.32", 433], ["7", 461], ["R 430.22", 479], ["R 3,011.54", 523]]),
  ...row(469, [["4695312", 35], ["4695312", 75], ["LINER-CYLI", 130], ["UNK", 310], ["NEW", 350], ["3 HOURS", 386], ["0.00", 433], ["6", 461], ["R 1,031.29", 479], ["R 6,187.74", 523]]),
  ...row(458, [["1R1808", 35], ["LF691A", 75], ["ENGINE OIL FILTER", 130], ["CEP", 310], ["NEW", 350], ["Unavailable", 386], ["1.86", 433], ["0", 461], ["R 0.00", 479], ["R 0.00", 523]]),
];
// Items arrive in no particular order in a real PDF.
const shuffled = [...quoteItems].sort((a, b) => ((a.transform[4] * 7919 + a.transform[5] * 104729) % 13) - ((b.transform[4] * 7919 + b.transform[5] * 104729) % 13));

describe("rowsFromTextItems", () => {
  it("joins one-item-per-character text back into cells separated by tabs", () => {
    const lines = rowsFromTextItems(shuffled).split("\n");
    expect(lines).toContain("4695312\t4695312\tLINER-CYLI\tUNK\tNEW\t10-14 Days\t0.00\t1\tR 1,764.00\tR 1,764.00");
    expect(lines).toContain("1512939\t1512939\tBEARING MAIN STD C9\tINTER\tNEW\tSTOCK\t0.32\t7\tR 430.22\tR 3,011.54");
  });

  it("leaves a PDF whose items are already whole cells exactly as before", () => {
    const cell = (str: string, x: number, y: number): Item => ({ str, transform: [8, 0, 0, 8, x, y], width: str.length * 4 });
    const items = [cell("2,054.59", 300, 700), cell("PN-100", 40, 700), cell("4", 250, 700), cell("Gasket", 120, 700)];
    expect(rowsFromTextItems(items)).toBe("PN-100\tGasket\t4\t2,054.59");
  });

  it("cells with no width information are never merged (older parser output)", () => {
    const items = [{ str: "AB", transform: [8, 0, 0, 8, 10, 100], width: undefined as unknown as number }, { str: "CD", transform: [8, 0, 0, 8, 12, 100], width: undefined as unknown as number }];
    expect(rowsFromTextItems(items)).toBe("AB\tCD");
  });
});

describe("guessFromText on a character-per-item quote", () => {
  const text = rowsFromTextItems(shuffled);
  const parts = ["4695312", "1077694", "1512939", "1R1808", "LF691A"];

  it("reads the unit price (not the weight, not the line total)", () => {
    const g = guessFromText(text, parts, {});
    expect(g["1512939"]).toBe(430.22);
    expect(g["4695312"]).toBe(1764);
  });

  it("items the supplier marks Unavailable (zero price) get no price, not their weight", () => {
    const g = guessFromText(text, parts, {});
    expect(g["1077694"]).toBeUndefined();
    expect(g["1R1808"]).toBeUndefined();
    expect(g["LF691A"]).toBeUndefined();
  });

  it("when a number is quoted twice, the line that matches the wanted quantity wins", () => {
    expect(guessFromText(text, parts, { "4695312": 6 })["4695312"]).toBe(1031.29);
    expect(guessFromText(text, parts, { "4695312": 1 })["4695312"]).toBe(1764);
  });
});

describe("guessFromText keeps the formats it already read", () => {
  it("a single-price row still gives that price", () => {
    expect(guessFromText("PN-4021\tGasket\t2\tR 150.00", ["PN4021"], {})["PN4021"]).toBe(150);
  });
  it("unit price then line total gives the unit price", () => {
    expect(guessFromText("ABC123\t3\t100.00\t300.00", ["ABC123"], {})["ABC123"]).toBe(100);
  });
});
