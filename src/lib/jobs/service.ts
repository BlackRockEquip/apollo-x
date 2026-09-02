import { Prisma } from "@prisma/client";
import type { RequestContext } from "@/lib/auth/context-types";
import type { TenantPermission } from "@/lib/auth/permissions";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit/service";
import { issueReservedStockTx, releaseReservationTx, reserveStockTx, returnStockTx } from "@/lib/inventory/service";
import {
  jobsListQuery,
  jobCreateDraftInput,
  jobUpdateInput,
  jobRegisterInput,
  jobStatusChangeInput,
  jobCloseInput,
  jobReopenInput,
  jobNoteCreateInput,
  jobFieldServiceInput,
  jobWarrantyInput,
  jobPartRequirementCreateInput,
  jobPartRequirementUpdateInput,
  jobPartIssueInput,
  jobPartReserveInput,
  jobPartReleaseInput,
  jobPartReturnInput,
  type JobPartReturnInput,
  type JobsListQuery,
} from "@/lib/jobs/validation";
import { registerPexJob } from "@/lib/pex/service";

type JobStatus = Prisma.JobGetPayload<{ select: { status: true } }>["status"];
type JobType = Prisma.JobGetPayload<{ select: { type: true } }>["type"];
type JobActivityType = Prisma.JobActivityGetPayload<{ select: { type: true } }>["type"];

const WIP_STATUSES: JobStatus[] = ["TO_BE_COLLECTED", "TO_BE_RECEIVED", "STRIPPING", "QUOTE_IN_PROGRESS", "AWAITING_GO_AHEAD", "WAITING_FOR_PARTS", "ASSEMBLY", "TESTING", "TO_BE_DELIVERED"];

const jobListSelect = {
  id: true,
  jobNumber: true,
  draftNumber: true,
  status: true,
  type: true,
  customerReference: true,
  customerPo: true,
  machineModel: true,
  machineSerial: true,
  component: true,
  componentSerial: true,
  description: true,
  etaDate: true,
  createdAt: true,
  updatedAt: true,
  customer: { select: { id: true, name: true, tradingName: true, accountCode: true } },
} satisfies Prisma.JobSelect;

function requireJobs(ctx: RequestContext, permission: TenantPermission) {
  requireModule(ctx, "JOBS_WIP", "WRITE");
  requireTenantPermission(ctx, permission);
  return ctx.companyId!;
}

function requireJobsRead(ctx: RequestContext) {
  requireModule(ctx, "JOBS_WIP", "READ");
  requireTenantPermission(ctx, "JOBS_VIEW");
  return ctx.companyId!;
}

function notFound(): never {
  throw new Error("NOT_FOUND");
}

function decimalOrNull(value: number | null | undefined) {
  return value == null ? null : new Prisma.Decimal(value);
}

async function getCustomerOrThrow(companyId: string, customerId: string) {
  const customer = await prisma.customer.findFirst({ where: { id: customerId, companyId, active: true } });
  if (!customer) notFound();
  return customer;
}

async function getUserOrNull(companyId: string, userId: string | null | undefined) {
  if (!userId) return null;
  const membership = await prisma.companyMembership.findFirst({ where: { companyId, userId, status: "ACTIVE" } });
  if (!membership) notFound();
  return userId;
}

