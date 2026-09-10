import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { EntitlementStatus, ModuleKey, PlatformRole, PrismaClient } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { AuthorizationError, requireTenantPermission } from "@/lib/auth/guards";
import type { RequestContext } from "@/lib/auth/context-types";
import { DEFAULT_PLATFORM_PERMISSIONS, DEFAULT_TENANT_PERMISSIONS } from "@/lib/auth/permissions";
import { resolveSessionToken } from "@/lib/auth/session";
import { listPlatformCompanies, getPlatformCompanyDetail, createPlatformCompany, grantPlatformAuthority, listPlatformUsers, setPlatformCompanyStatus, updatePlatformAuthority, updatePlatformCompany, updatePlatformEntitlement } from "@/lib/platform/admin-service";
import { startSupportAccess, endSupportAccess } from "@/lib/platform/support-service";
import { getOwnCompany } from "@/lib/repositories/phase1-security";
import { evaluateModuleAccess } from "@/lib/entitlements/policy";
import { BLACK_ROCK_INTERNAL_CODE } from "@/lib/constants";

const connection = process.env.DATABASE_URL_TEST;
if (!connection) throw new Error("DATABASE_URL_TEST is required for Phase 5 integration tests.");
const database = new PrismaClient({ datasources: { db: { url: connection } } });
const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;

type Fixture = {
  companyA: string; companyB: string; blackRock: string;
  userA: string; userB: string; blackRockUser: string; operator: string; extraPlatformUser: string;
  membershipA: string; membershipB: string; blackRockMembership: string;
  createdCompany?: string;
  extraAssignment?: string;
};
const fixture = {} as Fixture;

function tenantContext(companyId: string, userId: string, permissions = DEFAULT_TENANT_PERMISSIONS.COMPANY_ADMIN): RequestContext {
  return {
    userId, displayName: "Tenant User", companyId, companyInternalCode: "TEST", tenantRole: "COMPANY_ADMIN",
    tenantPermissions: new Set(permissions), platformPermissions: new Set(), supportAccessId: null, supportMode: null,
    moduleAccess: new Map(Object.values(ModuleKey).map((key) => [key, "FULL" as const])), correlationId: `tenant-${suffix}`,
  };
}

function platformContext(userId: string, permissions = DEFAULT_PLATFORM_PERMISSIONS.PLATFORM_ADMIN): RequestContext {
  return {
    userId, displayName: "Platform Admin", companyId: null, companyInternalCode: null, tenantRole: null,
    tenantPermissions: new Set(), platformPermissions: new Set(permissions), supportAccessId: null, supportMode: null,
    moduleAccess: new Map(), correlationId: `platform-${suffix}-${randomUUID()}`,
  };
}

async function addSession(input: { token: string; userId: string; membershipId?: string; supportAccessId?: string; version?: number; expiresAt?: Date }) {
  await database.userSession.create({
    data: {
      tokenHash: createHash("sha256").update(input.token).digest("hex"),
      userId: input.userId,
      membershipId: input.membershipId,
      supportAccessId: input.supportAccessId,
      sessionVersion: input.version ?? 1,
      expiresAt: input.expiresAt ?? new Date(Date.now() + 3_600_000),
    },
  });
}

