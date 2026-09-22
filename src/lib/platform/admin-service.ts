import { EntitlementSource, EntitlementStatus, ModuleKey, PlatformRole, Prisma, Product, TenantStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { RequestContext } from "@/lib/auth/context-types";
import { requirePlatformPermission } from "@/lib/auth/guards";
import { BLACK_ROCK_INTERNAL_CODE, MODULE_LABELS } from "@/lib/constants";
import { DEFAULT_PLATFORM_PERMISSIONS, mergePermissionOverrides, type PlatformPermission } from "@/lib/auth/permissions";

type CompanyListQuery = {
  q?: string;
  status?: string;
};

type CompanySettingsInput = {
  themeColor?: string;
  mainTelephone?: string;
  mainEmail?: string;
  website?: string;
  registrationNumber?: string;
  vatNumber?: string;
  quoteValidityDays?: number;
  defaultTaxJurisdiction?: string;
  documentHeaderText?: string;
  documentFooterText?: string;
};

type CompanyInput = {
  internalCode: string;
  legalName: string;
  tradingName?: string;
  defaultCurrencyCode?: string;
  defaultGracePeriodDays?: number;
  settings?: CompanySettingsInput;
};

type CompanyUpdateInput = Omit<CompanyInput, "internalCode">;

type EntitlementInput = {
  // Optional, defaults to WORKSHOP below — every module built so far is a
  // WORKSHOP module. Callers won't need to pass this until the Sports
  // League product track adds its own module keys and an admin UI for them.
  product?: Product;
  module: ModuleKey;
  status: EntitlementStatus;
  source: EntitlementSource;
  effectiveFrom: string;
  expiresAt?: string;
  gracePeriodDays?: string;
  readOnlyOverrideUntil?: string;
  reason?: string;
};

type PlatformUserQuery = { q?: string };

type PlatformAuthorityCreateInput = { email: string; role: PlatformRole };
type PlatformAuthorityUpdateInput = { assignmentId: string; role: PlatformRole; active: boolean };

function requirePlatformCompaniesView(ctx: RequestContext) {
  if (ctx.companyId) throw new Error("PLATFORM_CONTEXT_REQUIRED");
  requirePlatformPermission(ctx, "PLATFORM_COMPANIES_VIEW");
}

function summarizeEntitlements(rows: Array<{ module: ModuleKey; status: string }>) {
  if (rows.length === 0) return "Black Rock full access or no entitlement rows";
  return rows
    .sort((a, b) => MODULE_LABELS[a.module].localeCompare(MODULE_LABELS[b.module]))
    .map((row) => `${MODULE_LABELS[row.module]}: ${row.status.replaceAll("_", " ")}`)
    .join(" · ");
}

function asNullable(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function asDate(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) throw new Error("INVALID_DATE");
  return date;
}

function normalizeCompanyInput(input: CompanyInput | CompanyUpdateInput) {
  return {
    legalName: input.legalName.trim(),
    tradingName: asNullable(input.tradingName),
    defaultCurrencyCode: (input.defaultCurrencyCode?.trim() || "ZAR").toUpperCase(),
    defaultGracePeriodDays: Math.max(0, Number.isFinite(input.defaultGracePeriodDays) ? Math.floor(input.defaultGracePeriodDays as number) : 30),
    settings: {
      themeColor: asNullable(input.settings?.themeColor),
      mainTelephone: asNullable(input.settings?.mainTelephone),
      mainEmail: asNullable(input.settings?.mainEmail),
      website: asNullable(input.settings?.website),
      registrationNumber: asNullable(input.settings?.registrationNumber),
      vatNumber: asNullable(input.settings?.vatNumber),
      quoteValidityDays: Math.max(0, Number.isFinite(input.settings?.quoteValidityDays) ? Math.floor(input.settings!.quoteValidityDays!) : 30),
      defaultTaxJurisdiction: (input.settings?.defaultTaxJurisdiction?.trim() || "ZA").toUpperCase(),
      documentHeaderText: asNullable(input.settings?.documentHeaderText),
      documentFooterText: asNullable(input.settings?.documentFooterText),
    },
  };
}

async function revokeCompanySessions(companyId: string, tx: Prisma.TransactionClient) {
  const supportIds = await tx.platformSupportAccess.findMany({ where: { companyId, endedAt: null }, select: { id: true } });
  await tx.userSession.updateMany({ where: { OR: [{ membership: { companyId } }, { supportAccessId: { in: supportIds.map((row) => row.id) } }] }, data: { revokedAt: new Date() } });
  await tx.platformSupportAccess.updateMany({ where: { companyId, endedAt: null }, data: { endedAt: new Date() } });
}

function assertMutableCompany(code: string) {
  if (code === BLACK_ROCK_INTERNAL_CODE) throw new Error("BLACK_ROCK_PROTECTED");
}

function effectivePlatformPermissions(role: PlatformRole, rows: ReadonlyArray<{ permission: string; allowed: boolean }>) {
  return Array.from(mergePermissionOverrides<PlatformPermission>(DEFAULT_PLATFORM_PERMISSIONS[role], rows)).sort();
}

async function revokeUserSessions(userId: string, tx: Prisma.TransactionClient) {
  await tx.userIdentity.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
  await tx.userSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  const activeSupport = await tx.platformSupportAccess.findMany({ where: { operatorId: userId, endedAt: null }, select: { id: true } });
  if (activeSupport.length > 0) {
    await tx.platformSupportAccess.updateMany({ where: { id: { in: activeSupport.map((row) => row.id) } }, data: { endedAt: new Date() } });
  }
}

async function assertNotRemovingLastPlatformAdmin(tx: Prisma.TransactionClient, input: { assignmentId: string; nextRole: PlatformRole; nextActive: boolean }) {
  await tx.$queryRaw`SELECT id FROM "PlatformRoleAssignment" WHERE role = 'PLATFORM_ADMIN' AND active = true FOR UPDATE`;
  const activeAdmins = await tx.platformRoleAssignment.findMany({ where: { role: "PLATFORM_ADMIN", active: true }, select: { id: true } });
  const targetIsUsableAdmin = activeAdmins.some((row) => row.id === input.assignmentId);
  if (!targetIsUsableAdmin) return;
  const remainsUsableAdmin = input.nextRole === "PLATFORM_ADMIN" && input.nextActive === true;
  if (remainsUsableAdmin) return;
  if (activeAdmins.length <= 1) throw new Error("LAST_PLATFORM_ADMIN_REQUIRED");
}

export async function listPlatformCompanies(ctx: RequestContext, query: CompanyListQuery) {
  requirePlatformCompaniesView(ctx);
  const q = (query.q ?? "").trim();
  const status = query.status === "ACTIVE" || query.status === "SUSPENDED" ? query.status : "ALL";
  const contains = { contains: q, mode: "insensitive" as const };
  const where: Prisma.CompanyWhereInput = {
    ...(status !== "ALL" ? { status } : {}),
    ...(q ? {
      OR: [
        { legalName: contains },
        { tradingName: contains },
        { internalCode: contains },
      ],
    } : {}),
  };
  const companies = await prisma.company.findMany({
    where,
    orderBy: [{ legalName: "asc" }],
    select: {
      id: true,
      internalCode: true,
      legalName: true,
      tradingName: true,
      status: true,
      createdAt: true,
      defaultCurrencyCode: true,
      settings: { select: { themeColor: true, accentColor: true, secondaryColor: true, logoMimeType: true } },
      _count: { select: { memberships: true, entitlements: true, supportTickets: true } },
      entitlements: { select: { module: true, status: true } },
    },
  });
  return companies.map((company) => ({
    ...company,
    entitlementSummary: summarizeEntitlements(company.entitlements),
    blackRockIncluded: company.internalCode === BLACK_ROCK_INTERNAL_CODE,
    enabledModuleCount: company.entitlements.filter((row) => row.status === "ACTIVE" || row.status === "GRACE_READ_ONLY").length,
  }));
}

export async function getPlatformCompanyDetail(ctx: RequestContext, companyId: string) {
  requirePlatformCompaniesView(ctx);
  const company = await prisma.company.findFirst({
    where: { id: companyId },
    select: {
      id: true,
      internalCode: true,
      legalName: true,
      tradingName: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      defaultCurrencyCode: true,
      defaultGracePeriodDays: true,
      settings: {
        select: {
          themeColor: true,
          accentColor: true,
          secondaryColor: true,
          logoMimeType: true,
          registrationNumber: true,
          vatNumber: true,
          mainTelephone: true,
          mainEmail: true,
          website: true,
          quoteValidityDays: true,
          defaultCurrencyCode: true,
          defaultTaxJurisdiction: true,
          documentHeaderText: true,
          documentFooterText: true,
          // Storage location (Super Admin setting) — never select
          // storageSecretAccessKey here, same write-only convention as
          // smtpPassword.
          storageProvider: true,
          storageBucket: true,
          storageRegion: true,
          storageEndpoint: true,
          storageAccessKeyId: true,
          storageConfiguredAt: true,
        },
      },
      entitlements: {
        orderBy: [{ module: "asc" }],
        select: {
          module: true,
          status: true,
          source: true,
          effectiveFrom: true,
          expiresAt: true,
          gracePeriodDays: true,
          readOnlyOverrideUntil: true,
        },
      },
      memberships: { include: { user: { select: { email: true, displayName: true, active: true } }, permissions: true }, orderBy: [{ role: "asc" }, { createdAt: "asc" }] },
      supportTickets: { orderBy: { updatedAt: "desc" }, take: 12, select: { id: true, ticketNumber: true, subject: true, priority: true, status: true, updatedAt: true, reportedBy: { select: { displayName: true } } } },
      auditEvents: { where: { source: "PLATFORM" }, orderBy: { occurredAt: "desc" }, take: 15, select: { id: true, action: true, entityType: true, occurredAt: true, actor: { select: { displayName: true } } } },
      _count: { select: { memberships: true, jobs: true, customers: true, suppliers: true, supportTickets: true } },
    },
  });
  if (!company) throw new Error("RESOURCE_NOT_FOUND");
  return {
    ...company,
    entitlementSummary: summarizeEntitlements(company.entitlements),
    blackRockIncluded: company.internalCode === BLACK_ROCK_INTERNAL_CODE,
  };
}

export async function createPlatformCompany(ctx: RequestContext, input: CompanyInput) {
  requirePlatformPermission(ctx, "PLATFORM_COMPANIES_CREATE");
  if (ctx.companyId) throw new Error("PLATFORM_CONTEXT_REQUIRED");
  const internalCode = input.internalCode.trim().toUpperCase();
  if (!internalCode) throw new Error("INTERNAL_CODE_REQUIRED");
  if (!input.legalName.trim()) throw new Error("LEGAL_NAME_REQUIRED");
  const normalized = normalizeCompanyInput(input);
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        internalCode,
        legalName: normalized.legalName,
        tradingName: normalized.tradingName,
        defaultCurrencyCode: normalized.defaultCurrencyCode,
        defaultGracePeriodDays: normalized.defaultGracePeriodDays,
        settings: { create: normalized.settings },
      },
    }).catch((error: unknown) => {
      if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") throw new Error("DUPLICATE_INTERNAL_CODE");
      throw error;
    });
    await tx.auditEvent.create({
      data: {
        companyId: company.id,
        actorId: ctx.userId,
        source: "PLATFORM",
        module: "PLATFORM",
        entityType: "Company",
        entityId: company.id,
        action: "PLATFORM_COMPANY_CREATED",
        correlationId: ctx.correlationId,
        afterData: { internalCode, legalName: normalized.legalName, tradingName: normalized.tradingName },
      },
    });
    return company;
  });
}

