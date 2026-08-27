import { ModuleKey } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { RequestContext } from "@/lib/auth/context-types";
import { requireModule, requireTenant, requireTenantPermission } from "@/lib/auth/guards";

type SecurityDatabase = Pick<typeof prisma, "company" | "companyMembership" | "companyModuleEntitlement" | "auditEvent">;

export async function getOwnCompany(context: RequestContext, database: SecurityDatabase = prisma) {
  requireTenant(context);
  return database.company.findUnique({ where: { id: context.companyId }, select: { id: true, internalCode: true, legalName: true, tradingName: true, status: true } });
}

export async function getTenantMembership(context: RequestContext, membershipId: string, database: SecurityDatabase = prisma) {
  requireTenantPermission(context, "USERS_MANAGE");
  requireTenant(context);
  const companyId = context.companyId;
  return database.companyMembership.findFirst({ where: { id: membershipId, companyId }, select: { id: true, userId: true, role: true, status: true } });
}

export async function getTenantEntitlement(context: RequestContext, moduleKey: ModuleKey, database: SecurityDatabase = prisma) {
  requireTenant(context);
  return database.companyModuleEntitlement.findUnique({ where: { companyId_module: { companyId: context.companyId, module: moduleKey } } });
}

export async function getTenantAuditEvent(context: RequestContext, eventId: string, database: SecurityDatabase = prisma) {
  requireTenantPermission(context, "AUDIT_VIEW");
  return database.auditEvent.findFirst({ where: { id: eventId, companyId: context.companyId } });
}

export async function createTenantAuditEvent(context: RequestContext, action: string, database: SecurityDatabase = prisma) {
  requireTenant(context);
  requireModule(context, "DASHBOARD", "WRITE");
  return database.auditEvent.create({ data: { companyId: context.companyId, actorId: context.userId, supportAccessId: context.supportAccessId, source: context.supportAccessId ? "PLATFORM" : "UI", module: "TEST", entityType: "Phase1", action, correlationId: context.correlationId } });
}
