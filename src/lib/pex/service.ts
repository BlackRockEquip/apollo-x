import { Prisma } from "@prisma/client";
import type { RequestContext } from "@/lib/auth/context-types";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit/service";
import { StockError } from "@/lib/http/errors";
import { prisma } from "@/lib/prisma";
import { allocateDocumentNumberTx } from "@/lib/master-data/service";
import {
  pexInventoryListQuery,
  pexLinkReturnJobInput,
  pexNotesUpdateInput,
  pexScrapInput,
  pexTrackingListQuery,
  pexUnlinkedReturnJobsQuery,
} from "@/lib/pex/validation";

type Tx = Prisma.TransactionClient;
type JobStatus = Prisma.JobGetPayload<{ select: { status: true } }>["status"];
type JobType = Prisma.JobGetPayload<{ select: { type: true } }>["type"];
type JobActivityType = Prisma.JobActivityGetPayload<{ select: { type: true } }>["type"];
type PexStatus = Prisma.PexRecordGetPayload<{ select: { status: true } }>["status"];
type ScopedJob = Prisma.JobGetPayload<Record<string, never>>;

function requirePexStockRead(ctx: RequestContext) {
  requireModule(ctx, "PEX_STOCK", "READ");
  requireTenantPermission(ctx, "PEX_STOCK_VIEW");
  return ctx.companyId!;
}

function requirePexTrackingRead(ctx: RequestContext) {
  requireModule(ctx, "PEX_TRACKING", "READ");
  requireTenantPermission(ctx, "PEX_TRACKING_VIEW");
  return ctx.companyId!;
}

function requirePexHistoryRead(ctx: RequestContext) {
  for (const attempt of [requirePexStockRead, requirePexTrackingRead, (c: RequestContext) => { requireModule(c, "JOBS_WIP", "READ"); requireTenantPermission(c, "JOBS_VIEW"); return c.companyId!; }]) {
    try { return attempt(ctx); } catch { /* try the next view that can reach this */ }
  }
  // None of them passed: re-run the original gate so the caller gets its normal error.
  return requirePexStockRead(ctx);
}


// Every mutating PEX action lives conceptually "under" the job page's PEX
// section, regardless of which of the two list pages (PEX Stock/PEX
// Tracking) happens to surface the resulting record — so, unlike the old
// PexStockUnit/PexSupplyLink service, writes are gated uniformly through
// the PEX_STOCK module rather than split by action. Tenant permission
// names are reused unchanged from the retired PexStockUnit/PexSupplyLink
// permission set (see permissions.ts) rather than adding new ones, since
// their original meanings map cleanly onto the new, smaller action surface
// (PEX_SUPPLY_LINK -> "Link PEX return job", PEX_SUPPLY_CREATE -> "Create
// linked return job now" / "Send to PEX Inventory", PEX_SUPPLY_EDIT ->
// unlink / notes, PEX_STOCK_SCRAP -> "Scrap unit"). PEX_STOCK_TRANSFER_IN
// was revived 2026-10-05 for "Send to PEX Inventory" (see
// allocateJobToPexInventory) so it can be limited to Admins/Managers.
// PEX_STOCK_EDIT, PEX_STOCK_QUARANTINE, PEX_RETURN_RECEIVE and
// PEX_CHAIN_RELINK are now unused dead permission names — the storage-
// location/quarantine/core-mismatch concepts they gated don't exist in
// ModApp's PexRecord model this replaces.
function requirePexWrite(ctx: RequestContext, permission: "PEX_SUPPLY_CREATE" | "PEX_SUPPLY_LINK" | "PEX_SUPPLY_EDIT" | "PEX_STOCK_SCRAP" | "PEX_STOCK_TRANSFER_IN") {
  requireModule(ctx, "PEX_STOCK", "WRITE");
  requireTenantPermission(ctx, permission);
  return ctx.companyId!;
}

function notFound(): never {
  throw new Error("NOT_FOUND");
}

async function requireScopedJob(tx: Tx, companyId: string, id: string): Promise<ScopedJob> {
  const job = await tx.job.findFirst({ where: { id, companyId } });
  if (!job) notFound();
  return job;
}

async function addActivity(tx: Tx, ctx: RequestContext, jobId: string, type: JobActivityType, description: string, metadata?: Prisma.InputJsonValue) {
  await tx.jobActivity.create({ data: { companyId: ctx.companyId!, jobId, type, description, metadata, actorId: ctx.userId } });
}

// ---------------------------------------------------------------------------
// Job-lifecycle hooks — called from src/lib/jobs/service.ts, not from any
// API route directly. Every one is a safe no-op for a job this doesn't
// apply to, matching ModApp's own "just call it unconditionally" shape for
// syncPexConsumption/the PEX block inside updateJobStatus.
// ---------------------------------------------------------------------------

// 2026-10-07 — user report (job BRE1135): "status is moved to delivered
// awaiting payment but pex status still shows to be delivered". A PEX Supply
// unit counts as delivered once its Delivery date is filled in OR the job's
// own status says it has gone out (Delivered awaiting payment, Complete,
// Closed) — previously only the date counted, so moving the status stepper
// past delivery without also filling the date left the record on "To be
// delivered". Every place that picks between TO_BE_DELIVERED and AWAIT_CORE
// goes through this one rule.
const DELIVERED_JOB_STATUSES: JobStatus[] = ["DELIVERED_AWAITING_PAYMENT", "COMPLETE", "CLOSED"];
export function pexSupplyDeliveredStatus(job: { deliveryDate: Date | null; status?: JobStatus | string | null }): PexStatus {
  return job.deliveryDate || (job.status && DELIVERED_JOB_STATUSES.includes(job.status as JobStatus)) ? "AWAIT_CORE" : "TO_BE_DELIVERED";
}

// 2026-10-09 — user request: "if a pex supply is delivered but still
// awaiting payment status, the pex supply date can still be allocated to
// table". PEX Tracking's Supply date column used to stay blank until a
// return job was linked (that is when the date was first written). It now
// fills in as soon as the supply counts as delivered (see
// pexSupplyDeliveredStatus): the job's Delivery date when there is one,
// otherwise the date it was first seen as delivered. A supply that is not
// delivered (yet, or any more) has no supply date.
export function pexSupplyDateFor(job: { deliveryDate: Date | null; status?: JobStatus | string | null }, existing: Date | null): Date | null {
  if (pexSupplyDeliveredStatus(job) === "TO_BE_DELIVERED") return null;
  return job.deliveryDate ?? existing ?? new Date();
}

function sameInstant(a: Date | null, b: Date | null) {
  return (a ? a.getTime() : null) === (b ? b.getTime() : null);
}