export async function updatePlatformCompany(ctx: RequestContext, companyId: string, input: CompanyUpdateInput & { internalCode?: never }) {
  requirePlatformPermission(ctx, "PLATFORM_COMPANIES_EDIT");
  if (ctx.companyId) throw new Error("PLATFORM_CONTEXT_REQUIRED");
  const normalized = normalizeCompanyInput(input);
  return prisma.$transaction(async (tx) => {
    const before = await tx.company.findUnique({ where: { id: companyId }, include: { settings: true } });
    if (!before) throw new Error("RESOURCE_NOT_FOUND");
    assertMutableCompany(before.internalCode);
    const company = await tx.company.update({
      where: { id: companyId },
      data: {
        legalName: normalized.legalName,
        tradingName: normalized.tradingName,
        defaultCurrencyCode: normalized.defaultCurrencyCode,
        defaultGracePeriodDays: normalized.defaultGracePeriodDays,
        settings: {
          upsert: {
            create: normalized.settings,
            update: normalized.settings,
          },
        },
      },
      include: { settings: true },
    });
    await tx.auditEvent.create({
      data: {
        companyId,
        actorId: ctx.userId,
        source: "PLATFORM",
        module: "PLATFORM",
        entityType: "Company",
        entityId: companyId,
        action: "PLATFORM_COMPANY_UPDATED",
        correlationId: ctx.correlationId,
        beforeData: JSON.parse(JSON.stringify(before)) as Prisma.InputJsonValue,
        afterData: JSON.parse(JSON.stringify(company)) as Prisma.InputJsonValue,
      },
    });
    return company;
  });
}

