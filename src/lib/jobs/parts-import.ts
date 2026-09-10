// ----------------------------------------------------------------------------
// Parses an uploaded parts-list spreadsheet (.xlsx/.xls/.csv) into rows the
// same shape as a pasted bulk-add line (partNumber, quantity, description).
// Added at the user's explicit request for an "import parts list" option
// next to the paste box — mirrors the header-detection approach already used
// for RFQ price extraction (src/lib/rfq/quote-extraction.ts's
// guessFromSpreadsheet), just producing part rows instead of a price guess.
//
// Like the RFQ extractor, this is best-effort: every supplier/customer
// spreadsheet is laid out differently. A row missing a recognizable part
// number or a valid positive quantity is silently skipped rather than
// failing the whole import, same as parseBulkPartRow does for pasted text.
// ----------------------------------------------------------------------------

export type ExtractedPartRow = { partNumber: string; quantity: number; description: string | null };

const PART_HEADER_LABELS = ["part number", "part no", "part #", "part", "item no", "item"];
const QTY_HEADER_LABELS = ["qty", "quantity"];
const DESCRIPTION_HEADER_LABELS = ["description", "desc"];

function findColumn(row: string[], labels: string[], exclude: number[] = []): number {
  for (const label of labels) {
    const idx = row.findIndex((c, i) => c.includes(label) && !exclude.includes(i));
    if (idx !== -1) return idx;
  }
  return -1;
}

export async function extractPartLinesFromSpreadsheet(bytes: Buffer): Promise<ExtractedPartRow[]> {
  // Dynamically imported so this (fairly heavy) parser is only loaded when a
  // file is actually uploaded — same reasoning as quote-extraction.ts.
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(bytes, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];

  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (rows.length === 0) return [];

  // Scan the first several rows for one that looks like a header — a title
  // or logo row above the real header is common, so this isn't always row 0.
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
  if (headerIndex === -1) return [];

  const headerRow = rows[headerIndex].map((c) => String(c).trim().toLowerCase());
  const qtyCol = findColumn(headerRow, QTY_HEADER_LABELS, [partCol]);
  const descCol = findColumn(headerRow, DESCRIPTION_HEADER_LABELS, [partCol, qtyCol].filter((i) => i !== -1));

  const out: ExtractedPartRow[] = [];
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    const partNumber = String(row[partCol] ?? "").trim();
    if (!partNumber) continue;
    const quantity = qtyCol !== -1 ? Number(row[qtyCol]) : 1;
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    const description = descCol !== -1 ? String(row[descCol] ?? "").trim() || null : null;
    out.push({ partNumber, quantity, description });
  }
  return out;
}