// Mirrors ModApp's inline "if (jobType === PEX_SUPPLY) { create a PexRecord
// if one doesn't already exist }" — done at job creation and, separately,
// whenever a save changes an existing job's type to PEX_SUPPLY. Makes the
// unit visible on PEX Tracking the moment the supply job exists, not only
// once a return job gets linked to it.
export async function createPexRecordForSupplyJob(
  tx: Tx,
  ctx: RequestContext,
  companyId: string,
  job: { id: string; type: JobType; customerId: string; component: string | null; componentType: string | null; deliveryDate: Date | null; status?: JobStatus | string | null },
) {
  if (job.type !== "PEX_SUPPLY") return;
  const existing = await tx.pexRecord.findFirst({ where: { companyId, supplyJobId: job.id } });
  if (existing) return;
  await tx.pexRecord.create({
    data: {
      companyId,
      customerId: job.customerId,
      unitDescription: job.componentType ?? job.component ?? null,
      supplyJobId: job.id,
      // Covers the (unusual but possible) case of a save that changes an
      // EXISTING job's type to PEX_SUPPLY when it already has a delivery
      // date on file — see syncPexAwaitCoreFromDeliveryDate below for the
      // normal, far more common path (deliveryDate set on an already-PEX
      // job later).
      status: pexSupplyDeliveredStatus(job),
      supplyDate: pexSupplyDateFor(job, null),
      createdById: ctx.userId,
      updatedById: ctx.userId,
    },
  });
}

// Keeps a PEX Supply job's PexRecord status in step with whether the unit
// has actually been delivered yet, independent of the job's own status
// stepper — deliveryDate is a plain form field (Commercial & logistics
// panel), not tied to any particular job-status stage, so it can change
// without any job-status transition happening alongside it. At the user's
// direct request: "when a pex supply has a delivery date its status says
// to be delivered still, this needs to change to await core." Once
// delivered, what's actually still being waited on is the customer
// returning their old core unit, not delivery — so the record now shows
// AWAIT_CORE instead of staying on TO_BE_DELIVERED indefinitely. Only
// touches a record that hasn't been linked to a return job yet (once
// linked, attachReturnJobTx takes over deriving status from the return
// job's own progress) and isn't SCRAPPED (a deliberate terminal state a
// delivery-date save should never second-guess). Called unconditionally on
// every job create/save, same pattern as syncPexRedeployment.
export async function syncPexAwaitCoreFromDeliveryDate(
  tx: Tx,
  ctx: RequestContext,
  companyId: string,
  job: { id: string; type: JobType; deliveryDate: Date | null; status?: JobStatus | string | null },
) {
  if (job.type !== "PEX_SUPPLY") return;
  const pexAsSupply = await tx.pexRecord.findFirst({ where: { companyId, supplyJobId: job.id } });
  if (!pexAsSupply || pexAsSupply.returnJobId || pexAsSupply.status === "SCRAPPED") return;
  const desired: PexStatus = pexSupplyDeliveredStatus(job);
  const desiredDate = pexSupplyDateFor(job, pexAsSupply.supplyDate);
  if (pexAsSupply.status !== desired || !sameInstant(pexAsSupply.supplyDate, desiredDate)) {
    await tx.pexRecord.update({ where: { id: pexAsSupply.id }, data: { status: desired, supplyDate: desiredDate, updatedById: ctx.userId } });
  }
}

// Mirrors ModApp's syncPexConsumption exactly (down to the self-correcting
// "field changed or was cleared" branch) — called on EVERY job create/save,
// not just PEX-typed ones, since redeployment is driven purely by whatever
// text is in THIS job's own "Previous job number" field. Keeps
// PexRecord.consumedByJobId/consumedAt in step with it: typing in a
// completed PEX return job's number marks that unit "redeployed" (dropping
// it out of PEX Inventory's "Ready to Go" list); changing or clearing the
// field releases whatever it previously claimed back to available.
export async function syncPexRedeployment(
  tx: Tx,
  ctx: RequestContext,
  companyId: string,
  job: { id: string; previousJobNumber: string | null },
) {
  const currentlyConsumed = await tx.pexRecord.findFirst({
    where: { companyId, consumedByJobId: job.id },
    include: { returnJob: { select: { jobNumber: true } } },
  });

  if (currentlyConsumed && currentlyConsumed.returnJob?.jobNumber === job.previousJobNumber) {
    return; // already linked to the right unit, nothing to do
  }

  if (currentlyConsumed) {
    await tx.pexRecord.update({ where: { id: currentlyConsumed.id }, data: { consumedByJobId: null, consumedAt: null, updatedById: ctx.userId } });
  }

  if (!job.previousJobNumber) return;

  // Only a completed ("Ready to Go") return job counts as an available
  // unit to redeploy — and only if nothing else has already claimed it.
  const candidate = await tx.pexRecord.findFirst({
    where: { companyId, consumedByJobId: null, returnJob: { jobNumber: job.previousJobNumber, status: "COMPLETE" } },
  });

  if (candidate && candidate.returnJobId !== job.id) {
    await tx.pexRecord.update({ where: { id: candidate.id }, data: { consumedByJobId: job.id, consumedAt: new Date(), updatedById: ctx.userId } });
  }
}

// Maps a PEX return job's own generic status onto the PEX lifecycle, purely
// so the PexRecord row (and both list pages, which group/filter by it)
// makes sense — there's no separate user-facing PEX-status control, it's
// derived automatically here. Mirrors ModApp's JOB_STATUS_TO_PEX_STATUS.
// Only the main-workshop flow's real step list is covered (a PEX_RETURN
// job is never field-service) — CANCELLED/RETURNED_UNREPAIRED and
// every field-service-only status intentionally have no entry, so
// syncPexStatusFromJobStatus below leaves the PexRecord's status exactly
// as it was for those, the same as ModApp's mapping simply never being
// consulted for a status a PEX job can't actually reach.
// Exported (2026-09-10) so scripts/repair-pex-record-status.ts can reuse
// this exact mapping to recompute already-stored PexRecord rows rather than
// keeping a second, driftable copy of it.
export const JOB_STATUS_TO_PEX_STATUS: Partial<Record<JobStatus, PexStatus>> = {
  TO_BE_COLLECTED: "OUTSTANDING",
  TO_BE_RECEIVED: "OUTSTANDING",
  TO_STRIP: "RECEIVED",
  STRIPPING: "IN_REPAIR",
  QUOTE_IN_PROGRESS: "IN_REPAIR",
  AWAITING_GO_AHEAD: "IN_REPAIR",
  AWAIT_OUTWORK: "IN_REPAIR",
  WAITING_FOR_PARTS: "IN_REPAIR",
  ASSEMBLY: "IN_REPAIR",
  TESTING: "IN_REPAIR",
  TO_PAINT_WRAP: "IN_REPAIR",
  TO_BE_DELIVERED: "IN_REPAIR",
  DELIVERED_AWAITING_PAYMENT: "IN_REPAIR",
  COMPLETE: "COMPLETED",
  // Not part of the ordered stepper, but reachable via the separate
  // "Close job" action once a job is COMPLETE — treated the same as
  // COMPLETE rather than left unmapped, so closing a finished PEX return
  // job doesn't leave its PexRecord looking unfinished.
  CLOSED: "COMPLETED",
};