type CompanyStorageProfileInput = {
  // "" clears the override so this company falls back to the platform
  // default bucket (see src/lib/storage/index.ts's resolution order).
  provider: "" | "R2" | "B2" | "S3_COMPATIBLE";
  bucket?: string;
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  // Write-only, same convention as CompanySettings.smtpPassword — blank
  // means "leave the stored secret unchanged", never returned to any
  // client.
  secretAccessKey?: string;
};

// Super Admin-only setting — see claude/decision-storage-architecture-render-plus-object-storage.md.
// Deliberately lives in admin-service.ts (platform-permission-gated), not
// company-settings-service.ts (tenant-permission-gated): a company's own
// Company Admin can edit their branding/SMTP but must not be able to
// redirect where their files are stored.
export async function updatePlatformCompanyStorageProfile(ctx: RequestContext, companyId: string, input: CompanyStorageProfileInput) {
  requirePlatformPermission(ctx, "PLATFORM_CONFIGURATION_MANAGE");
  if (ctx.companyId) throw new Error("PLATFORM_CONTEXT_REQUIRED");
  return prisma.$transaction(async (tx) => {
    const before = await tx.company.findUnique({ where: { id: companyId }, include: { settings: true } });
    if (!before) throw new Error("RESOURCE_NOT_FOUND");
    const clearingOverride = input.provider === "";
    if (!clearingOverride) {
      if (!input.bucket?.trim()) throw new Error("STORAGE_BUCKET_REQUIRED");
      if (!input.accessKeyId?.trim()) throw new Error("STORAGE_ACCESS_KEY_REQUIRED");
      const willHaveSecret = !!(input.secretAccessKey?.trim() || before.settings?.storageSecretAccessKey);
      if (!willHaveSecret) throw new Error("STORAGE_SECRET_KEY_REQUIRED");
    }
    const settings = await tx.companySettings.update({
      where: { companyId },
      data: clearingOverride
        ? { storageProvider: null, storageBucket: null, storageRegion: null, storageEndpoint: null, storageAccessKeyId: null, storageSecretAccessKey: null, storageConfiguredAt: null }
        : {
            // Safe: clearingOverride is false here, so input.provider (validated
            // above alongside bucket/accessKeyId) is never "" in this branch —
            // TS just can't correlate that across the two separate consts.
            storageProvider: input.provider as "R2" | "B2" | "S3_COMPATIBLE",
            storageBucket: input.bucket!.trim(),
            storageRegion: asNullable(input.region) ?? "auto",
            storageEndpoint: asNullable(input.endpoint),
            storageAccessKeyId: input.accessKeyId!.trim(),
            ...(input.secretAccessKey?.trim() ? { storageSecretAccessKey: input.secretAccessKey.trim() } : {}),
            storageConfiguredAt: new Date(),
          },
    });
    await tx.auditEvent.create({
      data: {
        companyId,
        actorId: ctx.userId,
        source: "PLATFORM",
        module: "PLATFORM",
        entityType: "CompanySettings",
        entityId: settings.id,
        action: "PLATFORM_COMPANY_STORAGE_PROFILE_UPDATED",
        correlationId: ctx.correlationId,
        beforeData: JSON.parse(JSON.stringify({ ...before.settings, storageSecretAccessKey: undefined })) as Prisma.InputJsonValue,
        afterData: JSON.parse(JSON.stringify({ ...settings, storageSecretAccessKey: undefined })) as Prisma.InputJsonValue,
      },
    });
    return { ...settings, storageSecretAccessKey: undefined };
  });
}

