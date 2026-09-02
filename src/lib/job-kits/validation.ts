import { z } from "zod";

const optionalText = z.string().trim().max(500).optional().nullable();
const longText = z.string().trim().max(4000).optional().nullable();

export const jobKitListQuery = z.object({
  q: z.string().trim().max(120).default(""),
  status: z.enum(["active", "inactive", "all"]).default("active"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const jobKitLineInput = z.object({
  partId: z.string().cuid(),
  quantityDefault: z.union([z.string().regex(/^\d+(\.\d{1,4})?$/), z.number().positive()]).transform(String).refine((v) => Number(v) > 0, "Quantity must be greater than zero."),
  notes: optionalText,
  sortOrder: z.coerce.number().int().min(0).max(100000).optional(),
});

export const jobKitCreateInput = z.object({
  name: z.string().trim().min(2).max(160),
  description: longText,
  machineMake: optionalText,
  machineModel: optionalText,
  componentType: optionalText,
  active: z.boolean().optional().default(true),
  lines: z.array(jobKitLineInput).default([]),
});

export const jobKitUpdateInput = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  description: longText,
  machineMake: optionalText,
  machineModel: optionalText,
  componentType: optionalText,
  active: z.boolean().optional(),
});

export const jobKitActiveInput = z.object({
  active: z.boolean(),
});

export const jobKitApplyInput = z.object({
  kitId: z.string().cuid(),
});

export type JobKitListQuery = z.infer<typeof jobKitListQuery>;