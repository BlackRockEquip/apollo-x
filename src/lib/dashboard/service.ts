import { ModuleKey, Prisma, TicketStatus } from "@prisma/client";
import type { RequestContext } from "@/lib/auth/context-types";
import { requireModule, requireTenant, requireTenantPermission } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { JOB_STATUS_LABELS, MAIN_WORKSHOP_STATUS_STEPS, FIELD_SERVICE_STATUS_STEPS, ENGINEERING_STATUS_STEPS, jobStatusLabelsFor } from "@/lib/jobs/ui";
import { listPartsOutstanding } from "@/lib/jobs/parts-outstanding";

export type DashboardWidgetKey =
  | "jobs-summary"
  | "wip-status-counts"
  | "recent-jobs"
  | "pex-status"
  | "outstanding-parts"
  | "procurement-summary"
  | "upcoming-etas"
  | "overdue-etas"
  | "support-tickets"
  | "notifications";

type DashboardWidget = { key: DashboardWidgetKey; enabled: boolean; order: number };

// 2026-09-29, user request: "Remove cards Inventory alerts, Low stock" —
// both widgets showed the exact same low-stock part count (see the shared
// `lowStock` query this used to gate below), just under two different
// labels/icons; removing both here drops them from Settings > Dashboard's
// widget picker and from any already-saved per-user layout (normalizeWidgets
// below silently drops a saved key that's no longer in this list — no
// migration needed).
export const DASHBOARD_WIDGET_DEFS: Array<{ key: DashboardWidgetKey; label: string; module: ModuleKey | ModuleKey[]; permission: string }> = [
  { key: "jobs-summary", label: "Jobs summary", module: "JOBS_WIP", permission: "JOBS_VIEW" },
  { key: "wip-status-counts", label: "WIP status counts", module: "JOBS_WIP", permission: "JOBS_VIEW" },
  { key: "recent-jobs", label: "Recent jobs", module: "JOBS_WIP", permission: "JOBS_VIEW" },
  { key: "pex-status", label: "PEX status", module: "PEX_TRACKING", permission: "PEX_TRACKING_VIEW" },
  { key: "outstanding-parts", label: "Outstanding parts", module: "JOB_PARTS", permission: "INVENTORY_VIEW" },
  // 2026-09-18 — user asked "What is procurement summary on dashboard?"
  // while investigating it: it turned out to be a dead stub. Its gate
  // (module: "PROCUREMENT", permission: "REPORTS_VIEW") didn't match where
  // the actual outwork/RFQ screens live (both /suppliers/outwork and
  // /suppliers/rfq require JOBS_WIP/"JOBS_VIEW", same as the rest of
  // Jobs & WIP — nothing in the app grants/checks a "PROCUREMENT" module
  // access flag at all, so this widget was effectively unreachable for
  // everyone), getDashboardData never computed a value for it (widgetValue
  // in dashboard/page.tsx fell through to "—" for it), and it had no
  // WIDGET_HREF, so even on the rare account where it *did* show up it
  // wasn't clickable. Regated to match its real data source and wired up
  // below (procurementOpen) — see dashboard/page.tsx for the display side.
  //
  // 2026-10-22, user request: the card is "Outstanding outwork" - it goes to the Outwork screen, so it counts
  // outwork still out with the supplier (no RFQs) and needs the Outwork module.
  { key: "procurement-summary", label: "Outstanding outwork", module: "OUTWORK", permission: "JOBS_VIEW" },
  // 2026-10-16, user request: "ETA cards can be built for everyone". Part of core
  // Jobs & WIP (not an optional module), so every industry build gets them. Both read
  // the job's Mechanic ETA date; jobs with no Mechanic ETA are ignored.
  { key: "upcoming-etas", label: "Upcoming ETAs", module: "JOBS_WIP", permission: "JOBS_VIEW" },
  { key: "overdue-etas", label: "Overdue ETAs", module: "JOBS_WIP", permission: "JOBS_VIEW" },
  { key: "support-tickets", label: "Open support tickets", module: "NOTIFICATIONS", permission: "DASHBOARD_VIEW" },
  { key: "notifications", label: "Notifications", module: "NOTIFICATIONS", permission: "DASHBOARD_VIEW" },
];