export async function setPlatformCompanyStatus(ctx: RequestContext, companyId: string, status: TenantStatus) {
  requirePlatformPermission(ctx, "PLATFORM_COMPANIES_SUSPEND");
  if (ctx.companyId) throw new Error("PLATFORM_CONTEXT_REQUIRED");
  if (status !== "ACTIVE" && status !== "SUSPENDED") throw new Error("INVALID_STATUS");
  return prisma.$transaction(async (tx) => {
    const before = await tx.company.findUnique({ where: { id: companyId }, select: { id: true, internalCode: true, status: true } });
    if (!before) throw new Error("RESOURCE_NOT_FOUND");
    assertMutableCompany(before.internalCode);
    if (before.status === status) return before;
    const company = await tx.company.update({ where: { id: companyId }, data: { status } });
    if (status === "SUSPENDED") await revokeCompanySessions(companyId, tx);
    await tx.auditEvent.create({
      data: {
        companyId,
        actorId: ctx.userId,
        source: "PLATFORM",
        module: "PLATFORM",
        entityType: "Company",
        entityId: companyId,
        action: status === "SUSPENDED" ? "PLATFORM_COMPANY_SUSPENDED" : "PLATFORM_COMPANY_REACTIVATED",
        correlationId: ctx.correlationId,
        beforeData: { status: before.status },
        afterData: { status },
      },
    });
    return company;
  });
}

