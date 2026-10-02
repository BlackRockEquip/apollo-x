import type { RequestContext } from "@/lib/auth/context-types";
import { requireModule, requireTenant, requireTenantPermission } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// 2026-10-02 — new "Reports" sidebar section (user request: "Create a
// 'Reports' sidebar button above settings which allows a user to view and
// generate different types of reports: Jobs per customer, Warranty jobs
// (per component/customer/total), Ratios, Monthly reports per
// customer/total, every type of report that can be made (graphs,
// statistics, etc)" — first batch confirmed via AskUserQuestion: Jobs per
// customer, Warranty jobs breakdown, Monthly reports, Ratios).
//
// Gated by the REPORTS module + REPORTS_VIEW permission, both of which
// already existed in the codebase before this feature (ModuleKey.REPORTS,
// TENANT_PERMISSIONS' REPORTS_VIEW/REPORTS_EXPORT — see permissions.ts),
// already granted by default to MANAGER, STORE_CONTROLLER and FINANCE
// (COMPANY_ADMIN has everything via ALL_TENANT). A company only sees the
// Reports nav item once Platform Admin grants it the REPORTS entitlement —
// same as every other module in this app (see entitlements/policy.ts) —
// nothing new to wire there.
//
// Every report here is scoped to data that actually exists. Investigating
// the user's own three ratio examples (warranty-to-total-jobs,
// quote-to-job conversion, parts-to-labor cost) turned up a real gap: there
// are no Quote/SalesOrder/Invoice models yet (Job.quoteNumber etc. are
// still plain strings — see that field's own schema comment), and no
// tracked labour cost anywhere (JobFieldServiceReport.hours exists for some
// field-service jobs, but with no $ rate attached). Surfaced to the user via
// AskUserQuestion; their answer ("Skip for now, flag as future") is why
// RATIO_DEFS below only computes ratios backed by real stored data and
// lists the other two as comingSoon stats instead of faking them.
// ---------------------------------------------------------------------------

function authorize(ctx: RequestContext) {
  requireTenant(ctx);
  requireModule(ctx, "REPORTS", "READ");
  requireTenantPermission(ctx, "REPORTS_VIEW");
  return ctx.companyId;
}

// `months` is the shared time-window control across every report below —
// undefined/0/negative means "all time" (no lower bound), otherwise the
// first day of the month `months - 1` months ago (UTC), matching
// dashboard/service.ts's own monthBuckets convention so a "12 months" window
// here lines up with the Dashboard's trailing-12-month charts.
function sinceFor(months: number | undefined): Date | undefined {
  if (!months || months <= 0) return undefined;
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
}

function monthBuckets(months: number): Array<{ key: string; label: string; start: Date }> {
  const now = new Date();
  const buckets: Array<{ key: string; label: string; start: Date }> = [];
  for (let i = months - 1; i >= 0; i--) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
    const label = start.toLocaleDateString("en-ZA", { month: "short", year: "2-digit", timeZone: "UTC" });
    buckets.push({ key, label, start });
  }
  return buckets;
}