async function getJobScoped(companyId: string, id: string) {
  const job = await prisma.job.findFirst({
    where: { id, companyId },
    include: {
      customer: {
        include: {
          branches: { where: { active: true }, orderBy: { name: "asc" } },
          contacts: { where: { active: true }, orderBy: [{ isPrimary: "desc" }, { firstName: "asc" }] },
          addresses: { where: { active: true }, orderBy: [{ isPrimary: "desc" }, { type: "asc" }] },
        },
      },
      createdBy: true,
      updatedBy: true,
      closedBy: true,
      stripMechanic: true,
      buildMechanic: true,
      notes: { include: { createdBy: { select: { id: true, displayName: true, email: true } } }, orderBy: { createdAt: "desc" } },
      activities: { include: { actor: { select: { id: true, displayName: true, email: true } } }, orderBy: { createdAt: "desc" } },
      fieldServiceReport: true,
      warranty: true,
      components: true,
      pexSourceStockUnits: {
        include: {
          storageLocation: { select: { id: true, code: true, name: true } },
          currentSupplyJob: { select: { id: true, jobNumber: true, draftNumber: true } },
          currentReturnJob: { select: { id: true, jobNumber: true, draftNumber: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      },
      pexSupplyLinksAsSupply: {
        include: {
          pexStockUnit: { select: { id: true, component: true, componentPartNumber: true, componentSerial: true, status: true } },
          returnJob: { select: { id: true, jobNumber: true, draftNumber: true, status: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      },
      pexSupplyLinksAsReturn: {
        include: {
          pexStockUnit: { select: { id: true, component: true, componentPartNumber: true, componentSerial: true, status: true } },
          supplyJob: { select: { id: true, jobNumber: true, draftNumber: true, status: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      },
      partRequirements: {
        include: {
          part: { select: { id: true, partNumber: true, description: true, unitOfMeasure: true } },
          allocations: {
            include: {
              stockReservation: { select: { id: true, status: true, location: { select: { code: true, name: true } } } },
              location: { select: { id: true, code: true, name: true } },
              movements: {
                include: {
                  stockMovement: { select: { id: true, movementType: true, referenceNumber: true, occurredAt: true, reversalOfId: true } },
                },
                orderBy: { createdAt: "desc" },
              },
            },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: [{ active: "desc" }, { createdAt: "desc" }],
      },
    },
  });
  if (!job) notFound();

  return {
    ...job,
    partRequirements: job.partRequirements.map((requirement) => {
      const allocationSummaries = requirement.allocations.map((allocation) => {
        const issued = allocation.movements
          .filter((movement) => movement.kind === "ISSUE")
          .reduce((sum, movement) => sum.plus(movement.quantity), new Prisma.Decimal(0));
        const returned = allocation.movements
          .filter((movement) => movement.kind === "RETURN")
          .reduce((sum, movement) => sum.plus(movement.quantity), new Prisma.Decimal(0));
        const returnedReopen = allocation.movements
          .filter((movement) => movement.kind === "RETURN" && movement.returnDisposition === "REQUIREMENT_REMAINS")
          .reduce((sum, movement) => sum.plus(movement.quantity), new Prisma.Decimal(0));
        const effectiveFulfilled = issued.minus(returnedReopen);

        return {
          ...allocation,
          summary: {
            quantityReserved: allocation.quantityReserved,
            quantityIssued: issued,
            quantityReturned: returned,
            quantityReturnedToOutstanding: returnedReopen,
            quantityEffectiveFulfilled: effectiveFulfilled,
          },
        };
      });

      const totalReserved = allocationSummaries.reduce((sum, allocation) => sum.plus(allocation.quantityReserved), new Prisma.Decimal(0));
      const totalIssued = allocationSummaries.reduce((sum, allocation) => sum.plus(allocation.summary.quantityIssued), new Prisma.Decimal(0));
      const totalReturned = allocationSummaries.reduce((sum, allocation) => sum.plus(allocation.summary.quantityReturned), new Prisma.Decimal(0));
      const totalReturnedToOutstanding = allocationSummaries.reduce((sum, allocation) => sum.plus(allocation.summary.quantityReturnedToOutstanding), new Prisma.Decimal(0));
      const totalEffectiveFulfilled = allocationSummaries.reduce((sum, allocation) => sum.plus(allocation.summary.quantityEffectiveFulfilled), new Prisma.Decimal(0));
      const outstanding = Prisma.Decimal.max(requirement.quantityRequired.minus(totalEffectiveFulfilled), new Prisma.Decimal(0));

      return {
        ...requirement,
        allocations: allocationSummaries,
        summary: {
          quantityRequired: requirement.quantityRequired,
          quantityReserved: totalReserved,
          grossIssued: totalIssued,
          grossReturned: totalReturned,
          returnedReopeningRequirement: totalReturnedToOutstanding,
          effectiveFulfilled: totalEffectiveFulfilled,
          outstanding,
        },
      };
    }),
  };
}

async function getRequirementScoped(companyId: string, jobId: string, requirementId: string) {
  const requirement = await prisma.jobPartRequirement.findFirst({ where: { id: requirementId, companyId, jobId } });
  if (!requirement) notFound();
  return requirement;
}

function mapListWhere(companyId: string, query: JobsListQuery): Prisma.JobWhereInput {
  const contains = { contains: query.q, mode: "insensitive" as const };
  return {
    companyId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.view === "wip" ? { status: { in: WIP_STATUSES } } : {}),
    ...(query.view === "completed" ? { status: { in: ["COMPLETE", "CLOSED", "CANCELLED"] } } : {}),
    ...(query.q ? {
      OR: [
        { jobNumber: contains },
        { draftNumber: contains },
        { customerReference: contains },
        { customerPo: contains },
        { machineModel: contains },
        { machineSerial: contains },
        { component: contains },
        { componentSerial: contains },
        { componentPartNumber: contains },
        { description: contains },
        { customer: { name: contains } },
        { customer: { tradingName: contains } },
        { customer: { accountCode: contains } },
      ],
    } : {}),
  };
}

async function addActivity(tx: Prisma.TransactionClient, ctx: RequestContext, jobId: string, type: JobActivityType, description: string, metadata?: Prisma.InputJsonValue) {
  await tx.jobActivity.create({
    data: { companyId: ctx.companyId!, jobId, type, description, metadata, actorId: ctx.userId },
  });
}

export async function listJobs(ctx: RequestContext, raw: unknown) {
  const companyId = requireJobsRead(ctx);
  const query = jobsListQuery.parse(raw);
  const where = mapListWhere(companyId, query);
  const orderBy = { createdAt: query.sort === "oldest" ? "asc" : "desc" } as const;
  const [total, items] = await Promise.all([
    prisma.job.count({ where }),
    prisma.job.findMany({
      where,
      select: jobListSelect,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

export async function createDraftJob(ctx: RequestContext, raw: unknown) {
  const companyId = requireJobs(ctx, "JOBS_CREATE");
  const input = jobCreateDraftInput.parse(raw);
  await getCustomerOrThrow(companyId, input.customerId);
  const stripMechanicId = await getUserOrNull(companyId, input.stripMechanicId);
  const buildMechanicId = await getUserOrNull(companyId, input.buildMechanicId);
  if (input.relatedJobId) await getJobScoped(companyId, input.relatedJobId);
  const job = await prisma.$transaction(async (tx) => {
    const created = await tx.job.create({
      data: {
        companyId,
        customerId: input.customerId,
        customerReference: input.customerReference,
        customerPo: input.customerPo,
        dateReceived: input.dateReceived,
        machineModel: input.machineModel,
        machineSerial: input.machineSerial,
        component: input.component,
        componentType: input.componentType,
        componentSerial: input.componentSerial,
        componentPartNumber: input.componentPartNumber,
        description: input.description,
        type: input.type as JobType,
        etaDate: input.etaDate,
        relationshipNotes: input.relationshipNotes,
        relatedJobId: input.relatedJobId,
        stripMechanicId,
        buildMechanicId,
        createdById: ctx.userId,
        updatedById: ctx.userId,
      },
      include: { customer: true },
    });
    if (input.component) {
      await tx.jobComponent.create({
        data: {
          companyId,
          jobId: created.id,
          component: input.component,
          componentType: input.componentType,
          componentSerial: input.componentSerial,
          componentPartNumber: input.componentPartNumber,
        },
      });
    }
    await addActivity(tx, ctx, created.id, "JOB_CREATED", `Draft job ${created.draftNumber} created.`, { draftNumber: created.draftNumber, type: created.type });
    return created;
  });
  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "Job", entityId: job.id, action: "CREATE_DRAFT", afterData: { id: job.id, draftNumber: job.draftNumber } });
  return job;
}

export async function getJobById(ctx: RequestContext, id: string) {
  const companyId = requireJobsRead(ctx);
  return getJobScoped(companyId, id);
}

export async function updateJob(ctx: RequestContext, id: string, raw: unknown) {
  const companyId = requireJobs(ctx, "JOBS_EDIT");
  const input = jobUpdateInput.parse(raw);
  const existing = await getJobScoped(companyId, id);
  if (input.customerId) await getCustomerOrThrow(companyId, input.customerId);
  const stripMechanicId = input.stripMechanicId === undefined ? existing.stripMechanicId : await getUserOrNull(companyId, input.stripMechanicId);
  const buildMechanicId = input.buildMechanicId === undefined ? existing.buildMechanicId : await getUserOrNull(companyId, input.buildMechanicId);
  if (input.relatedJobId) await getJobScoped(companyId, input.relatedJobId);
  const updated = await prisma.$transaction(async (tx) => {
    const job = await tx.job.update({
      where: { id: existing.id },
      data: {
        ...(input.customerId !== undefined ? { customerId: input.customerId } : {}),
        ...(input.customerReference !== undefined ? { customerReference: input.customerReference } : {}),
        ...(input.customerPo !== undefined ? { customerPo: input.customerPo } : {}),
        ...(input.dateReceived !== undefined ? { dateReceived: input.dateReceived } : {}),
        ...(input.machineModel !== undefined ? { machineModel: input.machineModel } : {}),
        ...(input.machineSerial !== undefined ? { machineSerial: input.machineSerial } : {}),
        ...(input.component !== undefined ? { component: input.component } : {}),
        ...(input.componentType !== undefined ? { componentType: input.componentType } : {}),
        ...(input.componentSerial !== undefined ? { componentSerial: input.componentSerial } : {}),
        ...(input.componentPartNumber !== undefined ? { componentPartNumber: input.componentPartNumber } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.type !== undefined ? { type: input.type as JobType } : {}),
        ...(input.etaDate !== undefined ? { etaDate: input.etaDate } : {}),
        ...(input.relationshipNotes !== undefined ? { relationshipNotes: input.relationshipNotes } : {}),
        ...(input.relatedJobId !== undefined ? { relatedJobId: input.relatedJobId } : {}),
        ...(input.status !== undefined ? { status: input.status as JobStatus } : {}),
        stripMechanicId,
        buildMechanicId,
        updatedById: ctx.userId,
      },
    });

    const componentExists = await tx.jobComponent.findFirst({ where: { companyId, jobId: existing.id } });
    const componentPayload = {
      component: input.component ?? existing.component ?? "Component",
      componentType: input.componentType === undefined ? existing.componentType : input.componentType,
      componentSerial: input.componentSerial === undefined ? existing.componentSerial : input.componentSerial,
      componentPartNumber: input.componentPartNumber === undefined ? existing.componentPartNumber : input.componentPartNumber,
    };
    if (job.component) {
      if (componentExists) await tx.jobComponent.update({ where: { id: componentExists.id }, data: componentPayload });
      else await tx.jobComponent.create({ data: { companyId, jobId: existing.id, ...componentPayload } });
    }

    await addActivity(tx, ctx, existing.id, "STATUS_CHANGED", "Job details updated.", { updatedFields: Object.keys(input as Record<string, unknown>) });
    return job;
  });
  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "Job", entityId: updated.id, action: "UPDATE", afterData: { id: updated.id } });
  return updated;
}

export async function registerJob(ctx: RequestContext, id: string, raw: unknown) {
  const companyId = requireJobs(ctx, "JOBS_EDIT");
  const input = jobRegisterInput.parse(raw);
  const existing = await getJobScoped(companyId, id);
  if (existing.jobNumber) throw new Error("Job is already registered.");
  if (existing.type === "PEX_SUPPLY" || existing.type === "PEX_RETURN") {
    const updated = await registerPexJob(ctx, existing.id, input.initialStatus as JobStatus);
    await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "Job", entityId: updated.id, action: "REGISTER", afterData: { id: updated.id, jobNumber: updated.jobNumber, status: updated.status, sequenceType: "PEX_JOB" } });
    return updated;
  }
  const updated = await prisma.$transaction(async (tx) => {
    const r = await tx.documentNumberSequence.update({
      where: { companyId_type: { companyId, type: "JOB" } },
      data: { nextValue: { increment: BigInt(1) } },
      select: { prefix: true, padding: true, includeFinancialYear: true, financialYearStartMonth: true, nextValue: true },
    });
    const allocated = Number(r.nextValue) - 1;
    const now = new Date();
    const year = r.includeFinancialYear ? (now.getUTCMonth() + 1 >= r.financialYearStartMonth ? now.getUTCFullYear() + 1 : now.getUTCFullYear()) : now.getUTCFullYear();
    const number = `${r.prefix}${r.includeFinancialYear ? `${year}/` : ""}${allocated.toString().padStart(r.padding, "0")}`;
    const registered = await tx.job.update({ where: { id: existing.id }, data: { jobNumber: number, status: input.initialStatus as JobStatus, updatedById: ctx.userId }, include: { customer: true } });
    await addActivity(tx, ctx, existing.id, "JOB_REGISTERED", `Job registered as ${number}.`, { jobNumber: number, status: input.initialStatus });
    return registered;
  });
  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "Job", entityId: updated.id, action: "REGISTER", afterData: { id: updated.id, jobNumber: updated.jobNumber, status: updated.status } });
  return updated;
}

export async function changeJobStatus(ctx: RequestContext, id: string, raw: unknown) {
  const companyId = requireJobs(ctx, "JOBS_EDIT");
  const input = jobStatusChangeInput.parse(raw);
  const existing = await getJobScoped(companyId, id);
  if (existing.status === "DRAFT") throw new Error("Draft jobs must be registered before status changes.");
  const updated = await prisma.$transaction(async (tx) => {
    const job = await tx.job.update({ where: { id: existing.id }, data: { status: input.status as JobStatus, updatedById: ctx.userId } });
    await addActivity(tx, ctx, existing.id, "STATUS_CHANGED", `Status changed from ${existing.status} to ${input.status}.`, { from: existing.status, to: input.status, reason: input.reason ?? null });
    return job;
  });
  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "Job", entityId: updated.id, action: "STATUS_CHANGE", afterData: { from: existing.status, to: updated.status } });
  return updated;
}

export async function closeJob(ctx: RequestContext, id: string, raw: unknown) {
  const companyId = requireJobs(ctx, "JOBS_EDIT");
  const input = jobCloseInput.parse(raw);
  const existing = await getJobScoped(companyId, id);
  const updated = await prisma.$transaction(async (tx) => {
    const closed = await tx.job.update({ where: { id: existing.id }, data: { status: "CLOSED", closingOutcome: input.outcome, closingNote: input.closingNote, closedAt: new Date(), closedById: ctx.userId, updatedById: ctx.userId } });
    await addActivity(tx, ctx, existing.id, "JOB_CLOSED", `Job closed. Outcome: ${input.outcome}.`, { outcome: input.outcome });
    return closed;
  });
  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "Job", entityId: updated.id, action: "CLOSE", afterData: { status: updated.status, outcome: updated.closingOutcome } });
  return updated;
}

export async function reopenJob(ctx: RequestContext, id: string, raw: unknown) {
  const companyId = requireJobs(ctx, "JOBS_EDIT");
  const input = jobReopenInput.parse(raw);
  const existing = await getJobScoped(companyId, id);
  if (!["CLOSED", "CANCELLED", "COMPLETE"].includes(existing.status)) throw new Error("Only closed, cancelled or complete jobs can be reopened.");
  const updated = await prisma.$transaction(async (tx) => {
    const reopened = await tx.job.update({ where: { id: existing.id }, data: { status: input.status as JobStatus, updatedById: ctx.userId } });
    await addActivity(tx, ctx, existing.id, "JOB_REOPENED", `Job reopened to ${input.status}.`, { from: existing.status, to: input.status, reason: input.reason ?? null, previousClosedAt: existing.closedAt });
    return reopened;
  });
  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "Job", entityId: updated.id, action: "REOPEN", afterData: { from: existing.status, to: updated.status } });
  return updated;
}

export async function addJobNote(ctx: RequestContext, jobId: string, raw: unknown) {
  const companyId = requireJobs(ctx, "JOBS_EDIT");
  const input = jobNoteCreateInput.parse(raw);
  await getJobScoped(companyId, jobId);
  const note = await prisma.$transaction(async (tx) => {
    const created = await tx.jobNote.create({ data: { companyId, jobId, note: input.note, createdById: ctx.userId }, include: { createdBy: { select: { id: true, displayName: true, email: true } } } });
    await addActivity(tx, ctx, jobId, "NOTE_ADDED", "Note added to job.", { noteId: created.id });
    return created;
  });
  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "JobNote", entityId: note.id, action: "CREATE", afterData: { jobId, noteId: note.id } });
  return note;
}

