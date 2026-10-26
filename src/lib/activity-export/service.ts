import type { Prisma } from "@prisma/client";
import { z } from "zod";
import type { RequestContext } from "@/lib/auth/context-types";
import { requireModule, requirePlatformPermission, requireTenantPermission } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit/service";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Activity history export (2026-10-26, user request):
//  - Company admin, Settings > Import / Export: "export activity history that
//    allows the user to select all or specific jobs related". Contents are the
//    user's choice: Job activity, the System audit log, or both. Jobs are picked
//    by search-and-tick, and a date range limits which activity is exported.
//  - Platform administrators, within a company: a button that downloads the
//    complete activity history of that company (job activity + audit log).
// Output is one .xlsx workbook, one sheet per chosen type plus an "Export info"
// sheet that says who exported what and with which filters.
// ---------------------------------------------------------------------------

export class ActivityExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActivityExportError";
  }
}

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-26.");

export const activityExportInput = z
  .object({
    includeJobActivity: z.boolean().default(true),
    includeAuditLog: z.boolean().default(false),
    // Empty or missing = every job. Otherwise only these jobs.
    jobIds: z.array(z.string().min(1)).max(2000).optional(),
    from: dateOnly.optional().or(z.literal("").transform(() => undefined)),
    to: dateOnly.optional().or(z.literal("").transform(() => undefined)),
  })
  .refine((v) => v.includeJobActivity || v.includeAuditLog, { message: "Choose Job activity, System audit log, or both." });

export type ActivityExportInput = z.infer<typeof activityExportInput>;

export type ActivityExportResult = { buffer: Buffer; fileName: string; mimeType: string };

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const BATCH = 5000;
// Excel allows 32,767 characters in one cell.
const MAX_CELL = 32000;
const SOUTH_AFRICA_TZ = "Africa/Johannesburg";

// South Africa is UTC+2 all year, so the sheet shows the times the workshop
// actually saw. "sv-SE" formats as 2026-10-26 14:05:11, which sorts and reads well in Excel.
export function formatExportTimestamp(date: Date): string {
  return date.toLocaleString("sv-SE", { timeZone: SOUTH_AFRICA_TZ });
}

// A South African calendar day as a UTC range [start, end).
export function dayRange(from?: string, to?: string): { gte?: Date; lt?: Date } {
  const range: { gte?: Date; lt?: Date } = {};
  if (from) range.gte = new Date(`${from}T00:00:00+02:00`);
  if (to) range.lt = new Date(new Date(`${to}T00:00:00+02:00`).getTime() + 24 * 60 * 60 * 1000);
  if (range.gte && range.lt && range.gte >= range.lt) throw new ActivityExportError("The 'from' date must be on or before the 'to' date.");
  return range;
}

const SENSITIVE_KEY = /pass(word)?|secret|token|hash|apikey|api_key/i;

// Audit before/after snapshots are JSON. Keep them readable in one cell, and never
// let a credential-like field leave the system, even to an administrator.
export function redactForExport(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactForExport);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY.test(key) ? "[hidden]" : redactForExport(inner);
    }
    return out;
  }
  return value;
}

export function jsonCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = JSON.stringify(redactForExport(value));
  if (!text) return "";
  return text.length > MAX_CELL ? `${text.slice(0, MAX_CELL)}… (truncated)` : text;
}

function humanType(type: string): string {
  const spaced = type.toLowerCase().replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function jobLabel(job: { jobNumber: string | null; draftNumber: string } | undefined): string {
  if (!job) return "";
  return job.jobNumber || `Draft ${job.draftNumber}`;
}

type Row = Record<string, string | number>;

type BuildOptions = {
  companyId: string;
  companyName: string;
  exportedBy: string;
  includeJobActivity: boolean;
  includeAuditLog: boolean;
  jobIds?: string[];
  from?: string;
  to?: string;
};

async function jobActivityRows(opts: BuildOptions): Promise<Row[]> {
  const range = dayRange(opts.from, opts.to);
  const where: Prisma.JobActivityWhereInput = { companyId: opts.companyId };
  if (opts.jobIds?.length) where.jobId = { in: opts.jobIds };
  if (range.gte || range.lt) where.createdAt = range;
  const rows: Row[] = [];
  let cursor: string | undefined;
  for (;;) {
    const batch = await prisma.jobActivity.findMany({
      where,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        type: true,
        description: true,
        createdAt: true,
        job: { select: { jobNumber: true, draftNumber: true, customer: { select: { name: true } } } },
        actor: { select: { displayName: true } },
      },
    });
    for (const a of batch) {
      rows.push({
        "Job number": jobLabel(a.job),
        Customer: a.job.customer?.name ?? "",
        "Date and time": formatExportTimestamp(a.createdAt),
        Activity: humanType(a.type),
        Description: a.description,
        User: a.actor?.displayName ?? "System",
      });
    }
    if (batch.length < BATCH) break;
    cursor = batch[batch.length - 1].id;
  }
  return rows;
}

