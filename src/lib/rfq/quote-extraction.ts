// ----------------------------------------------------------------------------
// Best-effort price extraction for supplier quotes (RFQ responses) — ported
// from ModApp's src/lib/rfqQuoteExtraction.ts at the user's request ("add
// the below skipped functions" / "Prices are typed in by hand, not
// extracted from uploaded files").
//
// Every supplier formats their quote differently — different column order,
// currency symbols, extra line items, scanned PDFs with no real text in
// them, and so on. There is no reliable way to *guarantee* a correct read.
// So this module only ever produces a starting guess per part number; the
// caller (recordRfqQuote in rfq/service.ts) returns the guesses to the
// client, which shows them in the editable price table — nothing is saved
// as a real price until a person reviews and confirms it via
// saveRfqQuoteLines.
//
// Spreadsheets (.xlsx/.xls/.csv) are parsed properly (real rows and
// columns), so they're the most reliable source. PDFs and Word docs are
// just plain text once extracted, so guessing is done with a simpler
// "find the part number's line, take the last money-looking number on it"
// heuristic — good enough as a starting point, not meant to be perfect.
// ----------------------------------------------------------------------------

export async function guessPricesFromFile(bytes: Buffer, fileName: string, partNumbers: string[], quantities: Record<string, number> = {}): Promise<Record<string, number>> {
  const ext = fileName.toLowerCase().split(".").pop() || "";

  try {
    if (ext === "xlsx" || ext === "xls" || ext === "csv") {
      return await guessFromSpreadsheet(bytes, partNumbers);
    }
    if (ext === "pdf") {
      const text = await extractPdfText(bytes);
      return guessFromText(text, partNumbers, quantities);
    }
    if (ext === "docx") {
      const text = await extractDocxText(bytes);
      return guessFromText(text, partNumbers, quantities);
    }
  } catch {
    // Corrupt file, password-protected PDF, scanned image with no text
    // layer, old binary .doc we can't parse, etc. — extraction just comes
    // back empty and the person prices the quote by hand instead.
    return {};
  }

  // Unsupported file type (e.g. a photo of a quote) — nothing to read.
  return {};
}

// 2026-10-12, user report: three supplier PDFs (Spare Power, Babcock, Blumaq)
// read no prices at all. pdf-parse's default text output glues neighbouring
// table cells together with no gap ("0.47946.001,892.007 DAYS" for weight,
// price, amount and delay), so prices can't be told apart. This renders each
// page ourselves instead: every text item keeps its position, items on the
// same visual row are put in left-to-right order, and cells are separated by
// a tab so the price/qty columns survive intact.
type PdfTextItem = { str: string; transform: number[] };
type PdfPageData = { getTextContent: (options?: Record<string, unknown>) => Promise<{ items: PdfTextItem[] }> };

async function renderPdfPageAsRows(pageData: PdfPageData): Promise<string> {
  const content = await pageData.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: true });
  const items = content.items
    .filter((item) => item.str.trim() !== "")
    .map((item) => ({ text: item.str.trim(), x: item.transform[4], y: item.transform[5] }))
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const rows: Array<{ y: number; cells: Array<{ text: string; x: number }> }> = [];
  for (const item of items) {
    const row = rows.find((r) => Math.abs(r.y - item.y) <= 2);
    if (row) row.cells.push({ text: item.text, x: item.x });
    else rows.push({ y: item.y, cells: [{ text: item.text, x: item.x }] });
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) => row.cells.sort((a, b) => a.x - b.x).map((c) => c.text).join("\t"))
    .join("\n");
}

async function extractPdfText(bytes: Buffer): Promise<string> {
  // Dynamically imported so this (fairly heavy) parser is only ever loaded
  // when someone actually uploads a PDF quote.
  // The package's own entry point has a debug block that tries to open a
  // sample PDF whenever it is loaded through a bundler (module.parent is
  // missing), which throws and would make every PDF read as "empty". The lib
  // file below is the same parser without that block.
  // @ts-ignore — the lib entry has no type declarations of its own
  const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default as typeof import("pdf-parse");
  const result = await pdfParse(bytes, { pagerender: renderPdfPageAsRows as unknown as (pageData: unknown) => string });
  return result.text || "";
}

async function extractDocxText(bytes: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer: bytes });
  return result.value || "";
}

