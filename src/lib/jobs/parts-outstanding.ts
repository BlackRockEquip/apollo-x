import type { RequestContext } from "@/lib/auth/context-types";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";

// New — 2026-10-05, user request: Parts > "Parts Outstanding" tab — "list all
// jobs that have parts outstanding no matter if it's in RFQs or manually added
// parts", with the columns Job#, Supplier, Parts Outstanding (the quantity) and
// Days Outstanding.
//
// One row per job + supplier. Same day, user clarified what counts: "All parts
// that are not mark received should be listed" — so EVERY part line that has
// not been marked received is listed (in stock, on a pick slip, on order or
// not ordered yet alike), and the quantity is what has not been received yet
// (quantity - received). Only cancelled jobs are left out.
//
// Supplier column: the supplier the line was ordered from. A line with no
// supplier that is already in stock / on a pick slip shows "From stock"; any
// other line with no supplier shows the supplier(s) an RFQ for that job was sent
// to, so parts that are only being chased through an RFQ still show who is
// quoting; with neither, it is "Not ordered yet".
//
// Same day, user request: "parts are only outstanding once the job status
// changes to Await Outwork/Parts or higher." So a job's parts only appear here
// once the job has reached the Await outwork / parts stage or any later one
// (see OUTSTANDING_JOB_STATUSES). Before that (quoting, stripping, etc.) the job
// is still working out what it needs and nothing is "outstanding" yet. A field
// service job has no such stage; it counts from In progress onward. Cancelled
// jobs and jobs flagged Return unrepaired (Job.returnedUnrepaired — a flag on
// top of the job's normal status, added on the user's instruction) never count. This applies to
// this list only — the RFQs table's own Parts outstanding column is unchanged.
export type PartsOutstandingRow = {
  key: string;
  jobId: string;
  jobNumber: string;
  supplierId: string | null;
  supplierName: string;
  ordered: boolean;
  partLines: number;
  quantityOutstanding: number;
  outstandingSince: string | null;
};


// Main workshop flow from "Await outwork / parts" (WAITING_FOR_PARTS is the same
// stage under its older name) through Closed, then the field-service stages that
// correspond to "work under way or later".
export const OUTSTANDING_JOB_STATUSES = [
  "AWAIT_OUTWORK", "WAITING_FOR_PARTS", "ASSEMBLY", "TESTING", "TO_PAINT_WRAP", "TO_BE_DELIVERED", "DELIVERED_AWAITING_PAYMENT", "COMPLETE", "CLOSED",
  "IN_PROGRESS", "AWAIT_PAYMENT",
] as const;

export async function listPartsOutstanding(ctx: RequestContext): Promise<PartsOutstandingRow[]> {
  requireModule(ctx, "JOBS_WIP", "READ");
  requireTenantPermission(ctx, "JOBS_VIEW");
  const companyId = ctx.companyId!;

  const lines = await prisma.jobPartLine.findMany({
    where: { companyId, status: { not: "RECEIVED" }, job: { status: { in: [...OUTSTANDING_JOB_STATUSES] }, returnedUnrepaired: false } },
    select: {
      jobId: true, status: true, quantity: true, receivedQuantity: true, orderedAt: true, createdAt: true,
      orderedFromSupplier: { select: { id: true, name: true } },
      job: { select: { jobNumber: true, draftNumber: true } },
    },
  });

  type Group = { jobId: string; jobNumber: string; supplierId: string | null; supplierName: string | null; fromStock: boolean; partLines: number; qty: number; since: Date | null };
  const groups = new Map<string, Group>();
  for (const line of lines) {
    const qty = Number(line.quantity) - Number(line.receivedQuantity ?? 0);
    if (qty <= 0) continue;
    const supplierId = line.orderedFromSupplier?.id ?? null;
    const fromStock = !supplierId && (line.status === "IN_STOCK" || line.status === "PICKED");
    const key = `${line.jobId}:${supplierId ?? (fromStock ? "stock" : "none")}`;
    const since = line.orderedAt ?? line.createdAt;
    const group = groups.get(key) ?? { jobId: line.jobId, jobNumber: line.job.jobNumber ?? line.job.draftNumber, supplierId, supplierName: line.orderedFromSupplier?.name ?? null, fromStock, partLines: 0, qty: 0, since: null };
    group.partLines += 1;
    group.qty += qty;
    if (!group.since || since < group.since) group.since = since;
    groups.set(key, group);
  }

  // RFQ suppliers for jobs that have unassigned outstanding lines.
  const unassignedJobIds = Array.from(new Set(Array.from(groups.values()).filter((g) => !g.supplierId && !g.fromStock).map((g) => g.jobId)));
  const rfqSuppliersByJob = new Map<string, string[]>();
  if (unassignedJobIds.length > 0) {
    const rfqs = await prisma.jobRfqRequest.findMany({
      where: { companyId, jobId: { in: unassignedJobIds } },
      select: { jobId: true, supplier: { select: { name: true } } },
      orderBy: { requestedAt: "asc" },
    });
    for (const rfq of rfqs) {
      const names = rfqSuppliersByJob.get(rfq.jobId) ?? [];
      if (!names.includes(rfq.supplier.name)) names.push(rfq.supplier.name);
      rfqSuppliersByJob.set(rfq.jobId, names);
    }
  }

  return Array.from(groups.entries())
    .map(([key, g]): PartsOutstandingRow => {
      const rfqNames = g.supplierId || g.fromStock ? [] : rfqSuppliersByJob.get(g.jobId) ?? [];
      return {
        key,
        jobId: g.jobId,
        jobNumber: g.jobNumber,
        supplierId: g.supplierId,
        supplierName: g.supplierName ?? (g.fromStock ? "From stock" : rfqNames.length > 0 ? `RFQ sent to ${rfqNames.join(", ")}` : "Not ordered yet"),
        ordered: Boolean(g.supplierId),
        partLines: g.partLines,
        quantityOutstanding: Math.round(g.qty * 10000) / 10000,
        outstandingSince: g.since ? g.since.toISOString() : null,
      };
    })
    // Longest-waiting first.
    .sort((a, b) => (a.outstandingSince ?? "").localeCompare(b.outstandingSince ?? "") || a.jobNumber.localeCompare(b.jobNumber));
}
