import type { PlatformNotificationType } from "@prisma/client";
import type { RequestContext } from "@/lib/auth/context-types";
import { requirePlatformPermission } from "@/lib/auth/guards";
import { DEFAULT_PLATFORM_PERMISSIONS, mergePermissionOverrides } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";

// 2026-10-01 — user request: "when clicking the support button... if Org
// Admins click support then it should go to System Admin, a proper system
// flow." Platform-side counterpart of lib/notifications/service.ts — same
// bell/list/read-state shape, just addressed to platform staff (no
// companyId) rather than a company's own members. See PlatformNotification
// in schema.prisma for the row shape.

export async function listPlatformNotifications(ctx: RequestContext, opts: { unreadOnly?: boolean; take?: number } = {}) {
  requirePlatformPermission(ctx, "PLATFORM_SUPPORT_READ");
  const take = Math.min(Math.max(opts.take ?? 50, 1), 200);
  const [items, unreadCount] = await Promise.all([
    prisma.platformNotification.findMany({
      where: { userId: ctx.userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: "desc" },
      take,
    }),
    prisma.platformNotification.count({ where: { userId: ctx.userId, readAt: null } }),
  ]);
  return { items, unreadCount };
}

export async function getPlatformUnreadCount(ctx: RequestContext) {
  requirePlatformPermission(ctx, "PLATFORM_SUPPORT_READ");
  return prisma.platformNotification.count({ where: { userId: ctx.userId, readAt: null } });
}

export async function markPlatformNotificationRead(ctx: RequestContext, id: string) {
  requirePlatformPermission(ctx, "PLATFORM_SUPPORT_READ");
  const existing = await prisma.platformNotification.findFirst({ where: { id, userId: ctx.userId } });
  if (!existing) throw new Error("NOT_FOUND");
  if (existing.readAt) return existing;
  return prisma.platformNotification.update({ where: { id }, data: { readAt: new Date() } });
}

export async function markAllPlatformNotificationsRead(ctx: RequestContext) {
  requirePlatformPermission(ctx, "PLATFORM_SUPPORT_READ");
  await prisma.platformNotification.updateMany({ where: { userId: ctx.userId, readAt: null }, data: { readAt: new Date() } });
  return { ok: true };
}

// Internal — every active PlatformRoleAssignment holder whose *effective*
// permissions (role defaults merged with that assignment's own
// PlatformPermission overrides, same resolution auth/session.ts uses when
// building a signed-in ctx.platformPermissions) include PLATFORM_SUPPORT_READ
// — the same gate listPlatformSupportTickets/getPlatformSupportTicket
// already require to even see a ticket, so only platform staff who could
// actually act on it are notified of one.
async function platformSupportRecipientIds(): Promise<string[]> {
  const assignments = await prisma.platformRoleAssignment.findMany({
    where: { active: true },
    select: { userId: true, role: true, permissions: { select: { permission: true, allowed: true } } },
  });
  const ids = new Set<string>();
  for (const assignment of assignments) {
    const effective = mergePermissionOverrides(DEFAULT_PLATFORM_PERMISSIONS[assignment.role], assignment.permissions);
    if (effective.has("PLATFORM_SUPPORT_READ")) ids.add(assignment.userId);
  }
  return [...ids];
}

// Fire-and-forget, same convention as notifyAdminsAndManagers in
// lib/notifications/service.ts — a notification failing to send should
// never roll back or surface an error for whatever triggered it (here, a
// support ticket an Org Admin just raised).
export async function notifyPlatformSupportRecipients(type: PlatformNotificationType, title: string, message: string, link?: string | null) {
  try {
    const recipientIds = await platformSupportRecipientIds();
    if (recipientIds.length === 0) return;
    await prisma.platformNotification.createMany({
      data: recipientIds.map((userId) => ({ userId, type, title, message, link: link ?? null })),
    });
  } catch {
    // Best-effort — see comment above.
  }
}
