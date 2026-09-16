import { Prisma } from "@prisma/client";
import type { RequestContext } from "@/lib/auth/context-types";
import type { TenantPermission } from "@/lib/auth/permissions";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit/service";
import { isCompanyEmailConfigured } from "@/lib/email";
import { normalized } from "@/lib/master-data/validation";
import { allocateDocumentNumberTx } from "@/lib/master-data/service";
import {
  jobsListQuery,
  jobCreateDraftInput,
  jobUpdateInput,
  jobRegisterInput,
  jobStatusChangeInput,
  jobCloseInput,
  jobReopenInput,
  jobFieldServiceInput,
  jobWarrantyInput,
  jobPartLineBulkAddInput,
  jobPartLineOrderUpdateInput,
  jobPartLineDescriptionUpdateInput,
  jobPartLineReceiveInput,
  outworkAddInput,
  outworkEditInput,
  outworkReceiveInput,
  attachmentUploadInput,
  jobAttachmentNotesUpdateInput,
  jobMarkReturnedUnrepairedInput,
  type JobsListQuery,
} from "@/lib/jobs/validation";
import { createPexRecordForSupplyJob, syncPexRedeployment, syncPexStatusFromJobStatus, syncPexAwaitCoreFromDeliveryDate } from "@/lib/pex/service";
import { reserveStockTx, releaseReservationTx } from "@/lib/inventory/service";
import { extractPartLinesFromSpreadsheet } from "@/lib/jobs/parts-import";
import { MAIN_WORKSHOP_STATUS_STEPS, FIELD_SERVICE_STATUS_STEPS, UNIVERSAL_STATUSES, RETURNED_UNREPAIRED_REOPEN_STATUS, canMarkReturnedUnrepaired, statusStepsForJobType } from "@/lib/jobs/ui";

type JobStatus = Prisma.JobGetPayload<{ select: { status: true } }>["status"];
type JobType = Prisma.JobGetPayload<{ select: { type: true } }>["type"];
type JobActivityType = Prisma.JobActivityGetPayload<{ select: { type: true } }>["type"];

// Every flow-family stepper stage except the terminal COMPLETE — kept in
// sync with src/lib/jobs/ui.ts's per-family step lists rather than
// duplicating status names here.
const WIP_STATUSES: JobStatus[] = Array.from(new Set([...MAIN_WORKSHOP_STATUS_STEPS, ...FIELD_SERVICE_STATUS_STEPS])).filter((status) => status !== "COMPLETE");

