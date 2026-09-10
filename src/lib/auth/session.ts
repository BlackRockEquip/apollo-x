import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { ModuleKey } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/constants";
import { createOpaqueToken, hashToken } from "@/lib/security/tokens";
import {
  DEFAULT_PLATFORM_PERMISSIONS,
  DEFAULT_TENANT_PERMISSIONS,
  mergePermissionOverrides,
  SUPPORT_READ_TENANT_PERMISSIONS,
  SUPPORT_WRITE_TENANT_PERMISSIONS,
  type PlatformPermission,
  type TenantPermission,
} from "@/lib/auth/permissions";
import { evaluateModuleAccess, type ModuleAccessMode } from "@/lib/entitlements/policy";
import type { RequestContext } from "@/lib/auth/context-types";

export async function createSession(userId: string, membershipId: string | null, supportAccessId: string | null = null) {
  const user = await prisma.userIdentity.findUniqueOrThrow({ where: { id: userId }, select: { sessionVersion: true } });
  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  await prisma.userSession.create({
    data: { tokenHash: hashToken(token), userId, membershipId, supportAccessId, sessionVersion: user.sessionVersion, expiresAt },
  });
  return { token, expiresAt };
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.SESSION_COOKIE_SECURE === "true" || process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) await prisma.userSession.updateMany({ where: { tokenHash: hashToken(token), revokedAt: null }, data: { revokedAt: new Date() } });
  cookieStore.delete(SESSION_COOKIE);
}

export async function getRequestContext(): Promise<RequestContext | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  return resolveSessionToken(token);
}

type SessionDatabase = Pick<typeof prisma, "userSession">;

export async function resolveSessionToken(token: string, database: SessionDatabase = prisma, now = new Date()): Promise<RequestContext | null> {

  const session = await database.userSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: { include: { platformAssignments: { where: { active: true }, include: { permissions: true } } } },
      membership: { include: { company: { include: { entitlements: true, settings: true } }, permissions: true } },
      supportAccess: { include: { company: { include: { entitlements: true, settings: true } } } },
    },
  });

  if (!session || session.revokedAt || session.expiresAt <= now || !session.user.active || session.sessionVersion !== session.user.sessionVersion) return null;

  const support = session.supportAccess;
  if (support && (support.endedAt || support.expiresAt <= now)) return null;
  if (session.membership && session.membership.status !== "ACTIVE") return null;

  const company = support?.company ?? session.membership?.company ?? null;
  if (company && company.status !== "ACTIVE") return null;

  const tenantPermissions = support
    ? new Set(support.mode === "READ_WRITE" ? SUPPORT_WRITE_TENANT_PERMISSIONS : SUPPORT_READ_TENANT_PERMISSIONS)
    : session.membership
      ? mergePermissionOverrides<TenantPermission>(DEFAULT_TENANT_PERMISSIONS[session.membership.role], session.membership.permissions)
      : new Set<TenantPermission>();

  const platformPermissions = new Set<PlatformPermission>();
  for (const assignment of session.user.platformAssignments) {
    const effective = mergePermissionOverrides<PlatformPermission>(DEFAULT_PLATFORM_PERMISSIONS[assignment.role], assignment.permissions);
    for (const permission of effective) platformPermissions.add(permission);
  }

  if (support) {
    const required = support.mode === "READ_WRITE" ? "PLATFORM_SUPPORT_WRITE" : "PLATFORM_SUPPORT_READ";
    if (!platformPermissions.has(required)) return null;
  }

  const moduleAccess = new Map<ModuleKey, ModuleAccessMode>();
  if (company) {
    // This session-resolution path only ever serves the WORKSHOP product
    // today — filtered explicitly so a future SPORTS_LEAGUE entitlement row
    // on the same company can never leak into a Workshop ModuleKey lookup.
    const entitlementMap = new Map(company.entitlements.filter((row) => row.product === "WORKSHOP").map((row) => [row.module, row]));
    for (const moduleKey of Object.values(ModuleKey)) {
      const row = entitlementMap.get(moduleKey);
      moduleAccess.set(moduleKey, evaluateModuleAccess({
        companyInternalCode: company.internalCode,
        companyActive: company.status === "ACTIVE",
        module: moduleKey,
        status: row?.status,
        effectiveFrom: row?.effectiveFrom,
        expiresAt: row?.expiresAt,
        gracePeriodDays: row?.gracePeriodDays ?? company.defaultGracePeriodDays,
        readOnlyOverrideUntil: row?.readOnlyOverrideUntil,
      }, now));
    }
  }

  return {
    userId: session.user.id,
    displayName: session.user.displayName,
    companyId: company?.id ?? null,
    companyInternalCode: company?.internalCode ?? null,
    companyName: company ? (company.tradingName ?? company.legalName) : null,
    tenantRole: session.membership?.role ?? null,
    tenantPermissions,
    platformPermissions,
    supportAccessId: support?.id ?? null,
    supportMode: support?.mode ?? null,
    themeColor: company?.settings?.themeColor ?? null,
    accentColor: company?.settings?.accentColor ?? null,
    secondaryColor: company?.settings?.secondaryColor ?? null,
    hasCompanyLogo: Boolean(company?.settings?.logoMimeType),
    moduleAccess,
    correlationId: randomUUID(),
  };
}

export async function requireRequestContext() {
  const context = await getRequestContext();
  if (!context) throw new Error("AUTHENTICATION_REQUIRED");
  return context;
}
