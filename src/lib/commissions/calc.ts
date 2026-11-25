// ---------------------------------------------------------------------------
// 2026-11-25 — Commissions: the maths, as pure functions (no database, no React) so the server, the screens (live preview in
// the job dialog) and the tests all work it out the same way.
//
// Taken from the company's own Commissions.xlsx, as confirmed by the user ("look at Vernon for November, that is how it should
// work"):
//   - Profit on a line = invoices (ex VAT) - costs - fuel charge (other than self) - other expenses.
//   - A line counts towards the month of its first invoice date.
//   - Rep WITH a monthly target (their cost to company): the month starts at minus the target and every line's profit (or loss)
//     moves the balance. Commission = rate x whatever the month ends above the target. Vernon, November 2026: profit
//     R66 002.03 - target R45 000 = R21 002.03 x 15% = R3 150.30. A per-line rate or "no commission" does not apply here.
//   - Rep WITHOUT a target: commission = rate x each line's profit (a loss earns nothing), with an optional rate for one line
//     or no commission on that line.
//   - Commission for a month is due at the end of the month after the client's final payment of the last unpaid invoice in it.
// The rep's own fuel used for the month is kept beside this and never enters the sums.
// ---------------------------------------------------------------------------

export type CalcInvoice = { amount: number; invoicedOn: string; clientPaidOn: string | null };
export type CalcLine = {
  id: string;
  invoices: CalcInvoice[];
  costs: number;
  fuelCharge: number;
  otherExpenses: number;
  rateOverride: number | null;
  noCommission: boolean;
  /** Tie-breaker for lines invoiced on the same day (ISO timestamp). */
  createdAt?: string;
};
export type CalcRep = { rate: number; monthlyTarget: number };
// OVERPAID (2026-11-25): more was paid out for the month than it works out to. Shown, never carried into another month.
export type MonthStatus = "NONE" | "WAITING_CLIENT" | "DUE" | "OVERDUE" | "PART_PAID" | "PAID" | "OVERPAID";

export type LineResult = {
  id: string;
  invoiced: number;
  profit: number;
  /** Target balance after this line (negative = still to go). Null for a rep with no target. */
  balanceAfter: number | null;
  /** True on the line that took the month over its target. */
  metTarget: boolean;
  /** Commission earned by this line (no-target reps only; a target month earns as a whole). */
  commission: number | null;
  clientPaid: boolean;
};

export type MonthResult = {
  month: string;
  lineCount: number;
  invoiced: number;
  profit: number;
  target: number;
  aboveTarget: number;
  targetMet: boolean;
  /** Job reference of the line that took the month over its target. */
  metById: string | null;
  rate: number;
  commission: number;
  paid: number;
  owed: number;
  /** Paid out above what the month works out to (0 when not overpaid). Not carried into another month. */
  overpaid: number;
  status: MonthStatus;
  /** "YYYY-MM-DD": end of the month after the last client payment, once every invoice in the month is paid. */
  dueOn: string | null;
  paidInvoices: number;
  totalInvoices: number;
  lines: LineResult[];
};

export function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function lineInvoiced(line: Pick<CalcLine, "invoices">): number {
  return money(line.invoices.reduce((sum, inv) => sum + inv.amount, 0));
}

export function lineProfit(line: CalcLine): number {
  return money(lineInvoiced(line) - line.costs - line.fuelCharge - line.otherExpenses);
}

export function firstInvoiceDate(invoices: ReadonlyArray<Pick<CalcInvoice, "invoicedOn">>): string | null {
  const dates = invoices.map((inv) => inv.invoicedOn).filter(Boolean).sort();
  return dates[0] ?? null;
}

/** "YYYY-MM" the line counts towards: the month of its first invoice. */
export function lineMonth(invoices: ReadonlyArray<Pick<CalcInvoice, "invoicedOn">>): string | null {
  const first = firstInvoiceDate(invoices);
  return first ? first.slice(0, 7) : null;
}

/** Last day of the month after the given date ("2026-11-21" -> "2026-12-31"). */
export function endOfFollowingMonth(date: string): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7)); // 1-12; the following month is index `month` in 0-based terms
  const last = new Date(Date.UTC(year, month + 1, 0));
  return last.toISOString().slice(0, 10);
}

function sortLines(lines: readonly CalcLine[]): CalcLine[] {
  return [...lines].sort((a, b) => {
    const da = firstInvoiceDate(a.invoices) ?? "";
    const db = firstInvoiceDate(b.invoices) ?? "";
    if (da !== db) return da < db ? -1 : 1;
    return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
  });
}

