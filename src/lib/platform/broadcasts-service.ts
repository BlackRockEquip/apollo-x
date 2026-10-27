import { TenantRole, type NotificationType, type PlatformBroadcast, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { RequestContext } from "@/lib/auth/context-types";
import { requirePlatformPermission } from "@/lib/auth/guards";
import { normalizeAdLink } from "@/lib/ads/model";
import { broadcastInputSchema, broadcastState, type BroadcastCompanyOption, type BroadcastRow, type BroadcastUserOption } from "@/lib/platform/broadcast-model";
import { isPlatformEmailConfigured, sendPlatformEmail } from "@/lib/email";

// 2026-10-27, user request: "add functionality to do broadcast message throughout the platform to all companies, specific
// companies, specific users". Platform > Broadcasts (PLATFORM_CONFIGURATION_MANAGE, platform context only).
//
// A broadcast is one PlatformBroadcast row. Delivering it creates one PLATFORM_BROADCAST Notification per recipient
// membership (a person who belongs to two companies sees it in both), so it appears in the bell and History exactly like
// every other notification, and BroadcastBanner.tsx pops it up on the next page (see getActiveBroadcast in
// notifications/service.ts). Only ACTIVE members of ACTIVE companies receive it - suspended and closed companies are skipped.
// "Send now" delivers inside the request; a scheduled one is delivered by deliverDueBroadcasts() the first time anyone's
// browser polls after its start time (no separate scheduler to run). A withdrawn or expired broadcast stops showing.

function requireBroadcasts(ctx: RequestContext) {
  requirePlatformPermission(ctx, "PLATFORM_CONFIGURATION_MANAGE");
  if (ctx.companyId) throw new Error("PLATFORM_CONTEXT_REQUIRED");
}

/** Every active member of an active company that the audience points at (one entry per membership). */
async function resolveRecipients(b: Pick<PlatformBroadcast, "audience" | "companyIds" | "userIds">) {
  const where: Prisma.CompanyMembershipWhereInput = { status: "ACTIVE", company: { status: "ACTIVE" }, user: { active: true } };
  if (b.audience === "COMPANIES") where.companyId = { in: b.companyIds };
  if (b.audience === "USERS") where.userId = { in: b.userIds };
  return prisma.companyMembership.findMany({ where, select: { userId: true, companyId: true, user: { select: { email: true, displayName: true } } } });
}

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function emailRecipients(b: PlatformBroadcast, emails: string[]): Promise<number> {
  let sent = 0;
  const link = b.linkUrl ? normalizeAdLink(b.linkUrl) : null;
  const text = `${b.message}${link ? `\n\nMore: ${link}` : ""}\n\n- Flo X Integrations`;
  const html = `<p>${escapeHtml(b.message).replace(/\n/g, "<br>")}</p>${link ? `<p><a href="${escapeHtml(link)}">More information</a></p>` : ""}<p>- Flo X Integrations</p>`;
  for (const to of emails) {
    try {
      await sendPlatformEmail({ to, subject: b.title, text, html });
      sent += 1;
    } catch {
      // One bad address or a mail hiccup must not stop the rest; the sent count on the broadcast shows how many went.
    }
  }
  return sent;
}

/**
 * Turns a broadcast into notifications. Safe to call twice and from two browsers at once: the first caller claims it by
 * stamping deliveredAt, anyone else gets null back.
 */
export async function deliverBroadcast(id: string): Promise<PlatformBroadcast | null> {
  const claimed = await prisma.platformBroadcast.updateMany({ where: { id, deliveredAt: null, withdrawnAt: null }, data: { deliveredAt: new Date() } });
  if (claimed.count === 0) return null;
  const broadcast = await prisma.platformBroadcast.findUniqueOrThrow({ where: { id } });
  const recipients = await resolveRecipients(broadcast);
  const type = "PLATFORM_BROADCAST" as NotificationType;
  for (let i = 0; i < recipients.length; i += 1000) {
    await prisma.notification.createMany({
      data: recipients.slice(i, i + 1000).map((r) => ({ companyId: r.companyId, userId: r.userId, type, title: broadcast.title, message: broadcast.message, link: broadcast.linkUrl, broadcastId: broadcast.id })),
    });
  }
  const userCount = new Set(recipients.map((r) => r.userId)).size;
  const companyCount = new Set(recipients.map((r) => r.companyId)).size;
  const updated = await prisma.platformBroadcast.update({ where: { id }, data: { recipientCount: userCount, companyCount } });
  if (broadcast.sendEmail && (await isPlatformEmailConfigured().catch(() => false))) {
    const emails = Array.from(new Set(recipients.map((r) => r.user.email.trim()).filter(Boolean)));
    // Not awaited: a few hundred emails take a while, and the person pressing Send should not wait for them.
    void emailRecipients(broadcast, emails)
      .then((emailedCount) => prisma.platformBroadcast.update({ where: { id }, data: { emailedCount } }))
      .catch(() => undefined);
  }
  return updated;
}

let lastDueCheck = 0;
/** Delivers scheduled broadcasts whose time has come. Cheap enough to call on every banner poll (throttled to once per 15 s). */
export async function deliverDueBroadcasts(now = new Date()): Promise<void> {
  if (now.getTime() - lastDueCheck < 15000) return;
  lastDueCheck = now.getTime();
  try {
    const due = await prisma.platformBroadcast.findMany({ where: { deliveredAt: null, withdrawnAt: null, startsAt: { lte: now } }, select: { id: true }, take: 5 });
    for (const row of due) await deliverBroadcast(row.id).catch(() => undefined);
  } catch {
    // A failed check just means the next poll tries again.
  }
}

export async function listBroadcasts(ctx: RequestContext, now = new Date()): Promise<{ broadcasts: BroadcastRow[]; companies: BroadcastCompanyOption[]; emailConfigured: boolean }> {
  requireBroadcasts(ctx);
  lastDueCheck = 0;
  await deliverDueBroadcasts(now);
  const [records, companies, memberCounts, emailConfigured] = await Promise.all([
    prisma.platformBroadcast.findMany({ orderBy: [{ createdAt: "desc" }], take: 100 }),
    prisma.company.findMany({ orderBy: [{ legalName: "asc" }], select: { id: true, internalCode: true, legalName: true, tradingName: true, status: true } }),
    prisma.companyMembership.groupBy({ by: ["companyId"], where: { status: "ACTIVE" }, _count: { _all: true } }),
    isPlatformEmailConfigured().catch(() => false),
  ]);
  const reads = await prisma.notification.groupBy({ by: ["broadcastId"], where: { broadcastId: { in: records.map((r) => r.id) }, readAt: { not: null } }, _count: { _all: true } });
  const readByBroadcast = new Map(reads.map((r) => [r.broadcastId, r._count._all]));
  const memberByCompany = new Map(memberCounts.map((m) => [m.companyId, m._count._all]));
  const nameById = new Map(companies.map((c) => [c.id, c.tradingName || c.legalName]));
  return {
    broadcasts: records.map((b) => ({
      id: b.id,
      title: b.title,
      message: b.message,
      linkUrl: b.linkUrl,
      kind: b.kind,
      audience: b.audience,
      companyNames: b.audience === "COMPANIES" ? b.companyIds.map((id) => nameById.get(id)).filter((n): n is string => Boolean(n)) : [],
      state: broadcastState(b, now),
      sendEmail: b.sendEmail,
      requireAck: b.requireAck,
      startsAt: b.startsAt.toISOString(),
      expiresAt: b.expiresAt ? b.expiresAt.toISOString() : null,
      recipientCount: b.audience === "USERS" && !b.deliveredAt ? b.userIds.length : b.recipientCount,
      companyCount: b.companyCount,
      emailedCount: b.emailedCount,
      readCount: readByBroadcast.get(b.id) ?? 0,
      createdByName: b.createdByName,
      createdAt: b.createdAt.toISOString(),
    })),
    companies: companies.map((c) => ({ id: c.id, name: c.tradingName || c.legalName, code: c.internalCode, status: c.status, userCount: memberByCompany.get(c.id) ?? 0 })),
    emailConfigured,
  };
}

/** Find people to aim a message at: by name, email or company (q), or everyone holding one company role (role). */
export async function searchBroadcastUsers(ctx: RequestContext, opts: { q?: string; role?: string }): Promise<BroadcastUserOption[]> {
  requireBroadcasts(ctx);
  const q = (opts.q ?? "").trim();
  const role = opts.role ?? "";
  if (!q && !role) return [];
  if (role && !(Object.values(TenantRole) as string[]).includes(role)) return [];
  const contains = { contains: q, mode: "insensitive" as const };
  const where: Prisma.CompanyMembershipWhereInput = { status: "ACTIVE", company: { status: "ACTIVE" }, user: { active: true } };
  if (role) where.role = role as TenantRole;
  if (q) where.OR = [{ user: { displayName: contains } }, { user: { email: contains } }, { company: { OR: [{ legalName: contains }, { tradingName: contains }] } }];
  const rows = await prisma.companyMembership.findMany({
    where,
    take: role ? 1500 : 60,
    orderBy: [{ user: { displayName: "asc" } }],
    select: { userId: true, user: { select: { displayName: true, email: true } }, company: { select: { legalName: true, tradingName: true } } },
  });
  const byUser = new Map<string, BroadcastUserOption>();
  for (const row of rows) {
    const existing = byUser.get(row.userId);
    const company = row.company.tradingName || row.company.legalName;
    if (existing) existing.companies.push(company);
    else byUser.set(row.userId, { userId: row.userId, name: row.user.displayName, email: row.user.email, companies: [company] });
  }
  return Array.from(byUser.values()).slice(0, role ? 1000 : 25);
}

export async function createBroadcast(ctx: RequestContext, raw: unknown): Promise<BroadcastRow> {
  requireBroadcasts(ctx);
  const input = broadcastInputSchema.parse(raw);
  const now = new Date();
  let startsAt = input.startsAt ? new Date(input.startsAt) : now;
  if (startsAt.getTime() <= now.getTime() + 60 * 1000) startsAt = now;
  const target = { audience: input.audience, companyIds: input.audience === "COMPANIES" ? Array.from(new Set(input.companyIds)) : [], userIds: input.audience === "USERS" ? Array.from(new Set(input.userIds)) : [] };
  const reachable = await resolveRecipients(target);
  if (reachable.length === 0) throw new Error("BROADCAST_NO_RECIPIENTS");
  const link = input.linkUrl ? normalizeAdLink(input.linkUrl) : null;
  const created = await prisma.platformBroadcast.create({
    data: {
      title: input.title,
      message: input.message,
      linkUrl: link,
      kind: input.kind,
      audience: target.audience,
      companyIds: target.companyIds,
      userIds: target.userIds,
      sendEmail: input.sendEmail,
      requireAck: input.requireAck,
      startsAt,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      createdById: ctx.userId,
      createdByName: ctx.displayName,
    },
  });
  await prisma.auditEvent.create({
    data: {
      actorId: ctx.userId,
      source: "PLATFORM",
      module: "PLATFORM",
      entityType: "PlatformBroadcast",
      entityId: created.id,
      action: "PLATFORM_BROADCAST_CREATED",
      correlationId: ctx.correlationId,
      afterData: { title: created.title, kind: created.kind, audience: created.audience, companies: target.companyIds.length, users: target.userIds.length, scheduled: startsAt > now, sendEmail: created.sendEmail },
    },
  });
  if (startsAt <= now) await deliverBroadcast(created.id);
  const { broadcasts } = await listBroadcasts(ctx, new Date());
  const row = broadcasts.find((b) => b.id === created.id);
  if (!row) throw new Error("NOT_FOUND");
  return row;
}

/** Stops a broadcast showing. Anyone who has not read it yet has it moved to History so it no longer counts as unread. */
export async function withdrawBroadcast(ctx: RequestContext, id: string): Promise<void> {
  requireBroadcasts(ctx);
  const existing = await prisma.platformBroadcast.findUnique({ where: { id } });
  if (!existing) throw new Error("NOT_FOUND");
  if (existing.withdrawnAt) return;
  const now = new Date();
  await prisma.platformBroadcast.update({ where: { id }, data: { withdrawnAt: now } });
  await prisma.notification.updateMany({ where: { broadcastId: id, readAt: null }, data: { readAt: now, dismissedAt: now } });
  await prisma.auditEvent.create({
    data: { actorId: ctx.userId, source: "PLATFORM", module: "PLATFORM", entityType: "PlatformBroadcast", entityId: id, action: "PLATFORM_BROADCAST_WITHDRAWN", correlationId: ctx.correlationId, afterData: { title: existing.title } },
  });
}
