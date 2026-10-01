import { z } from "zod";
import type { NotificationType } from "@prisma/client";
import type { RequestContext } from "@/lib/auth/context-types";
import { requireTenant, requireTenantPermission } from "@/lib/auth/guards";
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

// 2026-10-01 — `history` added for the "dismiss moves it to a History tab"
// request below. Active (the default) excludes anything dismissed; history
// is the mirror — dismissed only. The bell's unread count is untouched by
// this (still just readAt, see getUnreadCount) since dismissing always
// marks something read too (see dismissNotification).
export async function listNotifications(ctx: RequestContext, opts: { unreadOnly?: boolean; take?: number; history?: boolean } = {}) {
  requireTenant(ctx);
  const companyId = ctx.companyId!;
  const take = Math.min(Math.max(opts.take ?? 50, 1), 200);
  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { companyId, userId: ctx.userId, ...(opts.unreadOnly ? { readAt: null } : {}), dismissedAt: opts.history ? { not: null } : null },
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

// 2026-10-01 — user request: "once notifications is there, allow a user to
// remove the notification which would move it to a History tab." Also
// stamps readAt (if not already set) — a dismissed notification showing up
// as still "unread" in History, or still counting toward the bell badge,
// would be confusing, and there's no scenario where someone dismisses
// something they haven't effectively already dealt with.
export async function dismissNotification(ctx: RequestContext, id: string) {
  requireTenant(ctx);
  const companyId = ctx.companyId!;
  const existing = await prisma.notification.findFirst({ where: { id, companyId, userId: ctx.userId } });
  if (!existing) throw new Error("NOT_FOUND");
  if (existing.dismissedAt) return existing;
  const now = new Date();
  return prisma.notification.update({ where: { id }, data: { dismissedAt: now, readAt: existing.readAt ?? now } });
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

// 2026-10-01 — user request ("when clicking the support button... a
// notification gets sent to Org Admins"): a narrower sibling of
// notifyAdminsAndManagers above — Org Admins specifically (COMPANY_ADMIN),
// not Managers too. Used by createSupportTicket (support/service.ts) when
// the reporter isn't a COMPANY_ADMIN themselves.
export async function notifyCompanyAdmins(companyId: string, type: NotificationType, title: string, message: string, link?: string | null) {
  try {
    const recipients = await prisma.companyMembership.findMany({
      where: { companyId, status: "ACTIVE", role: "COMPANY_ADMIN" },
      select: { userId: true },
    });
    if (recipients.length === 0) return;
    await prisma.notification.createMany({
      data: recipients.map((r) => ({ companyId, userId: r.userId, type, title, message, link: link ?? null })),
    });
  } catch {
    // Best-effort — same as notifyAdminsAndManagers above.
  }
}

// 2026-10-01 — user request: "allow the reply functionality [on a support
// ticket] to work back the user who requested support, and user receives
// notification and can respond accordingly." The two helpers above only
// ever target a role-based group (every Org Admin, every Admin/Manager) —
// this is the first case that needs one specific person: whichever single
// user raised the ticket (or, in the other direction, whoever replies isn't
// the reporter and so needs telling an Org Admin answered). See
// replyToSupportTicket in support/service.ts for both directions. Same
// fire-and-forget/best-effort convention as the two helpers above.
export async function notifyUser(companyId: string, userId: string, type: NotificationType, title: string, message: string, link?: string | null) {
  try {
    await prisma.notification.create({ data: { companyId, userId, type, title, message, link: link ?? null } });
  } catch {
    // Best-effort — same as notifyAdminsAndManagers above.
  }
}

const broadcastInput = z.object({
  title: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(1000),
  // "all" = every ACTIVE member of the company; otherwise a specific list
  // of userIds (validated against real, active members below — a broadcast
  // can't be aimed at someone outside the company just because their id
  // was guessed/edited client-side).
  recipients: z.union([z.literal("all"), z.array(z.string().min(1)).min(1)]),
});

// 2026-10-01 — user request: "Allow a Org Admin to send out a message to
// all users/individual users (Notification banner that popsup)." Gated by
// USERS_MANAGE at the API route (same permission the Users settings page
// itself requires — COMPANY_ADMIN-only by default, see permissions.ts),
// not re-checked here since every caller is already past that guard.
// Delivered as an ORG_BROADCAST Notification to each recipient — same bell
// count/History-tab handling as any other notification — plus
// BroadcastBanner.tsx polls for the newest unread one and shows it as a
// dismissible banner (the "popsup" from the request) until read/dismissed.
export async function sendCompanyBroadcast(ctx: RequestContext, raw: unknown) {
  requireTenantPermission(ctx, "USERS_MANAGE");
  const companyId = ctx.companyId!;
  const input = broadcastInput.parse(raw);
  const members = await prisma.companyMembership.findMany({ where: { companyId, status: "ACTIVE" }, select: { userId: true } });
  const activeIds = new Set(members.map((m) => m.userId));
  const targetIds = input.recipients === "all" ? [...activeIds] : input.recipients.filter((id) => activeIds.has(id));
  if (targetIds.length === 0) throw new Error("No valid recipients were selected.");
  await prisma.notification.createMany({
    data: targetIds.map((userId) => ({ companyId, userId, type: "ORG_BROADCAST" as NotificationType, title: input.title, message: input.message, link: null })),
  });
  return { ok: true, sentTo: targetIds.length };
}

// Polled by BroadcastBanner.tsx — the single newest unread ORG_BROADCAST
// notification for the signed-in user, if any. Separate from the bell's
// unread count/list since a broadcast needs its own, more intrusive
// "popsup" presentation rather than just another row to click into later.
export async function getActiveBroadcast(ctx: RequestContext) {
  requireTenant(ctx);
  const companyId = ctx.companyId!;
  return prisma.notification.findFirst({
    where: { companyId, userId: ctx.userId, type: "ORG_BROADCAST", readAt: null },
    orderBy: { createdAt: "desc" },
  });
}