function canSeeWidget(ctx: RequestContext, key: DashboardWidgetKey) {
  const def = DASHBOARD_WIDGET_DEFS.find((row) => row.key === key);
  if (!def) return false;
  // 2026-10-16, industry builds step B: a widget can list several modules (shown when any one is on).
  const modules = Array.isArray(def.module) ? def.module : [def.module];
  if (!modules.some((module) => (ctx.moduleAccess.get(module) ?? "DENIED") !== "DENIED")) return false;
  return ctx.tenantPermissions.has(def.permission as never);
}

// 2026-09-15, user request: "add a linegraph that is customizable for
// different analytics eg: total jobs per month, total completed jobs,
// warrantys per month etc, user can select 3 line graph views." A small,
// fixed catalog (unlike widgets, these need a real time-series query each —
// see buildMetricSeries below — so this stays a short, hand-picked list
// rather than trying to cover every possible count). Same
// module/permission gating shape as DASHBOARD_WIDGET_DEFS, reusing the
// exact module+permission each metric's underlying data already requires
// elsewhere (Jobs & WIP's own JOBS_VIEW, Support's own DASHBOARD_VIEW —
// matching the existing support-tickets widget above).
export type DashboardAnalyticsMetricKey = "jobs-created" | "jobs-completed" | "warranty-jobs" | "support-tickets-opened";

export const DASHBOARD_ANALYTICS_METRIC_DEFS: Array<{ key: DashboardAnalyticsMetricKey; label: string; module: ModuleKey; permission: string }> = [
  { key: "jobs-created", label: "Jobs created per month", module: "JOBS_WIP", permission: "JOBS_VIEW" },
  { key: "jobs-completed", label: "Jobs completed per month", module: "JOBS_WIP", permission: "JOBS_VIEW" },
  { key: "warranty-jobs", label: "Warranty jobs per month", module: "JOBS_WIP", permission: "JOBS_VIEW" },
  { key: "support-tickets-opened", label: "Support tickets opened per month", module: "NOTIFICATIONS", permission: "DASHBOARD_VIEW" },
];

const ANALYTICS_SERIES_MONTHS = 12;
const MAX_ANALYTICS_CHARTS = 3;

function canSeeMetric(ctx: RequestContext, key: DashboardAnalyticsMetricKey) {
  const def = DASHBOARD_ANALYTICS_METRIC_DEFS.find((row) => row.key === key);
  if (!def) return false;
  if ((ctx.moduleAccess.get(def.module) ?? "DENIED") === "DENIED") return false;
  return ctx.tenantPermissions.has(def.permission as never);
}

function defaultAnalyticsCharts(ctx: RequestContext): DashboardAnalyticsMetricKey[] {
  return DASHBOARD_ANALYTICS_METRIC_DEFS.filter((def) => canSeeMetric(ctx, def.key)).slice(0, MAX_ANALYTICS_CHARTS).map((def) => def.key);
}

function normalizeAnalyticsCharts(ctx: RequestContext, raw: unknown): DashboardAnalyticsMetricKey[] {
  const list = Array.isArray(raw) ? raw : [];
  const chosen: DashboardAnalyticsMetricKey[] = [];
  for (const value of list) {
    const key = String(value) as DashboardAnalyticsMetricKey;
    if (!DASHBOARD_ANALYTICS_METRIC_DEFS.some((def) => def.key === key)) continue;
    if (!canSeeMetric(ctx, key)) continue;
    if (chosen.includes(key)) continue;
    chosen.push(key);
    if (chosen.length >= MAX_ANALYTICS_CHARTS) break;
  }
  return chosen.length > 0 ? chosen : defaultAnalyticsCharts(ctx);
}

// One month-bucket list covering the trailing ANALYTICS_SERIES_MONTHS
// months (oldest first, ending with the current month) — UTC throughout so
// the bucketing is stable regardless of server timezone.
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