beforeAll(async () => {
  const [a, b, blackRock] = await Promise.all([
    database.company.create({ data: { internalCode: `PA_TENANT_A_${suffix}`, legalName: "Platform Tenant A", settings: { create: { themeColor: "#111111", mainEmail: "a@example.test" } }, entitlements: { create: { module: "QUOTES", source: "MODULE", status: "ACTIVE", effectiveFrom: new Date("2026-01-01"), expiresAt: new Date("2027-01-01") } } } }),
    database.company.create({ data: { internalCode: `PA_TENANT_B_${suffix}`, legalName: "Platform Tenant B", status: "SUSPENDED", settings: { create: { themeColor: "#222222", mainTelephone: "+27110000000" } }, entitlements: { create: { module: "INVENTORY", source: "MODULE", status: "GRACE_READ_ONLY", effectiveFrom: new Date("2026-01-01") } } } }),
    database.company.upsert({ where: { internalCode: BLACK_ROCK_INTERNAL_CODE }, update: {}, create: { internalCode: BLACK_ROCK_INTERNAL_CODE, legalName: "Black Rock Equipment Test", tradingName: "Black Rock Equipment", settings: { create: { themeColor: "#000000" } } } }),
  ]);
  Object.assign(fixture, { companyA: a.id, companyB: b.id, blackRock: blackRock.id });

  const [userA, userB, blackRockUser, operator, extraPlatformUser] = await Promise.all([
    database.userIdentity.create({ data: { email: `pa-a-${suffix}@example.test`, displayName: "Tenant A Admin", passwordHash: "test-only" } }),
    database.userIdentity.create({ data: { email: `pa-b-${suffix}@example.test`, displayName: "Tenant B Admin", passwordHash: "test-only" } }),
    database.userIdentity.create({ data: { email: `pa-black-${suffix}@example.test`, displayName: "Black Rock User", passwordHash: "test-only" } }),
    database.userIdentity.create({ data: { email: `pa-platform-${suffix}@example.test`, displayName: "Platform Operator", passwordHash: "test-only", platformAssignments: { create: { role: "PLATFORM_ADMIN" } } } }),
    database.userIdentity.create({ data: { email: `pa-support-${suffix}@example.test`, displayName: "Support Operator User", passwordHash: "test-only" } }),
  ]);
  Object.assign(fixture, { userA: userA.id, userB: userB.id, blackRockUser: blackRockUser.id, operator: operator.id, extraPlatformUser: extraPlatformUser.id });

  const [membershipA, membershipB, blackRockMembership] = await Promise.all([
    database.companyMembership.create({ data: { companyId: fixture.companyA, userId: fixture.userA, role: "COMPANY_ADMIN" } }),
    database.companyMembership.create({ data: { companyId: fixture.companyB, userId: fixture.userB, role: "COMPANY_ADMIN" } }),
    database.companyMembership.create({ data: { companyId: fixture.blackRock, userId: fixture.blackRockUser, role: "USER" } }),
  ]);
  Object.assign(fixture, { membershipA: membershipA.id, membershipB: membershipB.id, blackRockMembership: blackRockMembership.id });
});

beforeEach(async () => {
  await database.userSession.deleteMany({});
  await database.auditEvent.deleteMany({ where: { correlationId: { contains: `platform-${suffix}` } } });
  await database.platformSupportAccess.deleteMany({ where: { operatorId: fixture.operator } });
  if (fixture.operator) {
    await database.platformRoleAssignment.upsert({
      where: { userId_role: { userId: fixture.operator, role: "PLATFORM_ADMIN" } },
      create: { userId: fixture.operator, role: "PLATFORM_ADMIN", active: true },
      update: { active: true },
    });
  }
  if (fixture.extraPlatformUser) {
    await database.platformRoleAssignment.deleteMany({ where: { userId: fixture.extraPlatformUser } });
    await database.userIdentity.update({ where: { id: fixture.extraPlatformUser }, data: { sessionVersion: { increment: 1 } } });
  }
});

afterAll(async () => {
  const actorIds = [fixture.operator, fixture.userA, fixture.userB, fixture.blackRockUser, fixture.extraPlatformUser].filter((value): value is string => Boolean(value));
  const membershipIds = [fixture.membershipA, fixture.membershipB, fixture.blackRockMembership].filter((value): value is string => Boolean(value));
  const userIds = [fixture.userA, fixture.userB, fixture.blackRockUser, fixture.operator, fixture.extraPlatformUser].filter((value): value is string => Boolean(value));
  const companyIds = [fixture.createdCompany, fixture.companyA, fixture.companyB].filter((value): value is string => Boolean(value));
  if (actorIds.length > 0) await database.auditEvent.deleteMany({ where: { actorId: { in: actorIds } } });
  const supportOperatorIds = [fixture.operator, fixture.extraPlatformUser].filter((value): value is string => Boolean(value));
  if (supportOperatorIds.length > 0) await database.platformSupportAccess.deleteMany({ where: { operatorId: { in: supportOperatorIds } } });
  if (fixture.extraPlatformUser) await database.platformRoleAssignment.deleteMany({ where: { userId: fixture.extraPlatformUser } });
  if (membershipIds.length > 0) await database.companyMembership.deleteMany({ where: { id: { in: membershipIds } } });
  if (userIds.length > 0) await database.userIdentity.deleteMany({ where: { id: { in: userIds } } });
  if (companyIds.length > 0) await database.company.deleteMany({ where: { id: { in: companyIds } } });
  await database.$disconnect();
});