// Broadened for the Jobs & WIP list's customizable columns (see
// src/lib/jobs/wip-columns.ts) — every scalar field any column in
// JOBS_WIP_COLUMNS can show, so a user checking one of the less common
// columns (Kms travelled, Sales representative, ...) doesn't need a
// separate query. All flat scalars, no extra joins beyond the existing
// customer relation, so the added columns cost nothing beyond a slightly
// wider row.
const jobListSelect = {
  id: true,
  jobNumber: true,
  draftNumber: true,
  status: true,
  type: true,
  customerReference: true,
  customerPo: true,
  dateReceived: true,
  machineMake: true,
  machineModel: true,
  machineSerial: true,
  component: true,
  componentType: true,
  componentSerial: true,
  componentPartNumber: true,
  description: true,
  etaDate: true,
  mechanicEtaDate: true,
  relationshipNotes: true,
  quoteNumber: true,
  quoteDate: true,
  salesOrderNumber: true,
  salesOrderDate: true,
  invoiceNumber: true,
  invoiceDate: true,
  purchaseOrderNumber: true,
  purchaseOrderDate: true,
  purchaseOrderStatus: true,
  deliveryDate: true,
  deliveryType: true,
  receivingTransport: true,
  kmsTravelled: true,
  paymentDateReceived: true,
  machineHours: true,
  plantNumber: true,
  reportNumber: true,
  importTrackingNumber: true,
  previousJobNumber: true,
  salesRepresentative: true,
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
      company: { select: { id: true, legalName: true, tradingName: true } },
      createdBy: true,
      updatedBy: true,
      closedBy: true,
      stripMechanic: true,
      buildMechanic: true,
      // 2026-09-16 — kept for any historical reference, but the JobWorkspace
      // UI no longer reads this list (see the plain `notes` scalar column
      // added on Job itself, replacing the old add/edit/delete note list).
      noteEntries: { include: { createdBy: { select: { id: true, displayName: true, email: true } } }, orderBy: { createdAt: "desc" } },
      activities: { include: { actor: { select: { id: true, displayName: true, email: true } } }, orderBy: { createdAt: "desc" } },
      fieldServiceReport: true,
      warranty: true,
      components: true,
      // Full replace (2026-09-09) of the old PexStockUnit/PexSupplyLink
      // includes above — see schema.prisma's PexRecord comment. A job is
      // linked on at most one of these three legs at a time.
      pexAsSupply: {
        include: { returnJob: { select: { id: true, jobNumber: true, draftNumber: true, status: true } } },
      },
      pexAsReturn: {
        include: { supplyJob: { select: { id: true, jobNumber: true, draftNumber: true, status: true } } },
      },
      pexConsumedBy: {
        include: { returnJob: { select: { id: true, jobNumber: true, draftNumber: true } } },
      },
      // Parts list — replaces the old reserve/issue/return "Parts required"
      // workflow (see schema.prisma's JobPartLine comment). Much simpler
      // than the old partRequirements/allocations/movements chain: each row
      // is its own record with a direct status, no derived summary needed.
      partLines: {
        include: {
          part: { select: { id: true, partNumber: true, description: true, unitOfMeasure: true } },
          orderedFromSupplier: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      // Outwork — new (see schema.prisma's OutworkItem comment).
      outworkItems: {
        include: {
          // 2026-09-16 — vatNumber + the supplier's own address, added so
          // the outwork delivery note (see JobWorkspace.tsx's
          // printDeliveryNote) can print the supplier's full block —
          // name, address lines, VAT number — instead of just its name.
          // Same "one address, primary first" convention as the customer
          // include above.
          supplier: { select: { id: true, name: true, vatNumber: true, addresses: { where: { active: true }, orderBy: [{ isPrimary: "desc" }, { type: "asc" }], take: 1 } } },
        },
        orderBy: { createdAt: "desc" },
      },
      // RFQ (request for quote) — new (see schema.prisma's JobRfqRequest
      // comment). fileName/mimeType/sizeBytes are included so the UI can
      // show "a file is attached" without pulling the raw bytes down;
      // the bytes themselves are only fetched by the dedicated download
      // route (see rfq/[rfqId]/quote/file/route.ts).
      rfqRequests: {
        // select (not include) at this level — same reason as quote below:
        // JobRfqRequest now also carries an outbound attachmentData Bytes
        // column (added 2026-09-14), and a bare `include` would pull every
        // attached file's raw bytes into every job-detail load. Listing
        // the scalar fields explicitly (minus attachmentData) keeps this
        // to metadata only; the bytes are fetched on demand by the
        // dedicated route (GET /api/v1/jobs/[id]/rfq?rfqId=...).
        select: {
          id: true,
          jobId: true,
          supplierId: true,
          partsSummary: true,
          status: true,
          lastSendError: true,
          requestedAt: true,
          createdAt: true,
          updatedAt: true,
          attachmentFileName: true,
          attachmentMimeType: true,
          attachmentSizeBytes: true,
          supplier: { select: { id: true, name: true, mainEmail: true } },
          quote: {
            select: {
              id: true,
              fileName: true,
              mimeType: true,
              sizeBytes: true,
              notes: true,
              receivedAt: true,
              lines: true,
            },
          },
        },
        orderBy: [{ requestedAt: "desc" }],
      },
      // Attachments — new (see schema.prisma's JobAttachment comment).
      // Same convention as rfqRequests.quote above: metadata only here so
      // the UI can list/download-link without pulling every file's raw
      // bytes down on every job load — the bytes themselves are only
      // fetched by the dedicated download route.
      attachments: {
        select: { id: true, fileName: true, mimeType: true, sizeBytes: true, notes: true, createdAt: true, createdBy: { select: { displayName: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!job) notFound();

  return job;
}

async function getPartLineScoped(companyId: string, jobId: string, lineId: string) {
  const line = await prisma.jobPartLine.findFirst({ where: { id: lineId, companyId, jobId } });
  if (!line) notFound();
  return line;
}

async function getOutworkItemScoped(companyId: string, jobId: string, itemId: string) {
  const item = await prisma.outworkItem.findFirst({ where: { id: itemId, companyId, jobId } });
  if (!item) notFound();
  return item;
}

// Company/status/type/view filters only — no text search. Shared by
// mapListWhere below (which adds the text OR on top) and expandLinkedJobIds
// (which needs the same scoping for a linked job it pulls in by chain
// traversal, not by text match, to still respect active filters).
function mapListScopeWhere(companyId: string, query: JobsListQuery): Prisma.JobWhereInput {
  return {
    companyId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.view === "wip" ? { status: { in: WIP_STATUSES } } : {}),
    ...(query.view === "completed" ? { status: { in: ["COMPLETE", "CLOSED", "CANCELLED"] } } : {}),
  };
}

function mapListWhere(companyId: string, query: JobsListQuery): Prisma.JobWhereInput {
  const contains = { contains: query.q, mode: "insensitive" as const };
  return {
    ...mapListScopeWhere(companyId, query),
    ...(query.q ? {
      OR: [
        { jobNumber: contains },
        { draftNumber: contains },
        // Chained/linked jobs (a PEX redeployment, a warranty follow-up, or
        // any job someone typed a prior job's number into) are found by
        // their OWN job number/customer/etc. already, but not by searching
        // for the EARLIER job's number they're linked to — previousJobNumber
        // was missing from this OR entirely. Reported directly by the user:
        // "when searching through jobs, jobs are not linked through
        // previous job number." Without this, searching for job BRE1050
        // would not surface the later job that has "BRE1050" in its own
        // Previous job number field, even though that's exactly the kind of
        // relationship this search is meant to help someone trace. This
        // only covers one direction though (searching the EARLIER job's
        // number finds the LATER job) — see expandLinkedJobIds below for
        // the other direction (searching the LATER job's number finds the
        // EARLIER one it links back to).
        { previousJobNumber: contains },
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

// Bidirectional expansion of the previousJobNumber chain, starting from
// whatever mapListWhere's text search directly matched. Reported directly
// by the user: "when searching bre1070, it does not pickup BRE1050" — where
// BRE1070 is a later job whose own previousJobNumber is "BRE1050" (e.g. a
// redeployed PEX unit). previousJobNumber being in mapListWhere's OR
// already means searching "BRE1050" finds BRE1070 (BRE1070's OWN field
// contains the query), but searching "BRE1070" does NOT find BRE1050 —
// nothing on BRE1050's own record mentions "BRE1070" at all, so text
// matching alone can never find it that direction. This walks the chain
// outward from every directly-matched job instead, both ways (the job a
// match points back to via its own previousJobNumber, and any job that
// points forward at a match), so searching either end of a link surfaces
// the whole chain. Hop-capped as a defensive backstop against a data cycle
// looping forever — same spirit as getPreviousPexCycle's own cap in
// pex/service.ts, just smaller, since this is a search result rather than
// a full audit trail. scopeWhere (company/status/type/view, no text) is
// applied to every hop so a linked job outside the current filters (e.g.
// completed, while viewing "WIP only") doesn't unexpectedly appear.
async function expandLinkedJobIds(
  scopeWhere: Prisma.JobWhereInput,
  seed: Array<{ id: string; jobNumber: string | null; previousJobNumber: string | null }>,
): Promise<string[]> {
  const known = new Map(seed.map((row) => [row.id, row]));
  let frontier = seed;
  for (let hop = 0; hop < 10 && frontier.length > 0; hop++) {
    const knownNumbers = new Set([...known.values()].map((row) => row.jobNumber).filter((n): n is string => !!n));
    const wantedNumbers = [...new Set(frontier.map((row) => row.previousJobNumber).filter((n): n is string => !!n && !knownNumbers.has(n)))];
    const frontierNumbers = frontier.map((row) => row.jobNumber).filter((n): n is string => !!n);
    if (wantedNumbers.length === 0 && frontierNumbers.length === 0) break;
    const next = await prisma.job.findMany({
      where: {
        ...scopeWhere,
        id: { notIn: [...known.keys()] },
        OR: [
          ...(wantedNumbers.length ? [{ jobNumber: { in: wantedNumbers } }] : []),
          ...(frontierNumbers.length ? [{ previousJobNumber: { in: frontierNumbers } }] : []),
        ],
      },
      select: { id: true, jobNumber: true, previousJobNumber: true },
    });
    if (next.length === 0) break;
    for (const row of next) known.set(row.id, row);
    frontier = next;
  }
  return [...known.keys()];
}

async function addActivity(tx: Prisma.TransactionClient, ctx: RequestContext, jobId: string, type: JobActivityType, description: string, metadata?: Prisma.InputJsonValue) {
  await tx.jobActivity.create({
    data: { companyId: ctx.companyId!, jobId, type, description, metadata, actorId: ctx.userId },
  });
}

// jobNumber is a plain String (`"BRE" + zero-padded sequence`, e.g. "BRE999",
// "BRE1000" — see the numbering allocator in src/lib/master-data/service.ts),
// not an Int, so a database-level `orderBy: { jobNumber: "desc" }` sorts it
// lexicographically, not numerically. That's fine right up until a
// sequence's digit count grows past its configured zero-padding width — at
// that point "BRE999" (3 digits) string-sorts *ahead* of "BRE1000" (4
// digits), because "9" > "1" at the first differing character. Reported
// directly by the user: "table view starts at BRE999 but there are jobs
// that are higher on the list." Fixed by pulling the trailing run of digits
// out of each jobNumber and comparing those numerically instead — works
// regardless of prefix, padding width, or how many digits the sequence has
// grown to. A job with no parseable digits (including the null jobNumber a
// small number of legacy pre-numbering-fix jobs can still have) sorts to
// the same end of the list in both directions, same as the intent of the
// old `nulls` handling this replaces.
function jobNumberSortValue(jobNumber: string | null): number {
  const match = jobNumber?.match(/(\d+)(?!.*\d)/);
  return match ? parseInt(match[1], 10) : -1;
}

export async function listJobs(ctx: RequestContext, raw: unknown) {
  const companyId = requireJobsRead(ctx);
  const query = jobsListQuery.parse(raw);
  const scopeWhere = mapListScopeWhere(companyId, query);
  // No DB-level orderBy/skip/take anywhere below — see jobNumberSortValue
  // above for why job number can't be sorted correctly as a plain string
  // column. Sorting and paging happen further down, in application code,
  // over the full matching set (select is scalars-only, no relations, so
  // this stays cheap even for a company with several thousand jobs).
  const rows = query.q
    ? await (async () => {
        const textWhere = mapListWhere(companyId, query);
        const seed = await prisma.job.findMany({ where: textWhere, select: { id: true, jobNumber: true, previousJobNumber: true } });
        const ids = await expandLinkedJobIds(scopeWhere, seed);
        return prisma.job.findMany({ where: { ...scopeWhere, id: { in: ids } }, select: jobListSelect });
      })()
    : await prisma.job.findMany({ where: scopeWhere, select: jobListSelect });
  const total = rows.length;
  const direction = query.sort === "oldest" ? 1 : -1;
  const sorted = rows.slice().sort((a, b) => direction * (jobNumberSortValue(a.jobNumber) - jobNumberSortValue(b.jobNumber)));
  const start = (query.page - 1) * query.pageSize;
  const items = sorted.slice(start, start + query.pageSize);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

export async function createDraftJob(ctx: RequestContext, raw: unknown, options?: { literalJobNumber?: string }) {
  const companyId = requireJobs(ctx, "JOBS_CREATE");
  const input = jobCreateDraftInput.parse(raw);
  await getCustomerOrThrow(companyId, input.customerId);
  const stripMechanicId = await getUserOrNull(companyId, input.stripMechanicId);
  const buildMechanicId = await getUserOrNull(companyId, input.buildMechanicId);
  if (input.relatedJobId) await getJobScoped(companyId, input.relatedJobId);
  const job = await prisma.$transaction(async (tx) => {
    // Numbered immediately at creation, matching ModApp's nextJobNumber
    // (called right inside its createJob, no separate step) — at the
    // user's explicit request, since Apollo X's old two-step "Draft, then
    // Register to allocate the number" flow was leaving newly-created jobs
    // showing their raw internal id instead of picking up the prefix
    // configured under Settings > Numbering. PEX Supply/Return jobs draw
    // from the same "PEX_JOB" sequence registerJob used to allocate at
    // registration; every other type draws from "JOB". Note this throws
    // SEQUENCE_NOT_FOUND if the company hasn't set up (and activated) a
    // Numbering entry for that document type yet — job creation now
    // depends on one existing, where before it didn't.
    //
    // registerJob (below) still exists — it now only moves the job out of
    // DRAFT status into wherever the workflow should start — and keeps a
    // fallback that allocates a number there instead, purely for any job
    // that was already sitting in DRAFT (unnumbered) before this change
    // shipped.
    //
    // Note (2026-09-09): the PEX_SUPPLY/PEX_RETURN special-casing this
    // comment used to describe here — an auto-created PEX return job
    // deliberately staying unnumbered/DRAFT until a real Register — belonged
    // to the old PexStockUnit/PexSupplyLink model and no longer applies.
    // Under the PexRecord replacement (see schema.prisma's PexRecord
    // comment), a return job created by pex/service.ts's
    // createAndAttachReturnJobTx is numbered and active immediately, the
    // same as ModApp's own return jobs — there's no unnumbered-draft state
    // to protect and no special unwind path for it.
    // literalJobNumber lets a caller preserve a job's own real number
    // instead of allocating a fresh one from this company's Numbering
    // sequence — currently only the historical Jobs import
    // (src/lib/import-export/service.ts) passes it, so a legacy job can
    // keep its original number on the way in. Never exposed through the
    // public create-job API/validation (jobCreateDraftInput has no such
    // field) — only this internal service function accepts it, as a
    // second, explicit argument, so the ordinary New Job form still can't
    // set an arbitrary number by itself.
    const jobNumber = options?.literalJobNumber
      ? options.literalJobNumber
      : await allocateDocumentNumberTx(tx, ctx, input.type === "PEX_SUPPLY" || input.type === "PEX_RETURN" ? "PEX_JOB" : "JOB");
    const created = await tx.job.create({
      data: {
        companyId,
        jobNumber,
        customerId: input.customerId,
        customerReference: input.customerReference,
        customerPo: input.customerPo,
        dateReceived: input.dateReceived,
        machineMake: input.machineMake,
        machineModel: input.machineModel,
        machineSerial: input.machineSerial,
        component: input.component,
        componentType: input.componentType,
        componentSerial: input.componentSerial,
        componentPartNumber: input.componentPartNumber,
        description: input.description,
        notes: input.notes,
        type: input.type as JobType,
        etaDate: input.etaDate,
        mechanicEtaDate: input.mechanicEtaDate,
        relationshipNotes: input.relationshipNotes,
        relatedJobId: input.relatedJobId,
        stripMechanicId,
        buildMechanicId,
        quoteNumber: input.quoteNumber,
        quoteDate: input.quoteDate,
        salesOrderNumber: input.salesOrderNumber,
        salesOrderDate: input.salesOrderDate,
        invoiceNumber: input.invoiceNumber,
        invoiceDate: input.invoiceDate,
        purchaseOrderNumber: input.purchaseOrderNumber,
        purchaseOrderDate: input.purchaseOrderDate,
        ...(input.purchaseOrderStatus !== undefined ? { purchaseOrderStatus: input.purchaseOrderStatus } : {}),
        deliveryDate: input.deliveryDate,
        deliveryType: input.deliveryType,
        receivingTransport: input.receivingTransport,
        kmsTravelled: input.kmsTravelled,
        paymentDateReceived: input.paymentDateReceived,
        ...(input.paymentNotApplicable !== undefined ? { paymentNotApplicable: input.paymentNotApplicable } : {}),
        machineHours: decimalOrNull(input.machineHours === undefined || input.machineHours === null ? null : Number(input.machineHours)),
        plantNumber: input.plantNumber,
        reportNumber: input.reportNumber,
        importTrackingNumber: input.importTrackingNumber,
        previousJobNumber: input.previousJobNumber,
        salesRepresentative: input.salesRepresentative,
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
    await addActivity(tx, ctx, created.id, "JOB_CREATED", `Job ${created.jobNumber} created.`, { jobNumber: created.jobNumber, type: created.type });
    // A PEX Supply job gets its PexRecord the moment it exists — makes the
    // unit visible on PEX Tracking immediately, not only once a return job
    // is linked to it (see createPexRecordForSupplyJob's own comment).
    await createPexRecordForSupplyJob(tx, ctx, companyId, created);
    // Picks up "Previous job number" immediately if it was filled in on
    // the create form — previously a no-op here since the job had no
    // jobNumber yet to sync against (see the numbering comment above).
    // Unconditional for every job type, matching ModApp's own
    // syncPexConsumption call (see syncPexRedeployment's own doc comment).
    await syncPexRedeployment(tx, ctx, companyId, created);
    return created;
  });
  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "Job", entityId: job.id, action: "CREATE_DRAFT", afterData: { id: job.id, jobNumber: job.jobNumber } });
  return job;
}

export async function getJobById(ctx: RequestContext, id: string) {
  const companyId = requireJobsRead(ctx);
  const job = await getJobScoped(companyId, id);
  // emailConfigured — added 2026-09-09 alongside real RFQ/parts-follow-up
  // email sending, so the RFQ panel can show a "set up email under
  // Settings" banner instead of a confusing silent SKIPPED status. Just a
  // boolean, not the SMTP details themselves — safe to include for anyone
  // who can already view this job.
  const emailConfigured = await isCompanyEmailConfigured(companyId);
  return { ...job, emailConfigured };
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
        ...(input.machineMake !== undefined ? { machineMake: input.machineMake } : {}),
        ...(input.machineModel !== undefined ? { machineModel: input.machineModel } : {}),
        ...(input.machineSerial !== undefined ? { machineSerial: input.machineSerial } : {}),
        ...(input.component !== undefined ? { component: input.component } : {}),
        ...(input.componentType !== undefined ? { componentType: input.componentType } : {}),
        ...(input.componentSerial !== undefined ? { componentSerial: input.componentSerial } : {}),
        ...(input.componentPartNumber !== undefined ? { componentPartNumber: input.componentPartNumber } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.type !== undefined ? { type: input.type as JobType } : {}),
        ...(input.etaDate !== undefined ? { etaDate: input.etaDate } : {}),
        ...(input.mechanicEtaDate !== undefined ? { mechanicEtaDate: input.mechanicEtaDate } : {}),
        ...(input.relationshipNotes !== undefined ? { relationshipNotes: input.relationshipNotes } : {}),
        ...(input.relatedJobId !== undefined ? { relatedJobId: input.relatedJobId } : {}),
        ...(input.status !== undefined ? { status: input.status as JobStatus } : {}),
        ...(input.quoteNumber !== undefined ? { quoteNumber: input.quoteNumber } : {}),
        ...(input.quoteDate !== undefined ? { quoteDate: input.quoteDate } : {}),
        ...(input.salesOrderNumber !== undefined ? { salesOrderNumber: input.salesOrderNumber } : {}),
        ...(input.salesOrderDate !== undefined ? { salesOrderDate: input.salesOrderDate } : {}),
        ...(input.invoiceNumber !== undefined ? { invoiceNumber: input.invoiceNumber } : {}),
        ...(input.invoiceDate !== undefined ? { invoiceDate: input.invoiceDate } : {}),
        ...(input.purchaseOrderNumber !== undefined ? { purchaseOrderNumber: input.purchaseOrderNumber } : {}),
        ...(input.purchaseOrderDate !== undefined ? { purchaseOrderDate: input.purchaseOrderDate } : {}),
        ...(input.purchaseOrderStatus !== undefined ? { purchaseOrderStatus: input.purchaseOrderStatus } : {}),
        ...(input.deliveryDate !== undefined ? { deliveryDate: input.deliveryDate } : {}),
        ...(input.deliveryType !== undefined ? { deliveryType: input.deliveryType } : {}),
        ...(input.receivingTransport !== undefined ? { receivingTransport: input.receivingTransport } : {}),
        ...(input.kmsTravelled !== undefined ? { kmsTravelled: input.kmsTravelled } : {}),
        ...(input.paymentDateReceived !== undefined ? { paymentDateReceived: input.paymentDateReceived } : {}),
        ...(input.paymentNotApplicable !== undefined ? { paymentNotApplicable: input.paymentNotApplicable } : {}),
        ...(input.machineHours !== undefined ? { machineHours: decimalOrNull(input.machineHours === null ? null : Number(input.machineHours)) } : {}),
        ...(input.plantNumber !== undefined ? { plantNumber: input.plantNumber } : {}),
        ...(input.reportNumber !== undefined ? { reportNumber: input.reportNumber } : {}),
        ...(input.importTrackingNumber !== undefined ? { importTrackingNumber: input.importTrackingNumber } : {}),
        ...(input.previousJobNumber !== undefined ? { previousJobNumber: input.previousJobNumber } : {}),
        ...(input.salesRepresentative !== undefined ? { salesRepresentative: input.salesRepresentative } : {}),
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

    // Covers a save that changes an existing job's type TO PEX_SUPPLY —
    // same "create the PexRecord if one doesn't already exist" as
    // createDraftJob above, safe/no-op otherwise.
    await createPexRecordForSupplyJob(tx, ctx, companyId, job);
    // Unconditional for every job type, matching ModApp's own
    // syncPexConsumption call.
    await syncPexRedeployment(tx, ctx, companyId, job);
    // Also unconditional — deliveryDate is a plain form field with no
    // status transition of its own, so it needs its own sync call rather
    // than piggybacking on the status-change branch below (see
    // syncPexAwaitCoreFromDeliveryDate's own comment).
    await syncPexAwaitCoreFromDeliveryDate(tx, ctx, companyId, job);
    if (input.status !== undefined && input.status !== existing.status) {
      await syncPexStatusFromJobStatus(tx, ctx, companyId, job, job.status as JobStatus);
      if (RESERVATION_RELEASE_STATUSES.includes(job.status)) await releaseJobPartReservationsTx(tx, ctx, companyId, job.id);
    }
    return job;
  });
  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "Job", entityId: updated.id, action: "UPDATE", afterData: { id: updated.id } });
  return updated;
}

export async function registerJob(ctx: RequestContext, id: string, raw: unknown) {
  const companyId = requireJobs(ctx, "JOBS_EDIT");
  const input = jobRegisterInput.parse(raw);
  const existing = await getJobScoped(companyId, id);
  // "Already registered" is now a status question, not a numbering one —
  // every job created via createDraftJob above already has a jobNumber
  // from the moment it exists, so the old `if (existing.jobNumber)` guard
  // would reject registering any newly-created job at all. DRAFT is still
  // the one status Register is meant to move a job out of.
  if (existing.status !== "DRAFT") throw new Error("Job is already registered.");
  if (!statusStepsForJobType(existing.type as JobType).includes(input.initialStatus as JobStatus)) {
    throw new Error(`Status ${input.initialStatus} is not valid for a ${existing.type} job.`);
  }
  // PEX_SUPPLY/PEX_RETURN jobs now go through this same generic path —
  // createDraftJob already numbers every job (including these two types)
  // immediately at creation, so there's no more "stays unregistered/
  // unnumbered until Register" special case to delegate to a separate
  // registerPexJob for (that quirk belonged to the old PexStockUnit/
  // PexSupplyLink model's auto-created return draft, which the PexRecord
  // replace removed — see schema.prisma's PexRecord comment). Only the PEX
  // status sync below is genuinely PEX-specific now.
  const updated = await prisma.$transaction(async (tx) => {
    // Normally a no-op now (see createDraftJob) — this only fires for a
    // job that reached DRAFT before job numbers were assigned at creation
    // time, so it isn't stuck showing its raw internal id forever.
    const jobNumber = existing.jobNumber ?? (await allocateDocumentNumberTx(tx, ctx, existing.type === "PEX_SUPPLY" || existing.type === "PEX_RETURN" ? "PEX_JOB" : "JOB"));
    const registered = await tx.job.update({ where: { id: existing.id }, data: { jobNumber, status: input.initialStatus as JobStatus, updatedById: ctx.userId }, include: { customer: true } });
    await addActivity(tx, ctx, existing.id, "JOB_REGISTERED", `Job registered — status set to ${input.initialStatus}.`, { jobNumber, status: input.initialStatus });
    await syncPexStatusFromJobStatus(tx, ctx, companyId, registered, registered.status as JobStatus);
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
  const allowedStatuses = [...statusStepsForJobType(existing.type as JobType), ...UNIVERSAL_STATUSES];
  if (!allowedStatuses.includes(input.status as JobStatus)) {
    throw new Error(`Status ${input.status} is not valid for a ${existing.type} job.`);
  }
  const updated = await prisma.$transaction(async (tx) => {
    const job = await tx.job.update({ where: { id: existing.id }, data: { status: input.status as JobStatus, updatedById: ctx.userId } });
    await addActivity(tx, ctx, existing.id, "STATUS_CHANGED", `Status changed from ${existing.status} to ${input.status}.`, { from: existing.status, to: input.status, reason: input.reason ?? null });
    await syncPexStatusFromJobStatus(tx, ctx, companyId, job, job.status as JobStatus);
    if (RESERVATION_RELEASE_STATUSES.includes(job.status)) await releaseJobPartReservationsTx(tx, ctx, companyId, job.id);
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
    await syncPexStatusFromJobStatus(tx, ctx, companyId, closed, closed.status as JobStatus);
    await releaseJobPartReservationsTx(tx, ctx, companyId, closed.id);
    return closed;
  });
  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "Job", entityId: updated.id, action: "CLOSE", afterData: { status: updated.status, outcome: updated.closingOutcome } });
  return updated;
}

export async function reopenJob(ctx: RequestContext, id: string, raw: unknown) {
  const companyId = requireJobs(ctx, "JOBS_EDIT");
  const input = jobReopenInput.parse(raw);
  const existing = await getJobScoped(companyId, id);
  if (!["CLOSED", "CANCELLED", "COMPLETE", "RETURNED_UNREPAIRED"].includes(existing.status)) {
    throw new Error("Only closed, cancelled, complete or returned-unrepaired jobs can be reopened.");
  }
  if (!statusStepsForJobType(existing.type as JobType).includes(input.status as JobStatus)) {
    throw new Error(`Status ${input.status} is not valid for a ${existing.type} job.`);
  }
  const updated = await prisma.$transaction(async (tx) => {
    const reopened = await tx.job.update({ where: { id: existing.id }, data: { status: input.status as JobStatus, updatedById: ctx.userId } });
    await addActivity(tx, ctx, existing.id, "JOB_REOPENED", `Job reopened to ${input.status}.`, { from: existing.status, to: input.status, reason: input.reason ?? null, previousClosedAt: existing.closedAt });
    await syncPexStatusFromJobStatus(tx, ctx, companyId, reopened, reopened.status as JobStatus);
    return reopened;
  });
  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "Job", entityId: updated.id, action: "REOPEN", afterData: { from: existing.status, to: updated.status } });
  return updated;
}

export async function markJobReturnedUnrepaired(ctx: RequestContext, id: string, raw: unknown) {
  const companyId = requireJobs(ctx, "JOBS_EDIT");
  const input = jobMarkReturnedUnrepairedInput.parse(raw);
  const existing = await getJobScoped(companyId, id);
  if (!canMarkReturnedUnrepaired(existing.type as JobType)) {
    throw new Error(`${existing.type} jobs cannot be marked returned unrepaired — this action is only available for the main workshop flow.`);
  }
  if (["DRAFT", "CLOSED", "CANCELLED", "COMPLETE", "RETURNED_UNREPAIRED"].includes(existing.status)) {
    throw new Error(`A job with status ${existing.status} cannot be marked returned unrepaired.`);
  }
  const updated = await prisma.$transaction(async (tx) => {
    const marked = await tx.job.update({ where: { id: existing.id }, data: { status: "RETURNED_UNREPAIRED" as JobStatus, updatedById: ctx.userId } });
    await addActivity(tx, ctx, existing.id, "JOB_RETURNED_UNREPAIRED", `Job returned unrepaired. Reason: ${input.reason}.`, { from: existing.status, to: "RETURNED_UNREPAIRED", reason: input.reason, reopensTo: RETURNED_UNREPAIRED_REOPEN_STATUS });
    await syncPexStatusFromJobStatus(tx, ctx, companyId, marked, marked.status as JobStatus);
    return marked;
  });
  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "Job", entityId: updated.id, action: "RETURNED_UNREPAIRED", afterData: { from: existing.status, to: updated.status, reason: input.reason } });
  return updated;
}

// 2026-09-16 — addJobNote/updateJobNote/deleteJobNote (the old
// add/edit/delete list of separately-timestamped JobNote entries) and
// the /api/v1/jobs/[id]/notes route that called them were removed here
// — Notes is now one shared field on Job itself (see `notes` in
// updateJob above), autosaved exactly like description. Nothing else in
// the app read from these functions (confirmed before removing). The
// JobNote model/table itself is left in the schema — see schema.prisma's
// Job.notes comment — since the migration that added Job.notes
// backfilled it from those rows and they're kept as historical record,
// just no longer written to or read from here.

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
    // Kms travelled is a Job column, not a JobFieldServiceReport column —
    // it's edited alongside the field-service fields (matching ModApp's
    // placement) but saved onto the Job record itself.
    if (input.kmsTravelled !== undefined) {
      await tx.job.update({ where: { id: jobId }, data: { kmsTravelled: input.kmsTravelled } });
    }
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

// ---------------------------------------------------------------------------
// Parts list — replaces the old reserve/issue/return "Parts required"
// workflow. Added 2026-09-09 at the user's request: "the parts required
// section in apollo should be removed and the parts list section in modapp
// should be added". Mirrors ModApp's JobPartLine actions (addPartLinesBulk,
// markPartReceived/unmarkPartReceived, removePartLine,
// updatePartLineOrderNumber/updatePartLineDescription) but adapted to
// Apollo X's Part/StockBalance inventory model instead of ModApp's single
// InventoryItem.quantity field, and to Apollo X's requireJobs/addActivity/
// recordAudit conventions instead of Next.js Server Actions.
//
// File/spreadsheet import (2026-09-09, at the user's explicit request for
// an "import parts list" option next to the paste box): src/lib/jobs/
// parts-import.ts parses an uploaded .xlsx/.xls/.csv into the same row
// shape as a pasted line, reusing the header-detection approach from
// src/lib/rfq/quote-extraction.ts's spreadsheet guesser. The RFQ
// quote-line follow-up integration (PartsFollowUpButton.tsx) is still not
// ported — that depends on infrastructure Apollo X doesn't have yet.
// ---------------------------------------------------------------------------

const ALLOWED_PARTS_IMPORT_MIME_TYPES = [
  "text/csv",
  "application/csv",
  "text/plain",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
const MAX_PARTS_IMPORT_FILE_BYTES = 8_000_000;

type ParsedPartLineRow = { partNumber: string; description: string | null; quantity: number };

// "PN-1001, 2, Hydraulic seal kit" or a tab-separated paste straight out of
// Excel — same shape as ModApp's parseBulkPartRow. Part number and quantity
// are required; description is optional and can be filled in later via
// updatePartLineDescription. Unparseable rows (no part number, or a
// quantity that isn't a positive number) are silently dropped rather than
// failing the whole paste — a stray blank line or header row shouldn't
// block the rest of the list.
function parseBulkPartRow(raw: string): ParsedPartLineRow | null {
  const cells = (raw.includes("\t") ? raw.split("\t") : raw.split(",")).map((c) => c.trim());
  const partNumber = cells[0] || "";
  if (!partNumber) return null;
  const quantity = Number(cells[1]);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  const description = cells[2]?.trim() || null;
  return { partNumber, description, quantity };
}

export type AddPartLinesResult = { addedFromPaste: number; addedFromFile: number };

export async function addPartLinesBulk(ctx: RequestContext, jobId: string, raw: unknown): Promise<AddPartLinesResult> {
  const companyId = requireJobs(ctx, "JOBS_EDIT");
  const input = jobPartLineBulkAddInput.parse(raw);
  const job = await getJobScoped(companyId, jobId);
  const jobNumberLabel = job.jobNumber ?? job.draftNumber;

  const pasteRows = (input.bulkLines ?? "")
    .split("\n")
    .map((r) => r.trim())
    .filter(Boolean)
    .map(parseBulkPartRow)
    .filter((r): r is ParsedPartLineRow => r !== null);

  let fileRows: ParsedPartLineRow[] = [];
  if (input.fileName && input.mimeType && input.contentBase64) {
    if (!ALLOWED_PARTS_IMPORT_MIME_TYPES.includes(input.mimeType)) throw new Error("INVALID_ATTACHMENT_TYPE");
    const data = Buffer.from(input.contentBase64, "base64");
    if (data.length > MAX_PARTS_IMPORT_FILE_BYTES) throw new Error("ATTACHMENT_TOO_LARGE");
    fileRows = await extractPartLinesFromSpreadsheet(data);
  }

  const rows = [...pasteRows, ...fileRows];
  if (rows.length === 0) return { addedFromPaste: 0, addedFromFile: 0 };

  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      const partNumberNormalized = normalized(row.partNumber);
      const part = partNumberNormalized ? await tx.part.findFirst({ where: { companyId, partNumberNormalized }, select: { id: true, description: true, binLocationId: true } }) : null;

      // "In stock" reflects total on-hand across all locations, same
      // purpose as ModApp's InventoryItem lookup against Apollo X's
      // Part/StockBalance model. 2026-09-16 — user request: "stock is
      // checked but needs to show that it is reserved under Stock Levels
      // page so that it can not be used by another job" — when it's in
      // stock we now also reserve it (best-effort, at the part's own bin
      // location) so StockBalance.quantityReserved reflects it and another
      // job can't take the same units. A reservation failure (no bin
      // assigned, a race against another reservation, etc.) never blocks
      // adding the part line — it just leaves the line unreserved, same as
      // before this change.
      let inStock = false;
      if (part) {
        const balances = await tx.stockBalance.aggregate({ where: { companyId, partId: part.id }, _sum: { quantityOnHand: true } });
        const onHand = balances._sum.quantityOnHand ?? new Prisma.Decimal(0);
        inStock = onHand.gte(row.quantity);
      }

      const created = await tx.jobPartLine.create({
        data: {
          companyId,
          jobId,
          partNumber: row.partNumber,
          description: row.description || part?.description || null,
          quantity: new Prisma.Decimal(row.quantity),
          status: inStock ? "IN_STOCK" : "PENDING",
          partId: part?.id ?? null,
          createdById: ctx.userId,
          updatedById: ctx.userId,
        },
      });

      if (!inStock) {
        await addActivity(tx, ctx, jobId, "PART_ADDED", `Part line added: ${row.partNumber} (qty ${row.quantity}) — not currently in stock.`, { lineId: created.id, partNumber: row.partNumber, quantity: row.quantity });
      } else {
        await addActivity(tx, ctx, jobId, "PART_ADDED", `Part line added: ${row.partNumber} (qty ${row.quantity}).`, { lineId: created.id, partNumber: row.partNumber, quantity: row.quantity });

        if (part?.binLocationId) {
          try {
            await reserveStockTx(tx, { ...ctx, companyId }, {
              partId: part.id,
              locationId: part.binLocationId,
              quantity: String(row.quantity),
              referenceType: "JOB",
              referenceId: created.id,
              // 2026-09-16 — user request: the reservation's reason (shown
              // on the Part detail page's Recent Movements) should include
              // the job number so it's traceable at a glance, not just
              // "Reserved for job part line" with no way to tell which job.
              referenceNumber: jobNumberLabel,
              reason: `Reserved for job ${jobNumberLabel}`,
              notes: null,
              expiresAt: null,
              idempotencyKey: undefined,
            });
          } catch {
            // Best-effort — see comment above. Stock Levels' Reserved
            // column simply won't reflect this line if the reservation
            // couldn't be made.
          }
        }
      }
    }
  });

  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "JobPartLine", entityId: jobId, action: "BULK_ADD", afterData: { jobId, count: rows.length } });
  return { addedFromPaste: pasteRows.length, addedFromFile: fileRows.length };
}