export async function updatePlatformEntitlement(ctx: RequestContext, companyId: string, input: EntitlementInput) {
  requirePlatformPermission(ctx, "PLATFORM_ENTITLEMENTS_MANAGE");
  if (ctx.companyId) throw new Error("PLATFORM_CONTEXT_REQUIRED");
  const effectiveFrom = asDate(input.effectiveFrom);
  if (!effectiveFrom) throw new Error("EFFECTIVE_FROM_REQUIRED");
  const expiresAt = asDate(input.expiresAt);
  const readOnlyOverrideUntil = asDate(input.readOnlyOverrideUntil);
  const gracePeriodDays = input.gracePeriodDays?.trim() ? Math.max(0, Number.parseInt(input.gracePeriodDays, 10)) : null;
  const product = input.product ?? "WORKSHOP";
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.findUnique({ where: { id: companyId }, select: { id: true, internalCode: true } });
    if (!company) throw new Error("RESOURCE_NOT_FOUND");
    if (company.internalCode === BLACK_ROCK_INTERNAL_CODE && input.source !== "INTERNAL_FREE") throw new Error("BLACK_ROCK_ENTITLEMENT_PROTECTED");
    const before = await tx.companyModuleEntitlement.findUnique({ where: { companyId_product_module: { companyId, product, module: input.module } } });
    const entitlement = await tx.companyModuleEntitlement.upsert({
      where: { companyId_product_module: { companyId, product, module: input.module } },
      create: {
        companyId,
        product,
        module: input.module,
        status: input.status,
        source: input.source,
        effectiveFrom,
        expiresAt,
        gracePeriodDays,
        readOnlyOverrideUntil,
      },
      update: {
        status: input.status,
        source: input.source,
        effectiveFrom,
        expiresAt,
        gracePeriodDays,
        readOnlyOverrideUntil,
      },
    });
    await tx.entitlementHistory.create({
      data: {
        companyId,
        product,
        module: input.module,
        previousStatus: before?.status ?? null,
        newStatus: input.status,
        source: input.source,
        effectiveAt: effectiveFrom,
        expiresAt,
        reason: asNullable(input.reason) ?? undefined,
        changedById: ctx.userId,
      },
    });
    await tx.auditEvent.create({
      data: {
        companyId,
        actorId: ctx.userId,
        source: "PLATFORM",
        module: "PLATFORM",
        entityType: "CompanyModuleEntitlement",
        entityId: entitlement.id,
        action: "PLATFORM_ENTITLEMENT_UPDATED",
        correlationId: ctx.correlationId,
        ...(before ? { beforeData: JSON.parse(JSON.stringify(before)) as Prisma.InputJsonValue } : {}),
        afterData: JSON.parse(JSON.stringify(entitlement)) as Prisma.InputJsonValue,
        reason: asNullable(input.reason) ?? undefined,
      },
    });
    return entitlement;
  });
}

