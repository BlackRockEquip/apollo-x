import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { RequestContext } from "@/lib/auth/context-types";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit/service";
import { prisma } from "@/lib/prisma";
import { deleteStoredBlob, readStoredBlob } from "@/lib/attachments/blob-store";
import { offloadJobAttachment, offloadQuietly } from "@/lib/attachments/offload";

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
  // 2026-10-29: the item of a multi-item job this report is for. Left out = unchanged (whole job on a new report), null = whole job.
  itemId: z.string().cuid().optional().nullable(),
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

type OriginalFile = { id: string; fileName: string; mimeType: string; sizeBytes: number };

function serialize<T extends { reportDate: Date | null }>(report: T, original: OriginalFile | null = null) {
  return { ...report, reportDate: report.reportDate ? report.reportDate.toISOString().slice(0, 10) : null, original };
}

async function originalsFor(companyId: string, reports: { originalAttachmentId: string | null }[]) {
  const ids = reports.map((report) => report.originalAttachmentId).filter((id): id is string => Boolean(id));
  const files = ids.length ? await prisma.jobAttachment.findMany({ where: { companyId, id: { in: ids } }, select: { id: true, fileName: true, mimeType: true, sizeBytes: true } }) : [];
  return new Map(files.map((file) => [file.id, file]));
}

// The item must be one of this job's own items (a job with no items cannot have any link).
async function requireItemOnJob(companyId: string, jobId: string, itemId: string | null | undefined) {
  if (!itemId) return null;
  const item = await prisma.jobItem.findFirst({ where: { id: itemId, jobId, companyId }, select: { id: true } });
  if (!item) throw new Error("That item is not on this job.");
  return item.id;
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
  const originals = await originalsFor(companyId, reports);
  return { items: reports.map((report) => serialize(report, report.originalAttachmentId ? originals.get(report.originalAttachmentId) ?? null : null)) };
}

