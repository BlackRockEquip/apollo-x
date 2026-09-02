import { Prisma } from "@prisma/client";
import type { RequestContext } from "@/lib/auth/context-types";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit/service";
import { StockError } from "@/lib/http/errors";
import { prisma } from "@/lib/prisma";
import { allocateDocumentNumberTx } from "@/lib/master-data/service";
import {
  pexCancelLinkInput,
  pexCloseWithoutReturnInput,
  pexRelinkInput,
  pexReturnReceiveInput,
  pexStockListQuery,
  pexStockStatusInput,
  pexStockUpdateInput,
  pexSupplyLinkCreateInput,
  pexTrackingListQuery,
  pexTransferInput,
} from "@/lib/pex/validation";

type Tx = Prisma.TransactionClient;
type JobStatus = Prisma.JobGetPayload<{ select: { status: true } }>["status"];
type JobType = Prisma.JobGetPayload<{ select: { type: true } }>["type"];
type JobActivityType = Prisma.JobActivityGetPayload<{ select: { type: true } }>["type"];

const COMPLETED_JOB_STATUSES = new Set<JobStatus>(["COMPLETE", "CLOSED"]);

function requirePexStockRead(ctx: RequestContext) {
  requireModule(ctx, "PEX_STOCK", "READ");
  requireTenantPermission(ctx, "PEX_STOCK_VIEW");
  return ctx.companyId!;
}

function requirePexStockWrite(ctx: RequestContext, permission: "PEX_STOCK_TRANSFER_IN" | "PEX_STOCK_EDIT" | "PEX_STOCK_QUARANTINE" | "PEX_STOCK_SCRAP") {
  requireModule(ctx, "PEX_STOCK", "WRITE");
  requireTenantPermission(ctx, permission);
  return ctx.companyId!;
}

function requirePexTrackingRead(ctx: RequestContext) {
  requireModule(ctx, "PEX_TRACKING", "READ");
  requireTenantPermission(ctx, "PEX_TRACKING_VIEW");
  return ctx.companyId!;
}

function requirePexSupplyWrite(ctx: RequestContext, permission: "PEX_SUPPLY_LINK" | "PEX_SUPPLY_CREATE" | "PEX_SUPPLY_EDIT" | "PEX_RETURN_RECEIVE" | "PEX_CHAIN_RELINK") {
  requireModule(ctx, permission === "PEX_RETURN_RECEIVE" || permission === "PEX_CHAIN_RELINK" ? "PEX_TRACKING" : "PEX_STOCK", "WRITE");
  requireTenantPermission(ctx, permission);
  return ctx.companyId!;
}

function notFound(): never {
  throw new Error("NOT_FOUND");
}