// Asks for a received quantity — a delivery doesn't always match exactly.
// receivedQuantity accumulates ACROSS multiple clicks (each click records
// "this many arrived just now," added to whatever had already come in
// before), so receiving part of the order today and the rest later both
// count toward the same line, rather than the first partial receipt
// locking the line as fully received with no way to receive the rest. A
// line only becomes RECEIVED once its cumulative total reaches the full
// ordered quantity; anything in between is PARTIALLY_RECEIVED. The line's
// status from *before* any receiving started is remembered once (not
// overwritten by a later partial-receive click) so unmarkPartLineReceived
// can restore the true original state. Mirrors ModApp's markPartReceived.
export async function markPartLineReceived(ctx: RequestContext, jobId: string, lineId: string, raw: unknown) {
  const companyId = requireJobs(ctx, "JOBS_EDIT");
  const input = jobPartLineReceiveInput.parse(raw);
  const line = await getPartLineScoped(companyId, jobId, lineId);

  const alreadyReceived = line.receivedQuantity ?? new Prisma.Decimal(0);
  const outstanding = Prisma.Decimal.max(line.quantity.minus(alreadyReceived), new Prisma.Decimal(0));
  if (outstanding.lte(0)) throw new Error("PART_LINE_ALREADY_FULLY_RECEIVED");

  const enteredQty = new Prisma.Decimal(input.receivedQty);
  if (enteredQty.gt(outstanding)) throw new Error("PART_LINE_RECEIVE_EXCEEDS_OUTSTANDING");

  const newReceivedQuantity = alreadyReceived.plus(enteredQty);
  const nowFullyReceived = newReceivedQuantity.gte(line.quantity);

  const updated = await prisma.$transaction(async (tx) => {
    const record = await tx.jobPartLine.update({
      where: { id: line.id },
      data: {
        status: nowFullyReceived ? "RECEIVED" : "PARTIALLY_RECEIVED",
        receivedQuantity: newReceivedQuantity,
        previousStatus: line.previousStatus ?? line.status,
        updatedById: ctx.userId,
      },
    });
    await addActivity(tx, ctx, jobId, "PART_LINE_RECEIVED", nowFullyReceived
      ? `${line.partNumber}: ${newReceivedQuantity} of ${line.quantity} received (complete).`
      : `${line.partNumber}: ${newReceivedQuantity} of ${line.quantity} received (${line.quantity.minus(newReceivedQuantity)} still outstanding).`,
      { lineId: line.id, receivedQuantity: newReceivedQuantity.toString() });
    return record;
  });

  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "JobPartLine", entityId: updated.id, action: "RECEIVE", afterData: { jobId, lineId, receivedQuantity: updated.receivedQuantity?.toString() } });
  return updated;
}