// 2026-10-22, user request: "Completed jobs should take into account when the status says completed as well".
// A job is completed when its status is Complete or Closed (the status is the truth: closedAt is not cleared when a
// closed job is reopened, so a reopened job must not keep counting). The date it is placed on is the Delivery date, as
// before; a completed job with no Delivery date falls back to when it was closed, then to when its status moved to
// Complete, then to its last update, so it is still counted rather than silently dropped.
async function loadCompletionDates(companyId: string, since: Date): Promise<Date[]> {
  const rows = await prisma.$queryRaw<Array<{ doneAt: Date }>>(Prisma.sql`
    SELECT "doneAt" FROM (
      SELECT COALESCE(
        j."deliveryDate",
        j."closedAt",
        MAX(a."createdAt") FILTER (WHERE a."type"::text IN ('STATUS_CHANGED', 'JOB_REOPENED') AND a."metadata"->>'to' = 'COMPLETE'),
        j."updatedAt"
      ) AS "doneAt"
      FROM "Job" j
      LEFT JOIN "JobActivity" a ON a."jobId" = j."id"
      WHERE j."companyId" = ${companyId}
        AND j."status"::text IN ('COMPLETE', 'CLOSED')
      GROUP BY j."id"
    ) done
    WHERE "doneAt" >= ${since}
  `);
  return rows.map((row) => new Date(row.doneAt));
}

// One timestamp fetcher per metric — each just selects the single date
// field that defines "when this happened" for that metric, scoped to the
// trailing window; bucketing into months happens once, generically, in
// buildMetricSeries below rather than a separate SQL groupBy per metric.
//
// 2026-09-18, user request: "Jobs created per month, use date in as
// reference aswell for the other 2 lines" — then clarified: "Jobs created
// per month - Date in field / jobs completed per month - Delivery Date
// field." jobs-created and warranty-jobs bucket by Job.dateReceived ("Date
// in," the date a job physically arrived); jobs-completed buckets by
// Job.deliveryDate (the date the finished job actually went back out to the
// customer — a plain form field, independent of the job status stepper,
// see its own comment above the DeliveryType enum in schema.prisma) rather
// than createdAt/closedAt as each used before. Each metric's own filter
// (completed = closedAt set i.e. actually closed, warranty = type WARRANTY)
// is unchanged — only the date used to place a job on the X axis changed,
// so jobs-completed still only counts jobs that are actually closed, just
// bucketed by delivery date rather than when Close was clicked. Both
// dateReceived and deliveryDate are optional (see schema.prisma), so a job
// missing the relevant one is simply excluded from that series, same as
// jobs-completed already excluded jobs with no closedAt. support-tickets-
// opened is untouched — it isn't a job metric and has neither field.
//
// 2026-10-22, dashboard check: the support-ticket numbers follow the same visibility as the Support
// page - people who can manage users see every ticket in the company, everyone else only the tickets
// they reported themselves. `ownTicketsOnly` is that user's id (or null for "all tickets").
const ANALYTICS_METRIC_FETCHERS: Record<DashboardAnalyticsMetricKey, (companyId: string, since: Date, ownTicketsOnly: string | null) => Promise<Date[]>> = {
  "jobs-created": async (companyId, since) =>
    (await prisma.job.findMany({ where: { companyId, dateReceived: { gte: since } }, select: { dateReceived: true } })).map((row) => row.dateReceived).filter((d): d is Date => d != null),
  "jobs-completed": async (companyId, since) => loadCompletionDates(companyId, since),
  "warranty-jobs": async (companyId, since) =>
    (await prisma.job.findMany({ where: { companyId, type: "WARRANTY", dateReceived: { gte: since } }, select: { dateReceived: true } })).map((row) => row.dateReceived).filter((d): d is Date => d != null),
  "support-tickets-opened": async (companyId, since, ownTicketsOnly) =>
    (await prisma.supportTicket.findMany({ where: { companyId, tenantDeletedAt: null, createdAt: { gte: since }, ...(ownTicketsOnly ? { reportedById: ownTicketsOnly } : {}) }, select: { createdAt: true } })).map((row) => row.createdAt),
};

async function buildMetricSeries(companyId: string, key: DashboardAnalyticsMetricKey, ownTicketsOnly: string | null) {
  const buckets = monthBuckets(ANALYTICS_SERIES_MONTHS);
  const since = buckets[0].start;
  const dates = await ANALYTICS_METRIC_FETCHERS[key](companyId, since, ownTicketsOnly);
  const counts = new Map<string, number>(buckets.map((b) => [b.key, 0]));
  for (const date of dates) {
    const bucketKey = bucketKeyFor(date);
    if (counts.has(bucketKey)) counts.set(bucketKey, (counts.get(bucketKey) ?? 0) + 1);
  }
  return buckets.map((b) => ({ month: b.label, value: counts.get(b.key) ?? 0 }));
}