async function auditRows(opts: BuildOptions): Promise<Row[]> {
  const range = dayRange(opts.from, opts.to);
  const where: Prisma.AuditEventWhereInput = { companyId: opts.companyId };
  // Specific jobs: only the audit entries that are about those jobs.
  if (opts.jobIds?.length) {
    where.entityType = "Job";
    where.entityId = { in: opts.jobIds };
  }
  if (range.gte || range.lt) where.occurredAt = range;

  const rows: Row[] = [];
  let cursor: string | undefined;
  const jobNames = new Map<string, string>();
  for (;;) {
    const batch = await prisma.auditEvent.findMany({
      where,
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: { actor: { select: { displayName: true } } },
    });
    const unknownJobIds = [...new Set(batch.filter((e) => e.entityType === "Job" && e.entityId && !jobNames.has(e.entityId)).map((e) => e.entityId as string))];
    if (unknownJobIds.length) {
      const jobs = await prisma.job.findMany({ where: { companyId: opts.companyId, id: { in: unknownJobIds } }, select: { id: true, jobNumber: true, draftNumber: true } });
      for (const j of jobs) jobNames.set(j.id, jobLabel(j));
    }
    for (const e of batch) {
      rows.push({
        "Date and time": formatExportTimestamp(e.occurredAt),
        User: e.actor?.displayName ?? (e.source === "PLATFORM" ? "Platform" : "System"),
        Module: e.module,
        "Record type": e.entityType,
        "Record": e.entityType === "Job" && e.entityId ? jobNames.get(e.entityId) ?? e.entityId : e.entityId ?? "",
        Action: humanType(e.action),
        Reason: e.reason ?? "",
        Source: e.source,
        "Platform support access": e.supportAccessId ? "Yes" : "",
        "IP address": e.ipAddress ?? "",
        "Before": jsonCell(e.beforeData),
        "After": jsonCell(e.afterData),
        "Reference": e.correlationId,
      });
    }
    if (batch.length < BATCH) break;
    cursor = batch[batch.length - 1].id;
  }
  return rows;
}

async function buildWorkbook(opts: BuildOptions): Promise<ActivityExportResult> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();

  const jobRows = opts.includeJobActivity ? await jobActivityRows(opts) : [];
  const auditList = opts.includeAuditLog ? await auditRows(opts) : [];

  const info: Row[] = [
    { Item: "Company", Value: opts.companyName },
    { Item: "Exported by", Value: opts.exportedBy },
    { Item: "Exported at", Value: formatExportTimestamp(new Date()) },
    { Item: "Jobs", Value: opts.jobIds?.length ? `${opts.jobIds.length} selected job(s)` : "All jobs" },
    { Item: "Date range", Value: opts.from || opts.to ? `${opts.from || "the beginning"} to ${opts.to || "today"}` : "All dates" },
  ];
  if (opts.includeJobActivity) info.push({ Item: "Job activity rows", Value: jobRows.length });
  if (opts.includeAuditLog) info.push({ Item: "System audit log rows", Value: auditList.length });
  if (opts.includeAuditLog && opts.jobIds?.length) info.push({ Item: "Note", Value: "The audit log is limited to entries about the selected jobs." });
  info.push({ Item: "Times shown", Value: "South African time" });

  function addSheet(rows: Row[], name: string, emptyHeaders: string[], widths: number[]) {
    const sheet = rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([emptyHeaders]);
    sheet["!cols"] = widths.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(workbook, sheet, name.slice(0, 31));
  }

  addSheet(info, "Export info", ["Item", "Value"], [24, 60]);
  if (opts.includeJobActivity) {
    addSheet(jobRows, "Job activity", ["Job number", "Customer", "Date and time", "Activity", "Description", "User"], [14, 28, 20, 26, 70, 22]);
  }
  if (opts.includeAuditLog) {
    addSheet(auditList, "System audit log", ["Date and time", "User", "Module", "Record type", "Record", "Action", "Reason", "Source", "Platform support access", "IP address", "Before", "After", "Reference"], [20, 22, 16, 16, 24, 26, 28, 12, 12, 16, 50, 50, 36]);
  }

  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }) as Buffer;
  const stamp = new Date().toISOString().slice(0, 10);
  const safeName = opts.companyName.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "company";
  const label = opts.includeJobActivity && opts.includeAuditLog ? "activity-history" : opts.includeJobActivity ? "job-activity" : "audit-log";
  return { buffer, fileName: `${safeName}-${label}-${stamp}.xlsx`, mimeType: XLSX_MIME };
}