export async function upsertJobFieldService(ctx: RequestContext, jobId: string, raw: unknown) {
  const companyId = requireJobs(ctx, "JOBS_EDIT");
  const input = jobFieldServiceInput.parse(raw);
  const job = await getJobScoped(companyId, jobId);
  if (job.type !== "FIELD_SERVICE") throw new Error("Field-service information is only available for field service jobs.");
  const updated = await prisma.$transaction(async (tx) => {
    const record = await tx.jobFieldServiceReport.upsert({
      where: { jobId },
      create: { companyId, jobId, site: input.site, technician: input.technician, vehicle: input.vehicle, hours: decimalOrNull(input.hours), report: input.report, updatedById: ctx.userId },
      update: { site: input.site, technician: input.technician, vehicle: input.vehicle, hours: decimalOrNull(input.hours), report: input.report, updatedById: ctx.userId },
    });
    await addActivity(tx, ctx, jobId, "FIELD_SERVICE_UPDATED", "Field service information updated.");
    return record;
  });
  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "JobFieldServiceReport", entityId: updated.id, action: "UPSERT", afterData: { jobId } });
  return updated;
}

export async function upsertJobWarranty(ctx: RequestContext, jobId: string, raw: unknown) {
  const companyId = requireJobs(ctx, "JOBS_EDIT");
  const input = jobWarrantyInput.parse(raw);
  const job = await getJobScoped(companyId, jobId);
  if (job.type !== "WARRANTY") throw new Error("Warranty information is only available for warranty jobs.");
  const updated = await prisma.$transaction(async (tx) => {
    const record = await tx.jobWarranty.upsert({
      where: { jobId },
      create: { companyId, jobId, status: input.status, notes: input.notes, historicalSourceStatus: input.historicalSourceStatus, updatedById: ctx.userId },
      update: { status: input.status, notes: input.notes, historicalSourceStatus: input.historicalSourceStatus, updatedById: ctx.userId },
    });
    await addActivity(tx, ctx, jobId, "WARRANTY_UPDATED", `Warranty status updated to ${input.status}.`, { status: input.status });
    return record;
  });
  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "JobWarranty", entityId: updated.id, action: "UPSERT", afterData: { jobId, status: updated.status } });
  return updated;
}

