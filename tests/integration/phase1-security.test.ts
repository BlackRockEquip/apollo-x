import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ModuleKey, PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import type { RequestContext } from "@/lib/auth/context-types";
import { AuthorizationError, requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { getOwnCompanySettings, updateOwnCompanySettings } from "@/lib/repositories/company-settings";
import { createTenantAuditEvent, getOwnCompany, getTenantAuditEvent, getTenantEntitlement, getTenantMembership } from "@/lib/repositories/phase1-security";
import { startSupportAccess, endSupportAccess } from "@/lib/platform/support-service";
import { resolveSessionToken } from "@/lib/auth/session";
import { DEFAULT_PLATFORM_PERMISSIONS, DEFAULT_TENANT_PERMISSIONS } from "@/lib/auth/permissions";
import { evaluateModuleAccess } from "@/lib/entitlements/policy";
import { BLACK_ROCK_INTERNAL_CODE } from "@/lib/constants";
import { clearLoginFailures, isLoginBlocked, recordLoginFailure } from "@/lib/security/login-throttle";

const connection = process.env.DATABASE_URL_TEST;
if (!connection) throw new Error("DATABASE_URL_TEST is required for Phase 1 integration tests.");
const database = new PrismaClient({ datasources: { db: { url: connection } } });
const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;

type Fixture = {
  companyA: string; companyB: string; blackRock: string;
  userA: string; userB: string; blackRockUser: string; operator: string;
  membershipA: string; membershipB: string; blackRockMembership: string;
  settingsA: string; settingsB: string; auditA: string; auditB: string;
};
const fixture = {} as Fixture;

function tenantContext(companyId: string, userId: string, permissions = DEFAULT_TENANT_PERMISSIONS.COMPANY_ADMIN): RequestContext {
  return {
    userId, displayName: "Test user", companyId, companyInternalCode: "TEST", tenantRole: "COMPANY_ADMIN",
    tenantPermissions: new Set(permissions), platformPermissions: new Set(), supportAccessId: null, supportMode: null,
    moduleAccess: new Map(Object.values(ModuleKey).map((key) => [key, "FULL" as const])), correlationId: `test-${suffix}`,
  };
}

function platformContext(userId: string): RequestContext {
  return {
    userId, displayName: "Platform operator", companyId: null, companyInternalCode: null, tenantRole: null,
    tenantPermissions: new Set(), platformPermissions: new Set(DEFAULT_PLATFORM_PERMISSIONS.PLATFORM_ADMIN),
    supportAccessId: null, supportMode: null, moduleAccess: new Map(), correlationId: `platform-${suffix}`,
  };
}

async function addSession(input: { token: string; userId: string; membershipId?: string; supportAccessId?: string; version?: number; expiresAt?: Date }) {
  await database.userSession.create({
    data: {
      tokenHash: createHash("sha256").update(input.token).digest("hex"), userId: input.userId,
      membershipId: input.membershipId, supportAccessId: input.supportAccessId,
      sessionVersion: input.version ?? 1, expiresAt: input.expiresAt ?? new Date(Date.now() + 3_600_000),
    },
  });
}

beforeAll(async () => {
  const [a, b, blackRock] = await Promise.all([
    database.company.create({ data: { internalCode: `TENANT_A_${suffix}`, legalName: "Frikkie Test Company", settings: { create: { themeColor: "#111111" } }, entitlements: { create: { module: "QUOTES", source: "MODULE", status: "ACTIVE", effectiveFrom: new Date("2026-01-01"), expiresAt: new Date("2027-01-01") } } }, include: { settings: true } }),
    database.company.create({ data: { internalCode: `TENANT_B_${suffix}`, legalName: "Fanie Test Company", settings: { create: { themeColor: "#222222" } }, entitlements: { create: [
      { module: "QUOTES", source: "MODULE", status: "SUSPENDED", effectiveFrom: new Date("2026-01-01") },
      { module: "DASHBOARD", source: "MODULE", status: "ACTIVE", effectiveFrom: new Date("2026-01-01"), expiresAt: new Date("2027-01-01") },
    ] } }, include: { settings: true } }),
    database.company.create({ data: { internalCode: BLACK_ROCK_INTERNAL_CODE, legalName: "Black Rock Equipment Test", tradingName: "Black Rock Equipment", settings: { create: {} } }, include: { settings: true } }),
  ]);
  Object.assign(fixture, { companyA: a.id, companyB: b.id, blackRock: blackRock.id, settingsA: a.settings!.id, settingsB: b.settings!.id });

  const [userA, userB, blackRockUser, operator] = await Promise.all([
    database.userIdentity.create({ data: { email: `a-${suffix}@example.test`, displayName: "Tenant A Admin", passwordHash: "test-only" } }),
    database.userIdentity.create({ data: { email: `b-${suffix}@example.test`, displayName: "Tenant B Admin", passwordHash: "test-only" } }),
    database.userIdentity.create({ data: { email: `black-${suffix}@example.test`, displayName: "Black Rock User", passwordHash: "test-only" } }),
    database.userIdentity.create({ data: { email: `platform-${suffix}@example.test`, displayName: "Platform Operator", passwordHash: "test-only", platformAssignments: { create: { role: "PLATFORM_ADMIN" } } } }),
  ]);
  Object.assign(fixture, { userA: userA.id, userB: userB.id, blackRockUser: blackRockUser.id, operator: operator.id });

  const [membershipA, membershipB, blackMembership] = await Promise.all([
    database.companyMembership.create({ data: { userId: userA.id, companyId: a.id, role: "COMPANY_ADMIN" } }),
    database.companyMembership.create({ data: { userId: userB.id, companyId: b.id, role: "COMPANY_ADMIN" } }),
    database.companyMembership.create({ data: { userId: blackRockUser.id, companyId: blackRock.id, role: "USER" } }),
  ]);
  Object.assign(fixture, { membershipA: membershipA.id, membershipB: membershipB.id, blackRockMembership: blackMembership.id });

  const [auditA, auditB] = await Promise.all([
    database.auditEvent.create({ data: { companyId: a.id, actorId: userA.id, source: "UI", module: "TEST", entityType: "Fixture", action: "TENANT_A_EVENT", correlationId: suffix } }),
    database.auditEvent.create({ data: { companyId: b.id, actorId: userB.id, source: "UI", module: "TEST", entityType: "Fixture", action: "TENANT_B_SECRET_EVENT", correlationId: suffix } }),
  ]);
  Object.assign(fixture, { auditA: auditA.id, auditB: auditB.id });
});

afterAll(async () => {
  await database.loginThrottle.deleteMany({});
  await database.auditEvent.deleteMany({ where: { OR: [{ companyId: { in: [fixture.companyA, fixture.companyB, fixture.blackRock] } }, { correlationId: { contains: suffix } }] } });
  await database.company.deleteMany({ where: { id: { in: [fixture.companyA, fixture.companyB, fixture.blackRock] } } });
  await database.userIdentity.deleteMany({ where: { id: { in: [fixture.userA, fixture.userB, fixture.blackRockUser, fixture.operator] } } });
  await database.$disconnect();
});

beforeEach(async () => {
  await database.userSession.deleteMany({ where: { userId: { in: [fixture.userA, fixture.userB, fixture.blackRockUser, fixture.operator] } } });
  await database.platformSupportAccess.deleteMany({ where: { operatorId: fixture.operator } });
});

describe("tenant isolation", () => {
  it("returns only the authenticated company and settings", async () => {
    const context = tenantContext(fixture.companyA, fixture.userA);
    expect((await getOwnCompany(context, database))?.id).toBe(fixture.companyA);
    expect((await getOwnCompanySettings(context, database))?.id).toBe(fixture.settingsA);
  });

  it("does not disclose a Tenant B membership or audit ID to Tenant A", async () => {
    const context = tenantContext(fixture.companyA, fixture.userA);
    expect(await getTenantMembership(context, fixture.membershipB, database)).toBeNull();
    expect(await getTenantAuditEvent(context, fixture.auditB, database)).toBeNull();
  });

  it("rejects a Tenant B child mutation without revealing whether it exists", async () => {
    const context = tenantContext(fixture.companyA, fixture.userA);
    await expect(updateOwnCompanySettings(context, fixture.settingsB, { themeColor: "#ff0000" }, database)).rejects.toThrow("RESOURCE_NOT_FOUND");
    expect((await database.companySettings.findUnique({ where: { id: fixture.settingsB } }))?.themeColor).toBe("#222222");
  });

  it("reads only the authenticated tenant entitlement", async () => {
    const a = await getTenantEntitlement(tenantContext(fixture.companyA, fixture.userA), "QUOTES", database);
    const b = await getTenantEntitlement(tenantContext(fixture.companyB, fixture.userB), "QUOTES", database);
    expect(a?.status).toBe("ACTIVE");
    expect(b?.status).toBe("SUSPENDED");
  });
});

describe("explicit platform support context", () => {
  it("rejects a normal tenant user and tenant administrator entering another tenant", async () => {
    await expect(startSupportAccess(tenantContext(fixture.companyA, fixture.userA), { companyId: fixture.companyB, mode: "READ_ONLY", reason: "Unauthorized cross tenant attempt", expiresAt: new Date(Date.now() + 60_000) }, database)).rejects.toThrow(AuthorizationError);
  });

  it("does not grant tenant scope from platform authority alone", async () => {
    await expect(getOwnCompany(platformContext(fixture.operator), database)).rejects.toThrow(AuthorizationError);
  });

  it("requires explicit unexpired support access and blocks writes in read-only mode", async () => {
    const base = platformContext(fixture.operator);
    const support = await startSupportAccess(base, { companyId: fixture.companyB, mode: "READ_ONLY", reason: "Investigating tenant display issue", expiresAt: new Date(Date.now() + 60_000) }, database);
    const token = `support-read-${suffix}`;
    await addSession({ token, userId: fixture.operator, supportAccessId: support.id });
    const resolved = await resolveSessionToken(token, database);
    expect(resolved?.companyId).toBe(fixture.companyB);
    expect(() => requireTenantPermission(resolved!, "CUSTOMERS_VIEW")).not.toThrow();
    expect(() => requireTenantPermission(resolved!, "SETTINGS_MANAGE")).toThrow(AuthorizationError);
  });

  it("allows authorized writes in read-write mode and preserves operator/support identity in audit", async () => {
    const support = await startSupportAccess(platformContext(fixture.operator), { companyId: fixture.companyB, mode: "READ_WRITE", reason: "Authorized settings correction test", expiresAt: new Date(Date.now() + 60_000) }, database);
    const token = `support-write-${suffix}`;
    await addSession({ token, userId: fixture.operator, supportAccessId: support.id });
    const resolved = (await resolveSessionToken(token, database))!;
    await createTenantAuditEvent(resolved, "AUTHORIZED_SUPPORT_MUTATION", database);
    const audit = await database.auditEvent.findFirstOrThrow({ where: { action: "AUTHORIZED_SUPPORT_MUTATION", supportAccessId: support.id } });
    expect(audit.actorId).toBe(fixture.operator);
    expect(audit.companyId).toBe(fixture.companyB);
  });

  it("rejects expired support context and audits entry plus exit", async () => {
    const base = platformContext(fixture.operator);
    const support = await startSupportAccess(base, { companyId: fixture.companyA, mode: "READ_ONLY", reason: "Short lived support verification", expiresAt: new Date(Date.now() - 1) }, database);
    const token = `expired-${suffix}`;
    await addSession({ token, userId: fixture.operator, supportAccessId: support.id });
    expect(await resolveSessionToken(token, database)).toBeNull();

    const active = await startSupportAccess(base, { companyId: fixture.companyA, mode: "READ_ONLY", reason: "Entry and exit audit verification", expiresAt: new Date(Date.now() + 60_000) }, database);
    const supportContext = { ...base, companyId: fixture.companyA, companyInternalCode: `TENANT_A_${suffix}`, supportAccessId: active.id, supportMode: "READ_ONLY" as const };
    await endSupportAccess(supportContext, database);
    const actions = await database.auditEvent.findMany({ where: { supportAccessId: active.id }, select: { action: true, actorId: true } });
    expect(actions.map((row) => row.action).sort()).toEqual(["SUPPORT_CONTEXT_ENDED", "SUPPORT_CONTEXT_STARTED"]);
    expect(actions.every((row) => row.actorId === fixture.operator)).toBe(true);
  });
});

describe("Black Rock protected entitlement", () => {
  it("grants all modules without subscription rows and survives display-name changes", async () => {
    expect(await database.companyModuleEntitlement.count({ where: { companyId: fixture.blackRock } })).toBe(0);
    for (const moduleKey of Object.values(ModuleKey)) {
      expect(evaluateModuleAccess({ companyInternalCode: BLACK_ROCK_INTERNAL_CODE, companyActive: true, module: moduleKey }, new Date())).toBe("FULL");
    }
    await database.company.update({ where: { id: fixture.blackRock }, data: { tradingName: "Renamed Internal Tenant" } });
    const company = await database.company.findUniqueOrThrow({ where: { id: fixture.blackRock } });
    expect(evaluateModuleAccess({ companyInternalCode: company.internalCode, companyActive: true, module: "INVOICES" })).toBe("FULL");
  });

  it("does not bypass user permission or tenant isolation", async () => {
    const token = `black-${suffix}`;
    await addSession({ token, userId: fixture.blackRockUser, membershipId: fixture.blackRockMembership });
    const context = (await resolveSessionToken(token, database))!;
    expect(context.moduleAccess.get("INVOICES")).toBe("FULL");
    expect(() => requireTenantPermission(context, "INVOICES_ISSUE")).toThrow(AuthorizationError);
    expect(await getTenantAuditEvent({ ...context, tenantPermissions: new Set([...context.tenantPermissions, "AUDIT_VIEW"]) }, fixture.auditB, database)).toBeNull();
  });

  it("does not grant free access from another tenant's display name", async () => {
    await database.company.update({ where: { id: fixture.companyA }, data: { tradingName: "Black Rock Equipment" } });
    const company = await database.company.findUniqueOrThrow({ where: { id: fixture.companyA } });
    expect(evaluateModuleAccess({ companyInternalCode: company.internalCode, companyActive: true, module: "INVOICES" })).toBe("DENIED");
  });

  it("rejects changes to the protected internal tenant identifier", async () => {
    await expect(database.company.update({ where: { id: fixture.blackRock }, data: { internalCode: `CHANGED_${suffix}` } })).rejects.toThrow("Company internalCode is immutable");
    expect((await database.company.findUniqueOrThrow({ where: { id: fixture.blackRock } })).internalCode).toBe(BLACK_ROCK_INTERNAL_CODE);
  });
});

describe("external licensing", () => {
  it("keeps resolved navigation state and backend module guards aligned", async () => {
    const token = `external-${suffix}`;
    await addSession({ token, userId: fixture.userA, membershipId: fixture.membershipA });
    const context = (await resolveSessionToken(token, database, new Date("2026-08-26")))!;
    expect(context.moduleAccess.get("QUOTES")).toBe("FULL");
    expect(() => requireModule(context, "QUOTES", "WRITE")).not.toThrow();
    expect(context.moduleAccess.get("INVOICES")).toBe("DENIED");
    expect(() => requireModule(context, "INVOICES", "READ")).toThrow(AuthorizationError);
  });

  it("enforces full, grace read-only, grace expiry and suspension", () => {
    const base = { companyInternalCode: "EXTERNAL", companyActive: true, module: "QUOTES" as const, effectiveFrom: new Date("2026-01-01") };
    expect(evaluateModuleAccess({ ...base, status: "ACTIVE", expiresAt: new Date("2027-01-01") }, new Date("2026-08-26"))).toBe("FULL");
    expect(evaluateModuleAccess({ ...base, status: "ACTIVE", expiresAt: new Date("2026-08-10"), gracePeriodDays: 30 }, new Date("2026-08-26"))).toBe("READ_ONLY");
    expect(evaluateModuleAccess({ ...base, status: "ACTIVE", expiresAt: new Date("2026-06-01"), gracePeriodDays: 30 }, new Date("2026-08-26"))).toBe("DENIED");
    expect(evaluateModuleAccess({ ...base, status: "SUSPENDED" }, new Date("2026-08-26"))).toBe("DENIED");
  });

  it("allows reads/exports but rejects manipulated write requests in grace", () => {
    const context = tenantContext(fixture.companyA, fixture.userA);
    const graceContext = { ...context, moduleAccess: new Map(context.moduleAccess).set("QUOTES", "READ_ONLY" as const) };
    expect(() => requireModule(graceContext, "QUOTES", "READ")).not.toThrow();
    expect(() => requireModule(graceContext, "QUOTES", "WRITE")).toThrow(AuthorizationError);
  });
});

describe("session and security invalidation", () => {
  it("invalidates sessions after user deactivation, version change, membership suspension and company suspension", async () => {
    const make = async (token: string) => { await addSession({ token, userId: fixture.userA, membershipId: fixture.membershipA }); return resolveSessionToken(token, database); };
    expect(await make(`active-${suffix}`)).not.toBeNull();
    await database.userIdentity.update({ where: { id: fixture.userA }, data: { active: false } });
    expect(await resolveSessionToken(`active-${suffix}`, database)).toBeNull();
    await database.userIdentity.update({ where: { id: fixture.userA }, data: { active: true, sessionVersion: { increment: 1 } } });
    const versionToken = `version-${suffix}`; await addSession({ token: versionToken, userId: fixture.userA, membershipId: fixture.membershipA, version: 1 });
    expect(await resolveSessionToken(versionToken, database)).toBeNull();
    const currentUser = await database.userIdentity.findUniqueOrThrow({ where: { id: fixture.userA } });
    const membershipToken = `membership-${suffix}`; await addSession({ token: membershipToken, userId: fixture.userA, membershipId: fixture.membershipA, version: currentUser.sessionVersion });
    await database.companyMembership.update({ where: { id: fixture.membershipA }, data: { status: "SUSPENDED" } });
    expect(await resolveSessionToken(membershipToken, database)).toBeNull();
    await database.companyMembership.update({ where: { id: fixture.membershipA }, data: { status: "ACTIVE" } });
    const companyToken = `company-${suffix}`; await addSession({ token: companyToken, userId: fixture.userA, membershipId: fixture.membershipA, version: currentUser.sessionVersion });
    await database.company.update({ where: { id: fixture.companyA }, data: { status: "SUSPENDED" } });
    expect(await resolveSessionToken(companyToken, database)).toBeNull();
    await database.company.update({ where: { id: fixture.companyA }, data: { status: "ACTIVE" } });
  });

  it("applies permission changes on the next request", async () => {
    const currentUser = await database.userIdentity.findUniqueOrThrow({ where: { id: fixture.userA } });
    const token = `permission-${suffix}`;
    await addSession({ token, userId: fixture.userA, membershipId: fixture.membershipA, version: currentUser.sessionVersion });
    expect((await resolveSessionToken(token, database))?.tenantPermissions.has("JOBS_EDIT")).toBe(true);
    await database.membershipPermission.upsert({ where: { membershipId_permission: { membershipId: fixture.membershipA, permission: "JOBS_EDIT" } }, create: { membershipId: fixture.membershipA, permission: "JOBS_EDIT", allowed: false }, update: { allowed: false } });
    expect((await resolveSessionToken(token, database))?.tenantPermissions.has("JOBS_EDIT")).toBe(false);
    await database.membershipPermission.deleteMany({ where: { membershipId: fixture.membershipA, permission: "JOBS_EDIT" } });
    await database.companyMembership.update({ where: { id: fixture.membershipA }, data: { role: "USER" } });
    expect((await resolveSessionToken(token, database))?.tenantPermissions.has("JOBS_CREATE")).toBe(false);
    await database.companyMembership.update({ where: { id: fixture.membershipA }, data: { role: "COMPANY_ADMIN" } });
  });

  it("locks after repeated login failures and clears after reset", async () => {
    const email = `throttle-${suffix}@example.test`; const ip = "127.0.0.45"; const now = new Date("2026-08-26T10:00:00Z");
    for (let attempt = 0; attempt < 5; attempt++) await recordLoginFailure(email, ip, now, database);
    expect(await isLoginBlocked(email, ip, new Date("2026-08-26T10:01:00Z"), database)).toBe(true);
    await clearLoginFailures(email, ip, database);
    expect(await isLoginBlocked(email, ip, new Date("2026-08-26T10:01:00Z"), database)).toBe(false);
  });
});
