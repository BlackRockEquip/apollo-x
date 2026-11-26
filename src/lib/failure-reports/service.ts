import { Prisma } from "@prisma/client";
import type { RequestContext } from "@/lib/auth/context-types";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit/service";
import { offloadJobAttachment, offloadQuietly } from "@/lib/attachments/offload";
import { readStoredBlob } from "@/lib/attachments/blob-store";
import { FailureReportError } from "@/lib/http/errors";
import { jobTypeLabelsFor } from "@/lib/jobs/ui";
import { prisma } from "@/lib/prisma";
import {
  JOB_FIELD_KEYS, SUGGEST_KEYS, blankFields, editedJobFields, jobToFields, normaliseFields, normaliseList, normaliseMarks, refreshFromJob,
  reportPageCount, todayIso, type JobFieldKey, type PhotoRoleKey, type ReportFields,
} from "@/lib/failure-reports/model";
import {
  createdInput, linkJobInput, photoAddInput, photoOrderInput, photoUpdateInput, profileInput, reportCreateInput, reportUpdateInput,
} from "@/lib/failure-reports/validation";

// ---------------------------------------------------------------------------
// Failure Reports (2026-11-25). The Failure Report Builder as an Apollo module.
// Access: the Failure Reports module switched on for the company (and the user), plus the job permissions -
//   JOBS_VIEW  see reports and company profiles, open a report, download it
//   JOBS_EDIT  make, change and delete reports; add photos; edit company profiles; save the made .pptx into the job's files
// The .pptx itself is built in the browser (components/failure-reports/buildPptx.ts) so it stays exactly as the builder made it.
// ---------------------------------------------------------------------------

const MODULE = "FAILURE_REPORTS" as const;
const idShape = /^[a-z0-9]{20,40}$/i;
const MAX_PHOTOS = 120;
const MAX_REPORT_FILE_BYTES = 20_000_000;

function notFound(): never { throw new Error("NOT_FOUND"); }

function requireRead(ctx: RequestContext) {
  requireModule(ctx, MODULE, "READ");
  requireTenantPermission(ctx, "JOBS_VIEW");
  return ctx.companyId!;
}

function requireWrite(ctx: RequestContext) {
  requireModule(ctx, MODULE, "WRITE");
  requireTenantPermission(ctx, "JOBS_EDIT");
  return ctx.companyId!;
}

const jobLabel = (job: { jobNumber: string | null; draftNumber?: string | null } | null | undefined) => (job ? job.jobNumber || job.draftNumber || "" : "");

// ---------------------------------------------------------------------------
// Job details -> report fields
// ---------------------------------------------------------------------------

const jobSelect = {
  id: true, jobNumber: true, draftNumber: true, type: true, component: true, componentSerial: true, machineSerial: true, machineMake: true, machineModel: true,
  plantNumber: true, dateReceived: true, customer: { select: { name: true, tradingName: true } }, stripMechanic: { select: { name: true } },
} satisfies Prisma.JobSelect;
type JobRow = Prisma.JobGetPayload<{ select: typeof jobSelect }>;

function fieldsOfJob(ctx: RequestContext, job: JobRow): Record<JobFieldKey, string> {
  const typeLabels = jobTypeLabelsFor(ctx.industryBuild === "ENGINEERING" ? "ENGINEERING" : undefined) as Record<string, string>;
  return jobToFields({
    jobNumber: job.jobNumber, draftNumber: job.draftNumber,
    // Everyone here holds JOBS_VIEW, and the job screen already shows them the customer.
    customerName: job.customer?.tradingName || job.customer?.name || null,
    component: job.component, componentSerial: job.componentSerial, machineSerial: job.machineSerial,
    machineMake: job.machineMake, machineModel: job.machineModel, plantNumber: job.plantNumber, dateReceived: job.dateReceived,
    jobTypeLabel: typeLabels[job.type] ?? null, stripMechanicName: job.stripMechanic?.name ?? null,
  });
}

async function loadJob(companyId: string, jobId: string) {
  if (!idShape.test(jobId)) notFound();
  const job = await prisma.job.findFirst({ where: { id: jobId, companyId }, select: jobSelect });
  if (!job) notFound();
  return job;
}

const jobValuesOf = (value: unknown): Partial<Record<JobFieldKey, string>> | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  return Object.fromEntries(JOB_FIELD_KEYS.filter((k) => typeof raw[k] === "string").map((k) => [k, raw[k] as string]));
};