// Full reset — restores whatever status the line was in before any
// receiving started (not always PENDING) and clears the received quantity
// back to zero, same as ModApp's unmarkPartReceived. There's no per-receipt
// history (just a running total), so this undoes all receiving on the line
// at once rather than "undo the last click."
export async function unmarkPartLineReceived(ctx: RequestContext, jobId: string, lineId: string) {
  const companyId = requireJobs(ctx, "JOBS_EDIT");
  const line = await getPartLineScoped(companyId, jobId, lineId);

  const updated = await prisma.$transaction(async (tx) => {
    const record = await tx.jobPartLine.update({
      where: { id: line.id },
      data: { status: line.previousStatus ?? "PENDING", receivedQuantity: null, previousStatus: null, updatedById: ctx.userId },
    });
    await addActivity(tx, ctx, jobId, "PART_LINE_RECEIVED_UNDONE", `${line.partNumber}: receiving undone, line reset.`, { lineId: line.id });
    return record;
  });

  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "JobPartLine", entityId: updated.id, action: "UNRECEIVE", afterData: { jobId, lineId } });
  return updated;
}

// The supplier's own PO/order reference for this part line, same as
// ModApp's updatePartLineOrderNumber — orderedAt is stamped the first time
// an order number is actually entered (not re-stamped on later edits to the
// same order number) and cleared if the order number is removed.
export async function updatePartLineOrder(ctx: RequestContext, jobId: string, lineId: string, raw: unknown) {
  const companyId = requireJobs(ctx, "JOBS_EDIT");
  const input = jobPartLineOrderUpdateInput.parse(raw);
  const line = await getPartLineScoped(companyId, jobId, lineId);

  const orderNumber = input.orderNumber ?? null;
  const orderedFromSupplierId = input.orderedFromSupplierId ?? null;
  const orderedAt = orderNumber ? line.orderedAt ?? new Date() : null;

  const updated = await prisma.$transaction(async (tx) => {
    const record = await tx.jobPartLine.update({
      where: { id: line.id },
      data: { orderNumber, orderedFromSupplierId, orderedAt, status: orderNumber && line.status === "PENDING" ? "ON_ORDER" : line.status, updatedById: ctx.userId },
    });
    await addActivity(tx, ctx, jobId, "PART_LINE_ORDER_UPDATED", `${line.partNumber}: order details updated.`, { lineId: line.id, orderNumber });
    return record;
  });

  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "JobPartLine", entityId: updated.id, action: "UPDATE_ORDER", afterData: { jobId, lineId, orderNumber } });
  return updated;
}

