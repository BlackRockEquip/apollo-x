import { prisma } from "@/lib/prisma";
import type { RequestContext } from "@/lib/auth/context-types";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";

// 2026-10-08, user request: "when inside a job, is it possible to create a
// small profile circle to see who is in the job, at the top right below the
// close job cancel job buttons." A job page that is open sends a heartbeat
// every 3 seconds; anyone seen in the last 20 seconds counts as being in the
// job. Leaving (closing the job or the tab) removes the row straight away.
function notFound(): never {
  throw new Error("NOT_FOUND");
}

const ACTIVE_WINDOW_MS = 20_000;

export type JobViewer = { userId: string; name: string; initials: string; you: boolean };

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

async function listViewers(ctx: RequestContext & { companyId: string }, jobId: string): Promise<JobViewer[]> {
  const since = new Date(Date.now() - ACTIVE_WINDOW_MS);
  const rows = await prisma.jobPresence.findMany({
    where: { companyId: ctx.companyId, jobId, lastSeenAt: { gte: since } },
    orderBy: { lastSeenAt: "asc" },
    include: { user: { select: { displayName: true } } },
  });
  const viewers = rows.map((r: { userId: string; user: { displayName: string } }) => ({ userId: r.userId, name: r.user.displayName, initials: initialsOf(r.user.displayName), you: r.userId === ctx.userId }));
  // You first, then whoever has been in the job longest.
  return [...viewers.filter((v: JobViewer) => v.you), ...viewers.filter((v: JobViewer) => !v.you)];
}

// Heartbeat: marks the caller as being in the job and returns everyone who is.
export async function heartbeatJobPresence(ctx: RequestContext, jobId: string): Promise<{ viewers: JobViewer[] }> {
  requireModule(ctx, "JOBS_WIP", "READ");
  requireTenantPermission(ctx, "JOBS_VIEW");
  const companyId = ctx.companyId!;
  const job = await prisma.job.findFirst({ where: { id: jobId, companyId }, select: { id: true } });
  if (!job) notFound();
  const now = new Date();
  await prisma.jobPresence.upsert({
    where: { jobId_userId: { jobId, userId: ctx.userId } },
    create: { companyId, jobId, userId: ctx.userId, lastSeenAt: now },
    update: { lastSeenAt: now },
  });
  // Housekeeping (only now and then, the heartbeat is frequent): drop this
  // job's rows nobody has refreshed for a while.
  if (Math.random() < 0.05) {
    await prisma.jobPresence.deleteMany({ where: { companyId, jobId, lastSeenAt: { lt: new Date(Date.now() - ACTIVE_WINDOW_MS * 6) } } });
  }
  return { viewers: await listViewers({ ...ctx, companyId }, jobId) };
}

// The caller has left the job.
export async function leaveJobPresence(ctx: RequestContext, jobId: string): Promise<{ ok: true }> {
  requireModule(ctx, "JOBS_WIP", "READ");
  const companyId = ctx.companyId!;
  await prisma.jobPresence.deleteMany({ where: { companyId, jobId, userId: ctx.userId } });
  return { ok: true };
}