// 2026-10-06, user request: "Build all currently mocked up now" (the refined
// dashboard v2 mockup). The dashboard now answers "what needs attention?"
// instead of only counting — see getDashboardData's attention / stuckJobs /
// statusBreakdown / partsOutstandingJobs / completedThisMonth below.
//
// Thresholds (per the mockup): a job is "stuck" once it has sat in the same
// status for 14+ days; parts are "overdue" once a job has had outstanding
// parts for 7+ days.
const STUCK_THRESHOLD_DAYS = 14;
const PARTS_OVERDUE_THRESHOLD_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

// ETA cards (2026-10-16): "Upcoming" = Mechanic ETA from today through the next
// ETA_UPCOMING_DAYS days; "Overdue" = Mechanic ETA before today on a job that is not
// finished. A job counts as finished for this once the work is done (ready to deliver
// or later) or it is closed/cancelled.
const ETA_UPCOMING_DAYS = 7;
const ETA_LIST_SIZE = 5;
const ETA_FINISHED_STATUSES = ["TO_BE_DELIVERED", "DELIVERED_AWAITING_PAYMENT", "AWAIT_PAYMENT", "COMPLETE", "CLOSED", "CANCELLED", "RETURNED_UNREPAIRED"] as const;

function startOfTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

type EtaJobRow = { id: string; jobNumber: string; customerName: string | null; status: string; label: string; etaDate: string; daysAway: number };
type EtaCard = { count: number; jobs: EtaJobRow[] };

async function loadEtaCard(ctx: RequestContext, companyId: string, kind: "upcoming" | "overdue"): Promise<EtaCard> {
  const today = startOfTodayUtc();
  const horizon = new Date(today.getTime() + (ETA_UPCOMING_DAYS + 1) * DAY_MS);
  // closedAt is deliberately not checked: it is not cleared when a closed job is reopened, so checking it hid every
  // reopened job from these cards. The status list below already leaves out closed and cancelled jobs.
  const where: Prisma.JobWhereInput = {
    companyId,
    status: { notIn: [...ETA_FINISHED_STATUSES] },
    mechanicEtaDate: kind === "overdue" ? { not: null, lt: today } : { gte: today, lt: horizon },
  };
  const showCustomer = ctx.tenantPermissions.has("CUSTOMERS_VIEW");
  const [count, rows] = await Promise.all([
    prisma.job.count({ where }),
    prisma.job.findMany({
      where,
      orderBy: [{ mechanicEtaDate: "asc" }, { createdAt: "asc" }],
      take: ETA_LIST_SIZE,
      select: { id: true, jobNumber: true, draftNumber: true, status: true, mechanicEtaDate: true, customer: { select: { name: true } } },
    }),
  ]);
  return {
    count,
    jobs: rows.map((row) => {
      const eta = row.mechanicEtaDate as Date;
      return {
        id: row.id,
        jobNumber: row.jobNumber ?? row.draftNumber ?? "—",
        customerName: showCustomer ? row.customer?.name ?? null : null,
        status: row.status,
        label: jobStatusLabelsFor(ctx.industryBuild)[row.status as keyof typeof JOB_STATUS_LABELS] ?? row.status,
        etaDate: eta.toISOString().slice(0, 10),
        daysAway: Math.round((eta.getTime() - today.getTime()) / DAY_MS),
      };
    }),
  };
}

// Open (non-terminal) statuses in pipeline order — same union the Jobs & WIP
// list's own view=wip filter uses (WIP_STATUSES in lib/jobs/service.ts), kept
// in pipeline order here so the status bars read top-to-bottom like the flow.
const WIP_STATUS_ORDER = Array.from(new Set([...MAIN_WORKSHOP_STATUS_STEPS, ...FIELD_SERVICE_STATUS_STEPS, ...ENGINEERING_STATUS_STEPS])).filter((status) => status !== "COMPLETE");

// Statuses where a job is legitimately waiting on the customer to pay, not on
// the workshop — never flagged as "stuck" (they still show on the bars). Jobs
// flagged Return Unrepaired are likewise counted but never flagged stuck.
const STUCK_EXEMPT_STATUSES = new Set<string>(["DELIVERED_AWAITING_PAYMENT", "AWAIT_PAYMENT"]);

