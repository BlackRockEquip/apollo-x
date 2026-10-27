import { z } from "zod";
import type { RequestContext } from "@/lib/auth/context-types";

// 2026-10-27, Mechanic view: the pure rules behind picking slip requests (input shapes, who may handle a request, merging
// duplicate parts). Kept apart from pick-requests.ts so they can be tested without a database.

const quantity = z
  .union([z.string().regex(/^\d+(\.\d{1,4})?$/), z.number().nonnegative()])
  .transform(String)
  .refine((v) => Number(v) > 0, "Quantity must be greater than zero.");

export const pickSlipRequestCreateInput = z.object({
  jobId: z.string().cuid(),
  lines: z.array(z.object({ partId: z.string().cuid(), quantity })).min(1, "Select at least one part.").max(200),
  note: z.string().trim().max(500).optional().nullable(),
});

export const pickSlipRequestQuery = z.object({
  status: z.enum(["PENDING", "FULFILLED", "DECLINED", "ALL"]).default("PENDING"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const pickSlipRequestDeclineInput = z.object({ reason: z.string().trim().max(500).optional().nullable() });

// Same rule as the Stock Levels screen: a mechanic only asks, everyone else with INVENTORY_ISSUE can create the slip.
export function canHandlePickSlipRequests(ctx: Pick<RequestContext, "tenantRole" | "tenantPermissions">): boolean {
  return ctx.tenantRole !== "USER" && ctx.tenantPermissions.has("INVENTORY_ISSUE");
}

// Merge a part picked twice into one line so one request never carries duplicates.
export function mergeRequestLines(lines: { partId: string; quantity: string }[]): { partId: string; quantity: string }[] {
  const merged = new Map<string, number>();
  for (const line of lines) merged.set(line.partId, (merged.get(line.partId) ?? 0) + Number(line.quantity));
  return Array.from(merged, ([partId, total]) => ({ partId, quantity: String(Math.round(total * 10000) / 10000) }));
}