// Money-looking numbers WITH two decimal places, in either layout: "2,054.59"
// / "107 377.70" (point decimals) or "R23 794,82" / "1.234,56" (comma
// decimals). Requiring the cents is what keeps quantities ("4", "1.000"),
// lead times ("7 DAYS"), line numbers and part numbers from being mistaken for
// prices. Percent columns are removed before scanning (see priceCandidates).
const PRICE_TOKEN = /(?<![\d.,])(?:R|ZAR|USD|EUR|\$|€)?\s?(\d{1,3}(?:[ ,.]\d{3})+|\d+)[.,](\d{2})(?!\d)/gi;

function parseMoney(raw: string): number | null {
  const cleaned = raw.replace(/[ ,]/g, "");
  const value = parseFloat(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}

// Every price-looking number on a quote line, left to right. Zero values are
// kept (so a "0.00" surcharge column keeps its place) — callers skip them.
function priceCandidates(cells: string[]): number[] {
  const out: number[] = [];
  for (const cell of cells) {
    if (cell.includes("%")) continue;
    for (const m of cell.matchAll(PRICE_TOKEN)) {
      const value = parseFloat(`${m[1].replace(/[ ,.]/g, "")}.${m[2]}`);
      if (Number.isFinite(value)) out.push(value);
    }
  }
  return out;
}

// Whole-number quantities on the line ("4", "4.000", "4,00"), used to tell the
// unit price from the line total.
function quantityCandidates(cells: string[], knownQuantity: number | undefined): number[] {
  const out = new Set<number>();
  if (knownQuantity && knownQuantity > 0) out.add(knownQuantity);
  for (const cell of cells) {
    const m = cell.trim().match(/^(\d{1,6})(?:[.,]0{1,4})?$/);
    if (m) {
      const q = Number(m[1]);
      if (q > 0) out.add(q);
    }
  }
  return [...out];
}

// Quotes list several amounts per row — weight, gross unit price, discount,
// nett unit price, line total — in a different order for every supplier.
// The unit price is the amount that, multiplied by a quantity shown on the
// same row, gives a later amount (the line total). That picks the unit price
// for Spare Power (unit, disc., final unit, qty, sub total), Babcock (gross,
// surcharge, nett unit, nett total) and Blumaq (weight, price, amount) alike,
// and skips weights/zeros since they never multiply up to a later amount.
function pickUnitPrice(prices: number[], quantities: number[]): number | null {
  const nonZero = prices.filter((p) => p > 0);
  if (nonZero.length === 0) return null;
  if (nonZero.length === 1) return nonZero[0];
  for (let i = 0; i < prices.length; i++) {
    const value = prices[i];
    if (value <= 0) continue;
    for (const q of quantities) {
      const expected = value * q;
      const tolerance = Math.max(0.02, expected * 0.0005);
      if (prices.slice(i + 1).some((later) => later > 0 && Math.abs(later - expected) <= tolerance)) return value;
    }
  }
  // No row-total relationship found (e.g. a quote that shows only unit
  // prices, or a partial quantity): fall back to the last amount on the row,
  // as before — it is always shown for review before anything is saved.
  return nonZero[nonZero.length - 1];
}

function splitCells(line: string): string[] {
  if (line.includes("\t")) return line.split("\t").map((c) => c.trim()).filter(Boolean);
  const wide = line.split(/ {2,}/).map((c) => c.trim()).filter(Boolean);
  return wide.length >= 3 ? wide : line.split(/\s+/).filter(Boolean);
}

function guessFromText(text: string, partNumbers: string[], quantities: Record<string, number>): Record<string, number> {
  const guesses: Record<string, number> = {};
  const lines = text.split(/\r?\n/);

  for (const partNumber of partNumbers) {
    const strict = loosePartNumberPattern(partNumber, false);
    if (!strict) continue;
    // 2026-10-12 — suppliers often print their own prefix in front of the
    // number ("VOE14676744", "VO14622911", "SA9325-06012" for 14676744 /
    // 14622911 / 9325-06012), which the strict pattern rejects as "part of a
    // longer code". Tried second, so an exact match always wins when both
    // appear.
    const prefixed = loosePartNumberPattern(partNumber, true);

    for (const pattern of [strict, prefixed]) {
      if (!pattern) continue;
      let found: number | undefined;
      for (const line of lines) {
        if (!pattern.test(line)) continue;
        // Strip the part number itself out first so a part number that
        // happens to contain digits is never mistaken for the price.
        const cells = splitCells(line.replace(new RegExp(pattern.source, "gi"), "\t"));
        const price = pickUnitPrice(priceCandidates(cells), quantityCandidates(cells, quantities[partNumber]));
        if (price !== null) { found = price; break; }
      }
      if (found !== undefined) { guesses[partNumber] = found; break; }
    }
  }

  return guesses;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 2026-10-06 — user report: quote files listing a part as "3J-1907" got no
// price imported, but changing the file to "3J1907" worked. Part numbers are
// stored with hyphens/spaces/dots stripped (see looseNormalized in
// master-data/validation.ts), while a supplier's own quote usually prints
// them with separators — and both the text and spreadsheet matching below
// compared them character for character. Now compared with every
// non-alphanumeric character ignored, so "3J1907", "3J-1907", "3J 1907" and
// "3J.1907" all match each other, in either direction.
function looseKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Regex matching a part number in free text with optional separators allowed
// between any two characters, and not embedded inside a longer alphanumeric
// token (so "3J1907" doesn't match inside "3J19075"). Global-free on purpose:
// safe to reuse with .test() and .replace() (replace swaps only the first hit).
function loosePartNumberPattern(partNumber: string, allowSupplierPrefix: boolean): RegExp | null {
  const chars = looseKey(partNumber).split("");
  if (chars.length === 0) return null;
  const body = chars.map((c) => escapeRegExp(c)).join("[\\s\\-./_\\\\]*");
  // The supplier prefix is only ever letters in front of a number that itself
  // starts with a digit, and only up to four of them — "VOE", "VO", "SA" —
  // so "1234" is never matched inside an unrelated alphanumeric code.
  const prefix = allowSupplierPrefix && /^\d/.test(chars[0]) ? "(?:[A-Za-z]{1,4}[\\s\\-./_]?)?" : "";
  if (allowSupplierPrefix && !prefix) return null;
  return new RegExp(`(?<![A-Za-z0-9])${prefix}${body}(?![A-Za-z0-9])`, "i");
}

// Ordered most-specific-first: the first label that matches a header cell
// (and whose column actually looks like it contains money — see
// columnLooksNumeric below) wins. Plain "unit" is deliberately included —
// a lot of real supplier quotes just label the price column "Unit" — but
// it's checked after the more specific labels, and never trusted blindly,
// since a column called "Unit" can just as easily mean "unit of measure"
// (e.g. "EA", "Box") rather than "unit price".
// 2026-10-01 — user report ("importing quotes for comparing prices, it is
// currently reading total values and not unit/price values"): "amount"
// used to be listed here as a generic per-unit label, but in the standard
// quote/invoice layout most suppliers actually use (Qty, Description, Unit
// Price, Amount) "Amount" is the LINE TOTAL (qty × unit price), not a
// per-unit figure — moved to TOTAL_ONLY_LABELS below, where it's divided
// back down by quantity like any other total column instead of being
// trusted as-is.
const PRICE_HEADER_LABELS = ["unit price", "unit cost", "price per unit", "cost per unit", "price/unit", "unit rate", "rate", "unit", "price", "cost"];
// A plain "Total" (or "Line total" / "Ext price" / "Amount") column is a
// last resort, not tried until every PRICE_HEADER_LABELS candidate has
// failed — it's a line total (unit price × quantity), not a unit price, so
// using it directly would be wrong for any line with quantity > 1. If a
// quantity column can also be found, the total is divided back down to an
// approximate unit price; otherwise it's used as-is (still just a guess,
// always shown for review before anything is saved).
const TOTAL_ONLY_LABELS = ["line total", "line price", "ext price", "extended price", "ext. price", "amount", "total"];
// 2026-10-01 — same report: a column literally labelled "Total Price" or
// "Total Cost" (or "Extended Price"/"Ext Price", already in
// TOTAL_ONLY_LABELS verbatim) was being matched by the PRICE_HEADER_LABELS
// loop below FIRST, since "total price".includes("price") is true — the
// more specific, deliberately-ordered TOTAL_ONLY_LABELS check never even
// ran, so the raw line total was used directly as if it were a unit price.
// Any header cell that itself looks like a TOTAL_ONLY_LABELS column is now
// excluded from the PRICE_HEADER_LABELS loop entirely, so it's only ever
// matched by (and divided back down to a unit price via) the dedicated
// total-column handling just below.
function looksLikeTotalColumnLabel(cell: string): boolean {
  return TOTAL_ONLY_LABELS.some((label) => cell.includes(label));
}
const QTY_HEADER_LABELS = ["qty", "quantity"];
const PART_HEADER_LABELS = ["part number", "part no", "part", "item no", "item"];

function findColumn(row: string[], labels: string[], exclude: number[] = []): number {
  for (const label of labels) {
    const idx = row.findIndex((c, i) => c.includes(label) && !exclude.includes(i));
    if (idx !== -1) return idx;
  }
  return -1;
}

// Guards against picking a text column just because its header happens to
// contain a price-ish word (most relevant for the bare "unit" label) — at
// least half of the first few non-blank cells below the header need to
// actually parse as a money-looking number.
function columnLooksNumeric(rows: unknown[][], startRow: number, col: number): boolean {
  let checked = 0;
  let numeric = 0;
  for (let i = startRow; i < rows.length && checked < 8; i++) {
    const raw = rows[i]?.[col];
    if (raw === undefined || raw === null || raw === "") continue;
    checked++;
    if (parseMoney(String(raw)) !== null) numeric++;
  }
  return checked > 0 && numeric / checked >= 0.5;
}

async function guessFromSpreadsheet(bytes: Buffer, partNumbers: string[]): Promise<Record<string, number>> {
  // Dynamically imported for the same reason as pdf-parse/mammoth above —
  // only loaded when a spreadsheet is actually uploaded.
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(bytes, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return {};

  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (rows.length === 0) return {};

  // Scan the first several rows for one that looks like a header — i.e.
  // has a recognizable "part" column. Quotes sometimes have a title or
  // logo row above the real header, so this isn't always row 0.
  let headerIndex = -1;
  let partCol = -1;

  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i].map((c) => String(c).trim().toLowerCase());
    const pCol = findColumn(row, PART_HEADER_LABELS);
    if (pCol !== -1) {
      headerIndex = i;
      partCol = pCol;
      break;
    }
  }

  if (headerIndex === -1) return {};

  const headerRow = rows[headerIndex].map((c) => String(c).trim().toLowerCase());
  const qtyCol = findColumn(headerRow, QTY_HEADER_LABELS, [partCol]);

  let priceCol = -1;
  let priceIsLineTotal = false;
  for (const label of PRICE_HEADER_LABELS) {
    const idx = headerRow.findIndex((c, i) => c.includes(label) && i !== partCol && !looksLikeTotalColumnLabel(c));
    if (idx !== -1 && columnLooksNumeric(rows, headerIndex + 1, idx)) {
      priceCol = idx;
      break;
    }
  }
  if (priceCol === -1) {
    for (const label of TOTAL_ONLY_LABELS) {
      const idx = headerRow.findIndex((c, i) => c.includes(label) && i !== partCol);
      if (idx !== -1 && columnLooksNumeric(rows, headerIndex + 1, idx)) {
        priceCol = idx;
        priceIsLineTotal = true;
        break;
      }
    }
  }

  if (priceCol === -1) return {};

  const guesses: Record<string, number> = {};
  const normalizedPartNumbers = new Map(partNumbers.map((p) => [looseKey(p), p]));

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    const cellPart = looseKey(String(row[partCol] ?? ""));
    if (!cellPart) continue;
    // Exact match first; otherwise tolerate a supplier's own 1-4 letter prefix
    // in front of a part number that starts with a digit ("VOE14676744").
    let original = normalizedPartNumbers.get(cellPart);
    if (!original) {
      const stripped = cellPart.replace(/^[a-z]{1,4}(?=\d)/, "");
      if (stripped !== cellPart) original = normalizedPartNumbers.get(stripped);
    }
    if (!original) continue;

    let priceValue = parseMoney(String(row[priceCol] ?? ""));
    if (priceValue !== null && priceIsLineTotal && qtyCol !== -1) {
      const qty = parseMoney(String(row[qtyCol] ?? ""));
      if (qty && qty > 0) priceValue = priceValue / qty;
    }
    if (priceValue !== null) {
      guesses[original] = priceValue;
    }
  }

  return guesses;
}
