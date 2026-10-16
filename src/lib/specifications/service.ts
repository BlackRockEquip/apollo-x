import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { RequestContext } from "@/lib/auth/context-types";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit/service";
import { prisma } from "@/lib/prisma";

// 2026-10-16, Specifications module (Engineering Business). The Dimensional Size Report: a header, a
// "recorded when the job arrived" table and a "recorded after machining" table, per component. A job can hold
// several reports. Everything needs the Specifications module plus the job permissions (JOBS_VIEW to read,
// JOBS_EDIT to change) — machinists with the restricted role can record dimensions, that is the point of it.

function notFound(): never { throw new Error("NOT_FOUND"); }

function requireRead(ctx: RequestContext) {
  requireModule(ctx, "JOBS_WIP", "READ");
  requireModule(ctx, "SPECIFICATIONS", "READ");
  requireTenantPermission(ctx, "JOBS_VIEW");
  return ctx.companyId!;
}

function requireWrite(ctx: RequestContext) {
  requireModule(ctx, "JOBS_WIP", "WRITE");
  requireModule(ctx, "SPECIFICATIONS", "WRITE");
  requireTenantPermission(ctx, "JOBS_EDIT");
  return ctx.companyId!;
}

const text = (max: number) =>
  z.string().max(max).optional().nullable().transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  });

export const dimensionLineInput = z.object({
  phase: z.enum(["ARRIVED", "AFTER_MACHINING"]),
  partNumber: text(120),
  description: text(300),
  outerDiameter: text(60),
  innerDiameter: text(60),
  length: text(60),
  tolerance: text(120),
  additionalMeasured: text(400),
  accepted: z.boolean().nullable().optional().transform((value) => (value === undefined ? null : value)),
});

export const dimensionReportInput = z.object({
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD.").optional().nullable().transform((value) => value || null),
  drawingNumber: text(120),
  machine: text(120),
  component: text(200),
  measuredBy: text(120),
  operator: text(120),
  instrument: text(200),
  notes: text(2000),
  lines: z.array(dimensionLineInput).max(400).default([]),
});

export const specificationFormSettingsInput = z.object({
  standardText: text(200),
  documentNumber: text(80),
  issueDate: text(40),
  revision: text(40),
  revisionDate: text(40),
});

const reportInclude = { lines: { orderBy: [{ phase: "asc" as const }, { sortOrder: "asc" as const }, { createdAt: "asc" as const }] } };

function serialize<T extends { reportDate: Date | null }>(report: T) {
  return { ...report, reportDate: report.reportDate ? report.reportDate.toISOString().slice(0, 10) : null };
}

async function requireJob(companyId: string, jobId: string) {
  if (!/^[a-z0-9]{20,40}$/i.test(jobId)) notFound();
  const job = await prisma.job.findFirst({ where: { id: jobId, companyId }, select: { id: true, jobNumber: true, draftNumber: true } });
  if (!job) notFound();
  return job;
}

function lineRows(companyId: string, reportId: string, lines: z.infer<typeof dimensionLineInput>[]) {
  // sortOrder follows the order the rows were sent in, per table.
  const counters: Record<string, number> = { ARRIVED: 0, AFTER_MACHINING: 0 };
  return lines.map((line) => ({
    companyId,
    reportId,
    phase: line.phase,
    sortOrder: counters[line.phase]++,
    partNumber: line.partNumber,
    description: line.description,
    outerDiameter: line.outerDiameter,
    innerDiameter: line.innerDiameter,
    length: line.length,
    tolerance: line.tolerance,
    additionalMeasured: line.additionalMeasured,
    accepted: line.accepted,
  }));
}

export async function listJobDimensionReports(ctx: RequestContext, jobId: string) {
  const companyId = requireRead(ctx);
  await requireJob(companyId, jobId);
  const reports = await prisma.jobDimensionReport.findMany({ where: { companyId, jobId }, orderBy: { createdAt: "asc" }, include: reportInclude });
  return { items: reports.map(serialize) };
}