export async function searchJobsForReports(ctx: RequestContext, query: string) {
  const companyId = requireRead(ctx);
  const q = query.trim().slice(0, 60);
  const jobs = await prisma.job.findMany({
    where: {
      companyId,
      ...(q ? { OR: [
        { jobNumber: { contains: q, mode: "insensitive" } },
        { component: { contains: q, mode: "insensitive" } },
        { machineModel: { contains: q, mode: "insensitive" } },
        { machineSerial: { contains: q, mode: "insensitive" } },
        { componentSerial: { contains: q, mode: "insensitive" } },
        { plantNumber: { contains: q, mode: "insensitive" } },
        { customer: { name: { contains: q, mode: "insensitive" } } },
      ] } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 15,
    select: jobSelect,
  });
  return {
    items: jobs.map((job) => {
      const f = fieldsOfJob(ctx, job);
      return { id: job.id, jobNumber: f.job, client: f.client, component: f.component, make: f.make, model: f.model, serial: f.serial };
    }),
  };
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

const reportInclude = {
  job: { select: { id: true, jobNumber: true, draftNumber: true } },
  photos: { orderBy: { sortOrder: "asc" }, select: { id: true, sortOrder: true, role: true, fileName: true, width: true, height: true, caption: true, marks: true, updatedAt: true } },
} satisfies Prisma.FailureReportInclude;
type ReportRow = Prisma.FailureReportGetPayload<{ include: typeof reportInclude }>;

function reportView(row: ReportRow) {
  const fields = normaliseFields(row.fields);
  return {
    id: row.id,
    jobId: row.jobId,
    jobLabel: jobLabel(row.job),
    profileId: row.profileId,
    fields,
    warranty: row.warranty as "na" | "granted" | "declined",
    perPage: row.perPage,
    descHeading: row.descHeading,
    replace: row.replaceItems,
    repair: row.repairItems,
    missing: row.missingItems,
    jobValues: jobValuesOf(row.jobValues),
    photos: row.photos.map((p) => ({
      id: p.id, role: (p.role === "cover" || p.role === "intro" ? p.role : "page") as PhotoRoleKey, fileName: p.fileName ?? "", width: p.width, height: p.height, caption: p.caption, marks: normaliseMarks(p.marks),
      // The image address carries the update time so a rotated photo is fetched again rather than taken from the browser cache.
      src: `/api/v1/failure-reports/${row.id}/photos/${p.id}?v=${p.updatedAt.getTime()}`,
    })),
    timesCreated: row.timesCreated,
    lastCreatedAt: row.lastCreatedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}
export type FailureReportView = ReturnType<typeof reportView>;

async function loadReport(companyId: string, id: string) {
  if (!idShape.test(id)) notFound();
  const row = await prisma.failureReport.findFirst({ where: { id, companyId }, include: reportInclude });
  if (!row) notFound();
  return row;
}

export async function listFailureReports(ctx: RequestContext, options: { jobId?: string; q?: string } = {}) {
  const companyId = requireRead(ctx);
  if (options.jobId && !idShape.test(options.jobId)) notFound();
  const q = (options.q ?? "").trim().slice(0, 60);
  const rows = await prisma.failureReport.findMany({
    where: { companyId, ...(options.jobId ? { jobId: options.jobId } : {}) },
    orderBy: { updatedAt: "desc" },
    take: options.jobId ? 50 : 300,
    select: {
      id: true, jobId: true, fields: true, timesCreated: true, lastCreatedAt: true, updatedAt: true, createdAt: true,
      job: { select: { jobNumber: true, draftNumber: true } }, profile: { select: { name: true } },
      // The cover photo for the thumbnail ("cover" sorts before "intro" and "page"), else the first photo.
      photos: { orderBy: [{ role: "asc" }, { sortOrder: "asc" }], take: 1, select: { id: true, updatedAt: true } },
      _count: { select: { photos: true } },
    },
  });
  const term = q.toLowerCase();
  const items = rows.map((row) => {
    const f = normaliseFields(row.fields);
    const cover = row.photos[0];
    return {
      id: row.id, jobId: row.jobId, jobLabel: jobLabel(row.job) || f.job, client: f.client, component: f.component, make: f.make, model: f.model,
      serial: f.serial, reportDate: f.date_report, companyName: row.profile?.name ?? "", photoCount: row._count.photos,
      status: row.timesCreated > 0 ? "CREATED" as const : "DRAFT" as const, timesCreated: row.timesCreated,
      lastCreatedAt: row.lastCreatedAt?.toISOString() ?? null, updatedAt: row.updatedAt.toISOString(),
      thumb: cover ? `/api/v1/failure-reports/${row.id}/photos/${cover.id}?v=${cover.updatedAt.getTime()}` : null,
    };
  }).filter((item) => !term || [item.jobLabel, item.client, item.component, item.make, item.model, item.serial, item.companyName, item.reportDate].some((v) => v.toLowerCase().includes(term)));
  return { items };
}

export async function getFailureReport(ctx: RequestContext, id: string) {
  const companyId = requireRead(ctx);
  return reportView(await loadReport(companyId, id));
}

async function defaultProfileId(companyId: string) {
  const row = await prisma.failureReportProfile.findFirst({ where: { companyId, active: true }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }], select: { id: true } });
  return row?.id ?? null;
}

/** New report: blank, or with the linked job's details pulled in. */
export async function createFailureReport(ctx: RequestContext, raw: unknown) {
  const companyId = requireWrite(ctx);
  const input = reportCreateInput.parse(raw ?? {});
  const fields: ReportFields = blankFields(todayIso());
  let jobValues: Record<JobFieldKey, string> | null = null;
  if (input.jobId) {
    const job = await loadJob(companyId, input.jobId);
    jobValues = fieldsOfJob(ctx, job);
    Object.assign(fields, jobValues);
  }
  await ensureCompanyProfile(ctx, companyId);
  let profileId = input.profileId ?? null;
  if (profileId && !await prisma.failureReportProfile.findFirst({ where: { id: profileId, companyId, active: true }, select: { id: true } })) profileId = null;
  profileId = profileId ?? await defaultProfileId(companyId);
  const row = await prisma.failureReport.create({
    data: {
      companyId, jobId: input.jobId ?? null, profileId, fields: fields as Prisma.InputJsonValue, jobValues: jobValues ? (jobValues as Prisma.InputJsonValue) : Prisma.JsonNull,
      replaceItems: [], repairItems: [], missingItems: [], createdById: ctx.userId, updatedById: ctx.userId,
    },
    include: reportInclude,
  });
  await recordAudit(ctx, { source: "UI", module: MODULE, entityType: "FailureReport", entityId: row.id, action: "CREATE", afterData: { jobId: input.jobId ?? null } as Prisma.InputJsonValue });
  return reportView(row);
}

/** Saves what the user typed (autosave). Only the parts sent are changed. */
export async function updateFailureReport(ctx: RequestContext, id: string, raw: unknown) {
  const companyId = requireWrite(ctx);
  const input = reportUpdateInput.parse(raw);
  const existing = await loadReport(companyId, id);
  const data: Prisma.FailureReportUpdateInput = { updatedById: ctx.userId };
  if (input.fields) data.fields = { ...normaliseFields(existing.fields), ...Object.fromEntries(Object.entries(input.fields).filter(([, v]) => typeof v === "string")) } as Prisma.InputJsonValue;
  if (input.warranty) data.warranty = input.warranty;
  if (input.perPage) data.perPage = input.perPage;
  if (input.descHeading !== undefined) data.descHeading = input.descHeading || "DESCRIPTION";
  if (input.replace) data.replaceItems = normaliseList(input.replace);
  if (input.repair) data.repairItems = normaliseList(input.repair);
  if (input.missing) data.missingItems = normaliseList(input.missing);
  if (input.profileId !== undefined) {
    if (input.profileId && !await prisma.failureReportProfile.findFirst({ where: { id: input.profileId, companyId }, select: { id: true } })) notFound();
    data.profile = input.profileId ? { connect: { id: input.profileId } } : { disconnect: true };
  }
  const row = await prisma.failureReport.update({ where: { id }, data, include: reportInclude });
  return reportView(row);
}

/**
 * Links the report to a job (or unlinks it), or refreshes it from its job. Untouched fields take the job's values; fields
 * the user changed are kept unless `overwriteEdited` is set. Answers which fields changed and which edited ones were kept.
 */
export async function linkFailureReportJob(ctx: RequestContext, id: string, raw: unknown) {
  const companyId = requireWrite(ctx);
  const input = linkJobInput.parse(raw);
  const existing = await loadReport(companyId, id);
  const current = normaliseFields(existing.fields);
  if (!input.jobId) {
    const row = await prisma.failureReport.update({ where: { id }, data: { job: { disconnect: true }, jobValues: Prisma.JsonNull, updatedById: ctx.userId }, include: reportInclude });
    await recordAudit(ctx, { source: "UI", module: MODULE, entityType: "FailureReport", entityId: id, action: "UPDATE", afterData: { jobId: null } as Prisma.InputJsonValue });
    return { report: reportView(row), updated: [] as JobFieldKey[], keptEdited: [] as JobFieldKey[] };
  }
  const job = await loadJob(companyId, input.jobId);
  const next = fieldsOfJob(ctx, job);
  // A different job than before: nothing the old job gave counts as "untouched" for the new one, so take the new job's values
  // over the old job's values but keep what the user typed themselves.
  const previous = jobValuesOf(existing.jobValues);
  const result = refreshFromJob(current, previous, next, !!input.overwriteEdited);
  const row = await prisma.failureReport.update({
    where: { id },
    data: { job: { connect: { id: job.id } }, fields: result.fields as Prisma.InputJsonValue, jobValues: next as Prisma.InputJsonValue, updatedById: ctx.userId },
    include: reportInclude,
  });
  await recordAudit(ctx, { source: "UI", module: MODULE, entityType: "FailureReport", entityId: id, action: "UPDATE", afterData: { jobId: job.id, updated: result.updated, keptEdited: result.keptEdited } as Prisma.InputJsonValue });
  return { report: reportView(row), updated: result.updated, keptEdited: result.keptEdited };
}

/** What the linked job says now, and which report fields differ from it (for the "Refresh from job" check). */
export async function jobDetailsForReport(ctx: RequestContext, id: string) {
  const companyId = requireRead(ctx);
  const report = await loadReport(companyId, id);
  if (!report.jobId) return { linked: false as const };
  const job = await loadJob(companyId, report.jobId);
  const fromJob = fieldsOfJob(ctx, job);
  const current = normaliseFields(report.fields);
  return { linked: true as const, fromJob, differs: JOB_FIELD_KEYS.filter((k) => current[k].trim() !== fromJob[k]), edited: editedJobFields(current, fromJob) };
}

export async function deleteFailureReport(ctx: RequestContext, id: string) {
  const companyId = requireWrite(ctx);
  const existing = await loadReport(companyId, id);
  await prisma.failureReport.delete({ where: { id } });
  const f = normaliseFields(existing.fields);
  await recordAudit(ctx, { source: "UI", module: MODULE, entityType: "FailureReport", entityId: id, action: "DELETE", beforeData: { job: f.job, client: f.client, photos: existing.photos.length } as Prisma.InputJsonValue });
  return { deleted: true };
}

/** Starts a new report as a copy of this one (photos, marks and text included). */
export async function duplicateFailureReport(ctx: RequestContext, id: string) {
  const companyId = requireWrite(ctx);
  const src = await loadReport(companyId, id);
  const photos = await prisma.failureReportPhoto.findMany({ where: { reportId: id, companyId }, orderBy: { sortOrder: "asc" } });
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.failureReport.create({
      data: {
        companyId, jobId: src.jobId, profileId: src.profileId, fields: { ...normaliseFields(src.fields), date_report: todayIso() } as Prisma.InputJsonValue,
        jobValues: src.jobValues ?? Prisma.JsonNull, warranty: src.warranty, perPage: src.perPage, descHeading: src.descHeading,
        replaceItems: src.replaceItems, repairItems: src.repairItems, missingItems: src.missingItems, createdById: ctx.userId, updatedById: ctx.userId,
      },
    });
    for (const p of photos) {
      await tx.failureReportPhoto.create({ data: { companyId, reportId: created.id, sortOrder: p.sortOrder, role: p.role, fileName: p.fileName, mimeType: p.mimeType, width: p.width, height: p.height, data: p.data, caption: p.caption, marks: p.marks ?? [] } });
    }
    return created;
  });
  await recordAudit(ctx, { source: "UI", module: MODULE, entityType: "FailureReport", entityId: row.id, action: "CREATE", afterData: { copyOf: id } as Prisma.InputJsonValue });
  return reportView(await loadReport(companyId, row.id));
}

