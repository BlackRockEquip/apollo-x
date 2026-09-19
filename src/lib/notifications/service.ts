import type { NotificationType } from "@prisma/client";
import type { RequestContext } from "@/lib/auth/context-types";
import { requireTenant } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";

// 2026-09-19 — user request: a notifications bell (always visible, next to
// Support) plus its own page, and an admin/manager notification whenever a
// parts list is imported. See the Notification model comment in
// schema.prisma for the row shape.
//
// Gating: every function here only requires requireTenant (plain company
// membership) — not a specific module or permission. A notification is
// addressed to one specific user (recipient-scoped by userId, always
// filtered to ctx.userId below), so there's no separate admin permission
// that could apply here the way there was for the logo/manufacturers/
// storage-locations bugs — every signed-in member already has exactly the
// access this needs: read and manage their own notifications, nothing
// else's. That's also why this deliberately skips the permission-scoping
// mismatch bug class rather than needing a workaround for it.

export async function listNotifications(ctx: RequestContext, opts: { unreadOnly?: boolean; take?: number } = {}) {
  requireTenant(ctx);
  const companyId = ctx.companyId!;
  const take = Math.min(Math.max(opts.take ?? 50, 1), 200);
  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { companyId, userId: ctx.userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: "desc" },
      take,
    }),
    prisma.notification.count({ where: { companyId, userId: ctx.userId, readAt: null } }),
  ]);
  return { items, unreadCount };
}

// Lightweight — just the badge count, for the always-visible bell on every
// page. Kept separate from listNotifications so pages that only need the
// count (i.e. every page, via AppShell) don't also pull the notification
// rows themselves.
export async function getUnreadCount(ctx: RequestContext) {
  requireTenant(ctx);
  const companyId = ctx.companyId!;
  return prisma.notification.count({ where: { companyId, userId: ctx.userId, readAt: null } });
}

export async function markNotificationRead(ctx: RequestContext, id: string) {
  requireTenant(ctx);
  const companyId = ctx.companyId!;
  const existing = await prisma.notification.findFirst({ where: { id, companyId, userId: ctx.userId } });
  if (!existing) throw new Error("NOT_FOUND");
  if (existing.readAt) return existing;
  return prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
}

export async function markAllNotificationsRead(ctx: RequestContext) {
  requireTenant(ctx);
  const companyId = ctx.companyId!;
  await prisma.notification.updateMany({ where: { companyId, userId: ctx.userId, readAt: null }, data: { readAt: new Date() } });
  return { ok: true };
}

// Internal — not exposed as an API route itself, called by other services
// (e.g. import-export/service.ts's importParts) that need to notify a
// company's admins/managers of something. Recipients are every ACTIVE
// CompanyMembership with role COMPANY_ADMIN or MANAGER — the same
// role/status filter already used elsewhere in this codebase for "who
// counts as an admin or manager of this company" (see e.g. the dashboard
// procurement widget). Deliberately fire-and-forget from the caller's
// point of view: this never throws for an individual recipient failure,
// since a notification is a courtesy, not something that should ever
// block or fail the action that triggered it (a parts import succeeding
// shouldn't roll back, or even error out to the user, because a
// notification insert had a problem).
export async function notifyAdminsAndManagers(companyId: string, type: NotificationType, title: string, message: string, link?: string | null) {
  try {
    const recipients = await prisma.companyMembership.findMany({
      where: { companyId, status: "ACTIVE", role: { in: ["COMPANY_ADMIN", "MANAGER"] } },
      select: { userId: true },
    });
    if (recipients.length === 0) return;
    await prisma.notification.createMany({
      data: recipients.map((r) => ({ companyId, userId: r.userId, type, title, message, link: link ?? null })),
    });
  } catch {
    // Best-effort — see comment above. Never let a notification failure
    // surface as an error for whatever triggered it.
  }
}