function normalize(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

function sameCoreIdentity(expected: { description?: string | null; type?: string | null; partNumber?: string | null; serial?: string | null }, actual: { description?: string | null; type?: string | null; partNumber?: string | null; serial?: string | null }) {
  return normalize(expected.description) === normalize(actual.description)
    && normalize(expected.type) === normalize(actual.type)
    && normalize(expected.partNumber) === normalize(actual.partNumber)
    && normalize(expected.serial) === normalize(actual.serial);
}

async function addJobActivity(tx: Tx, ctx: RequestContext, jobId: string, type: JobActivityType, description: string, metadata?: Prisma.InputJsonValue) {
  await tx.jobActivity.create({ data: { companyId: ctx.companyId!, jobId, type, description, metadata, actorId: ctx.userId } });
}

async function requireScopedJob(tx: Tx, companyId: string, jobId: string) {
  const job = await tx.job.findFirst({
    where: { id: jobId, companyId },
    include: {
      customer: { select: { id: true, name: true } },
      components: true,
    },
  });
  if (!job) notFound();
  return job;
}

async function requireScopedComponent(tx: Tx, companyId: string, jobId: string, componentId: string) {
  const component = await tx.jobComponent.findFirst({ where: { id: componentId, companyId, jobId } });
  if (!component) notFound();
  return component;
}

async function requireScopedLocation(tx: Tx, companyId: string, locationId: string | null | undefined) {
  if (!locationId) return null;
  const location = await tx.storageLocation.findFirst({ where: { id: locationId, companyId, active: true } });
  if (!location) notFound();
  return location;
}

async function requireScopedPexUnit(tx: Tx, companyId: string, id: string) {
  const unit = await tx.pexStockUnit.findFirst({
    where: { id, companyId },
    include: {
      sourceJob: { select: { id: true, jobNumber: true, draftNumber: true, type: true, status: true } },
      sourceJobComponent: true,
      currentSupplyJob: { select: { id: true, jobNumber: true, draftNumber: true, type: true, status: true } },
      currentReturnJob: { select: { id: true, jobNumber: true, draftNumber: true, type: true, status: true } },
      storageLocation: { select: { id: true, code: true, name: true, type: true } },
      supplyLinks: { where: { companyId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] },
    },
  });
  if (!unit) notFound();
  return unit;
}

async function requireScopedSupplyJob(tx: Tx, companyId: string, id: string) {
  const job = await tx.job.findFirst({ where: { id, companyId }, include: { customer: true } });
  if (!job) notFound();
  return job;
}

async function requireScopedSupplyLink(tx: Tx, companyId: string, supplyJobId: string) {
  const link = await tx.pexSupplyLink.findFirst({
    where: { companyId, supplyJobId },
    include: {
      pexStockUnit: { include: { sourceJob: true, storageLocation: true } },
      supplyJob: true,
      returnJob: true,
    },
  });
  if (!link) notFound();
  return link;
}

function ensureCompletedStandardRepair(job: { type: JobType; status: JobStatus }) {
  if (job.type !== "STANDARD_REPAIR") throw new StockError("INVALID_JOB_TYPE", "Only completed Standard Repair jobs can transfer a component into PEX Stock.");
  if (!COMPLETED_JOB_STATUSES.has(job.status)) throw new StockError("JOB_NOT_COMPLETE", "The source repair must be complete before transferring a component into PEX Stock.");
}

function ensureReturnDraftCancelable(job: { type: JobType; status: JobStatus; jobNumber: string | null }) {
  if (job.type !== "PEX_RETURN" || job.status !== "DRAFT" || job.jobNumber) {
    throw new StockError("PEX_UNWIND_BLOCKED", "This PEX chain can no longer be unwound silently; use the correction workflow instead.");
  }
}

export async function listPexStockUnits(ctx: RequestContext, raw: unknown) {
  const companyId = requirePexStockRead(ctx);
  const query = pexStockListQuery.parse(raw);
  const skip = (query.page - 1) * query.pageSize;
  const contains = { contains: query.q, mode: "insensitive" as const };
  const where: Prisma.PexStockUnitWhereInput = {
    companyId,
    ...(query.status !== "ALL" ? { status: query.status } : {}),
    ...(query.q ? {
      OR: [
        { component: contains },
        { componentType: contains },
        { componentPartNumber: contains },
        { componentSerial: contains },
        { machineModel: contains },
        { machineSerial: contains },
        { sourceJob: { jobNumber: contains } },
        { sourceJob: { draftNumber: contains } },
        { currentSupplyJob: { jobNumber: contains } },
        { storageLocation: { code: contains } },
        { storageLocation: { name: contains } },
      ],
    } : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.pexStockUnit.findMany({
      where,
      include: {
        sourceJob: { select: { id: true, jobNumber: true, draftNumber: true } },
        currentSupplyJob: { select: { id: true, jobNumber: true, draftNumber: true } },
        currentReturnJob: { select: { id: true, jobNumber: true, draftNumber: true } },
        storageLocation: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take: query.pageSize,
    }),
    prisma.pexStockUnit.count({ where }),
  ]);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

export async function getPexStockUnitById(ctx: RequestContext, id: string) {
  const companyId = requirePexStockRead(ctx);
  return requireScopedPexUnit(prisma, companyId, id);
}

export async function transferCompletedRepairToPexStock(ctx: RequestContext, jobId: string, raw: unknown) {
  const companyId = requirePexStockWrite(ctx, "PEX_STOCK_TRANSFER_IN");
  const input = pexTransferInput.parse(raw);
  const result = await prisma.$transaction(async (tx) => {
    const job = await requireScopedJob(tx, companyId, jobId);
    ensureCompletedStandardRepair(job);
    const component = await requireScopedComponent(tx, companyId, job.id, input.jobComponentId);
    const location = await requireScopedLocation(tx, companyId, input.storageLocationId ?? null);
    const existing = await tx.pexStockUnit.findFirst({ where: { companyId, sourceJobComponentId: component.id } });
    if (existing) throw new StockError("PEX_ALREADY_TRANSFERRED", "This completed repair component has already been transferred into PEX Stock.");
    const created = await tx.pexStockUnit.create({
      data: {
        companyId,
        sourceJobId: job.id,
        sourceJobComponentId: component.id,
        storageLocationId: location?.id ?? null,
        component: component.component,
        componentType: component.componentType,
        componentPartNumber: component.componentPartNumber,
        componentSerial: component.componentSerial,
        machineModel: job.machineModel,
        machineSerial: job.machineSerial,
        status: "AVAILABLE",
        notes: input.notes ?? null,
        createdById: ctx.userId,
        updatedById: ctx.userId,
      },
      include: { sourceJob: true, storageLocation: true },
    });
    await addJobActivity(tx, ctx, job.id, "PEX_STOCK_TRANSFERRED", `Component transferred into PEX Stock as available unit.`, {
      pexStockUnitId: created.id,
      sourceJobComponentId: component.id,
      storageLocationId: location?.id ?? null,
    });
    return created;
  });
  await recordAudit(ctx, { source: "UI", module: "PEX_STOCK", entityType: "PexStockUnit", entityId: result.id, action: "TRANSFER_IN", afterData: { jobId, jobComponentId: input.jobComponentId, storageLocationId: input.storageLocationId ?? null } });
  return result;
}

export async function updatePexStockMetadata(ctx: RequestContext, id: string, raw: unknown) {
  const companyId = requirePexStockWrite(ctx, "PEX_STOCK_EDIT");
  const input = pexStockUpdateInput.parse(raw);
  const updated = await prisma.$transaction(async (tx) => {
    const existing = await requireScopedPexUnit(tx, companyId, id);
    const location = await requireScopedLocation(tx, companyId, input.storageLocationId ?? null);
    return tx.pexStockUnit.update({
      where: { id: existing.id },
      data: { storageLocationId: location?.id ?? null, notes: input.notes ?? null, updatedById: ctx.userId },
      include: { sourceJob: true, storageLocation: true },
    });
  });
  await recordAudit(ctx, { source: "UI", module: "PEX_STOCK", entityType: "PexStockUnit", entityId: updated.id, action: "UPDATE", afterData: { storageLocationId: input.storageLocationId ?? null } });
  return updated;
}

async function setPexStockStatus(ctx: RequestContext, id: string, nextStatus: "QUARANTINE" | "AVAILABLE" | "SCRAPPED", permission: "PEX_STOCK_QUARANTINE" | "PEX_STOCK_SCRAP", raw: unknown) {
  const companyId = requirePexStockWrite(ctx, permission);
  const input = pexStockStatusInput.parse(raw);
  const updated = await prisma.$transaction(async (tx) => {
    const existing = await requireScopedPexUnit(tx, companyId, id);
    if (nextStatus === "QUARANTINE" && existing.status !== "AVAILABLE") throw new StockError("INVALID_PEX_STATUS", "Only available PEX units can move into quarantine.");
    if (nextStatus === "AVAILABLE" && existing.status !== "QUARANTINE") throw new StockError("INVALID_PEX_STATUS", "Only quarantined PEX units can be released back to available stock.");
    if (nextStatus === "SCRAPPED" && !["AVAILABLE", "QUARANTINE"].includes(existing.status)) throw new StockError("INVALID_PEX_STATUS", "Only available or quarantined PEX units can be scrapped.");
    if (existing.currentSupplyJobId || existing.currentReturnJobId || existing.status === "SUPPLIED") throw new StockError("PEX_STATUS_BLOCKED", "This PEX unit has an active supply/return chain and cannot be changed this way.");
    const unit = await tx.pexStockUnit.update({ where: { id: existing.id }, data: { status: nextStatus, updatedById: ctx.userId, notes: input.notes ?? existing.notes }, include: { sourceJob: true } });
    await addJobActivity(tx, ctx, existing.sourceJobId, "PEX_STOCK_STATUS_CHANGED", `PEX stock unit status changed to ${nextStatus}.`, { pexStockUnitId: existing.id, from: existing.status, to: nextStatus, reason: input.reason ?? null });
    return unit;
  });
  await recordAudit(ctx, { source: "UI", module: "PEX_STOCK", entityType: "PexStockUnit", entityId: updated.id, action: `STATUS_${nextStatus}`, afterData: { status: nextStatus, reason: input.reason ?? null } });
  return updated;
}

export function quarantinePexStockUnit(ctx: RequestContext, id: string, raw: unknown) {
  return setPexStockStatus(ctx, id, "QUARANTINE", "PEX_STOCK_QUARANTINE", raw);
}

export function releasePexStockUnit(ctx: RequestContext, id: string, raw: unknown) {
  return setPexStockStatus(ctx, id, "AVAILABLE", "PEX_STOCK_QUARANTINE", raw);
}

export function scrapPexStockUnit(ctx: RequestContext, id: string, raw: unknown) {
  return setPexStockStatus(ctx, id, "SCRAPPED", "PEX_STOCK_SCRAP", raw);
}

export async function listPexSupplyLinks(ctx: RequestContext, raw: unknown) {
  const companyId = requirePexTrackingRead(ctx);
  const query = pexTrackingListQuery.parse(raw);
  const skip = (query.page - 1) * query.pageSize;
  const contains = { contains: query.q, mode: "insensitive" as const };
  const where: Prisma.PexSupplyLinkWhereInput = {
    companyId,
    ...(query.status === "OUTSTANDING" ? { returnStatus: "EXPECTED", active: true } : query.status !== "ALL" ? { returnStatus: query.status as "EXPECTED" | "RECEIVED" | "CLOSED_WITHOUT_RETURN" } : {}),
    ...(query.q ? {
      OR: [
        { supplyJob: { jobNumber: contains } },
        { supplyJob: { draftNumber: contains } },
        { returnJob: { jobNumber: contains } },
        { returnJob: { draftNumber: contains } },
        { pexStockUnit: { component: contains } },
        { pexStockUnit: { componentSerial: contains } },
        { expectedCoreDescription: contains },
        { expectedCorePartNumber: contains },
        { expectedCoreSerial: contains },
        { returnedCoreDescription: contains },
        { returnedCorePartNumber: contains },
        { returnedCoreSerial: contains },
      ],
    } : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.pexSupplyLink.findMany({
      where,
      include: {
        pexStockUnit: { include: { sourceJob: { select: { jobNumber: true, draftNumber: true } } } },
        supplyJob: { select: { id: true, jobNumber: true, draftNumber: true, status: true, customer: { select: { name: true, tradingName: true } } } },
        returnJob: { select: { id: true, jobNumber: true, draftNumber: true, status: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take: query.pageSize,
    }),
    prisma.pexSupplyLink.count({ where }),
  ]);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

export async function getPexSupplyLinkBySupplyJobId(ctx: RequestContext, supplyJobId: string) {
  const companyId = requirePexTrackingRead(ctx);
  return requireScopedSupplyLink(prisma, companyId, supplyJobId);
}

export async function linkPexSupplyJob(ctx: RequestContext, supplyJobId: string, raw: unknown) {
  const companyId = requirePexSupplyWrite(ctx, "PEX_SUPPLY_LINK");
  const input = pexSupplyLinkCreateInput.parse(raw);
  const result = await prisma.$transaction(async (tx) => {
    const supplyJob = await requireScopedSupplyJob(tx, companyId, supplyJobId);
    if (supplyJob.type !== "PEX_SUPPLY") throw new StockError("INVALID_JOB_TYPE", "Only PEX Supply jobs can link to a PEX stock unit.");
    if (!supplyJob.jobNumber) throw new StockError("PEX_SUPPLY_NOT_REGISTERED", "Register the PEX Supply job before linking a PEX stock unit.");
    const existingLink = await tx.pexSupplyLink.findFirst({ where: { companyId, supplyJobId: supplyJob.id } });
    if (existingLink) throw new StockError("PEX_ALREADY_LINKED", "This PEX Supply job already has a linked stock unit.");

    const unit = await tx.pexStockUnit.findFirst({
      where: { id: input.pexStockUnitId, companyId },
      include: { sourceJob: true },
    });
    if (!unit) notFound();
    if (unit.status !== "AVAILABLE") throw new StockError("PEX_NOT_AVAILABLE", "Only available PEX stock units can be supplied.");

    const lockedUnit = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "PexStockUnit"
      WHERE id = ${unit.id} AND "companyId" = ${companyId} AND status = 'AVAILABLE'::"PexStockStatus"
      FOR UPDATE`;
    if (lockedUnit.length !== 1) throw new StockError("PEX_NOT_AVAILABLE", "The selected PEX stock unit is no longer available.");

    const activeSupply = await tx.pexSupplyLink.findFirst({ where: { companyId, pexStockUnitId: unit.id, active: true } });
    if (activeSupply) throw new StockError("PEX_ALREADY_SUPPLIED", "This PEX stock unit is already linked to an active supply.");

    const returnDraft = await tx.job.create({
      data: {
        companyId,
        draftNumber: `PEX-RET-${Date.now().toString(36).toUpperCase()}`,
        jobNumber: null,
        status: "DRAFT",
        type: "PEX_RETURN",
        customerId: supplyJob.customerId,
        customerReference: supplyJob.customerReference,
        customerPo: supplyJob.customerPo,
        dateReceived: null,
        machineModel: unit.machineModel,
        machineSerial: unit.machineSerial,
        component: unit.component,
        componentType: unit.componentType,
        componentSerial: unit.componentSerial,
        componentPartNumber: unit.componentPartNumber,
        description: `Auto-created PEX return draft for ${supplyJob.jobNumber}.`,
        relationshipNotes: `Auto-created from PEX supply ${supplyJob.jobNumber}.`,
        createdById: ctx.userId,
        updatedById: ctx.userId,
      },
    });

    const link = await tx.pexSupplyLink.create({
      data: {
        companyId,
        supplyJobId: supplyJob.id,
        returnJobId: returnDraft.id,
        pexStockUnitId: unit.id,
        expectedCoreDescription: input.expectedCoreDescription ?? unit.component,
        expectedCoreType: input.expectedCoreType ?? unit.componentType,
        expectedCorePartNumber: input.expectedCorePartNumber ?? unit.componentPartNumber,
        expectedCoreSerial: input.expectedCoreSerial ?? unit.componentSerial,
        active: true,
        createdById: ctx.userId,
        updatedById: ctx.userId,
      },
      include: { supplyJob: true, returnJob: true, pexStockUnit: true },
    });

    await tx.pexStockUnit.update({ where: { id: unit.id }, data: { status: "SUPPLIED", currentSupplyJobId: supplyJob.id, currentReturnJobId: returnDraft.id, updatedById: ctx.userId } });

    await addJobActivity(tx, ctx, supplyJob.id, "PEX_STOCK_LINKED", `PEX stock unit linked to supply job ${supplyJob.jobNumber}.`, { pexStockUnitId: unit.id, returnJobId: returnDraft.id, linkId: link.id });
    await addJobActivity(tx, ctx, supplyJob.id, "PEX_RETURN_AUTO_CREATED", `Draft PEX return created for supply job ${supplyJob.jobNumber}.`, { returnJobId: returnDraft.id, linkId: link.id });
    await addJobActivity(tx, ctx, returnDraft.id, "JOB_CREATED", `Auto-created draft PEX return for supply job ${supplyJob.jobNumber}.`, { supplyJobId: supplyJob.id, pexStockUnitId: unit.id, linkId: link.id });
    await addJobActivity(tx, ctx, unit.sourceJobId, "PEX_STOCK_STATUS_CHANGED", `PEX stock unit supplied on ${supplyJob.jobNumber}.`, { pexStockUnitId: unit.id, supplyJobId: supplyJob.id, linkId: link.id });
    return link;
  });
  await recordAudit(ctx, { source: "UI", module: "PEX_STOCK", entityType: "PexSupplyLink", entityId: result.id, action: "SUPPLY_LINK", afterData: { supplyJobId, pexStockUnitId: input.pexStockUnitId, returnJobId: result.returnJobId } });
  return result;
}

export async function receivePexReturn(ctx: RequestContext, supplyJobId: string, raw: unknown) {
  const companyId = requirePexSupplyWrite(ctx, "PEX_RETURN_RECEIVE");
  const input = pexReturnReceiveInput.parse(raw);
  const result = await prisma.$transaction(async (tx) => {
    const link = await requireScopedSupplyLink(tx, companyId, supplyJobId);
    if (!link.active || link.returnStatus !== "EXPECTED") throw new StockError("PEX_RETURN_CLOSED", "This PEX return has already been resolved.");
    const materiallyDifferent = !sameCoreIdentity(
      { description: link.expectedCoreDescription, type: link.expectedCoreType, partNumber: link.expectedCorePartNumber, serial: link.expectedCoreSerial },
      { description: input.returnedCoreDescription, type: input.returnedCoreType, partNumber: input.returnedCorePartNumber, serial: input.returnedCoreSerial },
    );
    if (materiallyDifferent && !normalize(input.returnMismatchReason)) throw new StockError("PEX_MISMATCH_REASON_REQUIRED", "A mismatch reason is required when the returned core identity differs from the expected core.");
    const updated = await tx.pexSupplyLink.update({
      where: { id: link.id },
      data: {
        returnedCoreDescription: input.returnedCoreDescription,
        returnedCoreType: input.returnedCoreType ?? null,
        returnedCorePartNumber: input.returnedCorePartNumber ?? null,
        returnedCoreSerial: input.returnedCoreSerial ?? null,
        returnMismatchReason: materiallyDifferent ? input.returnMismatchReason ?? null : null,
        returnedReceivedAt: input.returnedReceivedAt ?? new Date(),
        returnedReceivedById: ctx.userId,
        returnStatus: "RECEIVED",
        active: false,
        updatedById: ctx.userId,
      },
      include: { returnJob: true, supplyJob: true, pexStockUnit: true },
    });
    await tx.pexStockUnit.update({ where: { id: link.pexStockUnitId }, data: { currentReturnJobId: null, currentSupplyJobId: null, updatedById: ctx.userId } });
    await addJobActivity(tx, ctx, link.returnJobId, "PEX_RETURN_RECEIVED", `Returned core received for ${link.supplyJob.jobNumber || link.supplyJob.draftNumber}.`, { linkId: link.id, materiallyDifferent, returnMismatchReason: updated.returnMismatchReason });
    await addJobActivity(tx, ctx, link.supplyJobId, "PEX_RETURN_RECEIVED", `Returned core received against supply job.`, { linkId: link.id, returnJobId: link.returnJobId });
    return updated;
  });
  await recordAudit(ctx, { source: "UI", module: "PEX_TRACKING", entityType: "PexSupplyLink", entityId: result.id, action: "RETURN_RECEIVE", afterData: { supplyJobId, returnStatus: result.returnStatus, returnedReceivedAt: result.returnedReceivedAt } });
  return result;
}

export async function closePexReturnWithoutCore(ctx: RequestContext, supplyJobId: string, raw: unknown) {
  const companyId = requirePexSupplyWrite(ctx, "PEX_SUPPLY_EDIT");
  const input = pexCloseWithoutReturnInput.parse(raw);
  const result = await prisma.$transaction(async (tx) => {
    const link = await requireScopedSupplyLink(tx, companyId, supplyJobId);
    if (!link.active || link.returnStatus !== "EXPECTED") throw new StockError("PEX_RETURN_CLOSED", "This PEX return has already been resolved.");
    const updated = await tx.pexSupplyLink.update({
      where: { id: link.id },
      data: {
        returnStatus: "CLOSED_WITHOUT_RETURN",
        closedWithoutReturnReason: input.closedWithoutReturnReason,
        closedWithoutReturnNote: input.closedWithoutReturnNote ?? null,
        closedWithoutReturnAt: new Date(),
        closedWithoutReturnById: ctx.userId,
        active: false,
        updatedById: ctx.userId,
      },
      include: { returnJob: true, supplyJob: true },
    });
    await tx.pexStockUnit.update({ where: { id: link.pexStockUnitId }, data: { currentReturnJobId: null, currentSupplyJobId: null, updatedById: ctx.userId } });
    await addJobActivity(tx, ctx, link.returnJobId, "PEX_RETURN_CLOSED_WITHOUT_CORE", `PEX return closed without receiving the core.`, { linkId: link.id, reason: input.closedWithoutReturnReason });
    await addJobActivity(tx, ctx, link.supplyJobId, "PEX_RETURN_CLOSED_WITHOUT_CORE", `PEX return obligation closed without a returned core.`, { linkId: link.id, reason: input.closedWithoutReturnReason });
    return updated;
  });
  await recordAudit(ctx, { source: "UI", module: "PEX_TRACKING", entityType: "PexSupplyLink", entityId: result.id, action: "CLOSE_WITHOUT_RETURN", afterData: { supplyJobId, reason: input.closedWithoutReturnReason } });
  return result;
}

export async function cancelPexSupplyLink(ctx: RequestContext, supplyJobId: string, raw: unknown) {
  const companyId = requirePexSupplyWrite(ctx, "PEX_SUPPLY_EDIT");
  const input = pexCancelLinkInput.parse(raw);
  const result = await prisma.$transaction(async (tx) => {
    const link = await requireScopedSupplyLink(tx, companyId, supplyJobId);
    if (!link.active || link.returnStatus !== "EXPECTED") throw new StockError("PEX_UNWIND_BLOCKED", "Only active outstanding PEX links can be unwound.");
    ensureReturnDraftCancelable(link.returnJob);
    await tx.pexSupplyLink.update({ where: { id: link.id }, data: { active: false, updatedById: ctx.userId } });
    await tx.pexStockUnit.update({ where: { id: link.pexStockUnitId }, data: { status: "AVAILABLE", currentSupplyJobId: null, currentReturnJobId: null, updatedById: ctx.userId } });
    await tx.job.update({ where: { id: link.returnJobId }, data: { status: "CANCELLED", updatedById: ctx.userId } });
    await addJobActivity(tx, ctx, link.supplyJobId, "PEX_SUPPLY_CANCELLED", `PEX supply link cancelled and unwound.`, { linkId: link.id, reason: input.reason });
    await addJobActivity(tx, ctx, link.returnJobId, "PEX_STOCK_UNLINKED", `Auto-created PEX return draft cancelled during unwind.`, { linkId: link.id, reason: input.reason });
    return link;
  });
  await recordAudit(ctx, { source: "UI", module: "PEX_TRACKING", entityType: "PexSupplyLink", entityId: result.id, action: "CANCEL_LINK", afterData: { supplyJobId, reason: input.reason } });
  return { ok: true };
}

export async function relinkPexSupplyChain(ctx: RequestContext, supplyJobId: string, raw: unknown) {
  const companyId = requirePexSupplyWrite(ctx, "PEX_CHAIN_RELINK");
  const input = pexRelinkInput.parse(raw);
  const result = await prisma.$transaction(async (tx) => {
    const link = await requireScopedSupplyLink(tx, companyId, supplyJobId);
    if (!link.active || link.returnStatus !== "EXPECTED") throw new StockError("PEX_UNWIND_BLOCKED", "Only active outstanding PEX links can be corrected with relinking.");
    const nextUnit = await tx.pexStockUnit.findFirst({ where: { id: input.pexStockUnitId, companyId } });
    if (!nextUnit) notFound();
    if (nextUnit.status !== "AVAILABLE") throw new StockError("PEX_NOT_AVAILABLE", "The replacement PEX stock unit must be available.");
    const replacementConflict = await tx.pexSupplyLink.findFirst({ where: { companyId, pexStockUnitId: nextUnit.id, active: true } });
    if (replacementConflict) throw new StockError("PEX_ALREADY_SUPPLIED", "The replacement PEX stock unit is already linked to another active supply.");
    await tx.pexStockUnit.update({ where: { id: link.pexStockUnitId }, data: { status: "AVAILABLE", currentSupplyJobId: null, currentReturnJobId: null, updatedById: ctx.userId } });
    const updated = await tx.pexSupplyLink.update({
      where: { id: link.id },
      data: {
        pexStockUnitId: nextUnit.id,
        expectedCoreDescription: nextUnit.component,
        expectedCoreType: nextUnit.componentType,
        expectedCorePartNumber: nextUnit.componentPartNumber,
        expectedCoreSerial: nextUnit.componentSerial,
        updatedById: ctx.userId,
      },
      include: { supplyJob: true, returnJob: true, pexStockUnit: true },
    });
    await tx.pexStockUnit.update({ where: { id: nextUnit.id }, data: { status: "SUPPLIED", currentSupplyJobId: link.supplyJobId, currentReturnJobId: link.returnJobId, updatedById: ctx.userId } });
    await addJobActivity(tx, ctx, link.supplyJobId, "PEX_RETURN_RELINKED", `PEX chain relinked to a different stock unit.`, { linkId: link.id, fromPexStockUnitId: link.pexStockUnitId, toPexStockUnitId: nextUnit.id, reason: input.reason });
    return updated;
  });
  await recordAudit(ctx, { source: "UI", module: "PEX_TRACKING", entityType: "PexSupplyLink", entityId: result.id, action: "RELINK", afterData: { supplyJobId, pexStockUnitId: input.pexStockUnitId, reason: input.reason } });
  return result;
}

export async function registerPexJob(ctx: RequestContext, jobId: string, initialStatus: JobStatus) {
  const companyId = ctx.companyId!;
  return prisma.$transaction(async (tx) => {
    const job = await tx.job.findFirst({ where: { id: jobId, companyId } });
    if (!job) notFound();
    if (job.jobNumber) throw new StockError("JOB_ALREADY_REGISTERED", "Job is already registered.");
    if (job.type !== "PEX_SUPPLY" && job.type !== "PEX_RETURN") throw new StockError("INVALID_JOB_TYPE", "Only PEX Supply and PEX Return jobs use PEX_JOB numbering.");
    const number = await allocateDocumentNumberTx(tx, ctx, "PEX_JOB");
    const updated = await tx.job.update({ where: { id: job.id }, data: { jobNumber: number, status: initialStatus, updatedById: ctx.userId } });
    await addJobActivity(tx, ctx, job.id, job.type === "PEX_RETURN" ? "PEX_RETURN_REGISTERED" : "JOB_REGISTERED", `Job registered as ${number}.`, { jobNumber: number, status: initialStatus, sequenceType: "PEX_JOB" });
    return updated;
  });
}