// Fills in a part line's description after the fact — for the common case
// where a paste or an "Apply job kit" only had part number + qty.
// Deliberately one-shot, same as ModApp's updatePartLineDescription: once a
// description exists, this refuses to touch it again.
export async function updatePartLineDescription(ctx: RequestContext, jobId: string, lineId: string, raw: unknown) {
  const companyId = requireJobs(ctx, "JOBS_EDIT");
  const input = jobPartLineDescriptionUpdateInput.parse(raw);
  const line = await getPartLineScoped(companyId, jobId, lineId);
  if (line.description) throw new Error("PART_LINE_ALREADY_HAS_DESCRIPTION");

  const updated = await prisma.jobPartLine.update({ where: { id: line.id }, data: { description: input.description, updatedById: ctx.userId } });
  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "JobPartLine", entityId: updated.id, action: "UPDATE_DESCRIPTION", afterData: { jobId, lineId } });
  return updated;
}

// 2026-09-16 — follow-up to addPartLinesBulk's stock reservation (user
// request: reserve stock when a part is added so another job can't take
// it). That reservation is only ever released by "Create picking slip"
// consuming it or the line being individually removed (see
// removePartLine below) — a line that stays IN_STOCK and never goes
// through either would otherwise leave its units locked out of Stock
// Levels' available pool forever. Once the job reaches a status where no
// more parts will be picked against it — the same terminal set
// reopenJob already treats as "done" — release whatever's left. Called
// from changeJobStatus/updateJob/closeJob below.
const RESERVATION_RELEASE_STATUSES: readonly string[] = ["COMPLETE", "CLOSED", "CANCELLED", "RETURNED_UNREPAIRED"];