/**
 * One rep, one month. `lines` are the lines that count towards that month (see lineMonth), `paid` the commission already paid
 * out for it, `today` "YYYY-MM-DD" (decides due vs overdue). `jobRefs` maps line id to job reference for metById.
 */
export function computeMonth(month: string, rep: CalcRep, lines: readonly CalcLine[], paid: number, today: string, jobRefs: Readonly<Record<string, string>> = {}): MonthResult {
  const sorted = sortLines(lines);
  const target = rep.monthlyTarget > 0 ? money(rep.monthlyTarget) : 0;
  let balance = -target;
  let metById: string | null = null;
  let perLineTotal = 0;
  const results: LineResult[] = sorted.map((line) => {
    const profit = lineProfit(line);
    const clientPaid = line.invoices.length > 0 && line.invoices.every((inv) => Boolean(inv.clientPaidOn));
    if (target > 0) {
      const before = balance;
      balance = money(balance + profit);
      const met = before < 0 && balance >= 0 && metById === null;
      if (met) metById = jobRefs[line.id] ?? line.id;
      return { id: line.id, invoiced: lineInvoiced(line), profit, balanceAfter: balance, metTarget: met, commission: null, clientPaid };
    }
    const rate = line.rateOverride ?? rep.rate;
    const commission = line.noCommission ? 0 : money(Math.max(0, profit) * rate);
    perLineTotal += commission;
    return { id: line.id, invoiced: lineInvoiced(line), profit, balanceAfter: null, metTarget: false, commission, clientPaid };
  });
  const profit = money(results.reduce((sum, r) => sum + r.profit, 0));
  const aboveTarget = target > 0 ? money(Math.max(0, profit - target)) : 0;
  const commission = target > 0 ? money(aboveTarget * rep.rate) : money(perLineTotal);
  const paidRounded = money(paid);
  const owed = money(Math.max(0, commission - paidRounded));
  const allInvoices = sorted.flatMap((line) => line.invoices);
  const paidInvoices = allInvoices.filter((inv) => Boolean(inv.clientPaidOn)).length;
  const allPaid = allInvoices.length > 0 && paidInvoices === allInvoices.length;
  const lastPaid = allInvoices.map((inv) => inv.clientPaidOn).filter((d): d is string => Boolean(d)).sort().pop() ?? null;
  const dueOn = allPaid && lastPaid ? endOfFollowingMonth(lastPaid) : null;
  const overpaid = money(Math.max(0, paidRounded - commission));
  let status: MonthStatus;
  if (overpaid >= 0.005) status = "OVERPAID";
  else if (commission < 0.005) status = "NONE";
  else if (paidRounded >= commission - 0.005) status = "PAID";
  else if (paidRounded > 0) status = "PART_PAID";
  else if (dueOn) status = today > dueOn ? "OVERDUE" : "DUE";
  else status = "WAITING_CLIENT";
  return {
    month,
    lineCount: sorted.length,
    invoiced: money(results.reduce((sum, r) => sum + r.invoiced, 0)),
    profit,
    target,
    aboveTarget,
    targetMet: target > 0 ? profit >= target : true,
    metById,
    rate: rep.rate,
    commission,
    paid: paidRounded,
    owed,
    overpaid,
    status,
    dueOn,
    paidInvoices,
    totalInvoices: allInvoices.length,
    lines: results,
  };
}

export type RepCalcInput = {
  rep: CalcRep;
  lines: ReadonlyArray<CalcLine & { periodMonth: string; jobReference?: string }>;
  payouts: ReadonlyArray<{ month: string; amount: number }>;
  today: string;
};

/** Every month a rep has lines or payouts in, worked out. Keyed by "YYYY-MM". */
export function computeRepMonths(input: RepCalcInput): Record<string, MonthResult> {
  const months = new Set<string>([...input.lines.map((l) => l.periodMonth), ...input.payouts.map((p) => p.month)]);
  const jobRefs: Record<string, string> = {};
  for (const line of input.lines) jobRefs[line.id] = line.jobReference ?? line.id;
  const out: Record<string, MonthResult> = {};
  for (const month of Array.from(months).sort()) {
    const lines = input.lines.filter((l) => l.periodMonth === month);
    const paid = input.payouts.filter((p) => p.month === month).reduce((sum, p) => sum + p.amount, 0);
    out[month] = computeMonth(month, input.rep, lines, paid, input.today, jobRefs);
  }
  return out;
}

export const MONTH_STATUS_LABELS: Record<MonthStatus, string> = {
  NONE: "No commission",
  WAITING_CLIENT: "Waiting on client payment",
  DUE: "Due",
  OVERDUE: "Overdue",
  PART_PAID: "Part paid",
  PAID: "Paid",
  OVERPAID: "Paid more than due",
};
