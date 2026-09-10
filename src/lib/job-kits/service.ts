import { Prisma } from "@prisma/client";
import type { RequestContext } from "@/lib/auth/context-types";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit/service";
import { prisma } from "@/lib/prisma";
import { jobKitActiveInput, jobKitCreateInput, jobKitLineInput, jobKitListQuery, jobKitUpdateInput } from "./validation";

function notFound(): never { throw new Error("NOT_FOUND"); }
function normalized(value: string) { return value.trim().replace(/\s+/g, " ").toUpperCase(); }
function requireJobKitsRead(ctx: RequestContext) { requireModule(ctx, "JOB_KITS", "READ"); requireTenantPermission(ctx, "JOB_KITS_VIEW"); return ctx.companyId!; }
function requireJobKitsWrite(ctx: RequestContext, permission: "JOB_KITS_CREATE" | "JOB_KITS_EDIT" | "JOB_KITS_DEACTIVATE") { requireModule(ctx, "JOB_KITS", "WRITE"); requireTenantPermission(ctx, permission); return ctx.companyId!; }

async function getPartOrThrow(companyId: string, partId: string) {
  const part = await prisma.part.findFirst({ where: { id: partId, companyId, active: true }, select: { id: true, partNumber: true, description: true } });
  if (!part) notFound();
  return part;
}

