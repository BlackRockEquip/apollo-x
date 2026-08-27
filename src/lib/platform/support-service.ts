import type { Prisma, PrismaClient, SupportAccessMode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { RequestContext } from "@/lib/auth/context-types";
import { requirePlatformPermission } from "@/lib/auth/guards";

type SupportDatabase = PrismaClient;

export async function startSupportAccess(
  context: RequestContext,
  input: { companyId: string; mode: SupportAccessMode; reason: string; expiresAt: Date },
  database: SupportDatabase = prisma,
) {
  requirePlatformPermission(context, input.mode === "READ_WRITE" ? "PLATFORM_SUPPORT_WRITE" : "PLATFORM_SUPPORT_READ");
  if (context.companyId) throw new Error("PLATFORM_CONTEXT_REQUIRED");
  return database.$transaction(async (transaction) => {
    const company = await transaction.company.findFirst({ where: { id: input.companyId, status: "ACTIVE" }, select: { id: true } });
    if (!company) throw new Error("RESOURCE_NOT_FOUND");
    const support = await transaction.platformSupportAccess.create({
      data: { operatorId: context.userId, companyId: company.id, mode: input.mode, reason: input.reason, expiresAt: input.expiresAt },
    });
    await transaction.auditEvent.create({
      data: {
        companyId: company.id, actorId: context.userId, supportAccessId: support.id, source: "PLATFORM",
        module: "PLATFORM", entityType: "PlatformSupportAccess", entityId: support.id,
        action: "SUPPORT_CONTEXT_STARTED", reason: input.reason, correlationId: context.correlationId,
        afterData: { mode: input.mode, expiresAt: input.expiresAt.toISOString() },
      },
    });
    return support;
  });
}

export async function endSupportAccess(context: RequestContext, database: SupportDatabase = prisma) {
  if (!context.supportAccessId) throw new Error("SUPPORT_CONTEXT_REQUIRED");
  await database.$transaction(async (transaction) => {
    const endedAt = new Date();
    const result = await transaction.platformSupportAccess.updateMany({
      where: { id: context.supportAccessId!, operatorId: context.userId, endedAt: null },
      data: { endedAt, endedById: context.userId },
    });
    if (result.count !== 1) throw new Error("RESOURCE_NOT_FOUND");
    await transaction.auditEvent.create({
      data: {
        companyId: context.companyId, actorId: context.userId, supportAccessId: context.supportAccessId,
        source: "PLATFORM", module: "PLATFORM", entityType: "PlatformSupportAccess",
        entityId: context.supportAccessId, action: "SUPPORT_CONTEXT_ENDED", correlationId: context.correlationId,
      },
    });
  });
}

export async function recordSupportAudit(
  context: RequestContext,
  input: { entityType: string; entityId: string; action: string; afterData?: Prisma.InputJsonValue },
  database: SupportDatabase = prisma,
) {
  if (!context.supportAccessId) throw new Error("SUPPORT_CONTEXT_REQUIRED");
  return database.auditEvent.create({
    data: {
      companyId: context.companyId,
      actorId: context.userId,
      supportAccessId: context.supportAccessId,
      source: "PLATFORM",
      module: "PLATFORM",
      correlationId: context.correlationId,
      ...input,
    },
  });
}