export async function addJobPartRequirement(ctx: RequestContext, jobId: string, raw: unknown) {
  const companyId = requireJobs(ctx, "JOBS_EDIT");
  const input = jobPartRequirementCreateInput.parse(raw);
  await getJobScoped(companyId, jobId);
  const part = await prisma.part.findFirst({ where: { id: input.partId, companyId, active: true }, select: { id: true, partNumber: true, description: true } });
  if (!part) notFound();
  const requirement = await prisma.$transaction(async (tx) => {
    const created = await tx.jobPartRequirement.create({
      data: { companyId, jobId, partId: input.partId, quantityRequired: new Prisma.Decimal(input.quantityRequired), notes: input.notes, etaDate: input.etaDate },
      include: { part: { select: { id: true, partNumber: true, description: true, unitOfMeasure: true } }, allocations: true },
    });
    await addActivity(tx, ctx, jobId, "PART_ADDED", `Part requirement added for ${part.partNumber}.`, { requirementId: created.id, partId: part.id });
    return created;
  });
  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "JobPartRequirement", entityId: requirement.id, action: "CREATE", afterData: { jobId, partId: input.partId } });
  return requirement;
}

export async function updateJobPartRequirement(ctx: RequestContext, jobId: string, requirementId: string, raw: unknown) {
  const companyId = requireJobs(ctx, "JOBS_EDIT");
  const input = jobPartRequirementUpdateInput.parse(raw);
  const existing = await getRequirementScoped(companyId, jobId, requirementId);
  const updated = await prisma.$transaction(async (tx) => {
    const record = await tx.jobPartRequirement.update({
      where: { id: existing.id },
      data: {
        ...(input.quantityRequired !== undefined ? { quantityRequired: new Prisma.Decimal(input.quantityRequired) } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.etaDate !== undefined ? { etaDate: input.etaDate } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
      include: { part: { select: { id: true, partNumber: true, description: true, unitOfMeasure: true } }, allocations: true },
    });
    await addActivity(tx, ctx, jobId, input.active === false ? "PART_REMOVED" : "PART_ADDED", input.active === false ? `Part requirement removed from active list.` : `Part requirement updated.`, { requirementId: existing.id });
    return record;
  });
  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "JobPartRequirement", entityId: updated.id, action: "UPDATE", afterData: { jobId, requirementId } });
  return updated;
}