async function releaseJobPartReservationsTx(tx: Prisma.TransactionClient, ctx: RequestContext, companyId: string, jobId: string) {
  const lineIds = (await tx.jobPartLine.findMany({ where: { companyId, jobId }, select: { id: true } })).map((l) => l.id);
  if (lineIds.length === 0) return;
  const reservations = await tx.stockReservation.findMany({
    where: { companyId, referenceType: "JOB", referenceId: { in: lineIds }, status: "ACTIVE" },
  });
  for (const reservation of reservations) {
    try {
      await releaseReservationTx(tx, { ...ctx, companyId }, reservation.id, { reason: "Job reached a status where parts are no longer being picked against it" });
    } catch {
      // Best-effort, same as the reservation attempt itself — never block
      // a status change over a reservation-release failure.
    }
  }
}

export async function removePartLine(ctx: RequestContext, jobId: string, lineId: string) {
  const companyId = requireJobs(ctx, "JOBS_EDIT");
  const line = await getPartLineScoped(companyId, jobId, lineId);

  await prisma.$transaction(async (tx) => {
    // 2026-09-16 — a part line added while in stock may hold an active
    // reservation (see addPartLinesBulk). Release it before deleting the
    // line so those units become available to other jobs again, rather
    // than staying locked against a reservation nothing can ever consume.
    const activeReservation = await tx.stockReservation.findFirst({
      where: { companyId, referenceType: "JOB", referenceId: line.id, status: "ACTIVE" },
    });
    if (activeReservation) {
      try {
        await releaseReservationTx(tx, { ...ctx, companyId }, activeReservation.id, { reason: "Part line removed from job" });
      } catch {
        // Best-effort, same as the reservation attempt itself — never
        // block deleting the part line over a reservation-release failure.
      }
    }

    await tx.jobPartLine.delete({ where: { id: line.id } });
    await addActivity(tx, ctx, jobId, "PART_REMOVED", `Part line removed: ${line.partNumber}.`, { lineId: line.id, partNumber: line.partNumber });

    // 2026-09-14 — user request: "When deleting a part number in jobs
    // view, make sure that the RFQ if not sent is also deleted, if sent
    // then must stay." A JobRfqRequest snapshots the job's whole parts
    // list (there's no per-line link), so "not sent" here means any RFQ
    // still sitting in REQUESTED (legacy, no send ever attempted)/
    // FAILED/SKIPPED — no email actually reached the supplier for those,
    // so their now-stale parts snapshot is safe to clear out. SENT and
    // QUOTED requests (a real email went out, or a quote already came
    // back) are left untouched — the supplier already has that.
    const unsentRfqs = await tx.jobRfqRequest.findMany({ where: { companyId, jobId, status: { in: ["REQUESTED", "FAILED", "SKIPPED"] } }, include: { supplier: { select: { name: true } } } });
    for (const rfq of unsentRfqs) {
      await tx.jobRfqRequest.delete({ where: { id: rfq.id } });
      await addActivity(tx, ctx, jobId, "RFQ_REQUEST_REMOVED", `Quote request to ${rfq.supplier.name} removed — never sent, and a part was deleted from the list.`, { rfqRequestId: rfq.id, reason: "PART_LINE_DELETED", partNumber: line.partNumber });
    }
  });

  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "JobPartLine", entityId: line.id, action: "DELETE", afterData: { jobId, lineId, partNumber: line.partNumber } });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Outwork — new. Added 2026-09-09 at the user's request: "The outwork
