import { ModuleKey, Prisma, SupportAccessMode, TicketMessageKind, TicketPriority, TicketStatus } from "@prisma/client";
import { z } from "zod";
import type { RequestContext } from "@/lib/auth/context-types";
import { requirePlatformPermission, requireTenant } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { requestIp } from "@/lib/security/request";

const attachmentInput = z.object({ fileName: z.string().trim().min(1).max(160), mimeType: z.string().trim().min(3).max(120), contentBase64: z.string().min(4) });
const createTicketInput = z.object({
  subject: z.string().trim().min(3).max(160),
  description: z.string().trim().min(8).max(5000),
  category: z.string().trim().max(80).optional().nullable(),
  priority: z.nativeEnum(TicketPriority).default(TicketPriority.NORMAL),
  moduleKey: z.nativeEnum(ModuleKey).optional().nullable(),
  pageRoute: z.string().trim().max(240).optional().nullable(),
  appVersion: z.string().trim().max(80).optional().nullable(),
  attachments: z.array(attachmentInput).max(3).optional().default([]),
});

const replyInput = z.object({ body: z.string().trim().min(1).max(5000), kind: z.nativeEnum(TicketMessageKind).default(TicketMessageKind.REPLY), attachments: z.array(attachmentInput).max(3).optional().default([]) });
const platformUpdateInput = z.object({ status: z.nativeEnum(TicketStatus).optional(), priority: z.nativeEnum(TicketPriority).optional(), assignedSupportId: z.string().cuid().nullable().optional(), note: z.string().trim().max(500).optional().nullable() });

function pad(n: bigint) { return n.toString().padStart(6, "0"); }

async function allocateTicketNumber(tx: Prisma.TransactionClient) {
  const key = "SUPPORT_TICKET";
  const row = await tx.platformSequence.upsert({ where: { key }, create: { key, nextValue: 2n }, update: { nextValue: { increment: 1n } }, select: { nextValue: true } });
  return `SUP-${pad(row.nextValue - 1n)}`;
}

function canViewTenantTickets(ctx: RequestContext) {
  requireTenant(ctx);
  return ctx.tenantPermissions.has("USERS_MANAGE") || ctx.tenantPermissions.has("DASHBOARD_VIEW");
}

function validateAttachment(row: { fileName: string; mimeType: string; contentBase64: string }) {
  if (!["image/png", "image/jpeg", "image/webp", "application/pdf", "text/plain"].includes(row.mimeType)) throw new Error("INVALID_ATTACHMENT_TYPE");
  const data = Buffer.from(row.contentBase64, "base64");
  if (data.length > 4_000_000) throw new Error("ATTACHMENT_TOO_LARGE");
  return { fileName: row.fileName.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 160), mimeType: row.mimeType, data, sizeBytes: data.length };
}

export async function createSupportTicket(ctx: RequestContext, raw: unknown, meta?: { userAgent?: string | null; route?: string | null; appVersion?: string | null; ipAddress?: string | null }) {
  requireTenant(ctx);
  const input = createTicketInput.parse(raw);
  return prisma.$transaction(async (tx) => {
    const ticketNumber = await allocateTicketNumber(tx);
    const ticket = await tx.supportTicket.create({
      data: {
        companyId: ctx.companyId,
        ticketNumber,
        subject: input.subject,
        description: input.description,
        category: input.category || null,
        priority: input.priority,
        status: TicketStatus.OPEN,
        moduleKey: input.moduleKey ?? null,
        pageRoute: input.pageRoute || meta?.route || null,
        userAgent: meta?.userAgent || null,
        appVersion: input.appVersion || meta?.appVersion || null,
        reportedById: ctx.userId,
        messages: { create: { companyId: ctx.companyId, authorId: ctx.userId, kind: TicketMessageKind.REPLY, body: input.description } },
        events: { create: { companyId: ctx.companyId, actorId: ctx.userId, eventType: "TICKET_CREATED", toValue: TicketStatus.OPEN } },
        attachments: input.attachments.length > 0 ? { create: input.attachments.map(validateAttachment).map((row) => ({ companyId: ctx.companyId!, fileName: row.fileName, mimeType: row.mimeType, sizeBytes: row.sizeBytes, data: row.data, uploadedById: ctx.userId })) } : undefined,
      },
      include: { messages: true, attachments: true },
    });
    await tx.auditEvent.create({ data: { companyId: ctx.companyId, actorId: ctx.userId, supportAccessId: ctx.supportAccessId, source: "API", module: "SUPPORT", entityType: "SupportTicket", entityId: ticket.id, action: "SUPPORT_TICKET_CREATED", correlationId: ctx.correlationId, ipAddress: meta?.ipAddress, userAgent: meta?.userAgent, afterData: { ticketNumber, priority: ticket.priority, status: ticket.status } } });
    return ticket;
  });
}