// There is no "status changed at" column on Job, so time-in-current-status is
// derived from JobActivity: the latest STATUS_CHANGED / JOB_REOPENED row whose
// metadata.to equals the job's current status, or the JOB_REGISTERED row when
// the job was created straight into it (metadata.status). Falls back to the
// job's createdAt when no such row exists (e.g. older jobs). One query for the
// whole company's open jobs — no migration.
async function loadStatusSince(companyId: string): Promise<Map<string, { status: string; since: Date; flagged: boolean }>> {
  const rows = await prisma.$queryRaw<Array<{ id: string; status: string; flagged: boolean; since: Date }>>(Prisma.sql`
    SELECT j."id" AS "id", j."status"::text AS "status", j."returnedUnrepaired" AS "flagged",
      COALESCE(
        MAX(a."createdAt") FILTER (WHERE
          (a."type"::text IN ('STATUS_CHANGED', 'JOB_REOPENED') AND a."metadata"->>'to' = j."status"::text)
          OR (a."type"::text = 'JOB_REGISTERED' AND a."metadata"->>'status' = j."status"::text)),
        j."createdAt"
      ) AS "since"
    FROM "Job" j
    LEFT JOIN "JobActivity" a ON a."jobId" = j."id"
    WHERE j."companyId" = ${companyId}
      AND j."status"::text IN (${Prisma.join(WIP_STATUS_ORDER)})
    GROUP BY j."id"
  `);
  return new Map(rows.map((row) => [row.id, { status: row.status, since: new Date(row.since), flagged: row.flagged }]));
}

function daysSince(date: Date, now: number) {
  return Math.max(0, Math.floor((now - date.getTime()) / DAY_MS));
}

function monthRange(offset: number) {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 1));
  return { start, end, label: start.toLocaleDateString("en-ZA", { month: "short", timeZone: "UTC" }) };
}

function canUseJobs(ctx: RequestContext) {
  return canSeeWidget(ctx, "jobs-summary");
}

function defaultWidgets(ctx: RequestContext): DashboardWidget[] {
  return DASHBOARD_WIDGET_DEFS
    .filter((row, index) => canSeeWidget(ctx, row.key) || index < 3)
    .map((row, index) => ({ key: row.key, enabled: canSeeWidget(ctx, row.key), order: index }));
}

function normalizeWidgets(ctx: RequestContext, raw: unknown): DashboardWidget[] {
  const list = Array.isArray(raw) ? raw : [];
  const parsed = list
    .map((row, index) => {
      if (!row || typeof row !== "object") return null;
      const value = row as Record<string, unknown>;
      const key = String(value.key ?? "") as DashboardWidgetKey;
      if (!DASHBOARD_WIDGET_DEFS.some((def) => def.key === key)) return null;
      if (!canSeeWidget(ctx, key)) return null;
      return { key, enabled: value.enabled !== false, order: Number.isFinite(value.order) ? Number(value.order) : index };
    })
    .filter((row): row is DashboardWidget => Boolean(row));
  const map = new Map(parsed.map((row) => [row.key, row]));
  for (const fallback of defaultWidgets(ctx)) if (!map.has(fallback.key) && canSeeWidget(ctx, fallback.key)) map.set(fallback.key, fallback);
  return Array.from(map.values()).sort((a, b) => a.order - b.order).map((row, index) => ({ ...row, order: index }));
}

function authorize(ctx: RequestContext) {
  requireTenant(ctx);
  requireModule(ctx, "DASHBOARD", "READ");
  requireTenantPermission(ctx, "DASHBOARD_VIEW");
  return ctx.companyId;
}

export async function getDashboardConfig(ctx: RequestContext) {
  const companyId = authorize(ctx);
  const row = await prisma.userDashboardConfig.findUnique({ where: { userId_companyId: { userId: ctx.userId, companyId } } });
  return {
    available: DASHBOARD_WIDGET_DEFS.filter((def) => canSeeWidget(ctx, def.key)),
    widgets: normalizeWidgets(ctx, row?.widgets),
    // 2026-09-15, user request: see DASHBOARD_ANALYTICS_METRIC_DEFS above.
    availableAnalyticsMetrics: DASHBOARD_ANALYTICS_METRIC_DEFS.filter((def) => canSeeMetric(ctx, def.key)),
    analyticsCharts: normalizeAnalyticsCharts(ctx, row?.analyticsCharts),
  };
}

