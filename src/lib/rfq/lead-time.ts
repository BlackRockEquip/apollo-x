// 2026-10-27, user request (Compare quotes): an Availability column that reads the lead time for parts when the supplier
// gives one. Every supplier words it differently, so this turns what they print into one short, readable phrase:
//   STOCK, STK, "in stc", AVAILABLE IMMEDIATELY, YES  ->  "In stock"
//   7 DAYS, 10-14 Days, 10d-14d                         ->  "7 days", "10-14 days"
//   5 TO 10 WORKING DAYS                                ->  "5-10 working days"
//   3 HOURS, 2-3 weeks                                  ->  "3 hours", "2-3 weeks"
//   "6stc 2pdc" (Babcock's note after the description)  ->  "6 in stock, 2 PDC"
//   "ex sweden"                                         ->  "Ex Sweden"
// It is a best guess shown in a box the person can edit; nothing here is saved on its own.

const UNITS: Array<[RegExp, string]> = [
  [/^(?:working\s*days?|wdays?|wd)$/i, "working days"],
  [/^(?:days?|d)$/i, "days"],
  [/^(?:weeks?|wks?|w)$/i, "weeks"],
  [/^(?:hours?|hrs?|h)$/i, "hours"],
];

function unitName(raw: string | undefined): string | null {
  if (!raw) return null;
  const word = raw.trim();
  for (const [pattern, name] of UNITS) if (pattern.test(word)) return name;
  return null;
}

const STOCK_WORDS = /^(?:in\s*)?(?:stock|stk|stc)$|^ex[\s-]*stock$|^available(?:\s+immediately)?$|^immediate(?:ly)?$|^(?:in\s*stock\s*)?yes$|^on\s*(?:the\s*)?shelf$/i;

const UNIT_SOURCE = "working\\s*days?|wdays?|wd|days?|weeks?|wks?|hours?|hrs?|[dwh]";
// "10-14 days", "10 to 14 days", "10d-14d", "7 days", "1 TO 2 WORKING DAYS"
const RANGE = new RegExp(`^(\\d{1,3})\\s*(${UNIT_SOURCE})?\\s*(?:-|–|—|to)\\s*(\\d{1,3})\\s*(${UNIT_SOURCE})$`, "i");
const SINGLE = new RegExp(`^(\\d{1,3})\\s*(${UNIT_SOURCE})$`, "i");

/** One table cell -> a lead time phrase, or null when the cell is not a lead time. */
export function normalizeLeadTime(raw: string | null | undefined): string | null {
  const cell = String(raw ?? "").replace(/\s+/g, " ").trim().replace(/[.;,]+$/, "");
  if (!cell) return null;
  if (STOCK_WORDS.test(cell)) return "In stock";
  const range = RANGE.exec(cell);
  if (range) {
    const unit = unitName(range[4]) ?? unitName(range[2]);
    if (unit) return `${Number(range[1])}-${Number(range[3])} ${unit}`;
  }
  const single = SINGLE.exec(cell);
  if (single) {
    const unit = unitName(single[2]);
    if (unit) return `${Number(single[1])} ${Number(single[1]) === 1 ? unit.replace(/s$/, "") : unit}`;
  }
  return null;
}

/** Babcock-style notes printed after the description: "in stc", "(6stc 2pdc)", "ex sweden". */
export function leadTimeFromDescription(raw: string | null | undefined): string | null {
  const text = String(raw ?? "");
  if (!text) return null;
  const parts: string[] = [];
  const counted = [...text.matchAll(/(?<![A-Za-z0-9])(\d{1,4})\s*(stc|pdc)\b/gi)];
  for (const m of counted) parts.push(`${Number(m[1])} ${m[2].toLowerCase() === "stc" ? "in stock" : "PDC"}`);
  if (parts.length > 0) return parts.join(", ");
  if (/\bin\s*stc\b|\bin\s*stock\b/i.test(text)) return "In stock";
  if (/\bpdc\b/i.test(text)) return "PDC";
  const overseas = /\bex[\s-]+(?!stock\b|works\b|factory\b|vat\b|gst\b|tax\b)([a-z]{3,})\b/i.exec(text);
  if (overseas) return `Ex ${overseas[1].charAt(0).toUpperCase()}${overseas[1].slice(1).toLowerCase()}`;
  return null;
}

/** The lead time on one quote row: the first cell that reads as one, else a note inside the description cells. */
export function leadTimeFromCells(cells: string[]): string | null {
  for (const cell of cells) {
    const found = normalizeLeadTime(cell);
    if (found) return found;
  }
  for (const cell of cells) {
    const found = leadTimeFromDescription(cell);
    if (found) return found;
  }
  return null;
}
