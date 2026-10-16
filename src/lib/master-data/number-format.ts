// How a document number is built from a numbering sequence. Shared by the
// server (allocating a real number) and the Document numbering tab (the
// Preview), so what the preview shows is exactly what gets issued.
export type NumberingFormat = { prefix: string; padding: number; includeFinancialYear: boolean; financialYearStartMonth: number };

/** The year printed when "include financial year" is on: the year the financial year ENDS in (start month March: Mar 2026 -> 2027). */
export function financialYearFor(now: Date, startMonth: number): number {
  return now.getUTCMonth() + 1 >= startMonth ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
}

export function formatDocumentNumber(format: NumberingFormat, value: bigint | number | string, now: Date = new Date()): string {
  const year = financialYearFor(now, format.financialYearStartMonth);
  const padding = Math.max(1, Math.floor(format.padding) || 1);
  return `${format.prefix}${format.includeFinancialYear ? `${year}/` : ""}${String(value).padStart(padding, "0")}`;
}
