// Parts-list filter chips, status tones and the footer summary (design A).

export type PartFilter = "all" | "outstanding" | "pickslip" | "received";
export type PartTone = "received" | "partial" | "picked" | "ordered" | "none";

export type PartLineLike = {
  status?: unknown;
  quantity?: unknown;
  receivedQuantity?: unknown;
  pickedQuantity?: unknown;
};

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function isOutstanding(line: PartLineLike): boolean {
  return num(line.quantity) - num(line.receivedQuantity) > 0;
}

export function isOnPickSlip(line: PartLineLike): boolean {
  return String(line.status ?? "") === "PICKED" || num(line.pickedQuantity) > 0;
}

export function isReceived(line: PartLineLike): boolean {
  return String(line.status ?? "") === "RECEIVED";
}

export function partTone(status: unknown): PartTone {
  switch (String(status ?? "")) {
    case "RECEIVED": return "received";
    case "PARTIALLY_RECEIVED": return "partial";
    case "PICKED": return "picked";
    case "ON_ORDER": return "ordered";
    default: return "none";
  }
}

export function matchesPartFilter(line: PartLineLike, filter: PartFilter): boolean {
  switch (filter) {
    case "outstanding": return isOutstanding(line);
    case "pickslip": return isOnPickSlip(line);
    case "received": return isReceived(line);
    default: return true;
  }
}

export type PartCounts = {
  total: number;
  outstanding: number;
  onPickSlip: number;
  received: number;
  partial: number;
  picked: number;
  ordered: number;
  none: number;
};

export function countParts(lines: PartLineLike[]): PartCounts {
  const counts: PartCounts = { total: lines.length, outstanding: 0, onPickSlip: 0, received: 0, partial: 0, picked: 0, ordered: 0, none: 0 };
  for (const line of lines) {
    if (isOutstanding(line)) counts.outstanding += 1;
    if (isOnPickSlip(line)) counts.onPickSlip += 1;
    counts[partTone(line.status)] += 1;
  }
  return counts;
}

// "5 received · 2 partly received · 1 on pick slip · 3 ordered · 1 to be ordered" — empty groups are skipped.
export function summaryParts(counts: PartCounts, toBeOrderedLabel = "to be ordered"): string[] {
  const out: string[] = [];
  if (counts.received) out.push(`${counts.received} received`);
  if (counts.partial) out.push(`${counts.partial} partly received`);
  if (counts.picked) out.push(`${counts.picked} on pick slip`);
  if (counts.ordered) out.push(`${counts.ordered} ordered`);
  if (counts.none) out.push(`${counts.none} ${toBeOrderedLabel}`);
  return out;
}
