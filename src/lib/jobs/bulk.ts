import { z } from "zod";
import type { RequestContext } from "@/lib/auth/context-types";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { changeJobStatus, closeJob } from "@/lib/jobs/service";
import { allocateJobToPexInventory } from "@/lib/pex/service";
import { JOB_STATUS_LABELS } from "@/lib/jobs/ui";
import { FLOW_JOB_STATUSES } from "@/lib/jobs/validation";

// New — 2026-10-06, user request: Jobs & WIP — "create a bulk update
// (Status, Close/cancel Job, Send to pex)".
//
// Deliberately NOT a second implementation of those actions: each selected job
// is run through the same service function the job page uses
// (changeJobStatus / closeJob / allocateJobToPexInventory), one at a time, so
// every existing rule, permission check, PEX sync, stock-reservation release,
// activity-log line and audit entry applies unchanged. The only thing added
// here is the loop, and a per-job result so one job that can't take the action
// (wrong status for its job type, not received yet, already in PEX...) doesn't
// stop the rest — the caller gets which succeeded, which were skipped (already
// in that state) and which failed with the reason.
const MAX_BULK_JOBS = 200;

export const jobsBulkInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), jobIds: z.array(z.string().min(1)).min(1).max(MAX_BULK_JOBS), status: z.enum(FLOW_JOB_STATUSES) }),
  z.object({ action: z.literal("close"), jobIds: z.array(z.string().min(1)).min(1).max(MAX_BULK_JOBS), outcome: z.string().trim().min(2).max(200), closingNote: z.string().trim().min(2).max(4000) }),
  z.object({ action: z.literal("cancel"), jobIds: z.array(z.string().min(1)).min(1).max(MAX_BULK_JOBS), reason: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal("pex"), jobIds: z.array(z.string().min(1)).min(1).max(MAX_BULK_JOBS) }),
]);

export type JobsBulkResult = {
  action: string;
  succeeded: Array<{ jobId: string; jobNumber: string }>;
  skipped: Array<{ jobId: string; jobNumber: string; reason: string }>;
  failed: Array<{ jobId: string; jobNumber: string; reason: string }>;
};

function friendlyError(error: unknown): string {
  if (error instanceof z.ZodError) return "The request is invalid.";
  if (error instanceof Error) {
    if (error.message === "NOT_FOUND") return "Job not found.";
    return error.message || "Unexpected error.";
  }
  return "Unexpected error.";
}

export async function bulkUpdateJobs(ctx: RequestContext, raw: unknown): Promise<JobsBulkResult> {
  requireModule(ctx, "JOBS_WIP", "WRITE");
  requireTenantPermission(ctx, "JOBS_EDIT");
  const input = jobsBulkInput.parse(raw);
  const companyId = ctx.companyId!;
  const ids = Array.from(new Set(input.jobIds));
  const jobs = await prisma.job.findMany({ where: { companyId, id: { in: ids } }, select: { id: true, jobNumber: true, draftNumber: true, status: true } });
  const byId = new Map(jobs.map((job) => [job.id, job]));

  const result: JobsBulkResult = { action: input.action, succeeded: [], skipped: [], failed: [] };
  for (const id of ids) {
    const job = byId.get(id);
    const jobNumber = job ? job.jobNumber ?? job.draftNumber : id;
    if (!job) { result.failed.push({ jobId: id, jobNumber, reason: "Job not found." }); continue; }
    try {
      switch (input.action) {
        case "status":
          // Re-saving the same status would add a fake "status changed" entry
          // (and restart the dashboard's time-in-status clock), so skip it.
          if (job.status === input.status) { result.skipped.push({ jobId: id, jobNumber, reason: `Already ${JOB_STATUS_LABELS[job.status]}.` }); continue; }
          await changeJobStatus(ctx, id, { status: input.status });
          break;
        case "close":
          if (job.status === "CLOSED" || job.status === "CANCELLED") { result.skipped.push({ jobId: id, jobNumber, reason: `Already ${JOB_STATUS_LABELS[job.status]}.` }); continue; }
          await closeJob(ctx, id, { outcome: input.outcome, closingNote: input.closingNote });
          break;
        case "cancel":
          if (job.status === "CANCELLED") { result.skipped.push({ jobId: id, jobNumber, reason: "Already cancelled." }); continue; }
          await changeJobStatus(ctx, id, { status: "CANCELLED", reason: input.reason || "Cancelled in bulk from Jobs & WIP" });
          break;
        case "pex":
          await allocateJobToPexInventory(ctx, id);
          break;
      }
      result.succeeded.push({ jobId: id, jobNumber });
    } catch (error) {
      result.failed.push({ jobId: id, jobNumber, reason: friendlyError(error) });
    }
  }
  return result;
}
