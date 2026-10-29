// Presentation helpers for job status pills and the "received / sent back" split used on the Customer pages (2026-10-29 redesign).
// Pure (no imports) so they can be unit tested. Status names are the JobStatus enum values.

export type StatusTone = "work" | "wait" | "done" | "neutral";

const WAIT = new Set(["TO_BE_COLLECTED", "TO_BE_RECEIVED", "QUOTE_IN_PROGRESS", "AWAITING_GO_AHEAD", "AWAIT_OUTWORK", "WAITING_FOR_PARTS", "AWAIT_ASSESSMENT", "TO_ATTEND"]);
const DONE = new Set(["TO_BE_DELIVERED", "DELIVERED_AWAITING_PAYMENT", "AWAIT_PAYMENT", "COMPLETE", "CLOSED"]);
const NEUTRAL = new Set(["CANCELLED", "RETURNED_UNREPAIRED"]);

/** Colour family for a status pill: blue = being worked on, amber = waiting on something, green = finished / on its way back, grey = cancelled. */
export function statusTone(status: string): StatusTone {
  if (NEUTRAL.has(status)) return "neutral";
  if (DONE.has(status)) return "done";
  if (WAIT.has(status)) return "wait";
  return "work";
}

export const TONE_COLORS: Record<StatusTone, { bg: string; fg: string }> = {
  work: { bg: "#e8f0fc", fg: "#1d4fa3" },
  wait: { bg: "#fff1d6", fg: "#8a5200" },
  done: { bg: "#e3f5ec", fg: "#066a4a" },
  neutral: { bg: "#eef0f3", fg: "#475467" },
};

/** Statuses that mean a customer's job has gone (or is ready to go) back to them. Also used to build the server-side "sent back" filter. */
export const SENT_BACK_STATUSES = ["TO_BE_DELIVERED", "DELIVERED_AWAITING_PAYMENT", "AWAIT_PAYMENT", "COMPLETE", "CLOSED", "CANCELLED", "RETURNED_UNREPAIRED"] as const;
const SENT_BACK = new Set<string>(SENT_BACK_STATUSES);

/** A customer's job is "received" while it is still with us, and "sent back" once it is ready to go back or has gone (or was returned unrepaired / cancelled). */
export function customerJobSide(status: string, returnedUnrepaired = false): "received" | "sent" {
  return returnedUnrepaired || SENT_BACK.has(status) ? "sent" : "received";
}

/** Whole days between two dates (UTC day), never negative. */
export function daysBetween(from: Date | string | null | undefined, to: Date | string = new Date()): number {
  if (!from) return 0;
  const a = new Date(from);
  const b = new Date(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  const day = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.max(0, Math.round((day(b) - day(a)) / 86400000));
}
