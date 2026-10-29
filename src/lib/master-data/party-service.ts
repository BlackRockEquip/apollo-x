// Server side of the Customers / Suppliers redesign (2026-10-29): the extra numbers shown on the list pages (open jobs, work out, ...), the
// tiles above them, and the "Jobs" / "Outwork" section on each customer's and supplier's own page. Read-only; nothing here changes data.
// The rules (what is "open", "overdue") live in party-model.ts so they can be unit tested without a database.
import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { RequestContext } from "@/lib/auth/context-types";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { SENT_BACK_STATUSES } from "@/lib/ui/job-tone";
import {
  CLOSED_JOB_STATUSES, OUTWORK_OVERDUE_DAYS, isOverdueEta, monthsAgo, outworkDaysOut, outworkState, startOfDay,
  summarizeCustomerJobs, summarizeSupplierOutwork,
} from "./party-model";

const SENT_BACK = [...SENT_BACK_STATUSES];
const CLOSED = [...CLOSED_JOB_STATUSES];

/** Job-derived numbers need the Jobs module + permission as well; a user who can see Customers but not Jobs just gets blanks. */
export function canReadJobs(ctx: RequestContext): boolean {
  try {
    requireModule(ctx, "JOBS_WIP", "READ");
    requireTenantPermission(ctx, "JOBS_VIEW");
    return true;
  } catch {
    return false;
  }
}

function customerAccess(ctx: RequestContext) {
  requireModule(ctx, "CUSTOMERS", "READ");
  requireTenantPermission(ctx, "CUSTOMERS_VIEW");
  return ctx.companyId!;
}

function supplierAccess(ctx: RequestContext) {
  requireModule(ctx, "SUPPLIERS", "READ");
  requireTenantPermission(ctx, "SUPPLIERS_VIEW");
  return ctx.companyId!;
}

function jobsAccess(ctx: RequestContext) {
  requireModule(ctx, "JOBS_WIP", "READ");
  requireTenantPermission(ctx, "JOBS_VIEW");
}

// ---------------------------------------------------------------------------------------------------------------------------------
// List pages: filters, per-row numbers and the tiles
// ---------------------------------------------------------------------------------------------------------------------------------

/** "Has open jobs" filter for the customers list. */
export function customerActivityWhere(activity: "all" | "open"): Prisma.CustomerWhereInput {
  return activity === "open" ? { jobs: { some: { returnedUnrepaired: false, status: { notIn: CLOSED } } } } : {};
}

/** "Has work out" filter for the suppliers list. */
export function supplierActivityWhere(activity: "all" | "open"): Prisma.SupplierWhereInput {
  return activity === "open" ? { outworkItems: { some: { status: "SENT_OUT" } } } : {};
}

export type CustomerRowStats = { openJobs: number; jobs12m: number; lastJobAt: string | null };
export type SupplierRowStats = { workOut: number; overdue: number };