export async function listPlatformUsers(ctx: RequestContext, query: PlatformUserQuery) {
  requirePlatformPermission(ctx, "PLATFORM_OPERATORS_MANAGE");
  if (ctx.companyId) throw new Error("PLATFORM_CONTEXT_REQUIRED");
  const q = (query.q ?? "").trim();
  const contains = { contains: q, mode: "insensitive" as const };
  const users = await prisma.userIdentity.findMany({
    where: q ? { OR: [{ displayName: contains }, { email: contains }] } : undefined,
    orderBy: [{ displayName: "asc" }],
    select: {
      id: true,
      displayName: true,
      email: true,
      active: true,
      createdAt: true,
      platformAssignments: {
        orderBy: [{ createdAt: "asc" }],
        select: { id: true, role: true, active: true, createdAt: true, permissions: { select: { permission: true, allowed: true } } },
      },
      // 2026-09-22, user request: "make sure no organization admin, user etc
      // can be a platform administrator." Surfaced here (not just enforced
      // on grant/reactivate in grantPlatformAuthority/updatePlatformAuthority
      // below) so the Platform Users table can show/disable the option
      // up front instead of only failing after the admin tries it.
      memberships: { where: { status: "ACTIVE" }, select: { id: true }, take: 1 },
    },
  });
  return users.map((user) => {
    const roles = user.platformAssignments.map((assignment) => ({
      assignmentId: assignment.id,
      role: assignment.role,
      active: assignment.active,
      createdAt: assignment.createdAt,
      effectivePermissions: effectivePlatformPermissions(assignment.role, assignment.permissions),
    }));
    const aggregate = new Set<PlatformPermission>();
    for (const role of roles) {
      if (!role.active) continue;
      for (const permission of role.effectivePermissions) aggregate.add(permission);
    }
    const { memberships, ...rest } = user;
    return {
      ...rest,
      roles,
      effectivePermissions: Array.from(aggregate).sort(),
      hasActiveCompanyMembership: memberships.length > 0,
    };
  });
}

export async function getPlatformOverview(ctx: RequestContext) {
  requirePlatformCompaniesView(ctx);
  const [companies, activeCompanies, users, openTickets, highPriority, activeSupportSessions, recentActivity, entitlementRows] = await Promise.all([
    prisma.company.count(),
    prisma.company.count({ where: { status: "ACTIVE" } }),
    prisma.userIdentity.count(),
    prisma.supportTicket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER"] } } }),
    prisma.supportTicket.count({ where: { priority: { in: ["HIGH", "CRITICAL"] }, status: { notIn: ["RESOLVED", "CLOSED"] } } }),
    prisma.platformSupportAccess.count({ where: { endedAt: null, expiresAt: { gt: new Date() } } }),
    prisma.auditEvent.findMany({ where: { source: "PLATFORM" }, orderBy: { occurredAt: "desc" }, take: 8, select: { id: true, action: true, entityType: true, occurredAt: true, actor: { select: { displayName: true } }, company: { select: { tradingName: true, legalName: true } } } }),
    prisma.companyModuleEntitlement.groupBy({ by: ["product", "module", "status"], _count: { _all: true } }),
  ]);
  return { companies, activeCompanies, users, openTickets, highPriority, activeSupportSessions, entitlementRows, recentActivity };
}