export async function listTenantSupportTickets(ctx: RequestContext) {
  if (!canViewTenantTickets(ctx)) throw new Error("FORBIDDEN");
  return prisma.supportTicket.findMany({ where: { companyId: ctx.companyId!, ...(ctx.tenantPermissions.has("USERS_MANAGE") ? {} : { reportedById: ctx.userId }) }, orderBy: [{ updatedAt: "desc" }], select: { id: true, ticketNumber: true, subject: true, category: true, priority: true, status: true, moduleKey: true, pageRoute: true, createdAt: true, updatedAt: true, reportedBy: { select: { displayName: true, email: true } }, assignedSupport: { select: { displayName: true, email: true } } } });
}

export async function getTenantSupportTicket(ctx: RequestContext, id: string) {
  if (!canViewTenantTickets(ctx)) throw new Error("FORBIDDEN");
  const ticket = await prisma.supportTicket.findFirstOrThrow({ where: { id, companyId: ctx.companyId!, ...(ctx.tenantPermissions.has("USERS_MANAGE") ? {} : { reportedById: ctx.userId }) }, include: { messages: { include: { author: { select: { displayName: true, email: true } }, attachments: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true } } }, orderBy: { createdAt: "asc" } }, events: { include: { actor: { select: { displayName: true, email: true } } }, orderBy: { createdAt: "asc" } }, attachments: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true } }, reportedBy: { select: { displayName: true, email: true } }, assignedSupport: { select: { displayName: true, email: true } } } });
  return { ...ticket, messages: ticket.messages.filter((message) => message.kind !== TicketMessageKind.INTERNAL_NOTE) };
}

export async function addPlatformSupportMessage(ctx: RequestContext, id: string, raw: unknown) {
  requirePlatformPermission(ctx, "PLATFORM_SUPPORT_WRITE");
  if (ctx.companyId) throw new Error("PLATFORM_CONTEXT_REQUIRED");
  const input = replyInput.parse(raw);
  const ticket = await prisma.supportTicket.findUnique({ where: { id }, select: { companyId: true, status: true } });
  if (!ticket) throw new Error("NOT_FOUND");
  return prisma.$transaction(async (tx) => {
    const message = await tx.supportTicketMessage.create({ data: { companyId: ticket.companyId, ticketId: id, authorId: ctx.userId, kind: input.kind, body: input.body } });
    if (input.attachments.length > 0) await tx.supportTicketAttachment.createMany({ data: input.attachments.map(validateAttachment).map((row) => ({ companyId: ticket.companyId, ticketId: id, messageId: message.id, fileName: row.fileName, mimeType: row.mimeType, sizeBytes: row.sizeBytes, data: row.data, uploadedById: ctx.userId })) });
    await tx.supportTicketEvent.create({ data: { companyId: ticket.companyId, ticketId: id, actorId: ctx.userId, eventType: input.kind === TicketMessageKind.INTERNAL_NOTE ? "INTERNAL_NOTE_ADDED" : "SUPPORT_REPLY_ADDED" } });
    return message;
  });
}

export async function replyToSupportTicket(ctx: RequestContext, id: string, raw: unknown) {
  requireTenant(ctx);
  const input = replyInput.parse(raw);
  const ticket = await prisma.supportTicket.findFirst({ where: { id, companyId: ctx.companyId!, ...(ctx.tenantPermissions.has("USERS_MANAGE") ? {} : { reportedById: ctx.userId }) } });
  if (!ticket) throw new Error("NOT_FOUND");
  return prisma.$transaction(async (tx) => {
    const msg = await tx.supportTicketMessage.create({ data: { companyId: ctx.companyId!, ticketId: id, authorId: ctx.userId, kind: input.kind, body: input.body } });
    if (input.attachments.length > 0) {
      await tx.supportTicketAttachment.createMany({ data: input.attachments.map(validateAttachment).map((row) => ({ companyId: ctx.companyId!, ticketId: id, messageId: msg.id, fileName: row.fileName, mimeType: row.mimeType, sizeBytes: row.sizeBytes, data: row.data, uploadedById: ctx.userId })) });
    }
    await tx.supportTicket.update({ where: { id }, data: { status: ticket.status === TicketStatus.RESOLVED ? TicketStatus.WAITING_ON_CUSTOMER : ticket.status } });
    await tx.supportTicketEvent.create({ data: { companyId: ctx.companyId!, ticketId: id, actorId: ctx.userId, eventType: input.kind === TicketMessageKind.INTERNAL_NOTE ? "INTERNAL_NOTE_ADDED" : "REPLY_ADDED" } });
    return msg;
  });
}

