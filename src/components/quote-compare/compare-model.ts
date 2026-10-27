// Pure helpers behind the Compare quotes screens (QuoteEntryDialog and
// QuotePickDialog). Kept free of React and of the job types so the maths —
// totals, "lowest on", suspicious prices, the best mix, the split by
// supplier — can be unit tested on its own.

// `lead` is the supplier's lead time for the part ("In stock", "7 days", "10-14 days"), when one was given.
export type PriceCell = { kind: "price"; unit: number; lead?: string } | { kind: "na" } | { kind: "none" };

export type GridRow = { qty: number; cells: PriceCell[] };

const NBSP = " ";

/** 1508.9 -> "1 508,90" (South African style: space thousands, comma decimals). */
export function formatNumber(value: number): string {
  const negative = value < 0;
  const [whole, cents] = Math.abs(value).toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${negative ? "-" : ""}${grouped},${cents}`;
}

export function formatRand(value: number): string {
  return `R${NBSP}${formatNumber(value)}`;
}

/** Text typed into a price box -> a number, or null when blank / not a number. */
export function parseDraftPrice(value: string | null | undefined): number | null {
  const cleaned = String(value ?? "").replace(/[\s ]/g, "").replace(",", ".");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Keep digits and one decimal point; a comma counts as the decimal point. */
export function sanitizePriceInput(value: string): string {
  const noSpaces = value.replace(/[\s ]/g, "").replace(/,/g, ".").replace(/[^0-9.]/g, "");
  const firstDot = noSpaces.indexOf(".");
  if (firstDot === -1) return noSpaces;
  return noSpaces.slice(0, firstDot + 1) + noSpaces.slice(firstDot + 1).replace(/\./g, "");
}

/** Lead time text as typed or saved: trimmed, and undefined when blank so a cell without one stays as it was. */
function leadOf(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return text === "" ? undefined : text;
}

/** True for the lead times that mean the supplier has it on the shelf ("In stock"). */
export function isInStockLead(lead: string | null | undefined): boolean {
  return /^in stock\b/i.test(String(lead ?? "").trim());
}

export function draftToCell(draft: { unitPrice: string; available: boolean; leadTime?: string } | undefined | null): PriceCell {
  if (!draft) return { kind: "none" };
  if (!draft.available) return { kind: "na" };
  const unit = parseDraftPrice(draft.unitPrice);
  if (unit === null) return { kind: "none" };
  const lead = leadOf(draft.leadTime);
  return lead ? { kind: "price", unit, lead } : { kind: "price", unit };
}

export function quoteLineToCell(line: { available?: boolean | null; unitPrice?: unknown; leadTime?: string | null } | undefined | null): PriceCell {
  if (!line) return { kind: "none" };
  if (line.available === false) return { kind: "na" };
  if (line.unitPrice == null || line.unitPrice === "") return { kind: "none" };
  const unit = Number(line.unitPrice);
  if (!Number.isFinite(unit)) return { kind: "none" };
  const lead = leadOf(line.leadTime);
  return lead ? { kind: "price", unit, lead } : { kind: "price", unit };
}

/** Lowest price in a row and every supplier index that has it. */
export function lowestOfRow(cells: PriceCell[]): { min: number; indexes: number[] } | null {
  let min: number | null = null;
  cells.forEach((c) => { if (c.kind === "price" && (min === null || c.unit < min)) min = c.unit; });
  if (min === null) return null;
  const indexes: number[] = [];
  cells.forEach((c, i) => { if (c.kind === "price" && c.unit === min) indexes.push(i); });
  return { min, indexes };
}

export function priceCount(cells: PriceCell[]): number {
  return cells.reduce((n, c) => n + (c.kind === "price" ? 1 : 0), 0);
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Whole-number percentage that `price` is above `min`; null when min is 0. */
export function percentOver(price: number, min: number): number | null {
  return min > 0 ? Math.round((price / min - 1) * 100) : null;
}

/**
 * A lowest price that is far below everything else on the line (under a
 * tenth of the median of the other prices) is more likely a typo or a price
 * for a different unit than a real saving. Needs at least three quotes.
 */
export function isSuspiciouslyLow(cells: PriceCell[], index: number): boolean {
  const cell = cells[index];
  if (!cell || cell.kind !== "price") return false;
  const prices = cells.flatMap((c) => (c.kind === "price" ? [c.unit] : []));
  if (prices.length < 3) return false;
  if (cell.unit !== Math.min(...prices)) return false;
  const others = cells.flatMap((c, i) => (i !== index && c.kind === "price" ? [c.unit] : []));
  return cell.unit < 0.1 * median(others);
}

export type SupplierStat = { total: number; priced: number; answered: number; lowestOn: number };

export function supplierStats(rows: GridRow[], supplierCount: number): SupplierStat[] {
  const stats: SupplierStat[] = Array.from({ length: supplierCount }, () => ({ total: 0, priced: 0, answered: 0, lowestOn: 0 }));
  for (const row of rows) {
    const low = lowestOfRow(row.cells);
    const contested = priceCount(row.cells) > 1;
    row.cells.forEach((cell, i) => {
      if (!stats[i]) return;
      if (cell.kind === "price") {
        stats[i].total += cell.unit * row.qty;
        stats[i].priced += 1;
        stats[i].answered += 1;
        if (contested && low && low.indexes.includes(i)) stats[i].lowestOn += 1;
      } else if (cell.kind === "na") {
        stats[i].answered += 1;
      }
    });
  }
  return stats;
}

export type BestMix = { total: number; pricedLines: number; supplierCount: number };

/** Buying every line from whoever is cheapest on it. */
export function bestMix(rows: GridRow[]): BestMix {
  let total = 0;
  let pricedLines = 0;
  const winners = new Set<number>();
  for (const row of rows) {
    const low = lowestOfRow(row.cells);
    if (!low) continue;
    total += low.min * row.qty;
    pricedLines += 1;
    winners.add(low.indexes[0]);
  }
  return { total, pricedLines, supplierCount: winners.size };
}

export type EntryCompare =
  | { kind: "best"; otherIndex: number | null; otherUnit: number | null }
  | { kind: "behind"; percent: number | null; bestIndex: number; bestUnit: number }
  | { kind: "na" }
  | { kind: "none" };

/** How the supplier at `index` stacks up against the other suppliers on one line. */
export function entryCompare(cells: PriceCell[], index: number): EntryCompare {
  const cell = cells[index];
  if (!cell || cell.kind === "none") return { kind: "none" };
  if (cell.kind === "na") return { kind: "na" };
  let bestIndex = -1;
  let bestUnit = Infinity;
  cells.forEach((c, i) => {
    if (i !== index && c.kind === "price" && c.unit < bestUnit) { bestUnit = c.unit; bestIndex = i; }
  });
  if (bestIndex === -1) return { kind: "best", otherIndex: null, otherUnit: null };
  if (cell.unit <= bestUnit) return { kind: "best", otherIndex: bestIndex, otherUnit: bestUnit };
  return { kind: "behind", percent: percentOver(cell.unit, bestUnit), bestIndex, bestUnit };
}

// ---------- pick screen ----------

export type PickRow = { id: string; qty: number; cells: PriceCell[] };

/** Staged choice for one line: the supplier's quote id, or null to clear. */
export type PickPatch = Record<string, string | null>;

export function togglePickPatch(currentQuoteId: string | null, lineId: string, quoteId: string): PickPatch {
  return { [lineId]: currentQuoteId === quoteId ? null : quoteId };
}

/** Pick every line this supplier priced — or clear them all if they are already picked. */
export function pickSupplierPatch(rows: PickRow[], supplierIndex: number, supplierIds: string[], picks: Record<string, string | null>): PickPatch {
  const quoteId = supplierIds[supplierIndex];
  const priced = rows.filter((r) => r.cells[supplierIndex]?.kind === "price");
  const allPicked = priced.length > 0 && priced.every((r) => picks[r.id] === quoteId);
  const patch: PickPatch = {};
  for (const r of priced) patch[r.id] = allPicked ? null : quoteId;
  return patch;
}

/** Pick the cheapest supplier on every line that has a price (ties go to the first supplier). */
export function pickLowestPatch(rows: PickRow[], supplierIds: string[]): PickPatch {
  const patch: PickPatch = {};
  for (const r of rows) {
    const low = lowestOfRow(r.cells);
    if (low) patch[r.id] = supplierIds[low.indexes[0]];
  }
  return patch;
}

export type PickSummary = {
  total: number;
  pickedLines: number;
  allocation: { index: number; amount: number; lines: number }[];
  baseline: { index: number; total: number } | null;
  saving: number | null;
  savingPercent: number | null;
};

/** `picks[i]` is the chosen supplier index for row i (or null). A pick on a cell without a price is ignored. */
export function pickSummary(rows: PickRow[], picks: (number | null)[]): PickSummary {
  const supplierCount = rows.reduce((n, r) => Math.max(n, r.cells.length), 0);
  const amounts = new Array<number>(supplierCount).fill(0);
  const lineCounts = new Array<number>(supplierCount).fill(0);
  let total = 0;
  let pickedLines = 0;
  rows.forEach((row, i) => {
    const pick = picks[i];
    if (pick == null) return;
    const cell = row.cells[pick];
    if (!cell || cell.kind !== "price") return;
    const amount = cell.unit * row.qty;
    total += amount;
    pickedLines += 1;
    amounts[pick] += amount;
    lineCounts[pick] += 1;
  });
  const allocation = amounts
    .map((amount, index) => ({ index, amount, lines: lineCounts[index] }))
    .filter((a) => a.lines > 0)
    .sort((a, b) => b.amount - a.amount);

  // Cheapest supplier that priced every line: what "buy it all from one place" costs.
  let baseline: PickSummary["baseline"] = null;
  if (rows.length > 0) {
    for (let s = 0; s < supplierCount; s++) {
      if (!rows.every((r) => r.cells[s]?.kind === "price")) continue;
      const supplierTotal = rows.reduce((sum, r) => sum + (r.cells[s] as { unit: number }).unit * r.qty, 0);
      if (!baseline || supplierTotal < baseline.total) baseline = { index: s, total: supplierTotal };
    }
  }
  const comparable = baseline !== null && pickedLines === rows.length;
  const saving = comparable ? baseline!.total - total : null;
  return {
    total,
    pickedLines,
    allocation,
    baseline,
    saving,
    savingPercent: comparable && baseline!.total > 0 ? Math.round(((baseline!.total - total) / baseline!.total) * 100) : null,
  };
}

export type PickInsights = { singleQuote: number[]; lowToConfirm: number[] };

/** Row indexes worth a second look: only one supplier priced them, or the lowest price looks too good. */
export function pickInsights(rows: PickRow[]): PickInsights {
  const singleQuote: number[] = [];
  const lowToConfirm: number[] = [];
  rows.forEach((row, i) => {
    if (priceCount(row.cells) === 1) singleQuote.push(i);
    const low = lowestOfRow(row.cells);
    if (low && isSuspiciouslyLow(row.cells, low.indexes[0])) lowToConfirm.push(i);
  });
  return { singleQuote, lowToConfirm };
}

/** "A", "A and B", "A, B and C", "A, B, C and 2 more" */
export function joinList(items: string[], max = 3): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  const shown = items.slice(0, max);
  const rest = items.length - shown.length;
  if (rest > 0) return `${shown.join(", ")} and ${rest} more`;
  return `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
}

/** "Diesel Parts Direct (Pty) Ltd" -> "Diesel Parts Direct": legal suffixes only get in the way of a comparison. */
export function shortSupplierName(name: string): string {
  const short = name
    .replace(/\s*\(\s*pty\s*\)\s*(ltd|limited)?\.?\s*$/i, "")
    .replace(/\s+(pty\s+)?(ltd|limited)\.?\s*$/i, "")
    .replace(/\s+(cc|inc\.?|\(pvt\)\s*ltd)\s*$/i, "")
    .trim();
  return short || name;
}