export async function customerRowStats(ctx: RequestContext, ids: string[], now: Date = new Date()): Promise<Record<string, CustomerRowStats>> {
  const out: Record<string, CustomerRowStats> = {};
  if (ids.length === 0 || !canReadJobs(ctx)) return out;
  const companyId = ctx.companyId!;
  const since = monthsAgo(now, 12);
  const [open, recent, last] = await Promise.all([
    prisma.job.groupBy({ by: ["customerId"], where: { companyId, customerId: { in: ids }, returnedUnrepaired: false, status: { notIn: CLOSED } }, _count: { _all: true } }),
    prisma.job.groupBy({ by: ["customerId"], where: { companyId, customerId: { in: ids }, createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.job.groupBy({ by: ["customerId"], where: { companyId, customerId: { in: ids } }, _max: { createdAt: true } }),
  ]);
  for (const id of ids) out[id] = { openJobs: 0, jobs12m: 0, lastJobAt: null };
  for (const r of open) out[r.customerId].openJobs = r._count._all;
  for (const r of recent) out[r.customerId].jobs12m = r._count._all;
  for (const r of last) out[r.customerId].lastJobAt = r._max.createdAt ? r._max.createdAt.toISOString() : null;
  return out;
}

function overdueCutoff(now: Date): Date {
  return new Date(startOfDay(now).getTime() - OUTWORK_OVERDUE_DAYS * 86400000);
}

export async function supplierRowStats(ctx: RequestContext, ids: string[], now: Date = new Date()): Promise<Record<string, SupplierRowStats>> {
  const out: Record<string, SupplierRowStats> = {};
  if (ids.length === 0 || !canReadJobs(ctx)) return out;
  const companyId = ctx.companyId!;
  const [outNow, late] = await Promise.all([
    prisma.outworkItem.groupBy({ by: ["supplierId"], where: { companyId, supplierId: { in: ids }, status: "SENT_OUT" }, _count: { _all: true } }),
    prisma.outworkItem.groupBy({ by: ["supplierId"], where: { companyId, supplierId: { in: ids }, status: "SENT_OUT", dateSentOut: { lt: overdueCutoff(now) } }, _count: { _all: true } }),
  ]);
  for (const id of ids) out[id] = { workOut: 0, overdue: 0 };
  for (const r of outNow) out[r.supplierId].workOut = r._count._all;
  for (const r of late) out[r.supplierId].overdue = r._count._all;
  return out;
}

export type CustomerListSummary = { active: number; inactive: number; withOpenJobs: number | null; openJobs: number | null; onHold: number };

export async function customerListSummary(ctx: RequestContext): Promise<CustomerListSummary> {
  const companyId = customerAccess(ctx);
  const jobs = canReadJobs(ctx);
  const [active, inactive, onHold, withOpenJobs, openJobs] = await Promise.all([
    prisma.customer.count({ where: { companyId, active: true } }),
    prisma.customer.count({ where: { companyId, active: false } }),
    prisma.customer.count({ where: { companyId, active: true, accountOnHold: true } }),
    jobs ? prisma.customer.count({ where: { companyId, active: true, ...customerActivityWhere("open") } }) : Promise.resolve(null),
    jobs ? prisma.job.count({ where: { companyId, returnedUnrepaired: false, status: { notIn: CLOSED }, customer: { active: true } } }) : Promise.resolve(null),
  ]);
  return { active, inactive, withOpenJobs, openJobs, onHold };
}

export type SupplierListSummary = { active: number; inactive: number; rfqReady: number; workOut: number | null; overdue: number | null; brands: number };

export async function supplierListSummary(ctx: RequestContext, now: Date = new Date()): Promise<SupplierListSummary> {
  const companyId = supplierAccess(ctx);
  const jobs = canReadJobs(ctx);
  const [active, inactive, rfqReady, brands, workOut, overdue] = await Promise.all([
    prisma.supplier.count({ where: { companyId, active: true } }),
    prisma.supplier.count({ where: { companyId, active: false } }),
    prisma.supplier.count({ where: { companyId, active: true, contacts: { some: { companyId, active: true, canReceiveRfq: true } } } }),
    prisma.manufacturer.count({ where: { companyId, active: true, suppliers: { some: { active: true, supplier: { active: true } } } } }),
    jobs ? prisma.outworkItem.count({ where: { companyId, status: "SENT_OUT" } }) : Promise.resolve(null),
    jobs ? prisma.outworkItem.count({ where: { companyId, status: "SENT_OUT", dateSentOut: { lt: overdueCutoff(now) } } }) : Promise.resolve(null),
  ]);
  return { active, inactive, rfqReady, workOut, overdue, brands };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// A customer's jobs: received / sent back
// ---------------------------------------------------------------------------------------------------------------------------------

const customerJobsQuery = z.object({
  side: z.enum(["received", "sent", "all"]).default("received"),
  q: z.string().trim().max(100).default(""),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

function iso(d: Date | null | undefined) {
  return d ? d.toISOString() : null;
}

export async function listCustomerJobs(ctx: RequestContext, customerId: string, raw: unknown, now: Date = new Date()) {
  const companyId = customerAccess(ctx);
  jobsAccess(ctx);
  const q = customerJobsQuery.parse(raw);
  const customer = await prisma.customer.findFirst({ where: { id: customerId, companyId }, select: { id: true } });
  if (!customer) throw new Error("NOT_FOUND");

  const contains = { contains: q.q, mode: "insensitive" as const };
  const sideWhere: Prisma.JobWhereInput =
    q.side === "received" ? { returnedUnrepaired: false, status: { notIn: SENT_BACK } }
    : q.side === "sent" ? { OR: [{ returnedUnrepaired: true }, { status: { in: SENT_BACK } }] }
    : {};
  const searchWhere: Prisma.JobWhereInput = q.q
    ? { OR: [{ jobNumber: contains }, { machineMake: contains }, { machineModel: contains }, { component: contains }, { machineSerial: contains }, { customerReference: contains }, { customerPo: contains }] }
    : {};
  const where: Prisma.JobWhereInput = { companyId, customerId, AND: [sideWhere, searchWhere] };

  const [groups, overdue, warranty, total, rows] = await Promise.all([
    prisma.job.groupBy({ by: ["status", "returnedUnrepaired"], where: { companyId, customerId }, _count: { _all: true } }),
    prisma.job.count({ where: { companyId, customerId, returnedUnrepaired: false, status: { notIn: SENT_BACK }, etaDate: { lt: startOfDay(now) } } }),
    prisma.job.count({ where: { companyId, customerId, type: "WARRANTY" } }),
    prisma.job.count({ where }),
    prisma.job.findMany({
      where,
      orderBy: [{ dateReceived: "desc" }, { createdAt: "desc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: { id: true, jobNumber: true, draftNumber: true, type: true, status: true, returnedUnrepaired: true, machineMake: true, machineModel: true, component: true, dateReceived: true, createdAt: true, etaDate: true, deliveryDate: true },
    }),
  ]);

  const summary = summarizeCustomerJobs(groups.map((g) => ({ status: g.status, returnedUnrepaired: g.returnedUnrepaired, count: g._count._all })), overdue, warranty);
  return {
    summary,
    counts: { received: summary.inWorkshop, sent: summary.sentBack, all: summary.total },
    total,
    page: q.page,
    pageSize: q.pageSize,
    items: rows.map((j) => ({
      id: j.id,
      jobNumber: j.jobNumber ?? j.draftNumber ?? "—",
      type: j.type,
      status: j.status,
      returnedUnrepaired: j.returnedUnrepaired,
      machine: [j.machineMake, j.machineModel].filter(Boolean).join(" ") || null,
      component: j.component,
      dateIn: iso(j.dateReceived ?? j.createdAt),
      eta: iso(j.etaDate),
      delivered: iso(j.deliveryDate),
      overdue: isOverdueEta(j.etaDate, j.status, j.returnedUnrepaired, now),
    })),
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// A supplier's outwork: sent out / received back
// ---------------------------------------------------------------------------------------------------------------------------------

const supplierOutworkQuery = z.object({
  side: z.enum(["sent", "received", "all"]).default("sent"),
  q: z.string().trim().max(100).default(""),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

export async function listSupplierOutwork(ctx: RequestContext, supplierId: string, raw: unknown, now: Date = new Date()) {
  const companyId = supplierAccess(ctx);
  jobsAccess(ctx);
  const q = supplierOutworkQuery.parse(raw);
  const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, companyId }, select: { id: true } });
  if (!supplier) throw new Error("NOT_FOUND");

  const contains = { contains: q.q, mode: "insensitive" as const };
  const sideWhere: Prisma.OutworkItemWhereInput = q.side === "sent" ? { status: "SENT_OUT" } : q.side === "received" ? { status: "RECEIVED" } : {};
  const searchWhere: Prisma.OutworkItemWhereInput = q.q
    ? { OR: [{ description: contains }, { notes: contains }, { job: { jobNumber: contains } }, { job: { customer: { name: contains } } }] }
    : {};
  const where: Prisma.OutworkItemWhereInput = { companyId, supplierId, AND: [sideWhere, searchWhere] };

  const [all, total, rows] = await Promise.all([
    prisma.outworkItem.findMany({ where: { companyId, supplierId }, select: { status: true, dateSentOut: true, dateReceived: true } }),
    prisma.outworkItem.count({ where }),
    prisma.outworkItem.findMany({
      where,
      orderBy: [{ dateSentOut: "desc" }, { createdAt: "desc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: { id: true, description: true, quantity: true, status: true, dateSentOut: true, dateReceived: true, job: { select: { id: true, jobNumber: true, draftNumber: true, customer: { select: { name: true } } } } },
    }),
  ]);

  const summary = summarizeSupplierOutwork(all, now);
  const receivedAll = all.filter((i) => i.status === "RECEIVED").length;
  return {
    summary,
    counts: { sent: all.length - receivedAll, received: receivedAll, all: all.length },
    total,
    page: q.page,
    pageSize: q.pageSize,
    items: rows.map((i) => ({
      id: i.id,
      jobId: i.job.id,
      jobNumber: i.job.jobNumber ?? i.job.draftNumber ?? "—",
      customer: i.job.customer?.name ?? null,
      description: i.description,
      quantity: i.quantity,
      status: i.status,
      state: outworkState(i, now),
      sentAt: iso(i.dateSentOut),
      receivedAt: iso(i.dateReceived),
      days: outworkDaysOut(i, now),
    })),
  };
}
