import type { AuditSource, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { RequestContext } from "@/lib/auth/context-types";

export type AuditInput = {
  source: AuditSource;
  module: string;
  entityType: string;
  entityId?: string;
  action: string;
  beforeData?: Prisma.InputJsonValue;
  afterData?: Prisma.InputJsonValue;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
};

export async function recordAudit(context: RequestContext, input: AuditInput) {
  return prisma.auditEvent.create({
    data: {
      companyId: context.companyId,
      actorId: context.userId,
      supportAccessId: context.supportAccessId,
      correlationId: context.correlationId,
      ...input,
    },
  });
}