// section from modapp should also be added to apollo". Mirrors ModApp's
// OutworkItem actions (addOutworkItems, markOutworkItemsReceived,
// editOutworkItem, unmarkOutworkItemReceived, deleteOutworkItem).
//
// Deliberately NOT ported from ModApp: printable delivery-note generation
// (saveGeneratedJobDocument/renderPrintDocument/DocumentBranding) — Apollo X
// has no document-branding/print-template subsystem yet, so this is
// record-keeping only (what was sent, to whom, when, and when it came
// back) rather than also producing a printable note.
// ---------------------------------------------------------------------------

export async function addOutworkItems(ctx: RequestContext, jobId: string, raw: unknown) {
  const companyId = requireJobs(ctx, "JOBS_EDIT");
  const input = outworkAddInput.parse(raw);
  await getJobScoped(companyId, jobId);

  const supplier = await prisma.supplier.findFirst({ where: { id: input.supplierId, companyId, active: true }, select: { id: true, name: true } });
  if (!supplier) notFound();

  // One batchId per submission (not per line) — added 2026-09-09 so a
  // "View delivery note" on any historical item can show the whole group
  // of items sent together, the same way the transient note shown right
  // after submitting naturally covers the whole batch. crypto.randomUUID()
  // is a Node/Web-standard global (available since Node 19) — no new
  // dependency needed.
  const batchId = crypto.randomUUID();

  const created = await prisma.$transaction(async (tx) => {
    await tx.outworkItem.createMany({
      data: input.lines.map((line) => ({
        companyId,
        jobId,
        supplierId: input.supplierId,
        description: line.description,
        quantity: line.quantity,
        dateSentOut: input.dateSentOut,
        status: "SENT_OUT",
        batchId,
        createdById: ctx.userId,
        updatedById: ctx.userId,
      })),
    });
    await addActivity(tx, ctx, jobId, "OUTWORK_SENT", `${input.lines.length} item${input.lines.length === 1 ? "" : "s"} sent to ${supplier.name}.`, { supplierId: supplier.id, count: input.lines.length });
    return input.lines.length;
  });

  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "OutworkItem", entityId: jobId, action: "CREATE", afterData: { jobId, supplierId: input.supplierId, count: created, batchId } });
  return { ok: true, count: created, batchId };
}

// Marks one or more outwork items received in a single call — a supplier
// may return part of a batch before the rest, so this only touches the ids
// given (scoped to this job, even if a stray id from elsewhere was passed).
export async function markOutworkItemsReceived(ctx: RequestContext, jobId: string, raw: unknown) {
  const companyId = requireJobs(ctx, "JOBS_EDIT");
  const input = outworkReceiveInput.parse(raw);
  await getJobScoped(companyId, jobId);

  const items = await prisma.outworkItem.findMany({ where: { id: { in: input.itemIds }, companyId, jobId } });
  if (items.length === 0) throw new Error("OUTWORK_ITEMS_NOT_FOUND");

  const dateReceived = input.receivedDate ?? new Date();

  await prisma.$transaction(async (tx) => {
    await tx.outworkItem.updateMany({ where: { id: { in: items.map((i) => i.id) } }, data: { status: "RECEIVED", dateReceived, updatedById: ctx.userId } });
    await addActivity(tx, ctx, jobId, "OUTWORK_RECEIVED", `${items.length} item${items.length === 1 ? "" : "s"} marked received.`, { itemIds: items.map((i) => i.id) });
  });

  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "OutworkItem", entityId: jobId, action: "RECEIVE", afterData: { jobId, itemIds: items.map((i) => i.id) } });
  return { ok: true, count: items.length };
}