function tenantCompany(ctx: RequestContext): string {
  requireTenantPermission(ctx, "SETTINGS_MANAGE");
  requireModule(ctx, "IMPORT_EXPORT", "READ");
  return ctx.companyId as string;
}

// Company admin export (Settings > Import / Export).
export async function exportActivityHistory(ctx: RequestContext, rawInput: unknown): Promise<ActivityExportResult> {
  const companyId = tenantCompany(ctx);
  const input = activityExportInput.parse(rawInput);
  // The audit log is a separate permission from settings, so an admin whose audit
  // access was removed cannot get it through the back door of an export.
  if (input.includeAuditLog) requireTenantPermission(ctx, "AUDIT_VIEW");
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { legalName: true, tradingName: true } });
  if (!company) throw new Error("NOT_FOUND");
  const companyName = company.tradingName?.trim() || company.legalName;
  const jobIds = input.jobIds?.length ? await ownJobIds(companyId, input.jobIds) : undefined;
  const result = await buildWorkbook({
    companyId,
    companyName,
    exportedBy: ctx.displayName,
    includeJobActivity: input.includeJobActivity,
    includeAuditLog: input.includeAuditLog,
    jobIds,
    from: input.from,
    to: input.to,
  });
  await recordAudit(ctx, {
    source: "UI",
    module: "IMPORT_EXPORT",
    entityType: "ActivityHistory",
    action: "ACTIVITY_HISTORY_EXPORTED",
    afterData: { jobActivity: input.includeJobActivity, auditLog: input.includeAuditLog, jobs: jobIds?.length ?? "all", from: input.from ?? null, to: input.to ?? null },
  });
  return result;
}

// Only ever export jobs that belong to this company, whatever ids the browser sent.
async function ownJobIds(companyId: string, ids: string[]): Promise<string[]> {
  const jobs = await prisma.job.findMany({ where: { companyId, id: { in: ids } }, select: { id: true } });
  if (!jobs.length) throw new ActivityExportError("None of the selected jobs were found.");
  return jobs.map((j) => j.id);
}

// Platform administrator export: everything for one company, no filters.
export async function exportCompanyActivityHistoryForPlatform(ctx: RequestContext, companyId: string): Promise<ActivityExportResult> {
  requirePlatformPermission(ctx, "PLATFORM_AUDIT_VIEW");
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, legalName: true, tradingName: true } });
  if (!company) throw new Error("NOT_FOUND");
  const companyName = company.tradingName?.trim() || company.legalName;
  const result = await buildWorkbook({
    companyId: company.id,
    companyName,
    exportedBy: ctx.displayName,
    includeJobActivity: true,
    includeAuditLog: true,
  });
  await prisma.auditEvent.create({
    data: {
      companyId: company.id,
      actorId: ctx.userId,
      supportAccessId: ctx.supportAccessId,
      correlationId: ctx.correlationId,
      source: "PLATFORM",
      module: "PLATFORM",
      entityType: "Company",
      entityId: company.id,
      action: "ACTIVITY_HISTORY_EXPORTED",
    },
  });
  return result;
}

export type ActivityJobOption = { id: string; jobNumber: string; customer: string; status: string; activityCount: number };

const searchInput = z.object({
  q: z.string().trim().max(80).optional(),
  from: dateOnly.optional().or(z.literal("").transform(() => undefined)),
  to: dateOnly.optional().or(z.literal("").transform(() => undefined)),
});

// Job picker for the company-admin card: search by job number or customer; with a
// date range, only jobs that had activity in that range are offered.
export async function searchJobsForActivityExport(ctx: RequestContext, raw: unknown): Promise<{ jobs: ActivityJobOption[]; truncated: boolean }> {
  const companyId = tenantCompany(ctx);
  const { q, from, to } = searchInput.parse(raw);
  const range = dayRange(from, to);
  const where: Prisma.JobWhereInput = { companyId };
  if (q) {
    where.OR = [
      { jobNumber: { contains: q, mode: "insensitive" } },
      { customer: { name: { contains: q, mode: "insensitive" } } },
      { customerReference: { contains: q, mode: "insensitive" } },
    ];
  }
  if (range.gte || range.lt) where.activities = { some: { createdAt: range } };
  const LIMIT = 100;
  const jobs = await prisma.job.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take: LIMIT + 1,
    select: {
      id: true,
      jobNumber: true,
      draftNumber: true,
      status: true,
      customer: { select: { name: true } },
      _count: { select: { activities: true } },
    },
  });
  return {
    truncated: jobs.length > LIMIT,
    jobs: jobs.slice(0, LIMIT).map((j) => ({
      id: j.id,
      jobNumber: jobLabel(j),
      customer: j.customer?.name ?? "",
      status: humanType(j.status),
      activityCount: j._count.activities,
    })),
  };
}
