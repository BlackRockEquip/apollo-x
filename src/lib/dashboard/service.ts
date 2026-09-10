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
  };
}

export async function saveDashboardConfig(ctx: RequestContext, raw: unknown) {
  const companyId = authorize(ctx);
  requireModule(ctx, "DASHBOARD", "WRITE");
  const widgets = normalizeWidgets(ctx, raw);
  return prisma.$transaction(async (tx) => {
    const saved = await tx.userDashboardConfig.upsert({
      where: { userId_companyId: { userId: ctx.userId, companyId } },
      create: { userId: ctx.userId, companyId, widgets: widgets as Prisma.InputJsonValue },
      update: { widgets: widgets as Prisma.InputJsonValue },
    });
    await tx.auditEvent.create({
      data: { companyId, actorId: ctx.userId, supportAccessId: ctx.supportAccessId, source: "API", module: "DASHBOARD", entityType: "UserDashboardConfig", entityId: saved.id, action: "DASHBOARD_LAYOUT_SAVED", correlationId: ctx.correlationId, afterData: widgets as Prisma.InputJsonValue },
    });
    return { widgets };
  });
}

export async function resetDashboardConfig(ctx: RequestContext) {
  const companyId = authorize(ctx);
  await prisma.userDashboardConfig.deleteMany({ where: { userId: ctx.userId, companyId } });
  return { widgets: defaultWidgets(ctx).filter((row) => canSeeWidget(ctx, row.key)) };
}

export async function getDashboardData(ctx: RequestContext) {
  const companyId = authorize(ctx);
  const { widgets } = await getDashboardConfig(ctx);
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

  return {
    widgets,
    data: {
      jobsSummary: jobsByStatus.reduce<Record<string, number>>((acc, row) => { acc[JOB_STATUS_LABELS[row.status]] = row._count._all; return acc; }, {}),
      recentJobs,
      lowStock: lowStock.map((part) => ({ ...part, balance: part.stockBalances[0] ?? null })),
      outstandingParts: outstandingPartLines,
      pexStatus: pexOpen.reduce<Record<string, number>>((acc, row) => { acc[String(row.status ?? "UNKNOWN")] = row._count._all; return acc; }, {}),
      supportTickets: tickets.reduce<Record<TicketStatus | string, number>>((acc, row) => { acc[String(row.status)] = row._count._all; return acc; }, {}),
    },
  };
}