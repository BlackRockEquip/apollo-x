// Mechanic tablet layout (design C, 2026-10-27): the pure rules behind the part cards, filter tabs,
// "This job" summary and bottom-bar totals, kept apart from the page so they can be tested.
import type { PartCounts, PartFilter } from "./parts-summary";

export type TabletTone = "received" | "partial" | "picked" | "ordered" | "none";
export type TabletActionKind = "receive" | "receive-rest" | "undo" | "supplier";

export type TabletLine = {
  id: string;
  partNumber?: string | null;
  description?: string | null;
  quantity?: unknown;
  receivedQuantity?: unknown;
  pickedQuantity?: unknown;
  status?: string | null;
  supplierName?: string | null;
  orderNumber?: string | null;
};

export type TabletCard = {
  id: string;
  partNumber: string;
  description: string;
  qtyLabel: string;
  tone: TabletTone;
  statusLabel: string;
  note: string;
  outstanding: number;
  action: { kind: TabletActionKind; label: string } | null;
};

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

// 12 -> "12", 2.5 -> "2.5", 0.3333333 -> "0.3333"
export function formatQty(value: unknown): string {
  const n = Math.round(num(value) * 10000) / 10000;
  return String(n);
}

export function toneOf(status: string | null | undefined): TabletTone {
  switch (status) {
    case "RECEIVED": return "received";
    case "PARTIALLY_RECEIVED": return "partial";
    case "PICKED": return "picked";
    case "ON_ORDER": return "ordered";
    default: return "none";
  }
}

export function statusLabelOf(status: string | null | undefined): string {
  switch (status) {
    case "RECEIVED": return "Received";
    case "PARTIALLY_RECEIVED": return "Partly received";
    case "PICKED": return "On pick slip";
    case "ON_ORDER": return "Ordered";
    case "IN_STOCK": return "In stock";
    default: return "Not ordered";
  }
}

export function buildTabletCard(line: TabletLine): TabletCard {
  const quantity = num(line.quantity);
  const received = num(line.receivedQuantity);
  const picked = num(line.pickedQuantity);
  const outstanding = Math.max(0, quantity - received);
  const tone = toneOf(line.status);
  const supplier = (line.supplierName ?? "").trim();
  const order = (line.orderNumber ?? "").trim();

  const noteParts: string[] = [];
  if (received > 0) noteParts.push(outstanding > 0 ? `${formatQty(received)} of ${formatQty(quantity)} in` : `${formatQty(received)} of ${formatQty(quantity)}`);
  if (picked > 0) noteParts.push(`${formatQty(picked)} on pick slip`);
  if (supplier) noteParts.push(supplier);
  else if (tone === "none" || tone === "ordered") noteParts.push("No supplier yet");
  if (order) noteParts.push(`Order ${order}`);

  let action: TabletCard["action"] = null;
  if (outstanding <= 0) {
    if (received > 0) action = { kind: "undo", label: "Undo receive" };
  } else if (received > 0) {
    action = { kind: "receive-rest", label: `Receive ${formatQty(outstanding)} more` };
  } else if (tone === "none" && !supplier && !order && picked <= 0) {
    action = { kind: "supplier", label: "Choose supplier" };
  } else {
    action = { kind: "receive", label: "Mark received" };
  }

  return {
    id: String(line.id),
    partNumber: (line.partNumber ?? "").trim() || "—",
    description: (line.description ?? "").trim(),
    qtyLabel: `×${formatQty(quantity)}`,
    tone,
    statusLabel: statusLabelOf(line.status),
    note: noteParts.join(" · "),
    outstanding,
    action,
  };
}

export const TABLET_SEGMENT_LABELS: Record<PartFilter, string> = {
  all: "All",
  outstanding: "To receive",
  pickslip: "On pick slip",
  received: "Received",
};

export function tabletSegments(counts: PartCounts): { key: PartFilter; label: string; count: number }[] {
  return [
    { key: "all", label: TABLET_SEGMENT_LABELS.all, count: counts.total },
    { key: "outstanding", label: TABLET_SEGMENT_LABELS.outstanding, count: counts.outstanding },
    { key: "pickslip", label: TABLET_SEGMENT_LABELS.pickslip, count: counts.onPickSlip },
    { key: "received", label: TABLET_SEGMENT_LABELS.received, count: counts.received },
  ];
}

export type TabletFactsInput = {
  machine?: string;
  machineSerial?: string;
  componentSerial?: string;
  plantNumber?: string;
  machineHours?: string;
  scheduled?: string;
  technician?: string;
  fieldService?: boolean;
};

// Rows with nothing in them are left out so the summary stays short.
export function buildTabletFacts(input: TabletFactsInput): { label: string; value: string }[] {
  const rows: [string, string | undefined][] = [
    ["Machine", input.machine],
    ["Machine serial", input.machineSerial],
    ["Component serial", input.componentSerial],
    ["Plant number", input.plantNumber],
    ["Machine hours", input.machineHours && input.machineHours.trim() ? `${input.machineHours.trim()} h` : undefined],
  ];
  if (input.fieldService) {
    rows.push(["Scheduled", input.scheduled], ["Technician", input.technician]);
  }
  return rows.filter(([, value]) => value && value.trim()).map(([label, value]) => ({ label, value: (value as string).trim() }));
}

// The newest note: the last non-empty line, cut to max characters.
export function latestNote(notes: string | null | undefined, max = 180): string {
  const lines = (notes ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const last = lines[lines.length - 1] ?? "";
  return last.length > max ? `${last.slice(0, max - 1).trimEnd()}…` : last;
}

export function outstandingHeadline(counts: PartCounts): { title: string; sub: string } {
  if (counts.total === 0) return { title: "No parts yet", sub: "" };
  const title = counts.outstanding === 0 ? "All parts received" : `${counts.outstanding} ${counts.outstanding === 1 ? "part" : "parts"} outstanding`;
  return { title, sub: `${counts.received} of ${counts.total} received` };
}

// Index of the current status among the steps, 0-based; -1 when it is not on the track.
export function currentStepIndex(steps: string[], status: string): number {
  return steps.indexOf(status);
}