// Shared by createAndAttachReturnJobTx (new return job) and linkPexReturnJob
// (an existing standalone job) — sets the PexRecord's returnJobId/status/
// supplyDate and keeps the return job's "Previous job number" pointing back
// at the supply job, exactly like ModApp's createLinkedPexReturnJob /
// linkPexReturnJob both do.
async function attachReturnJobTx(
  tx: Tx,
  ctx: RequestContext,
  companyId: string,
  supplyJob: ScopedJob,
  returnJob: ScopedJob,
  pexAsSupply: { id: string; supplyDate: Date | null; returnDate: Date | null } | null,
) {
  const supplyDate = pexAsSupply?.supplyDate ?? supplyJob.deliveryDate ?? supplyJob.dateReceived ?? supplyJob.createdAt;
  const unitDescription = supplyJob.componentType ?? supplyJob.component ?? null;
  // Derive the PexRecord's status from the return job's OWN current status
  // (same JOB_STATUS_TO_PEX_STATUS mapping syncPexStatusFromJobStatus uses)
  // instead of hardcoding OUTSTANDING. For the automatic "create a
  // brand-new return job" path (createAndAttachReturnJobTx) this still
  // computes OUTSTANDING, since a freshly created return job's status is
  // always TO_BE_RECEIVED, which maps to OUTSTANDING anyway — no behavior
  // change there. It matters for "Link PEX return job", which attaches an
  // ALREADY-EXISTING PEX_RETURN job: that job may already be further along
  // the workshop flow (received, being stripped, etc.) by the time someone
  // gets around to linking it, and hardcoding OUTSTANDING was leaving the
  // PexRecord (and so PEX Tracking's Status column) showing "Outstanding" —
  // i.e. still awaited back from the client — for a unit that had, in
  // reality, already been received and was being worked on.
  const status = JOB_STATUS_TO_PEX_STATUS[returnJob.status] ?? "OUTSTANDING";
  // Same "first time it moves off outstanding is the moment it actually
  // came back" rule syncPexStatusFromJobStatus uses — a return job linked
  // in already past that stage should get a returnDate backfilled too,
  // rather than leaving it blank until its next status change.
  const returnDate = pexAsSupply?.returnDate ?? (status !== "OUTSTANDING" ? new Date() : null);

  if (pexAsSupply) {
    await tx.pexRecord.update({
      where: { id: pexAsSupply.id },
      data: { returnJobId: returnJob.id, unitDescription, status, supplyDate, returnDate, updatedById: ctx.userId },
    });
  } else {
    await tx.pexRecord.create({
      data: {
        companyId,
        customerId: supplyJob.customerId,
        unitDescription,
        supplyJobId: supplyJob.id,
        returnJobId: returnJob.id,
        status,
        supplyDate,
        returnDate,
        createdById: ctx.userId,
        updatedById: ctx.userId,
      },
    });
  }

  if (returnJob.previousJobNumber !== supplyJob.jobNumber) {
    await tx.job.update({ where: { id: returnJob.id }, data: { previousJobNumber: supplyJob.jobNumber, updatedById: ctx.userId } });
  }

  await addActivity(tx, ctx, supplyJob.id, "PEX_RETURN_LINKED", `PEX return job ${returnJob.jobNumber ?? returnJob.draftNumber} linked.`, { returnJobId: returnJob.id });
  await addActivity(tx, ctx, returnJob.id, "PEX_RETURN_LINKED", `Linked as the PEX return job for supply job ${supplyJob.jobNumber ?? supplyJob.draftNumber}.`, { supplyJobId: supplyJob.id });
}

// Creates the return job itself, then attaches it — shared by the
// "Create linked return job now" button and the automatic trigger inside
// syncPexStatusFromJobStatus (a PEX supply job reaching Complete). Numbers
// and activates the job immediately (status TO_BE_RECEIVED),
// matching ModApp's own return jobs.
async function createAndAttachReturnJobTx(
  tx: Tx,
  ctx: RequestContext,
  companyId: string,
  supplyJob: ScopedJob,
  pexAsSupply: { id: string; supplyDate: Date | null; returnDate: Date | null } | null,
) {
  const jobNumber = await allocateDocumentNumberTx(tx, ctx, "PEX_JOB");
  const returnJob = await tx.job.create({
    data: {
      companyId,
      jobNumber,
      status: "TO_BE_RECEIVED",
      type: "PEX_RETURN",
      customerId: supplyJob.customerId,
      customerReference: supplyJob.customerReference,
      customerPo: supplyJob.customerPo,
      machineMake: supplyJob.machineMake,
      machineModel: supplyJob.machineModel,
      machineSerial: supplyJob.machineSerial,
      component: supplyJob.component,
      componentType: supplyJob.componentType,
      componentSerial: supplyJob.componentSerial,
      componentPartNumber: supplyJob.componentPartNumber,
      description: `PEX return for supply job ${supplyJob.jobNumber ?? supplyJob.draftNumber}.`,
      previousJobNumber: supplyJob.jobNumber,
      createdById: ctx.userId,
      updatedById: ctx.userId,
    },
  });
  if (returnJob.component) {
    await tx.jobComponent.create({
      data: {
        companyId,
        jobId: returnJob.id,
        component: returnJob.component,
        componentType: returnJob.componentType,
        componentSerial: returnJob.componentSerial,
        componentPartNumber: returnJob.componentPartNumber,
      },
    });
  }
  await addActivity(tx, ctx, returnJob.id, "JOB_CREATED", `PEX return job ${jobNumber} created, linked to supply job ${supplyJob.jobNumber ?? supplyJob.draftNumber}.`, { jobNumber, supplyJobId: supplyJob.id });
  await attachReturnJobTx(tx, ctx, companyId, supplyJob, returnJob, pexAsSupply);
  return returnJob;
}