/**
 * Create Report was used: counts it, and for a report linked to a job keeps a copy of the .pptx in the job's files
 * (tagged Report, into the company's storage location like any job file). Making it again adds "(2)", "(3)".
 */
export async function recordFailureReportCreated(ctx: RequestContext, id: string, raw: unknown) {
  const companyId = requireWrite(ctx);
  const input = createdInput.parse(raw);
  const report = await loadReport(companyId, id);
  let savedToJob: { attachmentId: string; fileName: string } | null = null;
  if (report.jobId && input.contentBase64) {
    const data = Buffer.from(input.contentBase64, "base64");
    if (data.length === 0) throw new FailureReportError("EMPTY_FILE", "The report file was empty.");
    if (data.length > MAX_REPORT_FILE_BYTES) throw new FailureReportError("FILE_TOO_LARGE", "The report is too large to keep in the job's files (over 20 MB). It was still downloaded.");
    const fileName = input.fileName.replace(/[^A-Za-z0-9._ ()-]/g, "_").slice(0, 160);
    const jobId = report.jobId;
    const attachment = await prisma.$transaction(async (tx) => {
      const record = await tx.jobAttachment.create({
        data: { companyId, jobId, fileName, mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", sizeBytes: data.length, data, notes: "Failure report", tag: "REPORT", isPhoto: false, createdById: ctx.userId },
        select: { id: true, fileName: true },
      });
      await tx.jobActivity.create({ data: { companyId, jobId, type: "ATTACHMENT_UPLOADED", description: `Failure report saved: ${fileName}.`, metadata: { attachmentId: record.id, fileName, failureReportId: id } as Prisma.InputJsonValue, actorId: ctx.userId } });
      return record;
    });
    await offloadQuietly(offloadJobAttachment(attachment.id));
    savedToJob = { attachmentId: attachment.id, fileName: attachment.fileName };
  }
  const row = await prisma.failureReport.update({ where: { id }, data: { timesCreated: { increment: 1 }, lastCreatedAt: new Date(), updatedById: ctx.userId }, include: reportInclude });
  await recordAudit(ctx, { source: "UI", module: MODULE, entityType: "FailureReport", entityId: id, action: "UPDATE", afterData: { created: input.fileName, savedToJob: !!savedToJob, pages: reportPageCount(row.photos.filter((p) => p.role !== "cover" && p.role !== "intro").length, row.perPage) } as Prisma.InputJsonValue });
  return { report: reportView(row), savedToJob };
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

/** Frees the page 1 / page 2 slot: a photo already there moves to the end of the photo pages (nothing is deleted). */
async function freeSlot(tx: Prisma.TransactionClient, companyId: string, reportId: string, role: PhotoRoleKey, keepId?: string) {
  if (role === "page") return;
  const current = await tx.failureReportPhoto.findMany({ where: { reportId, companyId, role, ...(keepId ? { id: { not: keepId } } : {}) }, select: { id: true } });
  if (!current.length) return;
  const last = await tx.failureReportPhoto.findFirst({ where: { reportId, companyId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  let next = (last?.sortOrder ?? 0) + 1;
  for (const c of current) await tx.failureReportPhoto.update({ where: { id: c.id }, data: { role: "page", sortOrder: next++ } });
}

function decodeImage(contentBase64: string) {
  const data = Buffer.from(contentBase64.replace(/^data:image\/[a-z]+;base64,/, ""), "base64");
  if (data.length < 100) throw new FailureReportError("BAD_IMAGE", "That photo could not be read.");
  const jpeg = data[0] === 0xff && data[1] === 0xd8;
  const png = data[0] === 0x89 && data[1] === 0x50;
  if (!jpeg && !png) throw new FailureReportError("BAD_IMAGE", "Photos must be JPEG or PNG.");
  return { data, mimeType: jpeg ? "image/jpeg" : "image/png" };
}

export async function addFailureReportPhoto(ctx: RequestContext, reportId: string, raw: unknown) {
  const companyId = requireWrite(ctx);
  const input = photoAddInput.parse(raw);
  await loadReport(companyId, reportId);
  const count = await prisma.failureReportPhoto.count({ where: { reportId, companyId } });
  if (count >= MAX_PHOTOS) throw new FailureReportError("TOO_MANY_PHOTOS", `A report can hold up to ${MAX_PHOTOS} photos.`);
  const image = decodeImage(input.contentBase64);
  await prisma.$transaction(async (tx) => {
    await freeSlot(tx, companyId, reportId, input.role);
    const last = await tx.failureReportPhoto.findFirst({ where: { reportId, companyId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
    await tx.failureReportPhoto.create({
      data: { companyId, reportId, sortOrder: (last?.sortOrder ?? -1) + 1, role: input.role, fileName: input.fileName ?? null, mimeType: image.mimeType, width: input.width, height: input.height, data: image.data, caption: input.caption ?? "", marks: [] },
    });
  });
  await prisma.failureReport.update({ where: { id: reportId }, data: { updatedById: ctx.userId } });
  return reportView(await loadReport(companyId, reportId));
}

export async function updateFailureReportPhoto(ctx: RequestContext, reportId: string, photoId: string, raw: unknown) {
  const companyId = requireWrite(ctx);
  const input = photoUpdateInput.parse(raw);
  if (!idShape.test(photoId)) notFound();
  await loadReport(companyId, reportId);
  const photo = await prisma.failureReportPhoto.findFirst({ where: { id: photoId, reportId, companyId }, select: { id: true } });
  if (!photo) notFound();
  const data: Prisma.FailureReportPhotoUpdateInput = {};
  if (input.caption !== undefined) data.caption = input.caption;
  if (input.marks !== undefined) data.marks = normaliseMarks(input.marks) as unknown as Prisma.InputJsonValue;
  if (input.image) {
    const image = decodeImage(input.image.contentBase64);
    Object.assign(data, { data: image.data, mimeType: image.mimeType, width: input.image.width, height: input.image.height });
  }
  await prisma.$transaction(async (tx) => {
    if (input.role) {
      await freeSlot(tx, companyId, reportId, input.role, photoId);
      data.role = input.role;
      // Back to the photo pages: goes to the end of them.
      if (input.role === "page") {
        const last = await tx.failureReportPhoto.findFirst({ where: { reportId, companyId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
        data.sortOrder = (last?.sortOrder ?? 0) + 1;
      }
    }
    await tx.failureReportPhoto.update({ where: { id: photoId }, data });
  });
  await prisma.failureReport.update({ where: { id: reportId }, data: { updatedById: ctx.userId } });
  return reportView(await loadReport(companyId, reportId));
}

export async function deleteFailureReportPhoto(ctx: RequestContext, reportId: string, photoId: string) {
  const companyId = requireWrite(ctx);
  if (!idShape.test(photoId)) notFound();
  await loadReport(companyId, reportId);
  const deleted = await prisma.failureReportPhoto.deleteMany({ where: { id: photoId, reportId, companyId } });
  if (deleted.count === 0) notFound();
  await prisma.failureReport.update({ where: { id: reportId }, data: { updatedById: ctx.userId } });
  return reportView(await loadReport(companyId, reportId));
}

/** Puts the photos in the order given (ids not sent keep their place after the ones sent). */
export async function reorderFailureReportPhotos(ctx: RequestContext, reportId: string, raw: unknown) {
  const companyId = requireWrite(ctx);
  const input = photoOrderInput.parse(raw);
  const report = await loadReport(companyId, reportId);
  const known = new Set(report.photos.map((p) => p.id));
  const order = [...input.order.filter((id) => known.has(id)), ...report.photos.map((p) => p.id).filter((id) => !input.order.includes(id))];
  await prisma.$transaction(order.map((id, index) => prisma.failureReportPhoto.update({ where: { id }, data: { sortOrder: index } })));
  return reportView(await loadReport(companyId, reportId));
}

/** The photo's bytes, for the browser (thumbnails, the mark editor and building the report). */
export async function getFailureReportPhotoImage(ctx: RequestContext, reportId: string, photoId: string) {
  const companyId = requireRead(ctx);
  if (!idShape.test(reportId) || !idShape.test(photoId)) notFound();
  const photo = await prisma.failureReportPhoto.findFirst({ where: { id: photoId, reportId, companyId }, select: { data: true, mimeType: true } });
  if (!photo) notFound();
  return { data: Buffer.from(photo.data), mimeType: photo.mimeType };
}

// ---------------------------------------------------------------------------
// Suggestions (the builder's remembered drop-downs), from the company's own earlier reports
// ---------------------------------------------------------------------------

export async function failureReportSuggestions(ctx: RequestContext) {
  const companyId = requireRead(ctx);
  const rows = await prisma.failureReport.findMany({ where: { companyId }, orderBy: { updatedAt: "desc" }, take: 400, select: { fields: true, replaceItems: true, repairItems: true, missingItems: true } });
  const out: Record<string, string[]> = {};
  const add = (key: string, value: string) => {
    const v = value.trim();
    if (!v || v.length > 200) return;
    const list = (out[key] ??= []);
    if (list.length < 60 && !list.some((x) => x.toLowerCase() === v.toLowerCase())) list.push(v);
  };
  for (const row of rows) {
    const f = normaliseFields(row.fields);
    for (const key of SUGGEST_KEYS) add(key, f[key]);
    for (const v of row.replaceItems) add("replace", v);
    for (const v of row.repairItems) add("repair", v);
    for (const v of row.missingItems) add("missing", v);
  }
  return { suggestions: out };
}

// ---------------------------------------------------------------------------
// Company profiles (logo, colours, details a report is printed with)
// ---------------------------------------------------------------------------

type ProfileRow = Prisma.FailureReportProfileGetPayload<object>;

function profileView(row: ProfileRow) {
  const d = row.details && typeof row.details === "object" ? (row.details as Record<string, unknown>) : {};
  const str = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : "");
  return {
    id: row.id, name: row.name, legalName: row.legalName ?? "", logoData: row.logoData ?? null, logoAspect: row.logoAspect, logoDark: row.logoDark,
    accent: row.accent, dark: row.dark, accentText: row.accentText ?? null, headerStyle: row.headerStyle as "auto" | "light" | "band",
    details: { address: str("address"), phone: str("phone"), email: str("email"), website: str("website"), coreg: str("coreg"), vat: str("vat"), extra: str("extra") },
    footer: row.footer ?? "", showDetails: row.showDetails, isDefault: row.isDefault, active: row.active, updatedAt: row.updatedAt.toISOString(),
  };
}
export type FailureReportProfileView = ReturnType<typeof profileView>;

/** The company's own logo as a data URL (storage location first, then the copy kept in the settings). */
async function companyLogoDataUrl(companyId: string): Promise<string | null> {
  try {
    const settings = await prisma.companySettings.findUnique({ where: { companyId }, select: { logoMimeType: true, logoData: true } });
    if (!settings?.logoMimeType) return null;
    const attachment = await prisma.attachment.findFirst({ where: { companyId, ownerType: "COMPANY_LOGO", ownerId: companyId }, select: { id: true } });
    if (attachment) {
      try {
        const stored = await readStoredBlob(companyId, attachment.id);
        return `data:${settings.logoMimeType};base64,${stored.data.toString("base64")}`;
      } catch { /* fall back to the inline copy */ }
    }
    return settings.logoData ? `data:${settings.logoMimeType};base64,${Buffer.from(settings.logoData).toString("base64")}` : null;
  } catch {
    return null;
  }
}

/**
 * The first time the module is used, the company gets one profile made from its own Apollo details (name, address, phone,
 * logo ...) and marked as the default. Clients that want their own branding are added under Company profiles.
 */
async function ensureCompanyProfile(ctx: RequestContext, companyId: string) {
  const existing = await prisma.failureReportProfile.count({ where: { companyId } });
  if (existing > 0) return;
  const company = await prisma.company.findFirst({
    where: { id: companyId },
    select: {
      legalName: true, tradingName: true,
      settings: { select: { registrationNumber: true, vatNumber: true, mainTelephone: true, mainEmail: true, website: true } },
      addresses: { orderBy: [{ isPrimary: "desc" }, { type: "asc" }], take: 1 },
    },
  });
  if (!company) return;
  const a = company.addresses[0];
  const address = a ? [a.line1, a.line2, a.city, a.province, a.postalCode].filter((v): v is string => Boolean(v && v.trim())).join(", ") : "";
  const name = company.tradingName?.trim() || company.legalName;
  const logoData = await companyLogoDataUrl(companyId);
  await prisma.failureReportProfile.create({
    data: {
      companyId, name, legalName: company.tradingName && company.legalName !== company.tradingName ? company.legalName : null,
      logoData: logoData && logoData.length < 3_000_000 ? logoData : null,
      details: { address, phone: company.settings?.mainTelephone ?? "", email: company.settings?.mainEmail ?? "", website: company.settings?.website ?? "", coreg: company.settings?.registrationNumber ?? "", vat: company.settings?.vatNumber ?? "", extra: "" },
      footer: `${name} | Failure Report`, isDefault: true, createdById: ctx.userId, updatedById: ctx.userId,
    },
  });
}

export async function listFailureReportProfiles(ctx: RequestContext, options: { includeInactive?: boolean } = {}) {
  const companyId = requireRead(ctx);
  if (ctx.tenantPermissions.has("JOBS_EDIT") && (ctx.moduleAccess.get(MODULE) ?? "DENIED") === "FULL") await ensureCompanyProfile(ctx, companyId);
  const rows = await prisma.failureReportProfile.findMany({ where: { companyId, ...(options.includeInactive ? {} : { active: true }) }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] });
  const counts = await prisma.failureReport.groupBy({ by: ["profileId"], where: { companyId, profileId: { not: null } }, _count: { _all: true } });
  const used = new Map(counts.map((c) => [c.profileId, c._count._all]));
  return { items: rows.map((row) => ({ ...profileView(row), reportCount: used.get(row.id) ?? 0 })) };
}

async function clearOtherDefaults(tx: Prisma.TransactionClient, companyId: string, keepId: string) {
  await tx.failureReportProfile.updateMany({ where: { companyId, id: { not: keepId }, isDefault: true }, data: { isDefault: false } });
}

function profileData(input: ReturnType<typeof profileInput.parse>) {
  return {
    name: input.name, legalName: input.legalName || null, logoData: input.logoData ?? null, logoAspect: input.logoAspect ?? 1.4, logoDark: !!input.logoDark,
    accent: input.accent, dark: input.dark, accentText: input.accentText ?? null, headerStyle: input.headerStyle,
    details: input.details as Prisma.InputJsonValue, footer: input.footer || null, showDetails: input.showDetails,
  };
}

export async function createFailureReportProfile(ctx: RequestContext, raw: unknown) {
  const companyId = requireWrite(ctx);
  const input = profileInput.parse(raw);
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.failureReportProfile.create({ data: { companyId, ...profileData(input), isDefault: !!input.isDefault, createdById: ctx.userId, updatedById: ctx.userId } });
    if (input.isDefault) await clearOtherDefaults(tx, companyId, created.id);
    return created;
  });
  await recordAudit(ctx, { source: "UI", module: MODULE, entityType: "FailureReportProfile", entityId: row.id, action: "CREATE", afterData: { name: input.name } as Prisma.InputJsonValue });
  return profileView(row);
}

export async function updateFailureReportProfile(ctx: RequestContext, id: string, raw: unknown) {
  const companyId = requireWrite(ctx);
  if (!idShape.test(id)) notFound();
  const input = profileInput.parse(raw);
  const existing = await prisma.failureReportProfile.findFirst({ where: { id, companyId }, select: { id: true, isDefault: true } });
  if (!existing) notFound();
  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.failureReportProfile.update({ where: { id }, data: { ...profileData(input), ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}), updatedById: ctx.userId } });
    if (input.isDefault) await clearOtherDefaults(tx, companyId, id);
    return updated;
  });
  await recordAudit(ctx, { source: "UI", module: MODULE, entityType: "FailureReportProfile", entityId: id, action: "UPDATE", afterData: { name: input.name, isDefault: row.isDefault } as Prisma.InputJsonValue });
  return profileView(row);
}

/** A profile used by a report is switched off (reports keep printing with it); an unused one is removed. */
export async function deleteFailureReportProfile(ctx: RequestContext, id: string) {
  const companyId = requireWrite(ctx);
  if (!idShape.test(id)) notFound();
  const existing = await prisma.failureReportProfile.findFirst({ where: { id, companyId }, select: { id: true, name: true, isDefault: true } });
  if (!existing) notFound();
  const active = await prisma.failureReportProfile.count({ where: { companyId, active: true } });
  if (active <= 1) throw new FailureReportError("LAST_PROFILE", "Keep at least one company profile - reports need one to print with.");
  const used = await prisma.failureReport.count({ where: { companyId, profileId: id } });
  if (used > 0) await prisma.failureReportProfile.update({ where: { id }, data: { active: false, isDefault: false, updatedById: ctx.userId } });
  else await prisma.failureReportProfile.delete({ where: { id } });
  if (existing.isDefault) {
    const next = await prisma.failureReportProfile.findFirst({ where: { companyId, active: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
    if (next) await prisma.failureReportProfile.update({ where: { id: next.id }, data: { isDefault: true } });
  }
  await recordAudit(ctx, { source: "UI", module: MODULE, entityType: "FailureReportProfile", entityId: id, action: used > 0 ? "UPDATE" : "DELETE", afterData: { name: existing.name, switchedOff: used > 0 } as Prisma.InputJsonValue });
  return { deleted: used === 0, switchedOff: used > 0 };
}