// 2026-09-22, user request: "Platform Users menu -- make sure no
// organization admin, user etc can be a platform administrator." Nothing
// previously stopped grantPlatformAuthority from handing platform-wide
// authority to a UserIdentity that already holds a real tenant
// CompanyMembership — the two are meant to be separate people/roles (see
// PlatformShell's own sidebar note, "Platform authority never bypasses
// explicit support context"), but the grant flow only ever looked the
// target user up by email, with no check on their existing tenant
// standing. Shared by grantPlatformAuthority (new grant) and
// updatePlatformAuthority (reactivating an existing, currently-inactive
// assignment) below — both are ways a company member could end up with
// live platform authority.
async function assertNotActiveCompanyMember(tx: Prisma.TransactionClient, userId: string) {
  const activeMembership = await tx.companyMembership.findFirst({ where: { userId, status: "ACTIVE" }, select: { id: true } });
  if (activeMembership) throw new Error("ORG_MEMBER_CANNOT_BE_PLATFORM_ADMIN");
}

export async function grantPlatformAuthority(ctx: RequestContext, input: PlatformAuthorityCreateInput) {
  requirePlatformPermission(ctx, "PLATFORM_OPERATORS_MANAGE");
  if (ctx.companyId) throw new Error("PLATFORM_CONTEXT_REQUIRED");
  const email = input.email.trim().toLowerCase();
  if (!email) throw new Error("EMAIL_REQUIRED");
  return prisma.$transaction(async (tx) => {
    const user = await tx.userIdentity.findUnique({ where: { email } });
    if (!user) throw new Error("RESOURCE_NOT_FOUND");
    await assertNotActiveCompanyMember(tx, user.id);
    const assignment = await tx.platformRoleAssignment.upsert({
      where: { userId_role: { userId: user.id, role: input.role } },
      create: { userId: user.id, role: input.role, active: true },
      update: { active: true },
      include: { permissions: true },
    });
    await revokeUserSessions(user.id, tx);
    await tx.auditEvent.create({
      data: {
        actorId: ctx.userId,
        source: "PLATFORM",
        module: "PLATFORM",
        entityType: "PlatformRoleAssignment",
        entityId: assignment.id,
        action: "PLATFORM_AUTHORITY_GRANTED",
        correlationId: ctx.correlationId,
        afterData: { affectedUserId: user.id, email: user.email, role: assignment.role, active: assignment.active },
      },
    });
    return assignment;
  });
}

export async function updatePlatformAuthority(ctx: RequestContext, input: PlatformAuthorityUpdateInput) {
  requirePlatformPermission(ctx, "PLATFORM_OPERATORS_MANAGE");
  if (ctx.companyId) throw new Error("PLATFORM_CONTEXT_REQUIRED");
  return prisma.$transaction(async (tx) => {
    const before = await tx.platformRoleAssignment.findUnique({ where: { id: input.assignmentId }, include: { user: true, permissions: true } });
    if (!before) throw new Error("RESOURCE_NOT_FOUND");
    // Only re-check on an actual activation (was inactive, now being set
    // active) — an assignment that's already active is left alone here even
    // if the underlying user has since picked up a company membership some
    // other way, so this can't retroactively lock an admin out of managing
    // an existing grant. grantPlatformAuthority (above) is where a brand
    // new grant gets the same check.
    if (input.active && !before.active) await assertNotActiveCompanyMember(tx, before.userId);
    if (before.role === "PLATFORM_ADMIN" && (input.role !== "PLATFORM_ADMIN" || input.active === false)) {
      await assertNotRemovingLastPlatformAdmin(tx, { assignmentId: before.id, nextRole: input.role, nextActive: input.active });
    }
    let assignment = before;
    if (before.role !== input.role) {
      const existing = await tx.platformRoleAssignment.findUnique({ where: { userId_role: { userId: before.userId, role: input.role } } });
      if (existing && existing.id !== before.id) {
        assignment = await tx.platformRoleAssignment.update({ where: { id: existing.id }, data: { active: input.active }, include: { user: true, permissions: true } });
        await tx.platformRoleAssignment.delete({ where: { id: before.id } });
      } else {
        assignment = await tx.platformRoleAssignment.update({ where: { id: before.id }, data: { role: input.role, active: input.active }, include: { user: true, permissions: true } });
      }
    } else {
      assignment = await tx.platformRoleAssignment.update({ where: { id: before.id }, data: { active: input.active }, include: { user: true, permissions: true } });
    }
    await revokeUserSessions(before.userId, tx);
    await tx.auditEvent.create({
      data: {
        actorId: ctx.userId,
        source: "PLATFORM",
        module: "PLATFORM",
        entityType: "PlatformRoleAssignment",
        entityId: assignment.id,
        action: input.active ? "PLATFORM_AUTHORITY_UPDATED" : "PLATFORM_AUTHORITY_REVOKED",
        correlationId: ctx.correlationId,
        beforeData: JSON.parse(JSON.stringify({ id: before.id, role: before.role, active: before.active, userId: before.userId })) as Prisma.InputJsonValue,
        afterData: JSON.parse(JSON.stringify({ id: assignment.id, role: assignment.role, active: assignment.active, userId: assignment.userId })) as Prisma.InputJsonValue,
      },
    });
    return assignment;
  });
}

