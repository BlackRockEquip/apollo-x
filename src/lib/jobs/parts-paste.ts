// 2026-10-27, user request: "When adding parts to a job, remove the import parts list, allow a user only to type or
// paste parts required, this will remove the headache of always checking the columns and naming in a spreadsheet".
// The Add parts box is now the only way to add parts to a job, so it has to cope with whatever gets typed or pasted:
//   PN-1001, 2, Hydraulic seal kit      (commas)
//   PN-1001<tab>2<tab>Hydraulic seal    (straight out of Excel)
//   PN-1001 2 Hydraulic seal kit        (just spaces)
//   PN-1001 x2          PN-1001 2 pcs   PN-1001 - 2          (the way people type in a message)
//   PN-1001                                                    (no quantity means 1)
//   Part number, Qty, Description                              (a pasted header row is ignored)
// The part number is always first. The quantity is the next thing that reads as a number (a trailing "x2" also counts),
// everything else is the description. Nothing here touches the database.

export type ParsedPartLineRow = { partNumber: string; description: string | null; quantity: number };
export type PartsPasteResult = { rows: ParsedPartLineRow[]; skipped: string[] };

const MAX_PART_NUMBER_LENGTH = 64;
const MAX_QUANTITY = 1_000_000;
const MAX_SKIPPED_KEPT = 500;

const HEADER_WORDS = new Set(["part", "parts", "number", "no", "no.", "nr", "#", "item", "code", "qty", "quantity", "qnty", "description", "desc", "line", "ref", "reference"]);
const HEADER_KEY_WORDS = new Set(["qty", "quantity", "qnty", "description", "desc"]);

/** "Part number, Qty, Description" (in any order or delimiter) is a header row, not a part. */
export function isHeaderRow(line: string): boolean {
  const tokens = line.toLowerCase().split(/[\s,;|\t]+/).filter(Boolean);
  return tokens.length >= 2 && tokens.every((t) => HEADER_WORDS.has(t)) && tokens.some((t) => HEADER_KEY_WORDS.has(t));
}

function unquote(value: string): string {
  return value.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
}

/**
 * One cell or word as a quantity: "2", "2.5", "x2", "2x", "qty 2", "2 pcs", "2 off".
 * null = not a quantity at all; 0 = a number that is not a usable quantity (zero or negative).
 */
export function parseQuantity(raw: string): number | null {
  const cleaned = raw.trim().toLowerCase()
    .replace(/^(?:qty|quantity)\s*[:=]?\s*/, "")
    .replace(/^[x×]\s*/, "")
    .replace(/\s*(?:[x×]|pcs?|pieces?|off|ea|each|units?)\.?$/, "")
    .trim();
  if (!/^-?\d+(?:[.,]\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned.replace(",", "."));
  if (!Number.isFinite(value) || value <= 0 || value > MAX_QUANTITY) return 0;
  return value;
}

/** A last word that can only be a quantity: "x2" or "2x". A bare number at the end stays in the description. */
function isMarkedQuantity(word: string): boolean {
  return /^(?:[x×]\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s*[x×])$/i.test(word.trim());
}

const SEPARATOR_WORDS = new Set(["-", "–", "—", ":", "=", "@"]);

type Parsed = { partNumber: string; quantity: number | null; description: string };

function parseDelimited(cells: string[]): Parsed {
  const clean = cells.map(unquote);
  const partNumber = clean[0] || "";
  const rest = clean.slice(1).filter(Boolean);
  if (rest.length === 0) return { partNumber, quantity: 1, description: "" };
  const first = parseQuantity(rest[0]);
  if (first !== null) return { partNumber, quantity: first, description: rest.slice(1).join(", ") };
  // "PN-1001, Hydraulic seal kit, 2": the quantity after the description.
  const second = rest.length >= 2 ? parseQuantity(rest[1]) : null;
  if (second !== null) return { partNumber, quantity: second, description: [rest[0], ...rest.slice(2)].join(", ") };
  return { partNumber, quantity: 1, description: rest.join(", ") };
}

function parseSpaced(line: string): Parsed {
  const words = line.split(/\s+/).filter(Boolean);
  const partNumber = unquote(words[0] || "");
  let rest = words.slice(1);
  while (rest.length > 0 && SEPARATOR_WORDS.has(rest[0])) rest = rest.slice(1);
  if (rest.length === 0) return { partNumber, quantity: 1, description: "" };
  // "PN-1001 x 2"
  if (/^[x×]$/i.test(rest[0]) && rest.length >= 2) {
    const q = parseQuantity(rest[1]);
    if (q !== null) return { partNumber, quantity: q, description: rest.slice(2).join(" ") };
  }
  // "PN-1001 2 Hydraulic seal kit", "PN-1001 x2 seal", "PN-1001 2pcs"
  const first = parseQuantity(rest[0]);
  if (first !== null) {
    // "2 pcs" / "2 off": the unit word belongs to the quantity, not the description.
    const unitWord = rest.length >= 2 && /^(?:pcs?|pieces?|off|ea|each|units?)\.?$/i.test(rest[1]);
    return { partNumber, quantity: first, description: rest.slice(unitWord ? 2 : 1).join(" ") };
  }
  // "PN-1001 Hydraulic seal kit x2"
  const last = rest[rest.length - 1];
  if (rest.length >= 2 && isMarkedQuantity(last)) {
    const q = parseQuantity(last);
    if (q !== null) return { partNumber, quantity: q, description: rest.slice(0, -1).join(" ") };
  }
  return { partNumber, quantity: 1, description: rest.join(" ") };
}

export function parsePartsPaste(text: string): PartsPasteResult {
  const rows: ParsedPartLineRow[] = [];
  const skipped: string[] = [];
  for (const rawLine of String(text ?? "").split(/\r?\n/)) {
    const line = rawLine.replace(/^\s*[-*•]\s+/, "").trim();
    if (!line) continue;
    if (isHeaderRow(line)) continue;

    let parsed: Parsed;
    if (line.includes("\t")) parsed = parseDelimited(line.split("\t"));
    else if (line.includes(",")) parsed = parseDelimited(line.split(","));
    else if (line.includes(";")) parsed = parseDelimited(line.split(";"));
    else if (line.includes("|")) parsed = parseDelimited(line.split("|"));
    else parsed = parseSpaced(line);

    const tooLong = parsed.partNumber.length > MAX_PART_NUMBER_LENGTH;
    if (!parsed.partNumber || tooLong || !parsed.quantity || parsed.quantity <= 0) {
      if (skipped.length < MAX_SKIPPED_KEPT) skipped.push(line);
      continue;
    }
    rows.push({ partNumber: parsed.partNumber, quantity: parsed.quantity, description: parsed.description.trim() || null });
  }
  return { rows, skipped };
}