// Corrects a single outwork line after the fact — wrong supplier, a typo'd
// description, the wrong quantity, or the wrong date sent out. Always edits
// an existing line in place; adding new lines goes through addOutworkItems.
export async function editOutworkItem(ctx: RequestContext, jobId: string, itemId: string, raw: unknown) {
  const companyId = requireJobs(ctx, "JOBS_EDIT");
  const input = outworkEditInput.parse(raw);
  const item = await getOutworkItemScoped(companyId, jobId, itemId);

  const supplier = await prisma.supplier.findFirst({ where: { id: input.supplierId, companyId, active: true }, select: { id: true, name: true } });
  if (!supplier) notFound();

  const updated = await prisma.$transaction(async (tx) => {
    const record = await tx.outworkItem.update({
      where: { id: item.id },
      data: { supplierId: input.supplierId, description: input.description, quantity: input.quantity, dateSentOut: input.dateSentOut, notes: input.notes || null, updatedById: ctx.userId },
    });
    await addActivity(tx, ctx, jobId, "OUTWORK_EDITED", `Outwork item updated: ${input.description}.`, { itemId: item.id });
    return record;
  });

  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "OutworkItem", entityId: updated.id, action: "UPDATE", afterData: { jobId, itemId } });
  return updated;
}

// Outwork only has the two states (SENT_OUT / RECEIVED), so unlike the
// parts list's "remember whatever status it was in before" logic, there's
// only one place to return to.
export async function unmarkOutworkItemReceived(ctx: RequestContext, jobId: string, itemId: string) {
  const companyId = requireJobs(ctx, "JOBS_EDIT");
  const item = await getOutworkItemScoped(companyId, jobId, itemId);

  const updated = await prisma.$transaction(async (tx) => {
    const record = await tx.outworkItem.update({ where: { id: item.id }, data: { status: "SENT_OUT", dateReceived: null, updatedById: ctx.userId } });
    await addActivity(tx, ctx, jobId, "OUTWORK_RECEIVED_UNDONE", `Outwork item reset to sent-out: ${item.description}.`, { itemId: item.id });
    return record;
  });

  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "OutworkItem", entityId: updated.id, action: "UNRECEIVE", afterData: { jobId, itemId } });
  return updated;
}

// A disposable line item with no downstream cascade — nothing else
// references an OutworkItem by id.
export async function deleteOutworkItem(ctx: RequestContext, jobId: string, itemId: string) {
  const companyId = requireJobs(ctx, "JOBS_EDIT");
  const item = await getOutworkItemScoped(companyId, jobId, itemId);

  await prisma.$transaction(async (tx) => {
    await tx.outworkItem.delete({ where: { id: item.id } });
    await addActivity(tx, ctx, jobId, "OUTWORK_DELETED", `Outwork item removed: ${item.description}.`, { itemId: item.id });
  });

  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "OutworkItem", entityId: item.id, action: "DELETE", afterData: { jobId, itemId } });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Attachments — new. Added 2026-09-14 at the user's request ("Attachments
// to be able to download via job view, have a attachments section,
// view/delete"). Stored inline as bytes, same convention as
// JobRfqQuote/SupportTicketAttachment — see JobAttachment's schema.prisma
// comment for why (the user's explicit choice, real object storage
// deliberately deferred).
// ---------------------------------------------------------------------------

const ALLOWED_ATTACHMENT_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/zip",
];
const MAX_ATTACHMENT_BYTES = 8_000_000;

async function getJobAttachmentScoped(companyId: string, jobId: string, attachmentId: string) {
  const attachment = await prisma.jobAttachment.findFirst({ where: { id: attachmentId, companyId, jobId } });
  if (!attachment) notFound();
  return attachment;
}

// Uploads a new attachment — 8MB cap, allow-listed mime types, same shape
// as the RFQ quote file upload (see decodeQuoteFile in rfq/service.ts).
export async function addJobAttachment(ctx: RequestContext, jobId: string, raw: unknown) {
  const companyId = requireJobs(ctx, "JOBS_EDIT");
  const input = attachmentUploadInput.parse(raw);
  await getJobScoped(companyId, jobId);

  if (!ALLOWED_ATTACHMENT_MIME_TYPES.includes(input.mimeType)) throw new Error("INVALID_ATTACHMENT_TYPE");
  const data = Buffer.from(input.contentBase64, "base64");
  if (data.length > MAX_ATTACHMENT_BYTES) throw new Error("ATTACHMENT_TOO_LARGE");
  const fileName = input.fileName.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 160);

  const attachment = await prisma.$transaction(async (tx) => {
    const record = await tx.jobAttachment.create({
      data: { companyId, jobId, fileName, mimeType: input.mimeType, sizeBytes: data.length, data, notes: input.notes || null, createdById: ctx.userId },
      select: { id: true, fileName: true, mimeType: true, sizeBytes: true, notes: true, createdAt: true, createdBy: { select: { displayName: true } } },
    });
    await addActivity(tx, ctx, jobId, "ATTACHMENT_UPLOADED", `Attachment uploaded: ${fileName}.`, { attachmentId: record.id, fileName });
    return record;
  });

  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "JobAttachment", entityId: attachment.id, action: "CREATE", afterData: { jobId, fileName, sizeBytes: data.length } });
  return attachment;
}

// Hands back the file as base64 so the client can build a data: URL to
// view/download it — same convention as getRfqQuoteFile.
export async function getJobAttachmentFile(ctx: RequestContext, jobId: string, attachmentId: string) {
  const companyId = requireJobsRead(ctx);
  const attachment = await getJobAttachmentScoped(companyId, jobId, attachmentId);
  return { fileName: attachment.fileName, mimeType: attachment.mimeType, contentBase64: attachment.data.toString("base64") };
}

// 2026-09-15 — user request: "once a note is added [to an attachment],
// allow a user to edit it as well." The file itself is immutable (upload a
// new attachment to replace it); only the note text changes. Reuses
// ATTACHMENT_UPLOADED for the history entry with an `edited: true` flag,
// same reuse-rather-than-add-an-enum-value approach used for job notes
// above — avoids a migration for a one-line history entry.
export async function updateJobAttachmentNotes(ctx: RequestContext, jobId: string, attachmentId: string, raw: unknown) {
  const companyId = requireJobs(ctx, "JOBS_EDIT");
  const input = jobAttachmentNotesUpdateInput.parse(raw);
  const attachment = await getJobAttachmentScoped(companyId, jobId, attachmentId);
  const updated = await prisma.$transaction(async (tx) => {
    const record = await tx.jobAttachment.update({
      where: { id: attachment.id },
      data: { notes: input.notes || null },
      select: { id: true, fileName: true, mimeType: true, sizeBytes: true, notes: true, createdAt: true, createdBy: { select: { displayName: true } } },
    });
    await addActivity(tx, ctx, jobId, "ATTACHMENT_UPLOADED", `Attachment note updated: ${attachment.fileName}.`, { attachmentId: attachment.id, edited: true });
    return record;
  });
  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "JobAttachment", entityId: attachment.id, action: "UPDATE", afterData: { jobId, attachmentId } });
  return updated;
}

export async function deleteJobAttachment(ctx: RequestContext, jobId: string, attachmentId: string) {
  const companyId = requireJobs(ctx, "JOBS_EDIT");
  const attachment = await getJobAttachmentScoped(companyId, jobId, attachmentId);

  await prisma.$transaction(async (tx) => {
    await tx.jobAttachment.delete({ where: { id: attachment.id } });
    await addActivity(tx, ctx, jobId, "ATTACHMENT_DELETED", `Attachment removed: ${attachment.fileName}.`, { attachmentId: attachment.id, fileName: attachment.fileName });
  });

  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "JobAttachment", entityId: attachment.id, action: "DELETE", afterData: { jobId, attachmentId } });
  return { ok: true };
}