import { z } from "zod";

const optionalText = z.string().trim().max(500).optional().nullable();
const longText = z.string().trim().max(4000).optional().nullable();

export const pexStockListQuery = z.object({
  q: z.string().trim().max(120).default(""),
  status: z.enum(["ALL", "AVAILABLE", "SUPPLIED", "QUARANTINE", "SCRAPPED"]).default("ALL"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const pexTrackingListQuery = z.object({
  q: z.string().trim().max(120).default(""),
  status: z.enum(["ALL", "EXPECTED", "RECEIVED", "CLOSED_WITHOUT_RETURN", "OUTSTANDING"]).default("ALL"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const pexTransferInput = z.object({
  jobComponentId: z.string().cuid(),
  storageLocationId: z.string().cuid().optional().nullable(),
  notes: longText,
});

export const pexStockUpdateInput = z.object({
  storageLocationId: z.string().cuid().optional().nullable(),
  notes: longText,
});

export const pexStockStatusInput = z.object({
  reason: optionalText,
  notes: longText,
});

export const pexSupplyLinkCreateInput = z.object({
  pexStockUnitId: z.string().cuid(),
  expectedCoreDescription: optionalText,
  expectedCoreType: optionalText,
  expectedCorePartNumber: optionalText,
  expectedCoreSerial: optionalText,
});

export const pexReturnReceiveInput = z.object({
  returnedCoreDescription: z.string().trim().min(2).max(500),
  returnedCoreType: optionalText,
  returnedCorePartNumber: optionalText,
  returnedCoreSerial: optionalText,
  returnedReceivedAt: z.coerce.date().optional().nullable(),
  returnMismatchReason: z.string().trim().max(500).optional().nullable(),
});

export const pexCloseWithoutReturnInput = z.object({
  closedWithoutReturnReason: z.string().trim().min(2).max(200),
  closedWithoutReturnNote: longText,
});

export const pexCancelLinkInput = z.object({
  reason: z.string().trim().min(2).max(500),
});

export const pexRelinkInput = z.object({
  pexStockUnitId: z.string().cuid(),
  reason: z.string().trim().min(2).max(500),
});