export async function createJobDimensionReport(ctx: RequestContext, jobId: string, raw: unknown) {
  const companyId = requireWrite(ctx);
  const input = dimensionReportInput.parse(raw);
  await requireJob(companyId, jobId);
  const report = await prisma.$transaction(async (tx) => {
    const created = await tx.jobDimensionReport.create({
      data: {
        companyId, jobId,
        reportDate: input.reportDate ? new Date(`${input.reportDate}T00:00:00Z`) : null,
        drawingNumber: input.drawingNumber, machine: input.machine, component: input.component,
        measuredBy: input.measuredBy, operator: input.operator, instrument: input.instrument, notes: input.notes,
        createdById: ctx.userId, updatedById: ctx.userId,
      },
    });
    if (input.lines.length > 0) await tx.jobDimensionLine.createMany({ data: lineRows(companyId, created.id, input.lines) });
    return tx.jobDimensionReport.findUniqueOrThrow({ where: { id: created.id }, include: reportInclude });
  });
  await recordAudit(ctx, { source: "UI", module: "SPECIFICATIONS", entityType: "JobDimensionReport", entityId: report.id, action: "CREATE", afterData: { jobId, lineCount: report.lines.length } });
  return serialize(report);
}

// Saves the whole sheet in one go: header fields plus the full row list replace what was stored.
export async function updateJobDimensionReport(ctx: RequestContext, reportId: string, raw: unknown) {
  const companyId = requireWrite(ctx);
  const input = dimensionReportInput.parse(raw);
  const existing = await prisma.jobDimensionReport.findFirst({ where: { id: reportId, companyId }, select: { id: true } });
  if (!existing) notFound();
  const report = await prisma.$transaction(async (tx) => {
    await tx.jobDimensionReport.update({
      where: { id: reportId },
      data: {
        reportDate: input.reportDate ? new Date(`${input.reportDate}T00:00:00Z`) : null,
        drawingNumber: input.drawingNumber, machine: input.machine, component: input.component,
        measuredBy: input.measuredBy, operator: input.operator, instrument: input.instrument, notes: input.notes,
        updatedById: ctx.userId,
      },
    });
    await tx.jobDimensionLine.deleteMany({ where: { reportId, companyId } });
    if (input.lines.length > 0) await tx.jobDimensionLine.createMany({ data: lineRows(companyId, reportId, input.lines) });
    return tx.jobDimensionReport.findUniqueOrThrow({ where: { id: reportId }, include: reportInclude });
  });
  await recordAudit(ctx, { source: "UI", module: "SPECIFICATIONS", entityType: "JobDimensionReport", entityId: reportId, action: "UPDATE", afterData: { lineCount: report.lines.length } });
  return serialize(report);
}

export async function deleteJobDimensionReport(ctx: RequestContext, reportId: string) {
  const companyId = requireWrite(ctx);
  const existing = await prisma.jobDimensionReport.findFirst({ where: { id: reportId, companyId }, select: { id: true, jobId: true } });
  if (!existing) notFound();
  await prisma.jobDimensionReport.delete({ where: { id: reportId } });
  await recordAudit(ctx, { source: "UI", module: "SPECIFICATIONS", entityType: "JobDimensionReport", entityId: reportId, action: "DELETE", afterData: { jobId: existing.jobId } as Prisma.InputJsonValue });
  return { id: reportId };
}

export async function getSpecificationFormSettings(ctx: RequestContext) {
  const companyId = requireRead(ctx);
  const row = await prisma.specificationFormSettings.findUnique({ where: { companyId } });
  return {
    standardText: row?.standardText ?? null,
    documentNumber: row?.documentNumber ?? null,
    issueDate: row?.issueDate ?? null,
    revision: row?.revision ?? null,
    revisionDate: row?.revisionDate ?? null,
  };
}

export async function saveSpecificationFormSettings(ctx: RequestContext, raw: unknown) {
  const companyId = requireWrite(ctx);
  requireTenantPermission(ctx, "COMPANY_SETTINGS_EDIT");
  const input = specificationFormSettingsInput.parse(raw);
  await prisma.specificationFormSettings.upsert({
    where: { companyId },
    create: { companyId, ...input, updatedById: ctx.userId },
    update: { ...input, updatedById: ctx.userId },
  });
  await recordAudit(ctx, { source: "UI", module: "SPECIFICATIONS", entityType: "SpecificationFormSettings", entityId: companyId, action: "UPDATE", afterData: input as Prisma.InputJsonValue });
  return getSpecificationFormSettings(ctx);
}
