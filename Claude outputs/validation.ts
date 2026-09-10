import { z } from "zod";

const optionalText = z.string().trim().max(500).optional().nullable();
const longText = z.string().trim().max(4000).optional().nullable();
const optionalDate = z.coerce.date().optional().nullable();
const optionalId = z.string().cuid().optional().nullable();
const optionalDecimal = z.union([z.string().regex(/^\d+(\.\d{1,4})?$/), z.number().nonnegative()]).transform(String).optional().nullable();

// Single source of truth for the JobStatus enum on the validation side —
// see schema.prisma's JobStatus for the authoritative list and per-value
// comments, and src/lib/jobs/ui.ts for which subset applies to which job
// type (flow families). Kept as one array here so every endpoint below
// stays in sync instead of repeating (and drifting from) the same list.
export const ALL_JOB_STATUSES = [
  "DRAFT", "TO_BE_COLLECTED", "TO_BE_RECEIVED", "TO_STRIP", "STRIPPING", "QUOTE_IN_PROGRESS",
  "AWAITING_GO_AHEAD", "AWAIT_OUTWORK", "WAITING_FOR_PARTS", "ASSEMBLY", "TESTING", "TO_PAINT_WRAP",
  "TO_BE_DELIVERED", "DELIVERED_AWAITING_PAYMENT", "COMPLETE", "CLOSED", "CANCELLED", "RETURNED_UNREPAIRED",
  "TO_ATTEND", "ON_ROUTE", "IN_PROGRESS", "AWAIT_PAYMENT", "RECEIVED", "INSPECTING",
] as const;

// Valid as an initial/mid-flow status for register, status-change and
// reopen actions — excludes the DRAFT/CLOSED/CANCELLED wrapper states
// (those go through their own dedicated register/close actions, not a
// plain status set) and RETURNED_UNREPAIRED (only reachable via its own
// dedicated "mark returned unrepaired" action, since it carries a reason
// and is a deliberate off-ramp rather than a stepper stage).
export const FLOW_JOB_STATUSES = ALL_JOB_STATUSES.filter(
  (status) => !["DRAFT", "CLOSED", "CANCELLED", "RETURNED_UNREPAIRED"].includes(status),
) as [(typeof ALL_JOB_STATUSES)[number], ...(typeof ALL_JOB_STATUSES)[number][]];

const jobTypeEnum = z.enum(["STANDARD_REPAIR", "PARTIAL_REPAIR", "PEX_SUPPLY", "PEX_RETURN", "OUTRIGHT_SALE", "FIELD_SERVICE", "WARRANTY"]);
const deliveryTypeEnum = z.enum(["INTERNAL_BAKKIE", "INTERNAL_TRUCK", "INTERNAL_COURIER", "EXTERNAL_BAKKIE", "EXTERNAL_TRUCK", "EXTERNAL_COURIER"]);
const purchaseOrderStatusEnum = z.enum(["TBA", "AWAIT_PAYMENT", "PARTIALLY_PAID", "PAID", "NOT_APPLICABLE"]);

export const jobCreateDraftInput = z.object({
  customerId: z.string().cuid(),
  customerReference: optionalText,
  customerPo: optionalText,
  dateReceived: optionalDate,
  machineMake: optionalText,
  machineModel: optionalText,
  machineSerial: optionalText,
  component: optionalText,
  componentType: optionalText,
  componentSerial: optionalText,
  componentPartNumber: optionalText,
  description: longText,
  type: jobTypeEnum,
  etaDate: optionalDate,
  mechanicEtaDate: optionalDate,
  relationshipNotes: longText,
  relatedJobId: optionalId,
  stripMechanicId: optionalId,
  buildMechanicId: optionalId,
  // Field-parity additions (see schema.prisma's Job model comment) — all
  // optional, same as ModApp's equivalent fields.
  quoteNumber: optionalText,
  quoteDate: optionalDate,
  salesOrderNumber: optionalText,
  salesOrderDate: optionalDate,
  invoiceNumber: optionalText,
  invoiceDate: optionalDate,
  purchaseOrderNumber: optionalText,
  purchaseOrderDate: optionalDate,
  purchaseOrderStatus: purchaseOrderStatusEnum.optional(),
  deliveryDate: optionalDate,
  deliveryType: deliveryTypeEnum.optional().nullable(),
  receivingTransport: deliveryTypeEnum.optional().nullable(),
  kmsTravelled: z.coerce.number().int().min(0).max(100000).optional().nullable(),
  paymentDateReceived: optionalDate,
  paymentNotApplicable: z.boolean().optional(),
  machineHours: optionalDecimal,
  plantNumber: optionalText,
  reportNumber: optionalText,
  importTrackingNumber: optionalText,
  previousJobNumber: optionalText,
  salesRepresentative: optionalText,
});