// Takes either the object shape the settings screen now sends
// ({ widgets, analyticsCharts }) — the only real caller — but also accepts
// a bare widgets array for robustness, since that used to be this
// function's whole contract before analytics charts existed.
export async function saveDashboardConfig(ctx: RequestContext, raw: unknown) {
  const companyId = authorize(ctx);
  requireModule(ctx, "DASHBOARD", "WRITE");
  const body = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as { widgets?: unknown; analyticsCharts?: unknown }) : { widgets: raw };
  const widgets = normalizeWidgets(ctx, body.widgets);
  const analyticsCharts = normalizeAnalyticsCharts(ctx, body.analyticsCharts);
  return prisma.$transaction(async (tx) => {
    const saved = await tx.userDashboardConfig.upsert({
      where: { userId_companyId: { userId: ctx.userId, companyId } },
      create: { userId: ctx.userId, companyId, widgets: widgets as Prisma.InputJsonValue, analyticsCharts: analyticsCharts as Prisma.InputJsonValue },
      update: { widgets: widgets as Prisma.InputJsonValue, analyticsCharts: analyticsCharts as Prisma.InputJsonValue },
    });
    await tx.auditEvent.create({
      data: { companyId, actorId: ctx.userId, supportAccessId: ctx.supportAccessId, source: "API", module: "DASHBOARD", entityType: "UserDashboardConfig", entityId: saved.id, action: "DASHBOARD_LAYOUT_SAVED", correlationId: ctx.correlationId, afterData: { widgets, analyticsCharts } as Prisma.InputJsonValue },
    });
    return { widgets, analyticsCharts };
  });
}

export async function resetDashboardConfig(ctx: RequestContext) {
  const companyId = authorize(ctx);
  await prisma.userDashboardConfig.deleteMany({ where: { userId: ctx.userId, companyId } });
  return { widgets: defaultWidgets(ctx).filter((row) => canSeeWidget(ctx, row.key)), analyticsCharts: defaultAnalyticsCharts(ctx) };
}