function bucketKeyFor(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function seriesFromDates(buckets: Array<{ key: string; label: string }>, dates: Date[]) {
  const counts = new Map<string, number>(buckets.map((b) => [b.key, 0]));
  for (const date of dates) {
    const key = bucketKeyFor(date);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return buckets.map((b) => ({ month: b.label, value: counts.get(b.key) ?? 0 }));
}

export type JobsPerCustomerRow = { customerId: string; customerName: string; total: number; open: number; closed: number; warranty: number };

export async function getJobsPerCustomerReport(ctx: RequestContext, params: { months?: number }): Promise<JobsPerCustomerRow[]> {
  const companyId = authorize(ctx);
  const since = sinceFor(params.months);
  const jobs = await prisma.job.findMany({
    where: { companyId, ...(since ? { dateReceived: { gte: since } } : {}) },
    select: { customerId: true, closedAt: true, type: true, customer: { select: { name: true } } },
  });
  const byCustomer = new Map<string, JobsPerCustomerRow>();
  for (const job of jobs) {
    const row = byCustomer.get(job.customerId) ?? { customerId: job.customerId, customerName: job.customer?.name ?? "—", total: 0, open: 0, closed: 0, warranty: 0 };
    row.total += 1;
    if (job.closedAt) row.closed += 1; else row.open += 1;
    if (job.type === "WARRANTY") row.warranty += 1;
    byCustomer.set(job.customerId, row);
  }
  return Array.from(byCustomer.values()).sort((a, b) => b.total - a.total);
}

export type WarrantyBreakdownRow = { key: string; label: string; total: number; granted: number; declined: number; pending: number; noRecord: number };

export async function getWarrantyBreakdownReport(ctx: RequestContext, params: { months?: number }) {
  const companyId = authorize(ctx);
  const since = sinceFor(params.months);
  const jobs = await prisma.job.findMany({
    where: { companyId, type: "WARRANTY", ...(since ? { dateReceived: { gte: since } } : {}) },
    select: { component: true, customerId: true, customer: { select: { name: true } }, warranty: { select: { status: true } } },
  });

  function tally(rows: Map<string, WarrantyBreakdownRow>, key: string, label: string, status: "GRANTED" | "DECLINED" | "PENDING" | undefined) {
    const row = rows.get(key) ?? { key, label, total: 0, granted: 0, declined: 0, pending: 0, noRecord: 0 };
    row.total += 1;
    if (status === "GRANTED") row.granted += 1;
    else if (status === "DECLINED") row.declined += 1;
    else if (status === "PENDING") row.pending += 1;
    else row.noRecord += 1;
    rows.set(key, row);
  }

  const byComponent = new Map<string, WarrantyBreakdownRow>();
  const byCustomer = new Map<string, WarrantyBreakdownRow>();
  const total: WarrantyBreakdownRow = { key: "total", label: "Total", total: 0, granted: 0, declined: 0, pending: 0, noRecord: 0 };
  for (const job of jobs) {
    const status = job.warranty?.status;
    const componentLabel = job.component?.trim() || "Unspecified component";
    tally(byComponent, componentLabel, componentLabel, status);
    tally(byCustomer, job.customerId, job.customer?.name ?? "—", status);
    total.total += 1;
    if (status === "GRANTED") total.granted += 1;
    else if (status === "DECLINED") total.declined += 1;
    else if (status === "PENDING") total.pending += 1;
    else total.noRecord += 1;
  }
  return {
    total,
    byComponent: Array.from(byComponent.values()).sort((a, b) => b.total - a.total),
    byCustomer: Array.from(byCustomer.values()).sort((a, b) => b.total - a.total),
  };
}

export type ReportMonthlySeries = { key: string; label: string; points: Array<{ month: string; value: number }> };

const MONTHLY_SERIES_MONTHS_DEFAULT = 12;

export async function getMonthlyReport(ctx: RequestContext, params: { months?: number; customerId?: string }): Promise<{ series: ReportMonthlySeries[] }> {
  const companyId = authorize(ctx);
  const months = params.months && params.months > 0 ? params.months : MONTHLY_SERIES_MONTHS_DEFAULT;
  const buckets = monthBuckets(months);
  const since = buckets[0].start;
  const customerFilter = params.customerId ? { customerId: params.customerId } : {};

  const [created, completed, warranty] = await Promise.all([
    prisma.job.findMany({ where: { companyId, ...customerFilter, dateReceived: { gte: since } }, select: { dateReceived: true } }).then((rows) => rows.map((r) => r.dateReceived).filter((d): d is Date => d != null)),
    prisma.job.findMany({ where: { companyId, ...customerFilter, deliveryDate: { gte: since }, closedAt: { not: null } }, select: { deliveryDate: true } }).then((rows) => rows.map((r) => r.deliveryDate).filter((d): d is Date => d != null)),
    prisma.job.findMany({ where: { companyId, ...customerFilter, type: "WARRANTY", dateReceived: { gte: since } }, select: { dateReceived: true } }).then((rows) => rows.map((r) => r.dateReceived).filter((d): d is Date => d != null)),
  ]);

  return {
    series: [
      { key: "jobs-created", label: "Jobs created", points: seriesFromDates(buckets, created) },
      { key: "jobs-completed", label: "Jobs completed", points: seriesFromDates(buckets, completed) },
      { key: "warranty-jobs", label: "Warranty jobs", points: seriesFromDates(buckets, warranty) },
    ],
  };
}

export type RatioStat = {
  key: string;
  label: string;
  format: "percent" | "days" | "currency" | "count";
  value: number | null;
  detail: string;
  comingSoon?: string;
};

export async function getRatiosReport(ctx: RequestContext, params: { months?: number }): Promise<RatioStat[]> {
  const companyId = authorize(ctx);
  const since = sinceFor(params.months);
  const periodWhere = since ? { gte: since } : undefined;

  const [jobs, rfqJobs, rfqGeneral, movements] = await Promise.all([
    prisma.job.findMany({
      where: { companyId, ...(periodWhere ? { dateReceived: periodWhere } : {}) },
      select: { id: true, type: true, customerId: true, closedAt: true, dateReceived: true, etaDate: true, deliveryDate: true },
    }),
    prisma.jobRfqRequest.findMany({ where: { companyId, ...(periodWhere ? { createdAt: periodWhere } : {}) }, select: { status: true } }),
    prisma.generalRfqRequest.findMany({ where: { companyId, ...(periodWhere ? { createdAt: periodWhere } : {}) }, select: { status: true } }),
    // Real parts cost per job: ISSUE stock movements posted against a job
    // (StockReferenceType.JOB) are how a job's parts list actually leaves
    // the shelf (see inventory/service.ts's pick/issue flows). Checked
    // first whether those movements carry their own unitCost — they don't:
    // every ISSUE-against-a-job call site builds its movement without a
    // unitCost at all (only RECEIPT movements from a supplier delivery set
    // one), so movement.unitCost is always null here. Falls back to
    // Part.defaultPurchaseCost × quantity instead — a real, company-entered
    // cost field (see that field's own comment on the Part model), just a
    // catalog default rather than the exact cost in effect at the moment
    // each unit was issued. Still real data, unlike the labour half of the
    // ratio the user originally asked for (see this file's header comment —
    // no $ labour rate is tracked anywhere yet).
    prisma.stockMovement.findMany({
      where: { companyId, referenceType: "JOB", movementType: "ISSUE", ...(periodWhere ? { occurredAt: periodWhere } : {}) },
      select: { referenceId: true, quantity: true, partId: true },
    }),
  ]);

  const totalJobs = jobs.length;
  const warrantyJobs = jobs.filter((j) => j.type === "WARRANTY").length;
  const closedJobs = jobs.filter((j) => j.closedAt).length;
  const jobsWithBothDates = jobs.filter((j) => j.etaDate && j.deliveryDate);
  const onTimeJobs = jobsWithBothDates.filter((j) => j.deliveryDate! <= j.etaDate!);
  const closedWithReceived = jobs.filter((j) => j.closedAt && j.dateReceived);
  const avgTurnaroundDays = closedWithReceived.length > 0
    ? closedWithReceived.reduce((sum, j) => sum + (j.closedAt!.getTime() - j.dateReceived!.getTime()) / 86_400_000, 0) / closedWithReceived.length
    : null;

  const customerJobCounts = new Map<string, number>();
  for (const job of jobs) customerJobCounts.set(job.customerId, (customerJobCounts.get(job.customerId) ?? 0) + 1);
  const customersWithJobs = customerJobCounts.size;
  const repeatCustomers = Array.from(customerJobCounts.values()).filter((count) => count > 1).length;

  const jobRfqQuoted = rfqJobs.filter((r) => r.status === "QUOTED").length;
  const generalRfqReceived = rfqGeneral.filter((r) => r.status === "RECEIVED").length;

  const partIds = Array.from(new Set(movements.map((m) => m.partId)));
  const parts = partIds.length > 0 ? await prisma.part.findMany({ where: { id: { in: partIds } }, select: { id: true, defaultPurchaseCost: true } }) : [];
  const costByPartId = new Map(parts.map((p) => [p.id, Number(p.defaultPurchaseCost ?? 0)]));
  const partsCostByJob = new Map<string, number>();
  for (const movement of movements) {
    if (!movement.referenceId) continue;
    const cost = (costByPartId.get(movement.partId) ?? 0) * Number(movement.quantity ?? 0);
    partsCostByJob.set(movement.referenceId, (partsCostByJob.get(movement.referenceId) ?? 0) + cost);
  }
  const jobsWithPartsCost = Array.from(partsCostByJob.values());
  const avgPartsCostPerJob = jobsWithPartsCost.length > 0 ? jobsWithPartsCost.reduce((sum, v) => sum + v, 0) / jobsWithPartsCost.length : null;

  return [
    { key: "warranty-ratio", label: "Warranty jobs / total jobs", format: "percent", value: totalJobs > 0 ? (warrantyJobs / totalJobs) * 100 : null, detail: `${warrantyJobs} of ${totalJobs} jobs` },
    { key: "completion-rate", label: "Job completion rate", format: "percent", value: totalJobs > 0 ? (closedJobs / totalJobs) * 100 : null, detail: `${closedJobs} of ${totalJobs} jobs closed` },
    { key: "on-time-delivery", label: "On-time delivery rate", format: "percent", value: jobsWithBothDates.length > 0 ? (onTimeJobs.length / jobsWithBothDates.length) * 100 : null, detail: `${onTimeJobs.length} of ${jobsWithBothDates.length} jobs with both an ETA and a delivery date` },
    { key: "repeat-customer-rate", label: "Repeat customer rate", format: "percent", value: customersWithJobs > 0 ? (repeatCustomers / customersWithJobs) * 100 : null, detail: `${repeatCustomers} of ${customersWithJobs} customers with more than one job` },
    { key: "avg-turnaround-days", label: "Average turnaround time", format: "days", value: avgTurnaroundDays, detail: `Across ${closedWithReceived.length} closed job${closedWithReceived.length === 1 ? "" : "s"}, date received to close` },
    { key: "job-rfq-response-rate", label: "Job RFQ quote-back rate", format: "percent", value: rfqJobs.length > 0 ? (jobRfqQuoted / rfqJobs.length) * 100 : null, detail: `${jobRfqQuoted} of ${rfqJobs.length} job RFQs came back quoted` },
    { key: "general-rfq-response-rate", label: "General RFQ response rate", format: "percent", value: rfqGeneral.length > 0 ? (generalRfqReceived / rfqGeneral.length) * 100 : null, detail: `${generalRfqReceived} of ${rfqGeneral.length} general RFQs received a quote` },
    { key: "avg-parts-cost-per-job", label: "Average parts cost per job", format: "currency", value: avgPartsCostPerJob, detail: `Across ${jobsWithPartsCost.length} job${jobsWithPartsCost.length === 1 ? "" : "s"} with parts issued against them` },
    // Flagged, not faked — see this file's header comment and the user's
    // own "skip for now, flag as future" answer. No value is computed; the
    // UI renders these as a disabled card naming what's missing instead of
    // a number.
    { key: "quote-to-job-conversion", label: "Quote-to-job conversion", format: "percent", value: null, detail: "", comingSoon: "Needs a real Quotes module — Job.quoteNumber today is just a free-text field, not a linked record." },
    { key: "parts-to-labour-cost", label: "Parts-to-labour cost ratio", format: "percent", value: null, detail: "", comingSoon: "Needs tracked labour cost — no hourly rate × hours is recorded against a job anywhere yet." },
  ];
}
