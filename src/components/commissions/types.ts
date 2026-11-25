import type { MonthResult } from "@/lib/commissions/calc";

// What the Commissions screens get back from /api/v1/commissions. Written out here (not imported from the service) so the screens
// never pull server code into the browser. calc.ts is pure and safe to import.

export type RepSetting = { rate: number; monthlyTarget: number };
export type RepView = { id: string; name: string; active: boolean; setting: RepSetting | null; months: Record<string, MonthResult>; lineCount: number; payoutCount: number };
export type InvoiceView = { id?: string; invoiceNumber: string; invoicedOn: string; amountExVat: number; clientPaidOn: string | null };
export type CostView = { id?: string; description: string; amount: number };
export type LineView = {
  id: string; salesRepresentativeId: string; jobId: string | null; jobReference: string; jobNumber: string | null; description: string; periodMonth: string;
  fuelCharge: number; otherExpenses: number; otherExpensesNote: string; rateOverride: number | null; noCommission: boolean; notes: string;
  invoices: InvoiceView[]; costs: CostView[]; costsTotal: number; createdAt: string; updatedAt: string;
};
export type FuelView = { id: string; salesRepresentativeId: string; month: string; amount: number };
export type PayoutView = { id: string; salesRepresentativeId: string; month: string; amount: number; paidOn: string; note: string };
export type Overview = { today: string; canEdit: boolean; reps: RepView[]; lines: LineView[]; fuel: FuelView[]; payouts: PayoutView[] };
export type JobHit = { id: string; jobNumber: string; description: string; salesRepresentativeId: string | null; machine: string; customerName: string };

export async function commissionsApi<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const response = await fetch(url, {
    method: init?.method ?? "GET",
    headers: init?.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(body?.error?.message || "The request could not be completed.");
  return body as T;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function formatMoney(value: number): string {
  const sign = value < -0.004 ? "−" : "";
  const [whole, cents] = Math.abs(value).toFixed(2).split(".");
  return `${sign}R ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}.${cents}`;
}

export function formatMoneyShort(value: number): string {
  return formatMoney(value).replace(/\.\d\d$/, "");
}

export function monthLabel(month: string, long = false): string {
  const index = Number(month.slice(5, 7)) - 1;
  return `${(long ? MONTHS_LONG : MONTHS)[index] ?? month} ${month.slice(0, 4)}`;
}

export function shortMonth(month: string): string {
  return MONTHS[Number(month.slice(5, 7)) - 1] ?? month;
}

export function formatDate(date: string | null): string {
  if (!date) return "—";
  return `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export function repRule(setting: RepSetting | null): string {
  if (!setting) return "Rate and target not set";
  const rate = `${Math.round(setting.rate * 10000) / 100}% of profit`;
  return setting.monthlyTarget > 0 ? `${rate} · target ${formatMoneyShort(setting.monthlyTarget)} / month` : `${rate} · no target`;
}

export function yearMonths(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
}

/** Parse a money field the way people type it: "R 1 234,50", "1234.5", "12 000". */
export function parseMoney(text: string): number {
  const cleaned = text.replace(/[R\s]/gi, "").replace(/,(\d{1,2})$/, ".$1").replace(/,/g, "");
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : 0;
}
