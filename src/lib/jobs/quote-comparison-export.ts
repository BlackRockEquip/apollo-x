import type { XlsxCell } from "@/lib/files/xlsx-lite";

// Compare quotes export (CSV and Excel), built once so both always agree.
// 2026-10-27, user request: "when preferred supplier selected, when
// exporting, highlight the selected supplier in the table as well".
// The preferred supplier's cells (unit, total, availability) on each line are
// filled gold in the Excel file, and both files get a trailing "Preferred
// supplier" column, since a CSV cannot carry colour. A line with no choice
// has an empty Preferred supplier cell and nothing highlighted.

export type ExportQuoteLine = { unitPrice: string | number | null; available: boolean | null; leadTime: string };
export type ExportQuote = { quoteId: string; supplierName: string; lines: Record<string, ExportQuoteLine | undefined> };
export type ExportPartLine = { id: string; partNumber: string; description: string; quantity: number; quantityText: string };

export const PREFERRED_COLUMN_LABEL = "Preferred supplier";

export function buildQuoteComparisonRows(input: {
  quotes: ExportQuote[];
  parts: ExportPartLine[];
  // part line id -> chosen quote id (null / missing = no choice).
  pickedQuoteIdByLine: Record<string, string | null | undefined>;
}) {
  const { quotes, parts, pickedQuoteIdByLine } = input;
  const header = ["Part", "Description", "Qty", ...quotes.flatMap((q) => [`${q.supplierName} (unit)`, `${q.supplierName} (total)`, `${q.supplierName} (availability)`]), PREFERRED_COLUMN_LABEL];
  let anyPreferred = false;
  const csvRows: string[][] = [];
  const xlsxRows: XlsxCell[][] = [];
  for (const part of parts) {
    const pickedId = pickedQuoteIdByLine[part.id] ?? null;
    const picked = pickedId ? quotes.find((q) => q.quoteId === pickedId) : undefined;
    if (picked) anyPreferred = true;
    const csv: string[] = [part.partNumber, part.description, part.quantityText];
    const xl: XlsxCell[] = [{ v: part.partNumber }, { v: part.description }, { v: part.quantityText }];
    for (const quote of quotes) {
      const isPicked = picked?.quoteId === quote.quoteId;
      const line = quote.lines[part.id];
      const unit = line && line.available !== false && line.unitPrice !== null && line.unitPrice !== "" ? Number(line.unitPrice) : NaN;
      if (Number.isFinite(unit)) {
        const total = unit * part.quantity;
        csv.push(unit.toFixed(2), total.toFixed(2), line?.leadTime ?? "");
        xl.push({ v: Number(unit.toFixed(2)), money: true, highlight: isPicked }, { v: Number(total.toFixed(2)), money: true, highlight: isPicked }, { v: line?.leadTime ?? "", highlight: isPicked });
      } else {
        csv.push("", "", "");
        xl.push({ v: "", highlight: isPicked }, { v: "", highlight: isPicked }, { v: "", highlight: isPicked });
      }
    }
    csv.push(picked?.supplierName ?? "");
    xl.push({ v: picked?.supplierName ?? "", bold: Boolean(picked), highlight: Boolean(picked) });
    csvRows.push(csv);
    xlsxRows.push(xl);
  }
  return { header, csvRows, xlsxRows, anyPreferred };
}

// Excel column widths (characters) for the layout above.
export function quoteComparisonWidths(supplierCount: number): number[] {
  return [18, 34, 8, ...Array.from({ length: supplierCount }, () => [12, 12, 18]).flat(), 22];
}
