import { z } from "zod";

const optionalText = z.string().trim().max(500).optional().nullable();
const longText = z.string().trim().max(4000).optional().nullable();
const optionalDate = z.coerce.date().optional().nullable();
const optionalId = z.string().cuid().optional().nullable();

export const jobCreateDraftInput = z.object({
  customerId: z.string().cuid(),
  customerReference: optionalText,
  customerPo: optionalText,
  dateReceived: optionalDate,
  machineModel: optionalText,
  machineSerial: optionalText,
  component: optionalText,
  componentType: optionalText,
  componentSerial: optionalText,
  componentPartNumber: optionalText,
  description: longText,
  type: z.enum(["STANDARD_REPAIR", "PARTIAL_REPAIR", "PEX_SUPPLY", "PEX_RETURN", "OUTRIGHT_SALE", "FIELD_SERVICE", "WARRANTY"]),
  etaDate: optionalDate,
  relationshipNotes: longText,
  relatedJobId: optionalId,
  stripMechanicId: optionalId,
  buildMechanicId: optionalId,
});

export const jobUpdateInput = jobCreateDraftInput.partial().extend({
  status: z.enum(["DRAFT", "TO_BE_COLLECTED", "TO_BE_RECEIVED", "STRIPPING", "QUOTE_IN_PROGRESS", "AWAITING_GO_AHEAD", "WAITING_FOR_PARTS", "ASSEMBLY", "TESTING", "TO_BE_DELIVERED", "COMPLETE", "CLOSED", "CANCELLED"]).optional(),
});

export const jobRegisterInput = z.object({
  initialStatus: z.enum(["TO_BE_COLLECTED", "TO_BE_RECEIVED", "STRIPPING", "QUOTE_IN_PROGRESS", "AWAITING_GO_AHEAD", "WAITING_FOR_PARTS", "ASSEMBLY", "TESTING", "TO_BE_DELIVERED", "COMPLETE"]).default("TO_BE_RECEIVED"),
});

export const jobStatusChangeInput = z.object({
  status: z.enum(["TO_BE_COLLECTED", "TO_BE_RECEIVED", "STRIPPING", "QUOTE_IN_PROGRESS", "AWAITING_GO_AHEAD", "WAITING_FOR_PARTS", "ASSEMBLY", "TESTING", "TO_BE_DELIVERED", "COMPLETE", "CANCELLED"]),
  reason: optionalText,
});

export const jobCloseInput = z.object({
  outcome: z.string().trim().min(2).max(200),
  closingNote: z.string().trim().min(2).max(4000),
});

export const jobReopenInput = z.object({
  status: z.enum(["TO_BE_COLLECTED", "TO_BE_RECEIVED", "STRIPPING", "QUOTE_IN_PROGRESS", "AWAITING_GO_AHEAD", "WAITING_FOR_PARTS", "ASSEMBLY", "TESTING", "TO_BE_DELIVERED", "COMPLETE"]),
  reason: optionalText,
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

export const jobPartRequirementCreateInput = z.object({
  partId: z.string().cuid(),
  quantityRequired: z.coerce.number().positive(),
  notes: optionalText,
  etaDate: optionalDate,
});

export const jobPartRequirementUpdateInput = z.object({
  quantityRequired: z.coerce.number().positive().optional(),
  notes: optionalText,
  etaDate: optionalDate,
  active: z.boolean().optional(),
});

export const jobPartReserveInput = z.object({
  locationId: z.string().cuid(),
  quantity: z.union([z.string().regex(/^\d+(\.\d{1,4})?$/), z.number().nonnegative()]).transform(String).refine((v) => Number(v) > 0, "Quantity must be greater than zero."),
  referenceNumber: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  idempotencyKey: z.string().trim().min(8).max(120).optional(),
});

export const jobPartIssueInput = z.object({
  quantity: z.union([z.string().regex(/^\d+(\.\d{1,4})?$/), z.number().nonnegative()]).transform(String).refine((v) => Number(v) > 0, "Quantity must be greater than zero."),
  referenceNumber: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  idempotencyKey: z.string().trim().min(8).max(120).optional(),
});

export const jobPartReturnInput = z.object({
  quantity: z.union([z.string().regex(/^\d+(\.\d{1,4})?$/), z.number().nonnegative()]).transform(String).refine((v) => Number(v) > 0, "Quantity must be greater than zero."),
  disposition: z.enum(["UNUSED_SURPLUS", "REQUIREMENT_REMAINS"]),
  notes: z.string().trim().max(2000).optional().nullable(),
  idempotencyKey: z.string().trim().min(8).max(120).optional(),
});

export const jobPartReleaseInput = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const jobsListQuery = z.object({
  q: z.string().trim().max(120).default(""),
  view: z.enum(["all", "wip", "completed"]).default("all"),
  status: z.enum(["DRAFT", "TO_BE_COLLECTED", "TO_BE_RECEIVED", "STRIPPING", "QUOTE_IN_PROGRESS", "AWAITING_GO_AHEAD", "WAITING_FOR_PARTS", "ASSEMBLY", "TESTING", "TO_BE_DELIVERED", "COMPLETE", "CLOSED", "CANCELLED"]).optional(),
  type: z.enum(["STANDARD_REPAIR", "PARTIAL_REPAIR", "PEX_SUPPLY", "PEX_RETURN", "OUTRIGHT_SALE", "FIELD_SERVICE", "WARRANTY"]).optional(),
  sort: z.enum(["newest", "oldest"]).default("newest"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type JobsListQuery = z.infer<typeof jobsListQuery>;
export type JobPartReturnInput = z.infer<typeof jobPartReturnInput>;