export async function reserveJobRequirementStock(ctx: RequestContext, jobId: string, requirementId: string, raw: unknown) {
  const companyId = requireJobs(ctx, "JOBS_EDIT");
  requireTenantPermission(ctx, "INVENTORY_RESERVE");
  requireModule(ctx, "INVENTORY", "WRITE");
  const input = jobPartReserveInput.parse(raw);
  const requirement = await prisma.jobPartRequirement.findFirst({
    where: { id: requirementId, companyId, jobId, active: true },
    include: { part: { select: { id: true, partNumber: true, description: true } }, job: { select: { id: true, jobNumber: true, draftNumber: true } } },
  });
  if (!requirement) notFound();

  const location = await prisma.storageLocation.findFirst({ where: { id: input.locationId, companyId, active: true }, select: { id: true, code: true, name: true } });
  if (!location) notFound();

  const result = await prisma.$transaction(async (tx) => {
    const reserved = await reserveStockTx(tx, ctx as RequestContext & { companyId: string }, {
      partId: requirement.partId,
      locationId: input.locationId,
      quantity: input.quantity,
      referenceType: "JOB",
      referenceId: jobId,
      referenceNumber: input.referenceNumber ?? requirement.job.jobNumber ?? requirement.job.draftNumber,
      notes: input.notes ?? null,
      idempotencyKey: input.idempotencyKey,
    });

    const allocation = await tx.jobPartAllocation.create({
      data: {
        companyId,
        jobId,
        requirementId,
        partId: requirement.partId,
        locationId: input.locationId,
        stockReservationId: reserved.reservationId,
        quantityReserved: new Prisma.Decimal(input.quantity),
      },
    });

    await addActivity(tx, ctx, jobId, "PART_RESERVED", `${input.quantity} × ${requirement.part.partNumber} reserved from ${location.code || location.name}.`, {
      requirementId,
      allocationId: allocation.id,
      reservationId: reserved.reservationId,
      locationId: location.id,
      quantity: input.quantity,
      replayed: reserved.replayed,
    });

    return { ...reserved, allocationId: allocation.id };
  });

  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "JobPartAllocation", entityId: result.allocationId, action: "RESERVE", afterData: { jobId, requirementId, reservationId: result.reservationId, quantity: input.quantity, locationId: input.locationId, idempotencyKey: input.idempotencyKey ?? null } });
  return result;
}

