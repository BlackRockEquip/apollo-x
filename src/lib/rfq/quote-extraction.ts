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

export async function guessPricesFromFile(bytes: Buffer, fileName: string, partNumbers: string[]): Promise<Record<string, number>> {
  const ext = fileName.toLowerCase().split(".").pop() || "";

  try {
    if (ext === "xlsx" || ext === "xls" || ext === "csv") {
      return await guessFromSpreadsheet(bytes, partNumbers);
    }
    if (ext === "pdf") {
      const text = await extractPdfText(bytes);
      return guessFromText(text, partNumbers);
    }
    if (ext === "docx") {
      const text = await extractDocxText(bytes);
      return guessFromText(text, partNumbers);
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

async function extractPdfText(bytes: Buffer): Promise<string> {
  // Dynamically imported so this (fairly heavy) parser is only ever loaded
  // when someone actually uploads a PDF quote.
  const pdfParse = (await import("pdf-parse")).default;
  const result = await pdfParse(bytes);
  return result.text || "";
}

async function extractDocxText(bytes: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer: bytes });
  return result.value || "";
}

// Matches money-looking numbers: an optional currency symbol/code, then
// digits with optional thousand separators (comma or space) and an
// optional 2-decimal-place cents part. Deliberately loose — this only
// needs to find *candidates* on a line, not validate currency formatting.
const MONEY_PATTERN = /(?:R|ZAR|\$|USD|EUR|€)?\s?(\d{1,3}(?:[ ,]\d{3})*(?:\.\d{2})?|\d+\.\d{2})/gi;

function parseMoney(raw: string): number | null {
  const cleaned = raw.replace(/[ ,]/g, "");
  const value = parseFloat(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function guessFromText(text: string, partNumbers: string[]): Record<string, number> {
  const guesses: Record<string, number> = {};
  const lines = text.split(/\r?\n/);

  for (const partNumber of partNumbers) {
    const needle = partNumber.trim().toLowerCase();
    if (!needle) continue;

    const line = lines.find((l) => l.toLowerCase().includes(needle));
    if (!line) continue;

    // Strip the part number itself out first so a part number that happens
    // to contain digits (e.g. "PN-4021") is never mistaken for the price.
    const withoutPartNumber = line.split(new RegExp(escapeRegExp(needle), "i")).join(" ");
    const matches = [...withoutPartNumber.matchAll(MONEY_PATTERN)]
      .map((m) => parseMoney(m[1]))
      .filter((n): n is number => n !== null);

    if (matches.length > 0) {
      // Quantity and part numbers tend to appear earlier on the row; the
      // unit price (or line total) tends to be one of the last numbers —
      // take the last match as the best guess.
      guesses[partNumber] = matches[matches.length - 1];
    }
  }

  return guesses;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Ordered most-specific-first: the first label that matches a header cell
// (and whose column actually looks like it contains money — see
// columnLooksNumeric below) wins. Plain "unit" is deliberately included —
// a lot of real supplier quotes just label the price column "Unit" — but
// it's checked after the more specific labels, and never trusted blindly,
// since a column called "Unit" can just as easily mean "unit of measure"
// (e.g. "EA", "Box") rather than "unit price".
const PRICE_HEADER_LABELS = ["unit price", "unit cost", "price per unit", "cost per unit", "price/unit", "unit rate", "rate", "unit", "price", "cost", "amount"];
// A plain "Total" (or "Line total" / "Ext price") column is a last resort,
// not tried until every PRICE_HEADER_LABELS candidate has failed — it's a
// line total (unit price × quantity), not a unit price, so using it
// directly would be wrong for any line with quantity > 1. If a quantity
// column can also be found, the total is divided back down to an
// approximate unit price; otherwise it's used as-is (still just a guess,
// always shown for review before anything is saved).
const TOTAL_ONLY_LABELS = ["line total", "ext price", "extended price", "ext. price", "total"];
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
    const idx = headerRow.findIndex((c, i) => c.includes(label) && i !== partCol);
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
  const normalizedPartNumbers = new Map(partNumbers.map((p) => [p.trim().toLowerCase(), p]));

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    const cellPart = String(row[partCol] ?? "").trim().toLowerCase();
    if (!cellPart) continue;
    const original = normalizedPartNumbers.get(cellPart);
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