// Called from jobs/service.ts whenever a job's status actually changes
// (changeJobStatus, updateJob when it includes a status change, createJob,
// closeJob, reopenJob) — safe/no-op for any job
// that isn't currently a linked PEX return job, or an unlinked PEX supply
// job. Mirrors the PEX block inside ModApp's updateJobStatus.
export async function syncPexStatusFromJobStatus(
  tx: Tx,
  ctx: RequestContext,
  companyId: string,
  job: { id: string; deliveryDate: Date | null },
  nextStatus: JobStatus,
) {
  const pexAsReturn = await tx.pexRecord.findFirst({ where: { companyId, returnJobId: job.id } });
  if (pexAsReturn) {
    const mapped = JOB_STATUS_TO_PEX_STATUS[nextStatus];
    if (!mapped) return;
    await tx.pexRecord.update({
      where: { id: pexAsReturn.id },
      data: {
        status: mapped,
        // First time it moves off "outstanding" (still with the client) is
        // the moment the unit actually came back — record that once, don't
        // keep overwriting it on every later stage change.
        returnDate: !pexAsReturn.returnDate && mapped !== "OUTSTANDING" ? new Date() : undefined,
        updatedById: ctx.userId,
      },
    });
    return;
  }

  const pexAsSupply = await tx.pexRecord.findFirst({ where: { companyId, supplyJobId: job.id } });
  if (pexAsSupply && !pexAsSupply.returnJobId && pexAsSupply.status !== "SCRAPPED") {
    if (nextStatus === "COMPLETE") {
      // Completing the supply job is the moment the unit is actually out
      // the door with the client — create the return job right here
      // automatically rather than waiting on a separate manual click.
      const supplyJob = await requireScopedJob(tx, companyId, job.id);
      await createAndAttachReturnJobTx(tx, ctx, companyId, supplyJob, pexAsSupply);
    } else {
      // Respects deliveryDate rather than always resetting to
      // TO_BE_DELIVERED — a supply job's status can change (e.g. moving
      // through the normal stepper, or Reopen) without touching delivery
      // at all, and if the unit's already been delivered this needs to
      // land on AWAIT_CORE, not regress the record back to "not delivered
      // yet". See syncPexAwaitCoreFromDeliveryDate's own comment for the
      // full reasoning — same rule, applied here too since a status change
      // is a save just like any other.
      const desired: PexStatus = pexSupplyDeliveredStatus({ deliveryDate: job.deliveryDate, status: nextStatus });
      const desiredDate = pexSupplyDateFor({ deliveryDate: job.deliveryDate, status: nextStatus }, pexAsSupply.supplyDate);
      if (pexAsSupply.status !== desired || !sameInstant(pexAsSupply.supplyDate, desiredDate)) {
        await tx.pexRecord.update({ where: { id: pexAsSupply.id }, data: { status: desired, supplyDate: desiredDate, updatedById: ctx.userId } });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// API-facing actions — one per button/form on the job page's PEX section.
// ---------------------------------------------------------------------------

// "Create linked return job now" — for linking early, before the supply
// job reaches Complete (which would otherwise create it automatically).
export async function createPexReturnJob(ctx: RequestContext, supplyJobId: string) {
  const companyId = requirePexWrite(ctx, "PEX_SUPPLY_CREATE");
  const result = await prisma.$transaction(async (tx) => {
    const supplyJob = await requireScopedJob(tx, companyId, supplyJobId);
    if (supplyJob.type !== "PEX_SUPPLY") throw new StockError("INVALID_JOB_TYPE", "Only a PEX Supply job can have a linked return job created for it.");
    const pexAsSupply = await tx.pexRecord.findFirst({ where: { companyId, supplyJobId: supplyJob.id } });
    if (pexAsSupply?.returnJobId) throw new StockError("PEX_ALREADY_LINKED", "This job is already linked to a return job.");
    return createAndAttachReturnJobTx(tx, ctx, companyId, supplyJob, pexAsSupply);
  });
  await recordAudit(ctx, { source: "UI", module: "PEX_STOCK", entityType: "Job", entityId: result.id, action: "PEX_CREATE_LINKED_RETURN", afterData: { supplyJobId, returnJobId: result.id } });
  return result;
}

// "Link PEX return job" — matches up an already-existing standalone
// PEX_RETURN job (created by hand through New Job, instead of the button
// above) to this supply job, same mistake-recovery case ModApp's own
// linkPexReturnJob exists for.
export async function linkPexReturnJob(ctx: RequestContext, supplyJobId: string, raw: unknown) {
  const companyId = requirePexWrite(ctx, "PEX_SUPPLY_LINK");
  const input = pexLinkReturnJobInput.parse(raw);
  const result = await prisma.$transaction(async (tx) => {
    const supplyJob = await requireScopedJob(tx, companyId, supplyJobId);
    if (supplyJob.type !== "PEX_SUPPLY") throw new StockError("INVALID_JOB_TYPE", "Only a PEX Supply job can be linked to a return job.");
    if (input.returnJobId === supplyJob.id) throw new StockError("INVALID_JOB_TYPE", "A job can't be linked to itself.");
    const pexAsSupply = await tx.pexRecord.findFirst({ where: { companyId, supplyJobId: supplyJob.id } });
    if (pexAsSupply?.returnJobId) throw new StockError("PEX_ALREADY_LINKED", "This job is already linked to a return job.");
    const returnJob = await requireScopedJob(tx, companyId, input.returnJobId);
    if (returnJob.type !== "PEX_RETURN") throw new StockError("INVALID_JOB_TYPE", "Only a PEX Return job can be linked as a return job.");
    const alreadyLinkedElsewhere = await tx.pexRecord.findFirst({ where: { companyId, returnJobId: returnJob.id } });
    if (alreadyLinkedElsewhere) throw new StockError("PEX_ALREADY_LINKED", "That job is already linked as a return job elsewhere.");
    await attachReturnJobTx(tx, ctx, companyId, supplyJob, returnJob, pexAsSupply);
    const record = await tx.pexRecord.findFirst({ where: { companyId, supplyJobId: supplyJob.id } });
    if (!record) notFound();
    return record;
  });
  await recordAudit(ctx, { source: "UI", module: "PEX_STOCK", entityType: "PexRecord", entityId: result.id, action: "PEX_LINK_RETURN", afterData: { supplyJobId, returnJobId: input.returnJobId } });
  return { ok: true };
}

// "Unlink" — undoes the two actions above, letting a mistake (wrong job
// picked, or the wrong job auto-created) be corrected without deleting the
// supply job itself. Only unwinds the supply side of the pairing — the
// return job row is left exactly as it was otherwise (still exists, still
// on whatever status it's on), just free to be re-linked or left standing
// on its own. Resets the PexRecord to whatever a not-yet-linked supply job
// with this same delivery state looks like — TO_BE_DELIVERED if it hasn't
// been delivered, AWAIT_CORE if it has (same rule as
// syncPexAwaitCoreFromDeliveryDate; unlinking doesn't touch the supply
// job's own deliveryDate, so the reset should reflect it, not blindly
// regress to "not delivered").
export async function unlinkPexReturnJob(ctx: RequestContext, supplyJobId: string) {
  const companyId = requirePexWrite(ctx, "PEX_SUPPLY_EDIT");
  const result = await prisma.$transaction(async (tx) => {
    const supplyJob = await requireScopedJob(tx, companyId, supplyJobId);
    const pexAsSupply = await tx.pexRecord.findFirst({ where: { companyId, supplyJobId: supplyJob.id } });
    if (!pexAsSupply?.returnJobId) throw new StockError("PEX_NOT_LINKED", "This job isn't linked to a return job.");
    const returnJob = await tx.job.findFirst({ where: { id: pexAsSupply.returnJobId, companyId } });
    const resetStatus: PexStatus = pexSupplyDeliveredStatus(supplyJob);
    await tx.pexRecord.update({ where: { id: pexAsSupply.id }, data: { returnJobId: null, status: resetStatus, supplyDate: pexSupplyDateFor(supplyJob, pexAsSupply.supplyDate), updatedById: ctx.userId } });
    if (returnJob && returnJob.previousJobNumber === supplyJob.jobNumber) {
      await tx.job.update({ where: { id: returnJob.id }, data: { previousJobNumber: null, updatedById: ctx.userId } });
    }
    await addActivity(tx, ctx, supplyJob.id, "PEX_RETURN_UNLINKED", `Return job ${returnJob?.jobNumber ?? returnJob?.draftNumber ?? ""} unlinked.`.trim(), { returnJobId: pexAsSupply.returnJobId });
    if (returnJob) await addActivity(tx, ctx, returnJob.id, "PEX_RETURN_UNLINKED", `Unlinked from supply job ${supplyJob.jobNumber ?? supplyJob.draftNumber}.`, { supplyJobId: supplyJob.id });
    return { pexId: pexAsSupply.id, returnJobId: pexAsSupply.returnJobId };
  });
  await recordAudit(ctx, { source: "UI", module: "PEX_STOCK", entityType: "PexRecord", entityId: result.pexId, action: "PEX_UNLINK_RETURN", afterData: { supplyJobId, returnJobId: result.returnJobId } });
  return { ok: true };
}

// PEX notes field, on either side of the pairing.
export async function updatePexRecordNotes(ctx: RequestContext, pexId: string, raw: unknown) {
  const companyId = requirePexWrite(ctx, "PEX_SUPPLY_EDIT");
  const input = pexNotesUpdateInput.parse(raw);
  const pex = await prisma.pexRecord.findFirst({ where: { id: pexId, companyId } });
  if (!pex) notFound();
  const updated = await prisma.pexRecord.update({ where: { id: pex.id }, data: { notes: input.notes ?? null, updatedById: ctx.userId } });
  await recordAudit(ctx, { source: "UI", module: "PEX_STOCK", entityType: "PexRecord", entityId: updated.id, action: "PEX_UPDATE_NOTES", afterData: { notes: input.notes ?? null } });
  return updated;
}

// "Scrap unit" — a returned unit beyond repair, written off rather than
// left sitting forever in "To be repaired". Drops it out of PEX Inventory
// (see listPexInventory's `status: { not: "SCRAPPED" }` filter); nothing is
// deleted, so history stays intact for auditing. `reason` required, and
// gets logged both as a job note on the return job and in the unit's own
// history feed.
export async function scrapPexRecord(ctx: RequestContext, pexId: string, raw: unknown) {
  const companyId = requirePexWrite(ctx, "PEX_STOCK_SCRAP");
  const input = pexScrapInput.parse(raw);
  const result = await prisma.$transaction(async (tx) => {
    const pex = await tx.pexRecord.findFirst({ where: { id: pexId, companyId }, include: { returnJob: true, supplyJob: true } });
    if (!pex) notFound();
    if (pex.consumedByJobId) throw new StockError("PEX_ALREADY_CONSUMED", "This unit has already been redeployed to another job — it can't be scrapped.");
    if (pex.status === "SCRAPPED") return pex;
    const noteLine = `Scrapped — removed from PEX Inventory: ${input.reason}`;
    const updated = await tx.pexRecord.update({ where: { id: pex.id }, data: { status: "SCRAPPED", updatedById: ctx.userId } });
    if (pex.returnJob) {
      await tx.jobNote.create({ data: { companyId, jobId: pex.returnJob.id, note: noteLine, createdById: ctx.userId } });
      await addActivity(tx, ctx, pex.returnJob.id, "PEX_UNIT_SCRAPPED", noteLine, { pexId: pex.id, reason: input.reason });
    }
    if (pex.supplyJob) await addActivity(tx, ctx, pex.supplyJob.id, "PEX_UNIT_SCRAPPED", noteLine, { pexId: pex.id, reason: input.reason });
    return updated;
  });
  await recordAudit(ctx, { source: "UI", module: "PEX_STOCK", entityType: "PexRecord", entityId: result.id, action: "PEX_SCRAP", afterData: { reason: input.reason } });
  return { ok: true };
}

export const PEX_ALLOCATE_BLOCKED_STATUSES: string[] = ["TO_BE_COLLECTED", "TO_BE_RECEIVED", "CANCELLED"];

// "Send job to PEX Inventory" — any completed job of ANY type, not
// otherwise part of a PEX supply/return cycle, can be allocated straight
// to PEX Inventory: the job itself becomes the "return" record, no supply
// leg at all. Mirrors ModApp's allocateJobToPexInventory.
export async function allocateJobToPexInventory(ctx: RequestContext, jobId: string) {
  // 2026-10-05 — user request: "make the convert to Pex stock button
  // visible no matter what status type, reasoning is even if a job is
  // being repaired, it can still become pex stock" + "only for admins and
  // managers". Was PEX_SUPPLY_CREATE (Admin-only by default) and gated on
  // Delivered - awaiting payment. Now gated on PEX_STOCK_TRANSFER_IN — a
  // previously unused permission, granted to COMPANY_ADMIN (all) and MANAGER
  // by default in permissions.ts, adjustable per user like any other.
  const companyId = requirePexWrite(ctx, "PEX_STOCK_TRANSFER_IN");
  const result = await prisma.$transaction(async (tx) => {
    const job = await requireScopedJob(tx, companyId, jobId);
    // Any status where the unit is physically in the workshop is allowed,
    // including mid-repair (PEX Stock already lists those under "To be
    // repaired"; only COMPLETE units are ever matched for redeployment, see
    // the "Previous job number" lookup above). Excluded: statuses where the
    // unit hasn't arrived (TO_BE_COLLECTED, TO_BE_RECEIVED — PEX
    // Stock's listing hides TO_BE_RECEIVED returns, so allocating then
    // would recreate the "allocated but not showing" report from
    // 2026-09-16) and CANCELLED.
    if (PEX_ALLOCATE_BLOCKED_STATUSES.includes(job.status)) throw new StockError("JOB_NOT_ELIGIBLE", "This job's unit hasn't been received yet (or the job is cancelled), so it can't be sent to PEX Inventory.");
const existing = await tx.pexRecord.findFirst({ where: { companyId, status: { not: "SCRAPPED" }, OR: [{ supplyJobId: job.id }, { returnJobId: job.id }] } });
    if (existing) throw new StockError("PEX_ALREADY_LINKED", "This job is already linked to a PEX record.");
    const created = await tx.pexRecord.create({
      data: {
        companyId,
        customerId: job.customerId,
        unitDescription: job.componentType ?? job.component ?? null,
        returnJobId: job.id,
        status: "COMPLETED",
        returnDate: new Date(),
        createdById: ctx.userId,
        updatedById: ctx.userId,
      },
    });
    await addActivity(tx, ctx, job.id, "PEX_UNIT_ALLOCATED_TO_INVENTORY", "Allocated directly to PEX Inventory.", { pexId: created.id });
    return created;
  });
  await recordAudit(ctx, { source: "UI", module: "PEX_STOCK", entityType: "PexRecord", entityId: result.id, action: "PEX_ALLOCATE_DIRECT", afterData: { jobId } });
  return result;
}

// 2026-10-05 — user request: "add a way to undo adding to pex if it was
// clicked by accident". Reverses allocateJobToPexInventory: deletes the
// directly-allocated PexRecord (returnJobId = this job, no supply job) so
// the job drops out of PEX Stock and can be sent again later. Deleted
// rather than marked SCRAPPED because a scrapped record would keep holding
// the job's unique returnJobId slot (PexRecord.returnJobId is @unique),
// which would make a later re-send fail. Refused once the unit has been
// redeployed to another job, and for records that belong to a supply/return
// chain (those are managed with Unlink, not this). The job's own activity
// feed keeps a line for it; PEX_RETURN_UNLINKED is reused as the activity
// type because JobActivityType is a database enum and this isn't worth a
// migration.
export async function undoAllocateJobToPexInventory(ctx: RequestContext, jobId: string) {
  const companyId = requirePexWrite(ctx, "PEX_STOCK_TRANSFER_IN");
  const result = await prisma.$transaction(async (tx) => {
    const job = await requireScopedJob(tx, companyId, jobId);
    const pex = await tx.pexRecord.findFirst({ where: { companyId, returnJobId: job.id, status: { not: "SCRAPPED" } } });
    if (!pex) throw new StockError("PEX_NOT_ALLOCATED", "This job isn't currently in PEX Inventory.");
    if (pex.supplyJobId) throw new StockError("PEX_IN_CHAIN", "This job is part of a PEX supply/return chain, not a direct allocation — unlink it from the supply job instead.");
    if (pex.consumedByJobId) throw new StockError("PEX_ALREADY_CONSUMED", "This unit has already been redeployed to another job, so it can't be taken back out of PEX Inventory.");
    await tx.pexRecord.delete({ where: { id: pex.id } });
    await addActivity(tx, ctx, job.id, "PEX_RETURN_UNLINKED", "Removed from PEX Inventory (undid \"Send to PEX Inventory\").", { pexId: pex.id });
    return pex;
  });
  await recordAudit(ctx, { source: "UI", module: "PEX_STOCK", entityType: "PexRecord", entityId: result.id, action: "PEX_ALLOCATE_UNDO", afterData: { jobId } });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Read/list actions — feed the job page's PEX section and both list pages.
// ---------------------------------------------------------------------------

// Options for the "Link PEX return job" search — every PEX_RETURN job in
// this company not already linked as a return job anywhere.
export async function listUnlinkedPexReturnJobs(ctx: RequestContext, raw: unknown) {
  const companyId = requirePexStockRead(ctx);
  const query = pexUnlinkedReturnJobsQuery.parse(raw);
  const contains = { contains: query.q, mode: "insensitive" as const };
  const items = await prisma.job.findMany({
    where: {
      companyId,
      type: "PEX_RETURN",
      pexAsReturn: { is: null },
      ...(query.q ? { OR: [{ jobNumber: contains }, { customer: { name: contains } }, { customer: { tradingName: contains } }] } : {}),
    },
    select: { id: true, jobNumber: true, draftNumber: true, customer: { select: { name: true, tradingName: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return { items };
}

// PEX Stock page — shows ModApp's "PEX Inventory" content: units that have
// physically come back and aren't out on a job yet.
export async function listPexInventory(ctx: RequestContext, raw: unknown) {
  const companyId = requirePexStockRead(ctx);
  const query = pexInventoryListQuery.parse(raw);
  const contains = { contains: query.q, mode: "insensitive" as const };
  const baseWhere: Prisma.PexRecordWhereInput = {
    companyId,
    returnJobId: { not: null },
    returnJob: { status: { not: "TO_BE_RECEIVED" } },
    consumedByJobId: null,
    status: { not: "SCRAPPED" },
  };
  const returnJobStatusFilter: Prisma.JobWhereInput =
    query.status === "READY"
      ? { status: "COMPLETE" }
      : query.status === "TO_BE_REPAIRED"
        ? { status: { notIn: ["TO_BE_RECEIVED", "COMPLETE"] } }
        : { status: { not: "TO_BE_RECEIVED" } };
  const where: Prisma.PexRecordWhereInput = {
    ...baseWhere,
    returnJob: returnJobStatusFilter,
    ...(query.q
      ? {
          OR: [
            { unitDescription: contains },
            { returnJob: { jobNumber: contains } },
            { returnJob: { machineMake: contains } },
            { returnJob: { machineModel: contains } },
            { supplyJob: { jobNumber: contains } },
          ],
        }
      : {}),
  };
  const [items, total, readyCount, totalCount] = await prisma.$transaction([
    prisma.pexRecord.findMany({
      where,
      include: {
        supplyJob: { select: { id: true, jobNumber: true, draftNumber: true } },
        returnJob: { select: { id: true, jobNumber: true, draftNumber: true, status: true, machineMake: true, machineModel: true, componentPartNumber: true } },
      },
      orderBy: [{ updatedAt: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.pexRecord.count({ where }),
    prisma.pexRecord.count({ where: { ...baseWhere, returnJob: { status: "COMPLETE" } } }),
    prisma.pexRecord.count({ where: baseWhere }),
  ]);
  return { items, total, page: query.page, pageSize: query.pageSize, readyCount, toBeRepairedCount: totalCount - readyCount, totalCount };
}

// PEX Tracking page — shows ModApp's "PEX Units" content: every PEX record
// with a supply leg, the full supply -> return cycle history.
export async function listPexTracking(ctx: RequestContext, raw: unknown) {
  const companyId = requirePexTrackingRead(ctx);
  const query = pexTrackingListQuery.parse(raw);
  const contains = { contains: query.q, mode: "insensitive" as const };
  // 2026-09-23, user request: "make the pex tracking status for
  // outstanding and awaiting core the same 'Awaiting Core'." Filtering by
  // either value now returns both — matches the merged label/tone in
  // StatusPill.tsx (see its own comment) and the combined stat card below.
  // The dropdown itself only offers "AWAIT_CORE" now (page.tsx dropped its
  // separate "Outstanding" option), but "OUTSTANDING" is handled the same
  // way too in case an old bookmarked/shared URL still has it.
  const statusFilter: Prisma.PexRecordWhereInput["status"] =
    query.status === "AWAIT_CORE" || query.status === "OUTSTANDING" ? { in: ["AWAIT_CORE", "OUTSTANDING"] } : (query.status as PexStatus);
  // 2026-10-09 — user request: "status that are complete should not show in
  // table". Every unit whose PEX status is Completed (its return job is
  // Complete or Closed) is left off the list, the status filter results and
  // the summary cards — no longer only the ones also redeployed on another
  // job (the 2026-10-08 rule). A unit that comes back into repair (its return
  // job is reopened) shows again. NOT (rather than a status condition) so it
  // still combines with the status filter below.
  const redeployedAndCompletedHidden: Prisma.PexRecordWhereInput = { NOT: { status: "COMPLETED" } };
  const where: Prisma.PexRecordWhereInput = {
    companyId,
    supplyJobId: { not: null },
    ...redeployedAndCompletedHidden,
    ...(query.status !== "ALL" ? { status: statusFilter } : {}),
    ...(query.q
      ? {
          OR: [
            { unitDescription: contains },
            { supplyJob: { jobNumber: contains } },
            { returnJob: { jobNumber: contains } },
            { customer: { name: contains } },
            { customer: { tradingName: contains } },
          ],
        }
      : {}),
  };
  // Sorted highest → lowest by supply job number (BRE1132 at the top,
  // BRE001 at the bottom). jobNumber is a plain String, so a DB-level
  // orderBy would sort lexicographically ("BRE999" ahead of "BRE1000") —
  // same issue listJobs documents. So: pull just (id, supply job number)
  // for every matching record (tiny rows), sort numerically on the trailing
  // digits in application code, page over that order, then load the full
  // rows for just the requested page and put them back in that order.
  const sortRows = await prisma.pexRecord.findMany({
    where,
    select: { id: true, updatedAt: true, supplyJob: { select: { jobNumber: true, draftNumber: true } } },
  });
  const sortValue = (r: (typeof sortRows)[number]) => {
    const n = r.supplyJob?.jobNumber ?? r.supplyJob?.draftNumber ?? null;
    const m = n?.match(/(\d+)(?!.*\d)/);
    return m ? parseInt(m[1], 10) : -1;
  };
  sortRows.sort((a, b) => sortValue(b) - sortValue(a) || b.updatedAt.getTime() - a.updatedAt.getTime());
  const total = sortRows.length;
  const pageIds = sortRows.slice((query.page - 1) * query.pageSize, query.page * query.pageSize).map((r) => r.id);
  const pageRows = await prisma.pexRecord.findMany({
    where: { id: { in: pageIds } },
    include: {
      customer: { select: { id: true, name: true, tradingName: true } },
      supplyJob: { select: { id: true, jobNumber: true, draftNumber: true, purchaseOrderNumber: true } },
      returnJob: { select: { id: true, jobNumber: true, draftNumber: true, status: true } },
    },
  });
  const byId = new Map(pageRows.map((r) => [r.id, r]));
  const items = pageIds.map((id) => byId.get(id)!).filter(Boolean);
  const countsBase: Prisma.PexRecordWhereInput = { companyId, supplyJobId: { not: null }, ...redeployedAndCompletedHidden };
  // 2026-09-23, user report: "Pex tracking if status is awaiting core or
  // outstanding, it is the same thing, so the stats cards can be combined
  // with the outstanding at client card." AWAIT_CORE and OUTSTANDING are
  // both "core still owed back from the client" (see PexStatus's own
  // schema comment) — they only differ on whether a return job has been
  // linked yet, which is still worth keeping as separate PexStatus values
  // (the table's Status column and the status filter dropdown still show
  // them distinctly), but the summary card no longer needs two tiles for
  // what reads as the same thing to whoever's scanning it. Counted
  // together here as a single "outstanding" figure; PexTrackingPage drops
  // the separate "Awaiting core" card accordingly.
  const [toBeDelivered, outstanding, received, inRepair] = await prisma.$transaction([
    prisma.pexRecord.count({ where: { ...countsBase, status: "TO_BE_DELIVERED" } }),
    prisma.pexRecord.count({ where: { ...countsBase, status: { in: ["AWAIT_CORE", "OUTSTANDING"] } } }),
    prisma.pexRecord.count({ where: { ...countsBase, status: "RECEIVED" } }),
    prisma.pexRecord.count({ where: { ...countsBase, status: "IN_REPAIR" } }),
  ]);
  return { items, total, page: query.page, pageSize: query.pageSize, counts: { toBeDelivered, outstanding, received, inRepair } };
}

// Which JobActivity types actually belong in a PEX unit's own history feed
// — mirrors ModApp's PEX_UNIT_HISTORY_ACTIONS allow-list. STATUS_CHANGED is
// the big one: a return job's status IS this record's PEX status (see
// JOB_STATUS_TO_PEX_STATUS above), so its activity trail doubles as this
// unit's own status timeline, same reasoning as ModApp relying on its own
// JOB_STATUS_CHANGED for the same purpose.
const PEX_RECORD_HISTORY_ACTIVITY_TYPES: JobActivityType[] = [
  "JOB_CREATED",
  "STATUS_CHANGED",
  "PEX_RETURN_LINKED",
  "PEX_RETURN_UNLINKED",
  "PEX_UNIT_SCRAPPED",
  "PEX_UNIT_ALLOCATED_TO_INVENTORY",
  "JOB_RETURNED_UNREPAIRED",
  "JOB_REOPENED",
];

// One step back in a unit's redeployment chain — mirrors ModApp's
// getPreviousPexCycle exactly (down to walking via the supply job's own
// "Previous job number", not consumedByJobId, for the same reliability
// reason ModApp's own comment gives).
async function getPreviousPexCycle(companyId: string, previousJobNumber: string | null) {
  if (!previousJobNumber) return null;
  const priorReturnJob = await prisma.job.findFirst({ where: { companyId, jobNumber: previousJobNumber } });
  if (!priorReturnJob) return null;
  return prisma.pexRecord.findFirst({ where: { companyId, returnJobId: priorReturnJob.id }, include: { supplyJob: true, returnJob: true } });
}

// Feeds the "History" button next to a unit on either list page or the job
// page's PEX section — a read-only lifecycle view for one specific record.
// Mirrors ModApp's getPexUnitHistory. Reachable from either PEX page —
// PEX_STOCK read is required here regardless of which page linked to it,
// since it's the less-restrictive of the two view gates a company could
// have configured and both pages' users need to be able to open it.
export async function getPexRecordHistory(ctx: RequestContext, id: string) {
  // 2026-10-07 — user report: "View history also not working". The job page's
  // View history button called this with a PEX Stock-only gate, so anyone who
  // could open the job (and see its PEX panel) but didn't also hold the PEX
  // Stock view permission/module got a 403 and an error banner instead of the
  // list. It is read-only data about jobs they can already see, so any of the
  // three views that can reach it now opens it: PEX Stock, PEX Tracking, or
  // Jobs.
  const companyId = requirePexHistoryRead(ctx);
  const pex = await prisma.pexRecord.findFirst({ where: { id, companyId }, include: { supplyJob: true, returnJob: true, consumedByJob: true } });
  if (!pex) throw new StockError("PEX_NOT_FOUND", "This PEX record could not be found.");

  const jobIds = [pex.supplyJobId, pex.returnJobId].filter((jobId): jobId is string => !!jobId);
  const activity = jobIds.length
    ? await prisma.jobActivity.findMany({
        where: { companyId, jobId: { in: jobIds }, type: { in: PEX_RECORD_HISTORY_ACTIVITY_TYPES } },
        orderBy: { createdAt: "asc" },
        include: { actor: { select: { displayName: true } } },
      })
    : [];

  // Walk backward one cycle at a time via the current cycle's own supply
  // job's "Previous job number" — capped well above any realistic chain
  // length as a defensive backstop against a data cycle looping forever,
  // same as ModApp's own 50-iteration cap.
  const previousCycles: Array<{ supplyJobNumber: string | null; supplyJobId: string | null; supplyDate: string | null; returnJobNumber: string | null; returnJobId: string | null; returnDate: string | null }> = [];
  // 2026-10-06 — the job page's "View history" now lists just the PREVIOUS
  // JOBS in this unit's chain (job number, supply/return, date delivered,
  // status, PO number), newest first — each earlier cycle contributes its
  // return job and its supply job. Built in the same walk as previousCycles.
  const previousJobs: Array<{ jobId: string; jobNumber: string | null; kind: "SUPPLY" | "RETURN" | "JOB"; deliveredAt: string | null; status: string; purchaseOrderNumber: string | null }> = [];
  let cursorPreviousJobNumber = pex.supplyJob?.previousJobNumber ?? null;
  const seenJobNumbers = new Set<string>();
  for (let i = 0; i < 50 && cursorPreviousJobNumber && !seenJobNumbers.has(cursorPreviousJobNumber); i++) {
    seenJobNumbers.add(cursorPreviousJobNumber);
    const prior = await getPreviousPexCycle(companyId, cursorPreviousJobNumber);
    if (prior) {
      if (prior.returnJob) {
        previousJobs.push({ jobId: prior.returnJob.id, jobNumber: prior.returnJob.jobNumber ?? prior.returnJob.draftNumber ?? null, kind: "RETURN", deliveredAt: (prior.returnJob.deliveryDate ?? prior.returnDate)?.toISOString() ?? null, status: prior.returnJob.status, purchaseOrderNumber: prior.returnJob.purchaseOrderNumber ?? null });
      }
      if (prior.supplyJob) {
        previousJobs.push({ jobId: prior.supplyJob.id, jobNumber: prior.supplyJob.jobNumber ?? prior.supplyJob.draftNumber ?? null, kind: "SUPPLY", deliveredAt: (prior.supplyJob.deliveryDate ?? prior.supplyDate)?.toISOString() ?? null, status: prior.supplyJob.status, purchaseOrderNumber: prior.supplyJob.purchaseOrderNumber ?? null });
      }
      previousCycles.push({
        supplyJobNumber: prior.supplyJob?.jobNumber ?? null,
        supplyJobId: prior.supplyJobId,
        supplyDate: prior.supplyDate ? prior.supplyDate.toISOString() : null,
        returnJobNumber: prior.returnJob?.jobNumber ?? null,
        returnJobId: prior.returnJobId,
        returnDate: prior.returnDate ? prior.returnDate.toISOString() : null,
      });
      cursorPreviousJobNumber = prior.supplyJob?.previousJobNumber ?? null;
      continue;
    }
    // 2026-10-07 — the earlier job exists but isn't one half of a linked PEX
    // record (a return job that was never linked, a plain repair, a job from
    // before PEX tracking): previously the walk stopped here and the list
    // looked empty/broken. Show that job as a row and keep following ITS
    // "Previous job number".
    const earlier = await prisma.job.findFirst({ where: { companyId, jobNumber: cursorPreviousJobNumber } });
    if (!earlier) break;
    previousJobs.push({ jobId: earlier.id, jobNumber: earlier.jobNumber ?? earlier.draftNumber ?? null, kind: earlier.type === "PEX_RETURN" ? "RETURN" : earlier.type === "PEX_SUPPLY" ? "SUPPLY" : "JOB", deliveredAt: earlier.deliveryDate?.toISOString() ?? null, status: earlier.status, purchaseOrderNumber: earlier.purchaseOrderNumber ?? null });
    cursorPreviousJobNumber = earlier.previousJobNumber ?? null;
  }

  // 2026-10-08 — user request: "the view history button should pickup all even
  // future linked pex units so no matter which job I click history, it will show
  // the whole list". chainJobs is the unit's WHOLE chain, newest first: every
  // later job it was supplied on (and that job's return, and so on, found via
  // "Previous job number" pointing at the return job), this record's own supply
  // and return jobs, then everything earlier (previousJobs above). The same list
  // comes back whichever job in the chain the History button is clicked from.
  type ChainRow = { jobId: string; jobNumber: string | null; kind: "SUPPLY" | "RETURN" | "JOB"; deliveredAt: string | null; status: string; purchaseOrderNumber: string | null; current?: boolean };
  type ChainJob = { id: string; jobNumber: string | null; draftNumber: string | null; status: string; deliveryDate: Date | null; purchaseOrderNumber: string | null; type: string };
  const chainRow = (j: ChainJob, kind: ChainRow["kind"], fallbackDate: Date | null, current: boolean): ChainRow => ({
    jobId: j.id,
    jobNumber: j.jobNumber ?? j.draftNumber ?? null,
    kind,
    deliveredAt: (j.deliveryDate ?? fallbackDate)?.toISOString() ?? null,
    status: j.status,
    purchaseOrderNumber: j.purchaseOrderNumber ?? null,
    current,
  });
  const laterJobs: ChainRow[] = []; // oldest -> newest
  let cursorReturn: ChainJob | null = pex.returnJob ?? null;
  const seenLater = new Set<string>();
  for (let i = 0; i < 50 && cursorReturn?.jobNumber && !seenLater.has(cursorReturn.id); i++) {
    seenLater.add(cursorReturn.id);
    const next: ChainJob | null = await prisma.job.findFirst({
      where: { companyId, previousJobNumber: cursorReturn.jobNumber, id: { not: cursorReturn.id } },
      orderBy: { createdAt: "asc" },
    });
    if (!next || seenLater.has(next.id)) break;
    seenLater.add(next.id);
    laterJobs.push(chainRow(next, next.type === "PEX_SUPPLY" ? "SUPPLY" : next.type === "PEX_RETURN" ? "RETURN" : "JOB", null, false));
    if (next.type !== "PEX_SUPPLY") break;
    const nextRecord = await prisma.pexRecord.findFirst({ where: { companyId, supplyJobId: next.id }, include: { returnJob: true } });
    if (!nextRecord?.returnJob) break;
    laterJobs.push(chainRow(nextRecord.returnJob, "RETURN", nextRecord.returnDate, false));
    cursorReturn = nextRecord.returnJob;
  }
  const chainJobs: ChainRow[] = [
    ...laterJobs.reverse(),
    ...(pex.returnJob ? [chainRow(pex.returnJob, "RETURN", pex.returnDate, true)] : []),
    ...(pex.supplyJob ? [chainRow(pex.supplyJob, "SUPPLY", pex.supplyDate, true)] : []),
    ...previousJobs,
  ];

  return {
    id: pex.id,
    unitDescription: pex.unitDescription,
    status: pex.status,
    notes: pex.notes,
    supplyJobNumber: pex.supplyJob?.jobNumber ?? null,
    supplyJobId: pex.supplyJobId,
    supplyDate: pex.supplyDate ? pex.supplyDate.toISOString() : null,
    returnJobNumber: pex.returnJob?.jobNumber ?? null,
    returnJobId: pex.returnJobId,
    returnDate: pex.returnDate ? pex.returnDate.toISOString() : null,
    consumedByJobNumber: pex.consumedByJob?.jobNumber ?? null,
    consumedByJobId: pex.consumedByJobId,
    consumedAt: pex.consumedAt ? pex.consumedAt.toISOString() : null,
    entries: activity.map((a) => ({
      id: a.id,
      type: a.type,
      description: a.description,
      userName: a.actor?.displayName ?? null,
      createdAt: a.createdAt.toISOString(),
    })),
    previousCycles,
    previousJobs,
    chainJobs,
  };
}