export async function listJobKits(ctx: RequestContext, raw: unknown) {
  const companyId = requireJobKitsRead(ctx);
  const query = jobKitListQuery.parse(raw);
  const skip = (query.page - 1) * query.pageSize;
  const contains = { contains: query.q, mode: "insensitive" as const };
  const where: Prisma.JobKitWhereInput = {
    companyId,
    ...(query.status === "all" ? {} : { active: query.status === "active" }),
    ...(query.q ? { OR: [{ name: contains }, { description: contains }, { machineMake: contains }, { machineModel: contains }, { componentType: contains }] } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.jobKit.count({ where }),
    prisma.jobKit.findMany({
      where,
      orderBy: [{ active: "desc" }, { name: "asc" }],
      skip,
      take: query.pageSize,
      include: { _count: { select: { lines: true } }, lines: { select: { quantityDefault: true } } },
    }),
  ]);
  return {
    items: items.map((kit) => ({
      ...kit,
      lineCount: kit._count.lines,
      totalQuantity: kit.lines.reduce((sum, line) => sum.plus(line.quantityDefault), new Prisma.Decimal(0)),
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function getJobKitById(ctx: RequestContext, id: string) {
  const companyId = requireJobKitsRead(ctx);
  const kit = await prisma.jobKit.findFirst({
    where: { id, companyId },
    include: {
      createdBy: { select: { id: true, displayName: true, email: true } },
      lines: { include: { part: { select: { id: true, partNumber: true, description: true, unitOfMeasure: true, active: true } } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!kit) notFound();
  return kit;
}

export async function createJobKit(ctx: RequestContext, raw: unknown) {
  const companyId = requireJobKitsWrite(ctx, "JOB_KITS_CREATE");
  const input = jobKitCreateInput.parse(raw);
  for (const line of input.lines) await getPartOrThrow(companyId, line.partId);
  const created = await prisma.$transaction(async (tx) => {
    const kit = await tx.jobKit.create({
      data: {
        companyId,
        name: input.name,
        nameNormalized: normalized(input.name),
        description: input.description,
        machineMake: input.machineMake,
        machineModel: input.machineModel,
        componentType: input.componentType,
        active: input.active,
        createdById: ctx.userId,
        lines: input.lines.length ? {
          create: input.lines.map((line, index) => ({
            companyId,
            partId: line.partId,
            quantityDefault: new Prisma.Decimal(line.quantityDefault),
            notes: line.notes,
            sortOrder: line.sortOrder ?? index,
          })),
        } : undefined,
      },
      include: { lines: { include: { part: { select: { id: true, partNumber: true, description: true, unitOfMeasure: true, active: true } } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
    });
    return kit;
  });
  await recordAudit(ctx, { source: "UI", module: "JOB_KITS", entityType: "JobKit", entityId: created.id, action: "CREATE", afterData: { id: created.id, lineCount: created.lines.length } });
  return created;
}

export async function updateJobKit(ctx: RequestContext, id: string, raw: unknown) {
  const companyId = requireJobKitsWrite(ctx, "JOB_KITS_EDIT");
  const input = jobKitUpdateInput.parse(raw);
  const existing = await prisma.jobKit.findFirst({ where: { id, companyId } });
  if (!existing) notFound();
  const updated = await prisma.jobKit.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name, nameNormalized: normalized(input.name) } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.machineMake !== undefined ? { machineMake: input.machineMake } : {}),
      ...(input.machineModel !== undefined ? { machineModel: input.machineModel } : {}),
      ...(input.componentType !== undefined ? { componentType: input.componentType } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
    include: { lines: { include: { part: { select: { id: true, partNumber: true, description: true, unitOfMeasure: true, active: true } } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
  });
  await recordAudit(ctx, { source: "UI", module: "JOB_KITS", entityType: "JobKit", entityId: updated.id, action: "UPDATE", afterData: { id: updated.id } });
  return updated;
}

export async function setJobKitActive(ctx: RequestContext, id: string, raw: unknown) {
  const companyId = requireJobKitsWrite(ctx, "JOB_KITS_DEACTIVATE");
  const input = jobKitActiveInput.parse(raw);
  const existing = await prisma.jobKit.findFirst({ where: { id, companyId } });
  if (!existing) notFound();
  const updated = await prisma.jobKit.update({
    where: { id },
    data: { active: input.active },
    include: { lines: { include: { part: { select: { id: true, partNumber: true, description: true, unitOfMeasure: true, active: true } } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
  });
  await recordAudit(ctx, { source: "UI", module: "JOB_KITS", entityType: "JobKit", entityId: updated.id, action: input.active ? "REACTIVATE" : "DEACTIVATE", afterData: { id: updated.id, active: updated.active } });
  return updated;
}

export async function addJobKitLine(ctx: RequestContext, id: string, raw: unknown) {
  const companyId = requireJobKitsWrite(ctx, "JOB_KITS_EDIT");
  const input = jobKitLineInput.parse(raw);
  await getPartOrThrow(companyId, input.partId);
  const existing = await prisma.jobKit.findFirst({ where: { id, companyId } });
  if (!existing) notFound();
  const line = await prisma.jobKitLine.create({
    data: {
      companyId,
      jobKitId: id,
      partId: input.partId,
      quantityDefault: new Prisma.Decimal(input.quantityDefault),
      notes: input.notes,
      sortOrder: input.sortOrder ?? 0,
    },
    include: { part: { select: { id: true, partNumber: true, description: true, unitOfMeasure: true, active: true } } },
  });
  await recordAudit(ctx, { source: "UI", module: "JOB_KITS", entityType: "JobKitLine", entityId: line.id, action: "CREATE", afterData: { jobKitId: id, partId: input.partId } });
  return getJobKitById(ctx, id);
}

export async function updateJobKitLine(ctx: RequestContext, id: string, lineId: string, raw: unknown) {
  const companyId = requireJobKitsWrite(ctx, "JOB_KITS_EDIT");
  const input = jobKitLineInput.partial({ partId: true }).parse(raw);
  const existing = await prisma.jobKitLine.findFirst({ where: { id: lineId, companyId, jobKitId: id } });
  if (!existing) notFound();
  if (input.partId) await getPartOrThrow(companyId, input.partId);
  await prisma.jobKitLine.update({
    where: { id: lineId },
    data: {
      ...(input.partId !== undefined ? { partId: input.partId } : {}),
      ...(input.quantityDefault !== undefined ? { quantityDefault: new Prisma.Decimal(input.quantityDefault) } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
  });
  await recordAudit(ctx, { source: "UI", module: "JOB_KITS", entityType: "JobKitLine", entityId: lineId, action: "UPDATE", afterData: { jobKitId: id, lineId } });
  return getJobKitById(ctx, id);
}

export async function removeJobKitLine(ctx: RequestContext, id: string, lineId: string) {
  const companyId = requireJobKitsWrite(ctx, "JOB_KITS_EDIT");
  const existing = await prisma.jobKitLine.findFirst({ where: { id: lineId, companyId, jobKitId: id } });
  if (!existing) notFound();
  await prisma.jobKitLine.delete({ where: { id: lineId } });
  await recordAudit(ctx, { source: "UI", module: "JOB_KITS", entityType: "JobKitLine", entityId: lineId, action: "DELETE", afterData: { jobKitId: id, lineId } });
  return getJobKitById(ctx, id);
}

export async function applyJobKitToJob(ctx: RequestContext, jobId: string, kitId: string) {
  requireModule(ctx, "JOBS_WIP", "WRITE");
  requireTenantPermission(ctx, "JOBS_EDIT");
  requireModule(ctx, "JOB_KITS", "READ");
  requireTenantPermission(ctx, "JOB_KITS_VIEW");
  const companyId = ctx.companyId!;

  const result = await prisma.$transaction(async (tx) => {
    const job = await tx.job.findFirst({ where: { id: jobId, companyId }, select: { id: true, jobNumber: true, draftNumber: true, status: true } });
    if (!job) notFound();

    const kit = await tx.jobKit.findFirst({
      where: { id: kitId, companyId, active: true },
      include: { lines: { include: { part: { select: { id: true, partNumber: true, description: true, active: true } } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
    });
    if (!kit) notFound();
    if (kit.lines.length === 0) throw new Error("This job kit has no parts.");
    if (kit.lines.some((line) => !line.part.active)) notFound();

    // Targets JobPartLine (the Parts list) rather than the old
    // JobPartRequirement — updated 2026-09-09 alongside the Parts
    // required → Parts list swap (see schema.prisma's JobPartLine comment)
    // so "Apply job kit" stays useful under the new, simpler model. A kit
    // line for a part already on the job's parts list (and not yet
    // received) tops up that line's quantity instead of creating a
    // duplicate row; JobPartLine has no separate notes field, so the kit
    // line's own notes aren't merged in here — the applied-kit detail is
    // still captured below in the job activity's metadata.
    const appliedLines: Array<{ partId: string; partNumber: string; quantityAdded: string; lineId: string; mode: "CREATED" | "INCREMENTED" }> = [];

    for (const line of kit.lines) {
      const existing = await tx.jobPartLine.findFirst({ where: { companyId, jobId, partId: line.partId, status: { not: "RECEIVED" } } });
      if (existing) {
        const updated = await tx.jobPartLine.update({
          where: { id: existing.id },
          data: { quantity: existing.quantity.plus(line.quantityDefault), updatedById: ctx.userId },
        });
        appliedLines.push({ partId: line.partId, partNumber: line.part.partNumber, quantityAdded: line.quantityDefault.toString(), lineId: updated.id, mode: "INCREMENTED" });
      } else {
        const created = await tx.jobPartLine.create({
          data: {
            companyId,
            jobId,
            partNumber: line.part.partNumber,
            description: line.part.description,
            quantity: line.quantityDefault,
            status: "PENDING",
            partId: line.partId,
            createdById: ctx.userId,
            updatedById: ctx.userId,
          },
        });
        appliedLines.push({ partId: line.partId, partNumber: line.part.partNumber, quantityAdded: line.quantityDefault.toString(), lineId: created.id, mode: "CREATED" });
      }
    }

    await tx.jobActivity.create({
      data: {
        companyId,
        jobId,
        actorId: ctx.userId,
        type: "KIT_APPLIED",
        description: `Job kit ${kit.name} applied to ${job.jobNumber || job.draftNumber}.`,
        metadata: { kitId: kit.id, kitName: kit.name, appliedLines } as Prisma.InputJsonValue,
      },
    });

    return { kitId: kit.id, kitName: kit.name, appliedLines };
  });

  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "Job", entityId: jobId, action: "KIT_APPLY", afterData: { jobId, kitId, appliedLines: result.appliedLines } });
  return result;
}