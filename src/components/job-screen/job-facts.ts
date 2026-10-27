// The key-facts strip under the job header (design A): ETA, quote, orders, hours and parts.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-10-27" or "2026-10-27T00:00:00.000Z" -> local midnight of that calendar day. Never shifted by timezone.
export function parseDateOnly(value: unknown): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? "").trim());
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

export function formatFactDate(value: unknown): string {
  const date = parseDateOnly(value);
  if (!date) return "";
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function daysFrom(value: unknown, now: Date): number | null {
  const date = parseDateOnly(value);
  if (!date) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((date.getTime() - today.getTime()) / 86400000);
}

export function relativeDaysNote(days: number | null): string {
  if (days === null) return "";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "1 day overdue";
  if (days > 1) return `in ${days} days`;
  return `${-days} days overdue`;
}

export const PO_STATUS_LABELS: Record<string, string> = {
  TBA: "TBA",
  AWAIT_PAYMENT: "Awaiting payment",
  PARTIALLY_PAID: "Partially paid",
  PAID: "Paid",
  NOT_APPLICABLE: "Not applicable",
};

export type FactTone = "default" | "good" | "warn" | "bad";
export type FactItem = { key: string; label: string; value: string; note?: string; tone?: FactTone };

export type FactsInput = {
  fieldService: boolean;
  closed: boolean;
  etaDate?: string;
  quoteNumber?: string;
  quoteDate?: string;
  salesOrderNumber?: string;
  purchaseOrderNumber?: string;
  purchaseOrderStatus?: string;
  machineHours?: string;
  scheduledDate?: string;
  technician?: string;
  siteLine?: string;
  machine?: string;
  hoursTotal?: string;
  partsTotal: number;
  partsReceived: number;
  now?: Date; // left out until the page has mounted, so server and browser agree on the first render
};

const DASH = "—";

function dateFact(key: string, label: string, date: string | undefined, now: Date | undefined, closed: boolean): FactItem {
  const formatted = formatFactDate(date);
  if (!formatted) return { key, label, value: DASH };
  const days = closed || !now ? null : daysFrom(date, now);
  const note = relativeDaysNote(days);
  return { key, label, value: formatted, note: note || undefined, tone: days !== null && days < 0 ? "bad" : days !== null && days <= 2 ? "warn" : "default" };
}

export function partsFact(total: number, received: number): FactItem {
  if (total <= 0) return { key: "parts", label: "Parts", value: DASH };
  const tone: FactTone = received >= total ? "good" : "default";
  return { key: "parts", label: "Parts", value: `${received} of ${total}`, note: "received", tone };
}

export function buildFacts(input: FactsInput): FactItem[] {
  const text = (v: string | undefined) => (v && v.trim() ? v.trim() : DASH);
  if (input.fieldService) {
    return [
      dateFact("scheduled", "Scheduled", input.scheduledDate, input.now, input.closed),
      { key: "technician", label: "Technician", value: text(input.technician) },
      { key: "site", label: "Site", value: text(input.siteLine) },
      { key: "machine", label: "Machine", value: text(input.machine) },
      { key: "hours", label: "Total hours", value: text(input.hoursTotal) },
      partsFact(input.partsTotal, input.partsReceived),
    ];
  }
  const po = input.purchaseOrderStatus ? PO_STATUS_LABELS[input.purchaseOrderStatus] ?? input.purchaseOrderStatus : "";
  const poTone: FactTone = input.purchaseOrderStatus === "PAID" ? "good" : input.purchaseOrderStatus === "AWAIT_PAYMENT" || input.purchaseOrderStatus === "PARTIALLY_PAID" ? "warn" : "default";
  const quoteDate = formatFactDate(input.quoteDate);
  return [
    dateFact("eta", "ETA", input.etaDate, input.now, input.closed),
    { key: "quote", label: "Quote", value: text(input.quoteNumber), note: quoteDate || undefined },
    { key: "so", label: "Sales order", value: text(input.salesOrderNumber) },
    { key: "po", label: "Purchase order", value: text(input.purchaseOrderNumber), note: po || undefined, tone: poTone },
    { key: "hours", label: "Machine hours", value: text(input.machineHours) },
    partsFact(input.partsTotal, input.partsReceived),
  ];
}
