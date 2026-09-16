import { ModuleKey, Prisma, TicketStatus } from "@prisma/client";
import type { RequestContext } from "@/lib/auth/context-types";
import { requireModule, requireTenant, requireTenantPermission } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { JOB_STATUS_LABELS } from "@/lib/jobs/ui";

export type DashboardWidgetKey =
  | "jobs-summary"
  | "wip-status-counts"
  | "recent-jobs"
  | "inventory-alerts"
  | "low-stock"
  | "pex-status"
  | "outstanding-parts"
  | "procurement-summary"
  | "support-tickets"
  | "notifications";

type DashboardWidget = { key: DashboardWidgetKey; enabled: boolean; order: number };

export const DASHBOARD_WIDGET_DEFS: Array<{ key: DashboardWidgetKey; label: string; module: ModuleKey; permission: string }> = [
  { key: "jobs-summary", label: "Jobs summary", module: "JOBS_WIP", permission: "JOBS_VIEW" },
  { key: "wip-status-counts", label: "WIP status counts", module: "JOBS_WIP", permission: "JOBS_VIEW" },
  { key: "recent-jobs", label: "Recent jobs", module: "JOBS_WIP", permission: "JOBS_VIEW" },
  { key: "inventory-alerts", label: "Inventory alerts", module: "INVENTORY", permission: "INVENTORY_VIEW" },
  { key: "low-stock", label: "Low stock", module: "INVENTORY", permission: "INVENTORY_VIEW" },
  { key: "pex-status", label: "PEX status", module: "PEX_TRACKING", permission: "PEX_TRACKING_VIEW" },
  { key: "outstanding-parts", label: "Outstanding parts", module: "INVENTORY", permission: "INVENTORY_VIEW" },
  { key: "procurement-summary", label: "Procurement / outwork", module: "PROCUREMENT", permission: "REPORTS_VIEW" },
  { key: "support-tickets", label: "Support tickets", module: "NOTIFICATIONS", permission: "DASHBOARD_VIEW" },
  { key: "notifications", label: "Notifications", module: "NOTIFICATIONS", permission: "DASHBOARD_VIEW" },
];