export async function createJobDimensionReport(ctx: RequestContext, jobId: string, raw: unknown) {
  const companyId = requireWrite(ctx);
  const input = dimensionReportInput.parse(raw);
  await requireJob(companyId, jobId);
  const itemId = await requireItemOnJob(companyId, jobId, input.itemId);
  const report = await prisma.$transaction(async (tx) => {
    const created = await tx.jobDimensionReport.create({
      data: {
        companyId, jobId, itemId,
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
  const existing = await prisma.jobDimensionReport.findFirst({ where: { id: reportId, companyId }, select: { id: true, jobId: true } });
  if (!existing) notFound();
  const itemId = input.itemId === undefined ? undefined : await requireItemOnJob(companyId, existing.jobId, input.itemId);
  const report = await prisma.$transaction(async (tx) => {
    await tx.jobDimensionReport.update({
      where: { id: reportId },
      data: {
        ...(itemId !== undefined ? { itemId } : {}),
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
  return serialize(report, (await originalsFor(companyId, [report])).get(report.originalAttachmentId ?? "") ?? null);
}

export async function deleteJobDimensionReport(ctx: RequestContext, reportId: string) {
  const companyId = requireWrite(ctx);
  const existing = await prisma.jobDimensionReport.findFirst({ where: { id: reportId, companyId }, select: { id: true, jobId: true, originalAttachmentId: true } });
  if (!existing) notFound();
  await prisma.jobDimensionReport.delete({ where: { id: reportId } });
  await dropOriginalFile(companyId, existing.originalAttachmentId);
  await recordAudit(ctx, { source: "UI", module: "SPECIFICATIONS", entityType: "JobDimensionReport", entityId: reportId, action: "DELETE", afterData: { jobId: existing.jobId } as Prisma.InputJsonValue });
  return { id: reportId };
}

// ---- The original handwritten sheet --------------------------------------------------------------------------
// Kept as an ordinary job attachment (so it also shows in the job's Attachments and goes to the company's
// storage location); the report only remembers which attachment it is. Photos and PDFs only, 8 MB.
const ORIGINAL_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const MAX_ORIGINAL_BYTES = 8_000_000;

export const dimensionOriginalInput = z.object({
  fileName: z.string().trim().min(1).max(160),
  mimeType: z.string().trim().min(3).max(120),
  contentBase64: z.string().min(4),
});

async function dropOriginalFile(companyId: string, attachmentId: string | null | undefined) {
  if (!attachmentId) return;
  const file = await prisma.jobAttachment.findFirst({ where: { id: attachmentId, companyId }, select: { id: true, storedAttachmentId: true } });
  if (!file) return;
  await prisma.jobAttachment.delete({ where: { id: file.id } });
  await deleteStoredBlob(companyId, file.storedAttachmentId);
}

export async function setDimensionReportOriginal(ctx: RequestContext, reportId: string, raw: unknown) {
  const companyId = requireWrite(ctx);
  const input = dimensionOriginalInput.parse(raw);
  const report = await prisma.jobDimensionReport.findFirst({ where: { id: reportId, companyId }, select: { id: true, jobId: true, originalAttachmentId: true } });
  if (!report) notFound();
  if (!ORIGINAL_MIME_TYPES.includes(input.mimeType)) throw new Error("INVALID_ATTACHMENT_TYPE");
  const data = Buffer.from(input.contentBase64, "base64");
  if (data.length === 0 || data.length > MAX_ORIGINAL_BYTES) throw new Error("ATTACHMENT_TOO_LARGE");
  const fileName = input.fileName.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 160);
  const file = await prisma.$transaction(async (tx) => {
    const created = await tx.jobAttachment.create({
      data: { companyId, jobId: report.jobId, fileName, mimeType: input.mimeType, sizeBytes: data.length, data, notes: "Original handwritten dimensional size report", createdById: ctx.userId },
      select: { id: true, fileName: true, mimeType: true, sizeBytes: true },
    });
    await tx.jobDimensionReport.update({ where: { id: reportId }, data: { originalAttachmentId: created.id, updatedById: ctx.userId } });
    return created;
  });
  await dropOriginalFile(companyId, report.originalAttachmentId);
  await recordAudit(ctx, { source: "UI", module: "SPECIFICATIONS", entityType: "JobDimensionReport", entityId: reportId, action: "UPDATE", afterData: { originalFile: fileName, sizeBytes: data.length } });
  await offloadQuietly(offloadJobAttachment(file.id));
  return file;
}

export async function getDimensionReportOriginal(ctx: RequestContext, reportId: string) {
  const companyId = requireRead(ctx);
  const report = await prisma.jobDimensionReport.findFirst({ where: { id: reportId, companyId }, select: { originalAttachmentId: true } });
  if (!report?.originalAttachmentId) notFound();
  const file = await prisma.jobAttachment.findFirst({ where: { id: report.originalAttachmentId, companyId } });
  if (!file) notFound();
  if (file.storedAttachmentId) {
    const stored = await readStoredBlob(companyId, file.storedAttachmentId);
    return { fileName: file.fileName, mimeType: file.mimeType, contentBase64: stored.data.toString("base64") };
  }
  if (!file.data) throw new Error("STORAGE_FILE_MISSING");
  return { fileName: file.fileName, mimeType: file.mimeType, contentBase64: Buffer.from(file.data).toString("base64") };
}

export async function removeDimensionReportOriginal(ctx: RequestContext, reportId: string) {
  const companyId = requireWrite(ctx);
  const report = await prisma.jobDimensionReport.findFirst({ where: { id: reportId, companyId }, select: { originalAttachmentId: true } });
  if (!report) notFound();
  await prisma.jobDimensionReport.update({ where: { id: reportId }, data: { originalAttachmentId: null, updatedById: ctx.userId } });
  await dropOriginalFile(companyId, report.originalAttachmentId);
  await recordAudit(ctx, { source: "UI", module: "SPECIFICATIONS", entityType: "JobDimensionReport", entityId: reportId, action: "UPDATE", afterData: { originalFile: null } });
  return { ok: true };
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
