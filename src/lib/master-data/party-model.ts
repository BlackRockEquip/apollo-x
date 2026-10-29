// Pure rules behind the Customers / Suppliers redesign (2026-10-29): what counts as an "open" job, an "overdue" ETA or an overdue outwork
// item, and how the tiles on the list and detail pages are totalled. No imports from Prisma so every rule can be unit tested.
import { customerJobSide, daysBetween } from "@/lib/ui/job-tone";

/** A job that has finished, been closed or been cancelled is no longer "open". */
export const CLOSED_JOB_STATUSES = ["COMPLETE", "CLOSED", "CANCELLED"] as const;
/** Outwork that has been out with a supplier longer than this is flagged overdue. */
export const OUTWORK_OVERDUE_DAYS = 7;

export function isOpenJob(status: string, returnedUnrepaired = false): boolean {
  return !returnedUnrepaired && !(CLOSED_JOB_STATUSES as readonly string[]).includes(status);
}

/** Midnight (UTC day) of the given date, so "ETA is today" is not overdue yet. */
export function startOfDay(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function monthsAgo(now: Date, months: number): Date {
  const d = new Date(now.getTime());
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

/** True when the job is still with us (not sent back) and its ETA date is before today. */
export function isOverdueEta(etaDate: Date | string | null | undefined, status: string, returnedUnrepaired = false, now: Date = new Date()): boolean {
  if (!etaDate) return false;
  if (customerJobSide(status, returnedUnrepaired) !== "received") return false;
  const eta = new Date(etaDate);
  if (Number.isNaN(eta.getTime())) return false;
  return eta.getTime() < startOfDay(now).getTime();
}

export type StatusGroup = { status: string; returnedUnrepaired: boolean; count: number };
export type CustomerJobSummary = { total: number; inWorkshop: number; sentBack: number; overdue: number; warranty: number; warrantyShare: string };

/** Totals for the customer detail tiles from `groupBy(status, returnedUnrepaired)` rows plus two plain counts. */
export function summarizeCustomerJobs(groups: StatusGroup[], overdue: number, warranty: number): CustomerJobSummary {
  let inWorkshop = 0;
  let sentBack = 0;
  for (const g of groups) {
    if (customerJobSide(g.status, g.returnedUnrepaired) === "received") inWorkshop += g.count;
    else sentBack += g.count;
  }
  const total = inWorkshop + sentBack;
  return { total, inWorkshop, sentBack, overdue, warranty, warrantyShare: total > 0 ? `${((warranty / total) * 100).toFixed(1)}%` : "0%" };
}

export type OutworkLike = { status: string; dateSentOut: Date | string | null; dateReceived: Date | string | null };
export type OutworkState = "out" | "overdue" | "received";

export function outworkState(item: Pick<OutworkLike, "status" | "dateSentOut">, now: Date = new Date()): OutworkState {
  if (item.status === "RECEIVED") return "received";
  return item.dateSentOut && daysBetween(item.dateSentOut, now) > OUTWORK_OVERDUE_DAYS ? "overdue" : "out";
}

/** Days an item has been (or was) out: sent to received for finished items, sent to today for items still out. */
export function outworkDaysOut(item: OutworkLike, now: Date = new Date()): number {
  if (!item.dateSentOut) return 0;
  return daysBetween(item.dateSentOut, item.status === "RECEIVED" && item.dateReceived ? item.dateReceived : now);
}

/** Average days from sent to received over items that have both dates, 1 decimal place. null when there is nothing to average. */
export function avgTurnaroundDays(items: Array<Pick<OutworkLike, "dateSentOut" | "dateReceived">>): number | null {
  const spans = items.filter((i) => i.dateSentOut && i.dateReceived).map((i) => daysBetween(i.dateSentOut, i.dateReceived!));
  if (spans.length === 0) return null;
  return Math.round((spans.reduce((a, b) => a + b, 0) / spans.length) * 10) / 10;
}

export type SupplierOutworkSummary = { out: number; overdue: number; receivedBack: number; avgTurnaround: number | null };

/** Totals for the supplier detail tiles. `recent` = items received in the last 90 days (what "Received back" counts). */
export function summarizeSupplierOutwork(items: OutworkLike[], now: Date = new Date()): SupplierOutworkSummary {
  const since = new Date(now.getTime() - 90 * 86400000);
  let out = 0;
  let overdue = 0;
  let receivedBack = 0;
  for (const i of items) {
    const state = outworkState(i, now);
    if (state === "received") {
      if (i.dateReceived && new Date(i.dateReceived).getTime() >= since.getTime()) receivedBack += 1;
    } else {
      out += 1;
      if (state === "overdue") overdue += 1;
    }
  }
  return { out, overdue, receivedBack, avgTurnaround: avgTurnaroundDays(items.filter((i) => i.status === "RECEIVED")) };
}

/** Normalises a list-page "activity" filter value from the query string. */
export function parseActivityFilter(value: unknown): "all" | "open" {
  return value === "open" ? "open" : "all";
}