export async function issueJobAllocationStock(ctx: RequestContext, jobId: string, allocationId: string, raw: unknown) {
  const companyId = requireJobs(ctx, "JOBS_EDIT");
  requireTenantPermission(ctx, "INVENTORY_ISSUE");
  requireModule(ctx, "INVENTORY", "WRITE");
  const input = jobPartIssueInput.parse(raw);

  const allocation = await prisma.jobPartAllocation.findFirst({
    where: { id: allocationId, companyId, jobId },
    include: {
      requirement: { select: { id: true, active: true, partId: true } },
      part: { select: { partNumber: true } },
      location: { select: { id: true, code: true, name: true } },
    },
  });
  if (!allocation || !allocation.stockReservationId || !allocation.requirement.active) notFound();

  const result = await prisma.$transaction(async (tx) => {
    const issued = await issueReservedStockTx(tx, ctx as RequestContext & { companyId: string }, allocation.stockReservationId!, {
      partId: allocation.partId,
      locationId: allocation.locationId,
      quantity: input.quantity,
      referenceType: "JOB",
      referenceId: jobId,
      referenceNumber: input.referenceNumber ?? null,
      notes: input.notes ?? null,
      idempotencyKey: input.idempotencyKey,
    });

    const movement = await tx.jobPartAllocationMovement.create({
      data: {
        companyId,
        allocationId,
        stockMovementId: issued.movementId,
        kind: "ISSUE",
        quantity: new Prisma.Decimal(input.quantity),
      },
    });

    await addActivity(tx, ctx, jobId, "PART_ISSUED", `${input.quantity} × ${allocation.part.partNumber} issued from ${allocation.location.code || allocation.location.name}.`, {
      allocationId,
      stockMovementId: issued.movementId,
      jobPartAllocationMovementId: movement.id,
      quantity: input.quantity,
      replayed: issued.replayed,
    });

    return { ...issued, jobPartAllocationMovementId: movement.id };
  });

  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "JobPartAllocationMovement", entityId: result.jobPartAllocationMovementId, action: "ISSUE", afterData: { jobId, allocationId, stockMovementId: result.movementId, quantity: input.quantity, idempotencyKey: input.idempotencyKey ?? null } });
  return result;
}