describe("Phase 5 Platform Admin first pass", () => {
  it("platform user listing requires platform authority and tenant users cannot access it", async () => {
    const users = await listPlatformUsers(platformContext(fixture.operator), { q: "Platform" });
    expect(users.some((user) => user.id === fixture.operator)).toBe(true);
    await expect(listPlatformUsers(tenantContext(fixture.companyA, fixture.userA), { q: "" })).rejects.toThrow(AuthorizationError);
  });

  it("grants platform authority without creating tenant membership and authority alone cannot access tenant operational data", async () => {
    const assignment = await grantPlatformAuthority(platformContext(fixture.operator), { email: `pa-support-${suffix}@example.test`, role: PlatformRole.SUPPORT_READ_ONLY });
    fixture.extraAssignment = assignment.id;
    expect(await database.companyMembership.findFirst({ where: { userId: fixture.extraPlatformUser } })).toBeNull();
    const token = `phase5-platform-user-${suffix}`;
    const current = await database.userIdentity.findUniqueOrThrow({ where: { id: fixture.extraPlatformUser } });
    await addSession({ token, userId: fixture.extraPlatformUser, version: current.sessionVersion });
    const resolved = (await resolveSessionToken(token, database))!;
    expect(resolved.companyId).toBeNull();
    await expect(getOwnCompany(resolved, database)).rejects.toThrow(AuthorizationError);
  });

  it("revoke and role changes are reflected, audited, and stale authority is invalidated", async () => {
    const assignment = await grantPlatformAuthority(platformContext(fixture.operator), { email: `pa-support-${suffix}@example.test`, role: PlatformRole.SUPPORT_OPERATOR });
    const preUser = await database.userIdentity.findUniqueOrThrow({ where: { id: fixture.extraPlatformUser } });
    const token = `phase5-platform-role-${suffix}`;
    await addSession({ token, userId: fixture.extraPlatformUser, version: preUser.sessionVersion });
    expect((await resolveSessionToken(token, database))?.platformPermissions.has("PLATFORM_SUPPORT_WRITE")).toBe(true);

    const updated = await updatePlatformAuthority(platformContext(fixture.operator), { assignmentId: assignment.id, role: PlatformRole.SUPPORT_READ_ONLY, active: true });
    expect(updated.role).toBe(PlatformRole.SUPPORT_READ_ONLY);
    expect(await resolveSessionToken(token, database)).toBeNull();

    const current = await database.userIdentity.findUniqueOrThrow({ where: { id: fixture.extraPlatformUser } });
    const token2 = `phase5-platform-role-2-${suffix}`;
    await addSession({ token: token2, userId: fixture.extraPlatformUser, version: current.sessionVersion });
    const resolved = (await resolveSessionToken(token2, database))!;
    expect(resolved.platformPermissions.has("PLATFORM_SUPPORT_READ")).toBe(true);
    expect(resolved.platformPermissions.has("PLATFORM_SUPPORT_WRITE")).toBe(false);

    await updatePlatformAuthority(platformContext(fixture.operator), { assignmentId: updated.id, role: PlatformRole.SUPPORT_READ_ONLY, active: false });
    const audit = await database.auditEvent.findFirst({ where: { entityType: "PlatformRoleAssignment", entityId: updated.id }, orderBy: { occurredAt: "desc" } });
    expect(audit).not.toBeNull();
  });

  it("explicit support context remains required and support read/write distinction stays enforced", async () => {
    const readAssignment = await grantPlatformAuthority(platformContext(fixture.operator), { email: `pa-support-${suffix}@example.test`, role: PlatformRole.SUPPORT_READ_ONLY });
    const current = await database.userIdentity.findUniqueOrThrow({ where: { id: fixture.extraPlatformUser } });
    const token = `phase5-platform-readonly-${suffix}`;
    await addSession({ token, userId: fixture.extraPlatformUser, version: current.sessionVersion });
    const platformOnly = (await resolveSessionToken(token, database))!;
    await expect(getOwnCompany(platformOnly, database)).rejects.toThrow(AuthorizationError);
    const readSupport = await startSupportAccess({ ...platformOnly, correlationId: `platform-${suffix}-ro` }, { companyId: fixture.companyA, mode: "READ_ONLY", reason: "Read support", expiresAt: new Date(Date.now() + 60_000) }, database);
    const roToken = `phase5-platform-readonly-support-${suffix}`;
    const postRead = await database.userIdentity.findUniqueOrThrow({ where: { id: fixture.extraPlatformUser } });
    await addSession({ token: roToken, userId: fixture.extraPlatformUser, supportAccessId: readSupport.id, version: postRead.sessionVersion });
    const resolvedRo = (await resolveSessionToken(roToken, database))!;
    expect(() => requireTenantPermission(resolvedRo, "CUSTOMERS_VIEW")).not.toThrow();
    expect(() => requireTenantPermission(resolvedRo, "SETTINGS_MANAGE")).toThrow(AuthorizationError);

    await updatePlatformAuthority(platformContext(fixture.operator), { assignmentId: readAssignment.id, role: PlatformRole.SUPPORT_OPERATOR, active: true });
    const upgradedUser = await database.userIdentity.findUniqueOrThrow({ where: { id: fixture.extraPlatformUser } });
    const upgradedToken = `phase5-platform-write-${suffix}`;
    await addSession({ token: upgradedToken, userId: fixture.extraPlatformUser, version: upgradedUser.sessionVersion });
    const upgraded = (await resolveSessionToken(upgradedToken, database))!;
    const rwSupport = await startSupportAccess({ ...upgraded, correlationId: `platform-${suffix}-rw` }, { companyId: fixture.companyA, mode: "READ_WRITE", reason: "Write support", expiresAt: new Date(Date.now() + 60_000) }, database);
    const rwToken = `phase5-platform-write-support-${suffix}`;
    const refreshedUser = await database.userIdentity.findUniqueOrThrow({ where: { id: fixture.extraPlatformUser } });
    await addSession({ token: rwToken, userId: fixture.extraPlatformUser, supportAccessId: rwSupport.id, version: refreshedUser.sessionVersion });
    const resolvedRw = (await resolveSessionToken(rwToken, database))!;
    expect(() => requireTenantPermission(resolvedRw, "SETTINGS_MANAGE")).not.toThrow();
  });

  it("protects the last usable platform administrator", async () => {
    const isolatedAdmin = await database.userIdentity.create({ data: { email: `pa-last-admin-${suffix}@example.test`, displayName: "Last Admin", passwordHash: "test-only", platformAssignments: { create: { role: "PLATFORM_ADMIN" } } }, include: { platformAssignments: true } });
    const secondAdmin = await database.userIdentity.create({ data: { email: `pa-second-admin-${suffix}@example.test`, displayName: "Second Admin", passwordHash: "test-only", platformAssignments: { create: { role: "PLATFORM_ADMIN", active: false } } }, include: { platformAssignments: true } });
    try {
      const ambientAdminIds = (await database.platformRoleAssignment.findMany({ where: { role: "PLATFORM_ADMIN", active: true, userId: { notIn: [isolatedAdmin.id, secondAdmin.id] } }, select: { id: true } })).map((row) => row.id);
      if (ambientAdminIds.length > 0) {
        await database.platformRoleAssignment.updateMany({ where: { id: { in: ambientAdminIds } }, data: { active: false } });
      }
      const adminAssignment = isolatedAdmin.platformAssignments[0]!;
      await expect(updatePlatformAuthority(platformContext(isolatedAdmin.id), { assignmentId: adminAssignment.id, role: PlatformRole.SUPPORT_OPERATOR, active: true })).rejects.toThrow("LAST_PLATFORM_ADMIN_REQUIRED");
      await expect(updatePlatformAuthority(platformContext(isolatedAdmin.id), { assignmentId: adminAssignment.id, role: PlatformRole.PLATFORM_ADMIN, active: false })).rejects.toThrow("LAST_PLATFORM_ADMIN_REQUIRED");
      if (ambientAdminIds.length > 0) {
        await database.platformRoleAssignment.updateMany({ where: { id: { in: ambientAdminIds } }, data: { active: true } });
      }
    } finally {
      await database.platformRoleAssignment.deleteMany({ where: { userId: { in: [isolatedAdmin.id, secondAdmin.id] } } });
      await database.userIdentity.deleteMany({ where: { id: { in: [isolatedAdmin.id, secondAdmin.id] } } });
    }
  });

  it("creates a company and rejects duplicate immutable company codes", async () => {
    const created = await createPlatformCompany(platformContext(fixture.operator), {
      internalCode: `PASS2_CO_${suffix}`,
      legalName: "Pass 2 Company",
      tradingName: "Pass 2",
      defaultCurrencyCode: "zar",
      defaultGracePeriodDays: 14,
      settings: { mainEmail: "pass2@example.test", quoteValidityDays: 21, defaultTaxJurisdiction: "za" },
    });
    fixture.createdCompany = created.id;
    const stored = await database.company.findUniqueOrThrow({ where: { id: created.id }, include: { settings: true } });
    expect(stored.internalCode).toBe(`PASS2_CO_${suffix}`.toUpperCase());
    expect(stored.settings?.mainEmail).toBe("pass2@example.test");
    await expect(createPlatformCompany(platformContext(fixture.operator), { internalCode: `PASS2_CO_${suffix}`, legalName: "Duplicate" })).rejects.toThrow("DUPLICATE_INTERNAL_CODE");
  });

  it("does not allow immutable company code changes and allows editing safe fields", async () => {
    await updatePlatformCompany(platformContext(fixture.operator), fixture.companyA, {
      legalName: "Platform Tenant A Updated",
      tradingName: "Tenant A Updated",
      defaultCurrencyCode: "usd",
      defaultGracePeriodDays: 45,
      settings: { mainTelephone: "+27119999999", website: "https://example.test", quoteValidityDays: 10, defaultTaxJurisdiction: "na" },
    });
    const updated = await database.company.findUniqueOrThrow({ where: { id: fixture.companyA }, include: { settings: true } });
    expect(updated.internalCode).toContain("PA_TENANT_A_");
    expect(updated.legalName).toBe("Platform Tenant A Updated");
    expect(updated.defaultCurrencyCode).toBe("USD");
    expect(updated.settings?.website).toBe("https://example.test");
  });

  it("deactivates and reactivates non-destructively while revoking active sessions", async () => {
    const currentUser = await database.userIdentity.findUniqueOrThrow({ where: { id: fixture.userA } });
    const token = `phase5-suspend-${suffix}`;
    await addSession({ token, userId: fixture.userA, membershipId: fixture.membershipA, version: currentUser.sessionVersion });
    expect(await resolveSessionToken(token, database)).not.toBeNull();
    await setPlatformCompanyStatus(platformContext(fixture.operator), fixture.companyA, "SUSPENDED");
    expect(await resolveSessionToken(token, database)).toBeNull();
    expect(await database.job.count({ where: { companyId: fixture.companyA } })).toBe(0);
    await setPlatformCompanyStatus(platformContext(fixture.operator), fixture.companyA, "ACTIVE");
    const company = await database.company.findUniqueOrThrow({ where: { id: fixture.companyA } });
    expect(company.status).toBe("ACTIVE");
  });

  it("platform admin can access platform company list while normal tenant users cannot", async () => {
    const companies = await listPlatformCompanies(platformContext(fixture.operator), { q: "Platform", status: "ALL" });
    expect(companies.some((row) => row.id === fixture.companyA)).toBe(true);
    expect(companies.every((row) => !Object.prototype.hasOwnProperty.call(row, "memberships"))).toBe(true);
    await expect(listPlatformCompanies(tenantContext(fixture.companyA, fixture.userA), { q: "", status: "ALL" })).rejects.toThrow("PLATFORM_CONTEXT_REQUIRED");
  });

  it("company detail exposes safe metadata and entitlement summary only", async () => {
    const detail = await getPlatformCompanyDetail(platformContext(fixture.operator), fixture.companyA);
    expect(detail.internalCode).toContain("PA_TENANT_A_");
    expect(detail.entitlements[0]?.module).toBe("QUOTES");
    expect((detail as Record<string, unknown>).jobs).toBeUndefined();
  });

  it("duplicate PlatformShell cleanup does not break platform pages", async () => {
    expect(typeof PlatformRole.PLATFORM_ADMIN).toBe("string");
    const overview = await listPlatformCompanies(platformContext(fixture.operator), { q: "", status: "ALL" });
    const detail = await getPlatformCompanyDetail(platformContext(fixture.operator), fixture.companyA);
    const users = await listPlatformUsers(platformContext(fixture.operator), { q: "" });
    expect(overview.length).toBeGreaterThan(0);
    expect(detail.id).toBe(fixture.companyA);
    expect(users.length).toBeGreaterThan(0);
  });

  it("support read-only entry resolves tenant context but keeps mutation blocked", async () => {
    const sessionToken = `phase5-operator-base-read-${suffix}`;
    const currentUser = await database.userIdentity.findUniqueOrThrow({ where: { id: fixture.operator } });
    await addSession({ token: sessionToken, userId: fixture.operator, version: currentUser.sessionVersion });
    const base = (await resolveSessionToken(sessionToken, database))!;
    const support = await startSupportAccess(base, { companyId: fixture.companyA, mode: "READ_ONLY", reason: "Investigating tenant settings display", expiresAt: new Date(Date.now() + 60_000) }, database);
    const token = `phase5-read-${suffix}`;
    const refreshedUser = await database.userIdentity.findUniqueOrThrow({ where: { id: fixture.operator } });
    await addSession({ token, userId: fixture.operator, supportAccessId: support.id, version: refreshedUser.sessionVersion });
    const resolved = (await resolveSessionToken(token, database))!;
    expect(resolved.companyId).toBe(fixture.companyA);
    expect(resolved.supportMode).toBe("READ_ONLY");
    expect(() => requireTenantPermission(resolved, "CUSTOMERS_VIEW")).not.toThrow();
    expect(() => requireTenantPermission(resolved, "SETTINGS_MANAGE")).toThrow(AuthorizationError);
  });

  it("support read-write entry resolves tenant context and support exit ends it", async () => {
    const sessionToken = `phase5-operator-base-write-${suffix}`;
    const currentUser = await database.userIdentity.findUniqueOrThrow({ where: { id: fixture.operator } });
    await addSession({ token: sessionToken, userId: fixture.operator, version: currentUser.sessionVersion });
    const base = (await resolveSessionToken(sessionToken, database))!;
    const support = await startSupportAccess(base, { companyId: fixture.companyA, mode: "READ_WRITE", reason: "Authorized support correction", expiresAt: new Date(Date.now() + 60_000) }, database);
    const token = `phase5-write-${suffix}`;
    const refreshedUser = await database.userIdentity.findUniqueOrThrow({ where: { id: fixture.operator } });
    await addSession({ token, userId: fixture.operator, supportAccessId: support.id, version: refreshedUser.sessionVersion });
    const resolved = (await resolveSessionToken(token, database))!;
    expect(resolved.companyId).toBe(fixture.companyA);
    expect(resolved.supportMode).toBe("READ_WRITE");
    expect(await getOwnCompany(resolved, database)).not.toBeNull();

    await endSupportAccess({ ...resolved, correlationId: `platform-${suffix}-exit` }, database);
    const ended = await database.platformSupportAccess.findUniqueOrThrow({ where: { id: support.id } });
    expect(ended.endedAt).not.toBeNull();
  });

  it("cross-tenant access without explicit support context is rejected and support context is audited", async () => {
    await expect(getOwnCompany(platformContext(fixture.operator), database)).rejects.toThrow(AuthorizationError);
    const support = await startSupportAccess(platformContext(fixture.operator), { companyId: fixture.companyA, mode: "READ_ONLY", reason: "Audit support context creation", expiresAt: new Date(Date.now() + 60_000) }, database);
    const audits = await database.auditEvent.findMany({ where: { supportAccessId: support.id }, select: { action: true, companyId: true, actorId: true } });
    expect(audits.some((row) => row.action === "SUPPORT_CONTEXT_STARTED" && row.companyId === fixture.companyA && row.actorId === fixture.operator)).toBe(true);
  });

  it("normal tenant user cannot perform platform management", async () => {
    await expect(createPlatformCompany(tenantContext(fixture.companyA, fixture.userA), { internalCode: `TENANT_FAIL_${suffix}`, legalName: "Nope" })).rejects.toThrow(AuthorizationError);
    await expect(updatePlatformEntitlement(tenantContext(fixture.companyA, fixture.userA), fixture.companyA, { module: "QUOTES", status: "ACTIVE", source: "MODULE", effectiveFrom: "2026-01-01", reason: "No access" })).rejects.toThrow(AuthorizationError);
  });

  it("updates module entitlement, records entitlement history, and records platform audit", async () => {
    const before = await database.companyModuleEntitlement.findUnique({ where: { companyId_product_module: { companyId: fixture.companyA, product: "WORKSHOP", module: "QUOTES" } } });
    await updatePlatformEntitlement(platformContext(fixture.operator), fixture.companyA, {
      module: "QUOTES",
      status: "GRACE_READ_ONLY",
      source: "PLATFORM_OVERRIDE",
      effectiveFrom: "2026-09-01",
      expiresAt: "2026-10-01",
      gracePeriodDays: "5",
      readOnlyOverrideUntil: "2026-10-06",
      reason: "Commercial grace review",
    });
    const entitlement = await database.companyModuleEntitlement.findUniqueOrThrow({ where: { companyId_product_module: { companyId: fixture.companyA, product: "WORKSHOP", module: "QUOTES" } } });
    expect(entitlement.status).toBe("GRACE_READ_ONLY");
    expect(evaluateModuleAccess({ companyInternalCode: `PA_TENANT_A_${suffix}`, companyActive: true, module: entitlement.module, status: entitlement.status, effectiveFrom: entitlement.effectiveFrom, expiresAt: entitlement.expiresAt, gracePeriodDays: entitlement.gracePeriodDays, readOnlyOverrideUntil: entitlement.readOnlyOverrideUntil }, new Date("2026-09-15"))).toBe("READ_ONLY");
    const history = await database.entitlementHistory.findFirst({ where: { companyId: fixture.companyA, module: "QUOTES", newStatus: "GRACE_READ_ONLY" }, orderBy: { createdAt: "desc" } });
    expect(history?.previousStatus).toBe(before?.status ?? null);
    expect(history?.reason).toBe("Commercial grace review");
    const audit = await database.auditEvent.findFirst({ where: { companyId: fixture.companyA, action: "PLATFORM_ENTITLEMENT_UPDATED" }, orderBy: { occurredAt: "desc" } });
    expect(audit).not.toBeNull();
  });

  it("Black Rock entitlement does not create platform authority", async () => {
    const token = `phase5-black-${suffix}`;
    await addSession({ token, userId: fixture.blackRockUser, membershipId: fixture.blackRockMembership });
    const resolved = (await resolveSessionToken(token, database))!;
    expect(resolved.companyId).toBe(fixture.blackRock);
    await expect(listPlatformCompanies(resolved, { q: "", status: "ALL" })).rejects.toThrow("PLATFORM_CONTEXT_REQUIRED");
  });

  it("Black Rock internal free-module behavior cannot be disabled through normal entitlement management and does not bypass tenant permissions", async () => {
    expect(evaluateModuleAccess({ companyInternalCode: BLACK_ROCK_INTERNAL_CODE, companyActive: true, module: "IMPORT_EXPORT" }, new Date("2026-09-01"))).toBe("FULL");
    await expect(updatePlatformCompany(platformContext(fixture.operator), fixture.blackRock, { legalName: "Renamed", tradingName: "Renamed" })).rejects.toThrow("BLACK_ROCK_PROTECTED");
    await expect(setPlatformCompanyStatus(platformContext(fixture.operator), fixture.blackRock, "SUSPENDED")).rejects.toThrow("BLACK_ROCK_PROTECTED");
    await expect(updatePlatformEntitlement(platformContext(fixture.operator), fixture.blackRock, { module: "QUOTES", status: EntitlementStatus.SUSPENDED, source: "MODULE", effectiveFrom: "2026-09-01", reason: "Attempted disable" })).rejects.toThrow("BLACK_ROCK_ENTITLEMENT_PROTECTED");

    const token = `phase5-black-perm-${suffix}`;
    await addSession({ token, userId: fixture.blackRockUser, membershipId: fixture.blackRockMembership });
    const resolved = (await resolveSessionToken(token, database))!;
    expect(() => requireTenantPermission(resolved, "SETTINGS_MANAGE")).toThrow(AuthorizationError);
  });
});