function canSeeWidget(ctx: RequestContext, key: DashboardWidgetKey) {
  const def = DASHBOARD_WIDGET_DEFS.find((row) => row.key === key);
  if (!def) return false;
  if ((ctx.moduleAccess.get(def.module) ?? "DENIED") === "DENIED") return false;
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

// One timestamp fetcher per metric — each just selects the single date
// field that defines "when this happened" for that metric, scoped to the
// trailing window; bucketing into months happens once, generically, in
// buildMetricSeries below rather than a separate SQL groupBy per metric.
const ANALYTICS_METRIC_FETCHERS: Record<DashboardAnalyticsMetricKey, (companyId: string, since: Date) => Promise<Date[]>> = {
  "jobs-created": async (companyId, since) =>
    (await prisma.job.findMany({ where: { companyId, createdAt: { gte: since } }, select: { createdAt: true } })).map((row) => row.createdAt),
  // "Completed" here means actually closed (Job.closedAt set — see
  // schema.prisma's Job.closedAt/closedById), not just sitting in the
  // COMPLETE status without having gone through Close yet.
  "jobs-completed": async (companyId, since) =>
    (await prisma.job.findMany({ where: { companyId, closedAt: { gte: since } }, select: { closedAt: true } })).map((row) => row.closedAt).filter((d): d is Date => d != null),
  "warranty-jobs": async (companyId, since) =>
    (await prisma.job.findMany({ where: { companyId, type: "WARRANTY", createdAt: { gte: since } }, select: { createdAt: true } })).map((row) => row.createdAt),
  "support-tickets-opened": async (companyId, since) =>
    (await prisma.supportTicket.findMany({ where: { companyId, createdAt: { gte: since } }, select: { createdAt: true } })).map((row) => row.createdAt),
};

async function buildMetricSeries(companyId: string, key: DashboardAnalyticsMetricKey) {
  const buckets = monthBuckets(ANALYTICS_SERIES_MONTHS);
  const since = buckets[0].start;
  const dates = await ANALYTICS_METRIC_FETCHERS[key](companyId, since);
  const counts = new Map<string, number>(buckets.map((b) => [b.key, 0]));
  for (const date of dates) {
    const bucketKey = bucketKeyFor(date);
    if (counts.has(bucketKey)) counts.set(bucketKey, (counts.get(bucketKey) ?? 0) + 1);
  }
  return buckets.map((b) => ({ month: b.label, value: counts.get(b.key) ?? 0 }));
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

  const [jobsByStatus, recentJobs, lowStock, outstandingPartLines, pexOpen, tickets] = await Promise.all([
    enabled.some((key) => key === "jobs-summary" || key === "wip-status-counts")
      ? prisma.job.groupBy({ by: ["status"], where: { companyId }, _count: { _all: true } })
      : Promise.resolve([]),
    enabled.includes("recent-jobs")
      ? prisma.job.findMany({ where: { companyId }, orderBy: { updatedAt: "desc" }, take: 8, select: { id: true, jobNumber: true, status: true, customerReference: true, customerPo: true, component: true, machineModel: true, customer: { select: { name: true } } } })
      : Promise.resolve([]),
    enabled.includes("low-stock") || enabled.includes("inventory-alerts")
      ? prisma.part.findMany({ where: { companyId, stockBalances: { some: { quantityOnHand: { lte: prisma.stockBalance.fields.lowStockThreshold } } } }, take: 8, orderBy: { updatedAt: "desc" }, select: { id: true, partNumber: true, description: true, stockBalances: { take: 1, select: { quantityOnHand: true, lowStockThreshold: true } } } })
      : Promise.resolve([]),
    // "Outstanding" now means a JobPartLine that hasn't been fully received
    // yet (see PartLineStatus) — replaces the old reserve/issue/return
    // JobPartRequirement model, which was dropped when the Parts list was
    // swapped in to match ModApp (see workshop-track-progress.md).
    enabled.includes("outstanding-parts")
      ? prisma.jobPartLine.findMany({ where: { companyId, status: { not: "RECEIVED" } }, take: 8, orderBy: { updatedAt: "desc" }, select: { id: true, partNumber: true, description: true, quantity: true, receivedQuantity: true, status: true, job: { select: { id: true, jobNumber: true, customer: { select: { name: true } } } } } })
      : Promise.resolve([]),
    // Repointed (2026-09-09) from the old PexSupplyLink.returnStatus to
    // PexRecord.status as part of the full PEX -> PexRecord replacement
    // (see schema.prisma's PexRecord comment) — only records with a supply
    // leg count here, matching PEX Tracking's own "chains" scope, not PEX
    // Stock's inventory scope.
    enabled.includes("pex-status")
      ? prisma.pexRecord.groupBy({ by: ["status"], where: { companyId, supplyJobId: { not: null } }, _count: { _all: true } })
      : Promise.resolve([]),
    enabled.includes("support-tickets")
      ? prisma.supportTicket.groupBy({ by: ["status"], where: { companyId }, _count: { _all: true } })
      : Promise.resolve([]),
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
      points: await buildMetricSeries(companyId, key),
    })),
  );

  return {
    widgets,
    data: {
      jobsSummary: jobsByStatus.reduce<Record<string, number>>((acc, row) => { acc[JOB_STATUS_LABELS[row.status]] = row._count._all; return acc; }, {}),
      recentJobs,
      lowStock: lowStock.map((part) => ({ ...part, balance: part.stockBalances[0] ?? null })),
      outstandingParts: outstandingPartLines,
      pexStatus: pexOpen.reduce<Record<string, number>>((acc, row) => { acc[String(row.status ?? "UNKNOWN")] = row._count._all; return acc; }, {}),
      supportTickets: tickets.reduce<Record<TicketStatus | string, number>>((acc, row) => { acc[String(row.status)] = row._count._all; return acc; }, {}),
      // 2026-09-15, user request: "add a linegraph that is customizable for
      // different analytics ... user can select 3 line graph views."
      analyticsSeries,
    },
  };
}