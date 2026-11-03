import type { RequestContext } from "@/lib/auth/context-types";
import { requirePlatformPermission } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import {
  createTenantUserCore,
  deleteTenantUserCore,
  getTenantUserEditorDataCore,
  listTenantUsersCore,
  resetTenantUserSessionsCore,
  updateTenantUserCore,
} from "@/lib/users/service";

// 2026-11-03, user request: "under platform admin, inside a company where I add users, it should allow me to manage users from this
// screen, not tell me to enter the company users page". Platform > Companies > company > Users lists, adds, edits, signs out and
// removes a company's users without a support session. It uses the very same user rules as the company's own Users screen
// (lib/users/service.ts ...Core functions), checked against the platform permission instead, and every change is audited as a
// PLATFORM action on that company.

async function authorize(ctx: RequestContext, companyId: string, write: boolean) {
  requirePlatformPermission(ctx, "PLATFORM_TENANT_ADMINS_MANAGE");
  if (ctx.companyId) throw new Error("PLATFORM_CONTEXT_REQUIRED");
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, status: true } });
  if (!company) throw new Error("RESOURCE_NOT_FOUND");
  if (write && company.status !== "ACTIVE") throw new Error("COMPANY_NOT_ACTIVE");
}

export async function listPlatformCompanyUsers(ctx: RequestContext, companyId: string) {
  await authorize(ctx, companyId, false);
  return { users: await listTenantUsersCore(companyId), editor: await getTenantUserEditorDataCore(companyId) };
}

export async function getPlatformCompanyUserEditor(ctx: RequestContext, companyId: string, membershipId: string) {
  await authorize(ctx, companyId, false);
  return getTenantUserEditorDataCore(companyId, membershipId);
}

export async function addPlatformCompanyUser(ctx: RequestContext, companyId: string, raw: unknown) {
  await authorize(ctx, companyId, true);
  return createTenantUserCore(ctx, companyId, "PLATFORM", raw);
}

export async function updatePlatformCompanyUser(ctx: RequestContext, companyId: string, membershipId: string, raw: unknown) {
  await authorize(ctx, companyId, true);
  return updateTenantUserCore(ctx, companyId, "PLATFORM", membershipId, raw);
}

export async function resetPlatformCompanyUserSessions(ctx: RequestContext, companyId: string, membershipId: string) {
  await authorize(ctx, companyId, true);
  return resetTenantUserSessionsCore(ctx, companyId, "PLATFORM", membershipId);
}

export async function removePlatformCompanyUser(ctx: RequestContext, companyId: string, membershipId: string) {
  await authorize(ctx, companyId, true);
  return deleteTenantUserCore(ctx, companyId, "PLATFORM", membershipId);
}
