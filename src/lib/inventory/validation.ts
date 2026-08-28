import { z } from "zod";

// Quantities are decimal strings with up to 4 places (matches DECIMAL(19,4)).
// Floating point never crosses the service boundary.
const qty = z
  .union([z.string().regex(/^\d+(\.\d{1,4})?$/), z.number().nonnegative()])
  .transform(String)
  .refine((v) => Number(v) > 0, "Quantity must be greater than zero.");
const countedQty = z
  .union([z.string().regex(/^\d+(\.\d{1,4})?$/), z.number().nonnegative()])
  .transform(String);
const money = z.union([z.string().regex(/^\d+(\.\d{1,4})?$/), z.number().nonnegative()]).optional().nullable();
const optionalId = z.string().cuid().optional().nullable();
const shortText = z.string().trim().max(120).optional().nullable();
const longText = z.string().trim().max(2000).optional().nullable();
const idempotencyKey = z.string().trim().min(8).max(120).optional();
const issueReferenceType = z.enum(["GENERAL", "JOB", "PEX_REPAIR", "SALES_ORDER"]).default("GENERAL");

export const receiptInput = z.object({
  partId: z.string().cuid(),
  locationId: z.string().cuid(),
  quantity: qty,
  unitCost: money,
  supplierId: optionalId,
  supplierDeliveryNote: shortText,
  referenceNumber: shortText,
  notes: longText,
  idempotencyKey,
});

export const transferInput = z
  .object({
    partId: z.string().cuid(),
    fromLocationId: z.string().cuid(),
    toLocationId: z.string().cuid(),
    quantity: qty,
    reason: shortText,
    referenceNumber: shortText,
    notes: longText,
    idempotencyKey,
  })
  .refine((v) => v.fromLocationId !== v.toLocationId, { message: "Source and destination locations must differ.", path: ["toLocationId"] });

export const issueInput = z.object({
  partId: z.string().cuid(),
  locationId: z.string().cuid(),
  quantity: qty,
  referenceType: issueReferenceType,
  referenceId: optionalId,
  referenceNumber: shortText,
  reason: shortText,
  notes: longText,
  idempotencyKey,
});

export const returnInput = z.object({
  partId: z.string().cuid(),
  locationId: z.string().cuid(),
  quantity: qty,
  sourceMovementId: optionalId,
  reason: shortText,
  notes: longText,
  idempotencyKey,
});

export const adjustmentInput = z.object({
  partId: z.string().cuid(),
  locationId: z.string().cuid(),
  direction: z.enum(["IN", "OUT", "SCRAP"]),
  quantity: qty,
  reason: z.string().trim().min(3).max(500),
  notes: longText,
  idempotencyKey,
});

export const reservationInput = z.object({
  partId: z.string().cuid(),
  locationId: z.string().cuid(),
  quantity: qty,
  referenceType: issueReferenceType,
  referenceId: optionalId,
  referenceNumber: shortText,
  reason: shortText,
  notes: longText,
  expiresAt: z.coerce.date().optional().nullable(),
  idempotencyKey,
});

export const releaseInput = z.object({ reason: z.string().trim().max(500).optional() });

export const reversalInput = z.object({ reason: z.string().trim().min(3).max(500) });

export const countCreateInput = z.object({
  locationId: z.string().cuid(),
  referenceNumber: shortText,
  notes: longText,
  lines: z
    .array(
      z.object({
        partId: z.string().cuid(),
        countedQuantity: countedQty,
        reason: shortText,
      })
    )
    .max(500)
    .default([]),
});

export const countNoteInput = z.object({ notes: longText });

export const movementQuery = z.object({
  partId: optionalId,
  locationId: optionalId,
  movementType: z
    .enum(["RECEIPT", "TRANSFER", "ISSUE", "RETURN", "ADJUSTMENT_IN", "ADJUSTMENT_OUT", "RESERVATION", "RESERVATION_RELEASE", "PICK", "UNPICK", "REVERSAL", "RECONCILIATION", "SCRAP"])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const positionQuery = z.object({
  q: z.string().trim().max(100).default(""),
  locationId: optionalId,
  manufacturerId: optionalId,
  category: z.string().trim().max(100).optional(),
  stockState: z.enum(["ALL", "IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK", "RESERVED", "PARTIALLY_RESERVED", "INACTIVE_PART"]).default("ALL"),
  active: z.enum(["all", "active", "inactive"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const countQuery = z.object({
  status: z.enum(["OPEN", "COMPLETED", "APPROVED", "CANCELLED"]).optional(),
  locationId: optionalId,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type PositionQueryInput = z.infer<typeof positionQuery>;
export type MovementQueryInput = z.infer<typeof movementQuery>;
export type CountQueryInput = z.infer<typeof countQuery>;