export const jobUpdateInput = jobCreateDraftInput.partial().extend({
  status: z.enum(ALL_JOB_STATUSES).optional(),
});

export const jobRegisterInput = z.object({
  initialStatus: z.enum(FLOW_JOB_STATUSES).default("TO_BE_RECEIVED"),
});

export const jobStatusChangeInput = z.object({
  status: z.enum([...FLOW_JOB_STATUSES, "CANCELLED"] as [string, ...string[]]),
  reason: optionalText,
});

export const jobCloseInput = z.object({
  outcome: z.string().trim().min(2).max(200),
  closingNote: z.string().trim().min(2).max(4000),
});

export const jobReopenInput = z.object({
  status: z.enum(FLOW_JOB_STATUSES),
  reason: optionalText,
});

// A job that was quoted and the client declined, asking for it back
// unrepaired — reversible via jobReopenInput (reopens back onto
// AWAITING_GO_AHEAD, see RETURNED_UNREPAIRED_REOPEN_STATUS in
// src/lib/jobs/ui.ts). Main workshop flow only — the service layer should
// reject this for FIELD_SERVICE jobs (see canMarkReturnedUnrepaired).
export const jobMarkReturnedUnrepairedInput = z.object({
  reason: z.string().trim().min(2).max(500),
});

export const jobNoteCreateInput = z.object({
  note: z.string().trim().min(2).max(4000),
});

export const jobFieldServiceInput = z.object({
  site: optionalText,
  technician: optionalText,
  vehicle: optionalText,
  hours: z.coerce.number().min(0).max(100000).optional().nullable(),
  report: longText,
});

export const jobWarrantyInput = z.object({
  status: z.enum(["PENDING", "GRANTED", "DECLINED"]),
  notes: longText,
  historicalSourceStatus: optionalText,
});

// Parts list (replaces the old reserve/issue/return "Parts required"
// workflow — see schema.prisma's JobPartLine comment, added 2026-09-09 at
// the user's request: "the parts required section in apollo should be
// removed and the parts list section in modapp should be added"). Mirrors
// ModApp's AddPartLinesForm: a paste box, one row per line, where each row
// is "partNumber, quantity[, description]" (comma- or tab-separated — a
// straight paste out of Excel works without retyping commas). Rows with no
// recognizable part number or a non-positive quantity are dropped rather
// than failing the whole paste, same as ModApp's parseBulkPartRow.
export const jobPartLineBulkAddInput = z.object({
  bulkLines: z.string().trim().min(1, "Paste at least one part line."),
});

export const jobPartLineOrderUpdateInput = z.object({
  orderNumber: optionalText,
  orderedFromSupplierId: optionalId,
});

// One-shot, same as ModApp's updatePartLineDescription — the service layer
// refuses this once a description already exists on the line.
export const jobPartLineDescriptionUpdateInput = z.object({
  description: z.string().trim().min(1).max(500),
});

// receivedQty accumulates on top of whatever has already been received —
// see markPartLineReceived's comment in service.ts.
export const jobPartLineReceiveInput = z.object({
  receivedQty: z.coerce.number().positive("Enter a quantity greater than 0."),
});

// Outwork (new — added 2026-09-09 at the user's request: "The outwork
// section from modapp should also be added to apollo"). One supplier + one
// "date sent out" per submission, with a repeatable table of
// description/qty rows underneath — mirrors OutworkAddForm.tsx. No
// printable delivery-note generation here (Apollo X has no document-
// branding/print-template subsystem yet) — this is record-keeping only.
export const outworkLineInput = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.coerce.number().int().positive().default(1),
});

export const outworkAddInput = z.object({
  supplierId: z.string().cuid(),
  dateSentOut: optionalDate,
  lines: z.array(outworkLineInput).min(1, "Add at least one item with a description."),
});

export const outworkEditInput = z.object({
  supplierId: z.string().cuid(),
  description: z.string().trim().min(1).max(500),
  quantity: z.coerce.number().int().positive(),
  dateSentOut: optionalDate,
});

export const outworkReceiveInput = z.object({
  itemIds: z.array(z.string().cuid()).min(1, "Select at least one item."),
  receivedDate: optionalDate,
});

export const jobsListQuery = z.object({
  q: z.string().trim().max(120).default(""),
  view: z.enum(["all", "wip", "completed"]).default("all"),
  status: z.enum(ALL_JOB_STATUSES).optional(),
  type: jobTypeEnum.optional(),
  sort: z.enum(["newest", "oldest"]).default("newest"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type JobsListQuery = z.infer<typeof jobsListQuery>;
export type OutworkAddInput = z.infer<typeof outworkAddInput>;