export async function getDashboardData(ctx: RequestContext) {
  const companyId = authorize(ctx);
  const { widgets, analyticsCharts } = await getDashboardConfig(ctx);
  const enabled = widgets.filter((row) => row.enabled).map((row) => row.key);
  // Same ticket visibility as the Support page (see ANALYTICS_METRIC_FETCHERS above).
  const ownTicketsOnly = ctx.tenantPermissions.has("USERS_MANAGE") ? null : ctx.userId;

  const [jobsByStatus, recentJobs, pexOpen, tickets, outworkOutstanding] = await Promise.all([
    enabled.some((key) => key === "jobs-summary" || key === "wip-status-counts")
      ? prisma.job.groupBy({ by: ["status"], where: { companyId }, _count: { _all: true } })
      : Promise.resolve([]),
    enabled.includes("recent-jobs")
      ? prisma.job.findMany({ where: { companyId }, orderBy: { updatedAt: "desc" }, take: 8, select: { id: true, jobNumber: true, status: true, customerReference: true, customerPo: true, component: true, machineModel: true, customer: { select: { name: true } } } })
      : Promise.resolve([]),
    // Repointed (2026-09-09) from the old PexSupplyLink.returnStatus to
    // PexRecord.status as part of the full PEX -> PexRecord replacement
    // (see schema.prisma's PexRecord comment) — only records with a supply
    // leg count here, matching PEX Tracking's own "chains" scope, not PEX
    // Stock's inventory scope.
    enabled.includes("pex-status")
      ? prisma.pexRecord.groupBy({ by: ["status"], where: { companyId, supplyJobId: { not: null }, status: { notIn: ["COMPLETED", "SCRAPPED"] } }, _count: { _all: true } })
      : Promise.resolve([]),
    enabled.includes("support-tickets")
      // 2026-10-22, user request: only tickets still open - not Resolved or Closed.
      ? prisma.supportTicket.groupBy({ by: ["status"], where: { companyId, tenantDeletedAt: null, status: { notIn: ["RESOLVED", "CLOSED"] }, ...(ownTicketsOnly ? { reportedById: ownTicketsOnly } : {}) }, _count: { _all: true } })
      : Promise.resolve([]),
    // "Outstanding outwork" (2026-10-22, was "Procurement / outwork" with RFQs added in): outwork items still
    // out with the supplier - the same filter as the Outwork screen (anything not yet received).
    enabled.includes("procurement-summary")
      ? prisma.outworkItem.count({ where: { companyId, status: "SENT_OUT" } })
      : Promise.resolve(0),
  ]);

  // 2026-09-15, user request: "add a linegraph that is customizable for
  // different analytics ... user can select 3 line graph views." Always
  // computed (not gated behind an `enabled` toggle the way the widgets
  // above are) — analyticsCharts IS the enabled list, there's no separate
  // on/off per chart.
  const analyticsSeries = await Promise.all(
    analyticsCharts.map(async (key) => ({
      key,
      label: DASHBOARD_ANALYTICS_METRIC_DEFS.find((def) => def.key === key)?.label ?? key,
      points: await buildMetricSeries(companyId, key, ownTicketsOnly),
    })),
  );

  const nowMs = Date.now();
  // Status wording for the company's industry build (Engineering has its own).
  const statusLabels = jobStatusLabelsFor(ctx.industryBuild);
  // Bars read top-to-bottom in the company's own flow order.
  const statusOrder = ctx.industryBuild === "ENGINEERING" ? Array.from(new Set([...ENGINEERING_STATUS_STEPS.filter((status) => status !== "COMPLETE"), ...WIP_STATUS_ORDER])) : WIP_STATUS_ORDER;
  const jobsAccess = canUseJobs(ctx);
  const wantsStatusPanel = enabled.some((key) => key === "jobs-summary" || key === "wip-status-counts");

  // Time-in-status for every open job (see loadStatusSince). Feeds the
  // Needs-attention strip, the stuck flags on the status bars and the
  // "Stuck in a status" list.
  const statusSince = jobsAccess ? await loadStatusSince(companyId) : new Map<string, { status: string; since: Date; flagged: boolean }>();
  const statusCounts = new Map<string, { count: number; stuck: number }>();
  const stuckAll: Array<{ id: string; status: string; days: number }> = [];
  let awaitingGoAheadCount = 0;
  let awaitingGoAheadOldest = 0;
  let readyToDeliverCount = 0;
  for (const [id, entry] of statusSince) {
    const days = daysSince(entry.since, nowMs);
    const slot = statusCounts.get(entry.status) ?? { count: 0, stuck: 0 };
    slot.count += 1;
    if (days >= STUCK_THRESHOLD_DAYS && !entry.flagged && !STUCK_EXEMPT_STATUSES.has(entry.status)) {
      slot.stuck += 1;
      stuckAll.push({ id, status: entry.status, days });
    }
    statusCounts.set(entry.status, slot);
    if (entry.status === "AWAITING_GO_AHEAD") { awaitingGoAheadCount += 1; awaitingGoAheadOldest = Math.max(awaitingGoAheadOldest, days); }
    if (entry.status === "TO_BE_DELIVERED") readyToDeliverCount += 1;
  }
  stuckAll.sort((a, b) => b.days - a.days);
  const statusBreakdown = wantsStatusPanel
    ? statusOrder.filter((status) => (statusCounts.get(status)?.count ?? 0) > 0).map((status) => ({
        status,
        label: statusLabels[status],
        count: statusCounts.get(status)!.count,
        stuck: statusCounts.get(status)!.stuck,
      }))
    : [];

  // Parts outstanding, rolled up per job (listPartsOutstanding returns one
  // row per job + supplier). Needs Jobs & WIP access on top of the widget's
  // own Inventory gate, because the underlying list does.
  let partsOutstandingJobs: Array<{ jobId: string; jobNumber: string; customerName: string | null; lines: number; days: number }> = [];
  let partsOutstandingLineCount = 0;
  let partsOverdue = { jobs: 0, oldestDays: 0 };
  if (jobsAccess && (ctx.moduleAccess.get("JOB_PARTS") ?? "DENIED") !== "DENIED") {
    const rows = await listPartsOutstanding(ctx);
    const byJob = new Map<string, { jobId: string; jobNumber: string; lines: number; since: string | null }>();
    for (const row of rows) {
      const slot = byJob.get(row.jobId) ?? { jobId: row.jobId, jobNumber: row.jobNumber, lines: 0, since: null };
      slot.lines += row.partLines;
      if (row.outstandingSince && (!slot.since || row.outstandingSince < slot.since)) slot.since = row.outstandingSince;
      byJob.set(row.jobId, slot);
    }
    const jobsRolled = Array.from(byJob.values())
      .map((slot) => ({ ...slot, days: slot.since ? daysSince(new Date(slot.since), nowMs) : 0 }))
      .sort((a, b) => b.days - a.days);
    partsOutstandingLineCount = jobsRolled.reduce((sum, slot) => sum + slot.lines, 0);
    const overdue = jobsRolled.filter((slot) => slot.days >= PARTS_OVERDUE_THRESHOLD_DAYS);
    partsOverdue = { jobs: overdue.length, oldestDays: overdue.reduce((max, slot) => Math.max(max, slot.days), 0) };
    partsOutstandingJobs = jobsRolled.slice(0, 5).map((slot) => ({ jobId: slot.jobId, jobNumber: slot.jobNumber, customerName: null, lines: slot.lines, days: slot.days }));
  }

  // Customer names + job numbers for the few jobs the lists actually show.
  const stuckJobs = stuckAll.slice(0, 5);
  const nameIds = Array.from(new Set([...stuckJobs.map((row) => row.id), ...partsOutstandingJobs.map((row) => row.jobId)]));
  const jobInfo = nameIds.length > 0
    ? new Map((await prisma.job.findMany({ where: { companyId, id: { in: nameIds } }, select: { id: true, jobNumber: true, draftNumber: true, customer: { select: { name: true } } } })).map((row) => [row.id, row]))
    : new Map<string, { id: string; jobNumber: string | null; draftNumber: string; customer: { name: string } | null }>();
  for (const row of partsOutstandingJobs) row.customerName = jobInfo.get(row.jobId)?.customer?.name ?? null;

  // "Completed this month" — same definition as the chart's jobs-completed series
  // (status Complete or Closed, placed on the delivery date - see loadCompletionDates).
  let completedThisMonth: { count: number; previous: number; previousLabel: string } | null = null;
  if (jobsAccess) {
    const current = monthRange(0);
    const previous = monthRange(-1);
    const doneDates = await loadCompletionDates(companyId, previous.start);
    const inMonth = (range: { start: Date; end: Date }) => doneDates.filter((date) => date >= range.start && date < range.end).length;
    completedThisMonth = { count: inMonth(current), previous: inMonth(previous), previousLabel: previous.label };
  }

  // ETA cards — see ETA_* above.
  const [etaUpcoming, etaOverdue] = await Promise.all([
    jobsAccess && enabled.includes("upcoming-etas") ? loadEtaCard(ctx, companyId, "upcoming") : Promise.resolve<EtaCard>({ count: 0, jobs: [] }),
    jobsAccess && enabled.includes("overdue-etas") ? loadEtaCard(ctx, companyId, "overdue") : Promise.resolve<EtaCard>({ count: 0, jobs: [] }),
  ]);

  return {
    widgets,
    data: {
      etaUpcoming,
      etaOverdue,
      etaUpcomingDays: ETA_UPCOMING_DAYS,
      attention: jobsAccess
        ? {
            partsOverdue,
            awaitingGoAhead: { count: awaitingGoAheadCount, oldestDays: awaitingGoAheadOldest },
            stuck: { count: stuckAll.length },
            readyToDeliver: { count: readyToDeliverCount },
            stuckThresholdDays: STUCK_THRESHOLD_DAYS,
            overdueThresholdDays: PARTS_OVERDUE_THRESHOLD_DAYS,
          }
        : null,
      stuckJobs: stuckJobs.map((row) => ({
        id: row.id,
        jobNumber: jobInfo.get(row.id)?.jobNumber ?? jobInfo.get(row.id)?.draftNumber ?? "—",
        customerName: jobInfo.get(row.id)?.customer?.name ?? null,
        status: row.status,
        label: statusLabels[row.status as keyof typeof JOB_STATUS_LABELS] ?? row.status,
        days: row.days,
      })),
      statusBreakdown,
      partsOutstandingJobs,
      partsOutstandingLineCount,
      completedThisMonth,
      jobsSummary: jobsByStatus.reduce<Record<string, number>>((acc, row) => { acc[statusLabels[row.status]] = row._count._all; return acc; }, {}),
      recentJobs,
      outworkOutstanding,
      pexStatus: pexOpen.reduce<Record<string, number>>((acc, row) => { acc[String(row.status ?? "UNKNOWN")] = row._count._all; return acc; }, {}),
      supportTickets: tickets.reduce<Record<TicketStatus | string, number>>((acc, row) => { acc[String(row.status)] = row._count._all; return acc; }, {}),
      // 2026-09-15, user request: "add a linegraph that is customizable for
      // different analytics ... user can select 3 line graph views."
      analyticsSeries,
    },
  };
}