export async function listPlatformSupportTickets(ctx: RequestContext, query: Record<string, unknown>) {
  requirePlatformPermission(ctx, "PLATFORM_SUPPORT_READ");
  if (ctx.companyId) throw new Error("PLATFORM_CONTEXT_REQUIRED");
  const q = String(query.q ?? "").trim();
  const where: Prisma.SupportTicketWhereInput = {
    ...(query.companyId ? { companyId: String(query.companyId) } : {}),
    ...(query.status ? { status: String(query.status) as TicketStatus } : {}),
    ...(query.priority ? { priority: String(query.priority) as TicketPriority } : {}),
    ...(query.moduleKey ? { moduleKey: String(query.moduleKey) as ModuleKey } : {}),
    ...(query.assignedSupportId ? { assignedSupportId: String(query.assignedSupportId) } : {}),
    ...(q ? { OR: [{ ticketNumber: { contains: q, mode: "insensitive" } }, { subject: { contains: q, mode: "insensitive" } }, { company: { legalName: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  return prisma.supportTicket.findMany({ where, orderBy: [{ updatedAt: "desc" }], select: { id: true, ticketNumber: true, subject: true, priority: true, status: true, category: true, moduleKey: true, pageRoute: true, createdAt: true, updatedAt: true, company: { select: { id: true, internalCode: true, legalName: true, tradingName: true } }, reportedBy: { select: { displayName: true, email: true } }, assignedSupport: { select: { id: true, displayName: true, email: true } } } });
}

export async function getPlatformSupportTicket(ctx: RequestContext, id: string) {
  requirePlatformPermission(ctx, "PLATFORM_SUPPORT_READ");
  if (ctx.companyId) throw new Error("PLATFORM_CONTEXT_REQUIRED");
  return prisma.supportTicket.findUniqueOrThrow({ where: { id }, include: { company: true, reportedBy: { select: { displayName: true, email: true } }, assignedSupport: { select: { id: true, displayName: true, email: true } }, messages: { include: { author: { select: { displayName: true, email: true } }, attachments: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true } } }, orderBy: { createdAt: "asc" } }, events: { include: { actor: { select: { displayName: true, email: true } } }, orderBy: { createdAt: "asc" } }, attachments: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true } } } });
}

export async function startSupportAccessFromTicket(ctx: RequestContext, id: string, mode: SupportAccessMode) {
  requirePlatformPermission(ctx, mode === "READ_WRITE" ? "PLATFORM_SUPPORT_WRITE" : "PLATFORM_SUPPORT_READ");
  if (ctx.companyId) throw new Error("PLATFORM_CONTEXT_REQUIRED");
  const ticket = await prisma.supportTicket.findUnique({ where: { id }, select: { id: true, companyId: true, ticketNumber: true, subject: true } });
  if (!ticket) throw new Error("NOT_FOUND");
  const { startSupportAccess } = await import("@/lib/platform/support-service");
  return startSupportAccess(ctx, { companyId: ticket.companyId, mode, reason: `Support ticket ${ticket.ticketNumber}: ${ticket.subject}`, expiresAt: new Date(Date.now() + 30 * 60_000) });
}

export async function updatePlatformSupportTicket(ctx: RequestContext, id: string, raw: unknown) {
  requirePlatformPermission(ctx, "PLATFORM_SUPPORT_WRITE");
  if (ctx.companyId) throw new Error("PLATFORM_CONTEXT_REQUIRED");
  const input = platformUpdateInput.parse(raw);
  return prisma.$transaction(async (tx) => {
    const before = await tx.supportTicket.findUnique({ where: { id } });
    if (!before) throw new Error("NOT_FOUND");
    const nextStatus = input.status ?? before.status;
    const updated = await tx.supportTicket.update({ where: { id }, data: { status: nextStatus, priority: input.priority ?? before.priority, assignedSupportId: input.assignedSupportId === undefined ? before.assignedSupportId : input.assignedSupportId, resolvedAt: nextStatus === TicketStatus.RESOLVED ? new Date() : before.resolvedAt, closedAt: nextStatus === TicketStatus.CLOSED ? new Date() : null } });
    const events: Prisma.SupportTicketEventCreateManyInput[] = [];
    if (input.status && input.status !== before.status) events.push({ companyId: before.companyId, ticketId: id, actorId: ctx.userId, eventType: "STATUS_CHANGED", fromValue: before.status, toValue: input.status, note: input.note || null });
    if (input.priority && input.priority !== before.priority) events.push({ companyId: before.companyId, ticketId: id, actorId: ctx.userId, eventType: "PRIORITY_CHANGED", fromValue: before.priority, toValue: input.priority, note: input.note || null });
    if (input.assignedSupportId !== undefined && input.assignedSupportId !== before.assignedSupportId) events.push({ companyId: before.companyId, ticketId: id, actorId: ctx.userId, eventType: "ASSIGNMENT_CHANGED", fromValue: before.assignedSupportId ?? null, toValue: input.assignedSupportId ?? null, note: input.note || null });
    if (events.length > 0) await tx.supportTicketEvent.createMany({ data: events });
    await tx.auditEvent.create({ data: { companyId: before.companyId, actorId: ctx.userId, source: "PLATFORM", module: "SUPPORT", entityType: "SupportTicket", entityId: id, action: "PLATFORM_SUPPORT_TICKET_UPDATED", correlationId: ctx.correlationId, beforeData: before as Prisma.InputJsonValue, afterData: updated as Prisma.InputJsonValue, reason: input.note || undefined } });
    return updated;
  });
}

export function requestMetaFrom(request: Request) {
  return { userAgent: request.headers.get("user-agent"), route: request.headers.get("x-apollo-route"), appVersion: request.headers.get("x-apollo-version"), ipAddress: requestIp(request as never) };
}

export const SUPPORT_ENUMS = { TicketPriority, TicketStatus, TicketMessageKind, SupportAccessMode };