async function returnJobAllocationStockTx(
  tx: Prisma.TransactionClient,
  ctx: RequestContext & { companyId: string },
  jobId: string,
  allocation: {
    id: string;
    companyId: string;
    partId: string;
    locationId: string;
    stockReservationId: string | null;
    part: { partNumber: string };
    location: { id: string; code: string | null; name: string };
  },
  input: JobPartReturnInput,
) {
  const qtyRequested = new Prisma.Decimal(input.quantity);

  if (input.idempotencyKey) {
    const replayLinks = await tx.jobPartAllocationMovement.findMany({
      where: {
        companyId: ctx.companyId,
        allocationId: allocation.id,
        kind: "RETURN",
        stockMovement: {
          idempotencyKey: { startsWith: `${input.idempotencyKey}:` },
        },
      },
      include: {
        stockMovement: {
          select: { id: true, idempotencyKey: true },
        },
      },
      orderBy: [{ stockMovementId: "asc" }, { id: "asc" }],
    });

    if (replayLinks.length > 0) {
      const replayQty = replayLinks.reduce((sum, row) => sum.plus(row.quantity), new Prisma.Decimal(0));
      if (!replayQty.eq(qtyRequested)) throw new Error("IDEMPOTENT_RETURN_QUANTITY_MISMATCH");
      return {
        replayed: true,
        movementId: replayLinks[0]!.stockMovementId,
        movementIds: replayLinks.map((row) => row.stockMovementId),
        jobPartAllocationMovementId: replayLinks[0]!.id,
        jobPartAllocationMovementIds: replayLinks.map((row) => row.id),
      };
    }
  }

  await tx.$queryRaw`SELECT id FROM "JobPartAllocation" WHERE id = ${allocation.id} AND "companyId" = ${ctx.companyId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM "JobPartAllocationMovement" WHERE "allocationId" = ${allocation.id} AND "companyId" = ${ctx.companyId} FOR UPDATE`;

  const issueRows = await tx.jobPartAllocationMovement.findMany({
    where: { companyId: ctx.companyId, allocationId: allocation.id, kind: "ISSUE" },
    include: {
      stockMovement: {
        select: {
          id: true,
          quantity: true,
          fromLocationId: true,
          partId: true,
        },
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const returnRows = await tx.jobPartAllocationMovement.findMany({
    where: { companyId: ctx.companyId, allocationId: allocation.id, kind: "RETURN" },
    include: {
      stockMovement: {
        select: { id: true, reversalOfId: true },
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const returnedBySource = new Map<string, Prisma.Decimal>();
  for (const row of returnRows) {
    const sourceId = row.stockMovement?.reversalOfId;
    if (!sourceId) continue;
    returnedBySource.set(sourceId, (returnedBySource.get(sourceId) ?? new Prisma.Decimal(0)).plus(row.quantity));
  }

  const eligibleSources = issueRows
    .map((row) => {
      const stockMovement = (row as typeof row & { stockMovement: NonNullable<typeof row.stockMovement> }).stockMovement;
      if (!stockMovement) throw new Error("ALLOCATION_ISSUE_LINK_MISSING_STOCK_MOVEMENT");
      const issuedQty = new Prisma.Decimal(row.quantity);
      const alreadyReturned = returnedBySource.get(stockMovement.id) ?? new Prisma.Decimal(0);
      const eligibleQty = issuedQty.minus(alreadyReturned);
      return {
        jobMovementId: row.id,
        sourceMovementId: stockMovement.id,
        eligibleQty,
      };
    })
    .filter((row) => row.eligibleQty.gt(0));

  const totalEligible = eligibleSources.reduce((sum, row) => sum.plus(row.eligibleQty), new Prisma.Decimal(0));
  if (totalEligible.lt(qtyRequested)) throw new Error("RETURN_EXCEEDS_ELIGIBLE_ISSUED");

  let remaining = qtyRequested;
  const createdMovementIds: string[] = [];
  const createdJobMovementIds: string[] = [];

  for (const source of eligibleSources) {
    if (remaining.lte(0)) break;
    const splitQty = source.eligibleQty.lt(remaining) ? source.eligibleQty : remaining;
    const childIdempotencyKey = input.idempotencyKey ? `${input.idempotencyKey}:${source.sourceMovementId}` : undefined;

    const returned = await returnStockTx(tx, ctx, {
      partId: allocation.partId,
      locationId: allocation.locationId,
      quantity: splitQty.toString(),
      sourceMovementId: source.sourceMovementId,
      notes: input.notes ?? null,
      idempotencyKey: childIdempotencyKey,
    });

    const link = await tx.jobPartAllocationMovement.upsert({
      where: {
        allocationId_stockMovementId_kind: {
          allocationId: allocation.id,
          stockMovementId: returned.movementId,
          kind: "RETURN",
        },
      },
      update: { returnDisposition: input.disposition },
      create: {
        companyId: ctx.companyId,
        allocationId: allocation.id,
        stockMovementId: returned.movementId,
        kind: "RETURN",
        quantity: splitQty,
        returnDisposition: input.disposition,
      },
    });

    createdMovementIds.push(returned.movementId);
    createdJobMovementIds.push(link.id);
    remaining = remaining.minus(splitQty);
  }

  await addActivity(tx, ctx, jobId, "PART_RETURNED", `${input.quantity} × ${allocation.part.partNumber} returned to ${allocation.location.code || allocation.location.name}.`, {
    allocationId: allocation.id,
    stockMovementIds: createdMovementIds,
    jobPartAllocationMovementIds: createdJobMovementIds,
    quantity: input.quantity,
    returnDisposition: input.disposition,
    splitCount: createdMovementIds.length,
  });

  return {
    replayed: false,
    movementId: createdMovementIds[0]!,
    movementIds: createdMovementIds,
    jobPartAllocationMovementId: createdJobMovementIds[0]!,
    jobPartAllocationMovementIds: createdJobMovementIds,
  };
}

export async function returnJobAllocationStock(ctx: RequestContext, jobId: string, allocationId: string, raw: unknown) {
  const companyId = requireJobs(ctx, "JOBS_EDIT");
  requireTenantPermission(ctx, "INVENTORY_RETURN");
  requireModule(ctx, "INVENTORY", "WRITE");
  const input = jobPartReturnInput.parse(raw);

  const allocation = await prisma.jobPartAllocation.findFirst({
    where: { id: allocationId, companyId, jobId },
    include: {
      requirement: { select: { id: true, active: true } },
      part: { select: { partNumber: true } },
      location: { select: { id: true, code: true, name: true } },
    },
  });
  if (!allocation || !allocation.requirement.active) notFound();

  const result = await prisma.$transaction((tx) => returnJobAllocationStockTx(tx, ctx as RequestContext & { companyId: string }, jobId, allocation, input));

  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "JobPartAllocation", entityId: allocationId, action: "RETURN", afterData: { jobId, allocationId, stockMovementIds: result.movementIds, quantity: input.quantity, disposition: input.disposition, idempotencyKey: input.idempotencyKey ?? null, splitCount: result.movementIds.length } });
  return result;
}

export async function releaseJobAllocationReservation(ctx: RequestContext, jobId: string, allocationId: string, raw: unknown) {
  const companyId = requireJobs(ctx, "JOBS_EDIT");
  requireTenantPermission(ctx, "INVENTORY_RELEASE_RESERVATION");
  requireModule(ctx, "INVENTORY", "WRITE");
  const input = jobPartReleaseInput.parse(raw);

  const allocation = await prisma.jobPartAllocation.findFirst({
    where: { id: allocationId, companyId, jobId },
    include: {
      part: { select: { partNumber: true } },
      location: { select: { id: true, code: true, name: true } },
    },
  });
  if (!allocation || !allocation.stockReservationId) notFound();

  const result = await prisma.$transaction(async (tx) => {
    const released = await releaseReservationTx(tx, ctx as RequestContext & { companyId: string }, allocation.stockReservationId!, input);
    await addActivity(tx, ctx, jobId, "RESERVATION_RELEASED", `Remaining reservation released for ${allocation.part.partNumber} at ${allocation.location.code || allocation.location.name}.`, {
      allocationId,
      reservationId: allocation.stockReservationId,
      stockMovementId: released.movementId,
      reason: input.reason ?? null,
    });
    return released;
  });

  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "JobPartAllocation", entityId: allocationId, action: "RELEASE_RESERVATION", afterData: { jobId, allocationId, reservationId: allocation.stockReservationId, movementId: result.movementId, reason: input.reason ?? null } });
  return result;
}