type PlatformUserProfileInput = { displayName?: string; email?: string; active?: boolean };

// Mirrors assertNotRemovingLastPlatformAdmin above, but keyed on the
// UserIdentity's own `active` flag rather than a specific role assignment
// — deactivating the account (below) locks a platform admin out just as
// completely as deactivating their PlatformRoleAssignment would (see
// session.ts's `!session.user.active` check), so it needs the same
// protection.
async function assertNotDeactivatingLastPlatformAdmin(tx: Prisma.TransactionClient, userId: string) {
  const activeAdmins = await tx.platformRoleAssignment.findMany({ where: { role: "PLATFORM_ADMIN", active: true, user: { active: true } }, select: { userId: true } });
  const targetIsUsableAdmin = activeAdmins.some((row) => row.userId === userId);
  if (!targetIsUsableAdmin) return;
  if (activeAdmins.length <= 1) throw new Error("LAST_PLATFORM_ADMIN_REQUIRED");
}

// 2026-09-22, user request: "Platform Users menu -- make users editable
// which allows you to change user role, email etc." Role is already
// covered by updatePlatformAuthority above; this is the missing piece —
// editing the underlying UserIdentity's own name/email/active flag.
// updateTenantUser (users/service.ts) does the equivalent for a company's
// own users, but it's scoped by companyId via a membership row, which a
// pure platform operator (no CompanyMembership at all) doesn't have.
export async function updatePlatformUserProfile(ctx: RequestContext, userId: string, input: PlatformUserProfileInput) {
  requirePlatformPermission(ctx, "PLATFORM_OPERATORS_MANAGE");
  if (ctx.companyId) throw new Error("PLATFORM_CONTEXT_REQUIRED");
  const displayName = input.displayName !== undefined ? input.displayName.trim() : undefined;
  const email = input.email !== undefined ? input.email.trim().toLowerCase() : undefined;
  if (displayName !== undefined && displayName.length < 2) throw new Error("DISPLAY_NAME_TOO_SHORT");
  if (email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("INVALID_EMAIL");
  return prisma.$transaction(async (tx) => {
    const before = await tx.userIdentity.findUnique({ where: { id: userId } });
    if (!before) throw new Error("RESOURCE_NOT_FOUND");
    if (input.active === false) await assertNotDeactivatingLastPlatformAdmin(tx, userId);
    const updated = await tx.userIdentity.update({
      where: { id: userId },
      data: {
        ...(displayName !== undefined ? { displayName } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    });
    // Sessions revoked on a real credential-surface change (email) or a
    // deactivation — same trigger conditions grantPlatformAuthority/
    // updatePlatformAuthority already use elsewhere in this file, not on
    // every edit (a pure display-name rename shouldn't sign anyone out).
    if (input.active === false || email !== undefined) await revokeUserSessions(userId, tx);
    await tx.auditEvent.create({
      data: {
        actorId: ctx.userId,
        source: "PLATFORM",
        module: "PLATFORM",
        entityType: "UserIdentity",
        entityId: userId,
        action: "PLATFORM_USER_PROFILE_UPDATED",
        correlationId: ctx.correlationId,
        beforeData: { displayName: before.displayName, email: before.email, active: before.active },
        afterData: { displayName: updated.displayName, email: updated.email, active: updated.active },
      },
    });
    return updated;
  });
}