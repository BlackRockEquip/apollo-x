import { ModuleKey, Prisma, TenantRole } from "@prisma/client";
import { z } from "zod";
import type { RequestContext } from "@/lib/auth/context-types";
import { requireTenant, requireTenantPermission } from "@/lib/auth/guards";
import { DEFAULT_TENANT_PERMISSIONS, MODULE_OFF_PREFIX, TENANT_PERMISSIONS, mergePermissionOverrides, userDisabledModules } from "@/lib/auth/permissions";
import { MODULE_LABELS, tenantRoleLabelsFor, tenantRolesFor } from "@/lib/constants";
import { buildTiles, isIndustryBuildId, tileWorking, type IndustryBuildId } from "@/lib/builds/definitions";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/security/passwords";

const userInput = z.object({
  email: z.string().trim().email(),
  displayName: z.string().trim().min(2).max(120),
  role: z.nativeEnum(TenantRole),
  active: z.boolean().optional().default(true),
  // 2026-09-10 — editing an existing user always submits password:"" (the
  // field is left blank unless an admin explicitly types a new one — see
  // UsersWorkspace.tsx's "(leave blank to keep)" hint), but
  // z.string().min(8) treated "" as a present-but-too-short value rather
  // than "no change", so it failed validation rather than being skipped by
  // .optional() (which only accepts undefined, not ""). That made every
  // Edit-user Save fail with a generic "The request is invalid." regardless
  // of which user or which modules were involved. Preprocessing "" to
  // undefined restores "blank = keep existing password"; a real
  // too-short password is still rejected.
  password: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(8).max(120).optional()),
  moduleKeys: z.array(z.nativeEnum(ModuleKey)).optional().default([]),
  permissionOverrides: z.array(z.object({ permission: z.string(), allowed: z.boolean() })).optional().default([]),
});

function auth(ctx: RequestContext) {
  requireTenant(ctx);
  requireTenantPermission(ctx, "USERS_MANAGE");
  return ctx.companyId;
}

const MODULE_CATEGORY: Record<ModuleKey, string> = {
  DASHBOARD: "Core",
  CUSTOMERS: "CRM",
  SUPPLIERS: "CRM",
  JOBS_WIP: "Workshop",
  INVENTORY: "Workshop",
  STORAGE: "Workshop",
  JOB_KITS: "Workshop",
  REBUILDS: "Workshop",
  PEX_STOCK: "Workshop",
  PEX_TRACKING: "Workshop",
  PROCUREMENT: "Supply Chain",
  OUTWORK: "Supply Chain",
  WARRANTY: "Workshop",
  FIELD_SERVICE: "Workshop",
  NOTIFICATIONS: "Core",
  QUOTES: "Commercial",
  SALES_ORDERS: "Commercial",
  INVOICES: "Commercial",
  PAYMENTS: "Commercial",
  REPORTS: "Reporting",
  ATTACHMENTS: "Core",
  IMPORT_EXPORT: "Core",
  JOB_PARTS: "Workshop",
  PICK_SLIPS: "Workshop",
  SPECIFICATIONS: "Engineering",
};

export async function companyEntitledModules(companyId: string) {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { internalCode: true, entitlements: { select: { module: true, status: true } } } });
  if (company.internalCode === "BLACK_ROCK_EQUIPMENT") return new Set(Object.values(ModuleKey));
  return new Set(company.entitlements.filter((row) => row.status === "ACTIVE" || row.status === "GRACE_READ_ONLY").map((row) => row.module));
}

async function companyIndustryBuild(companyId: string): Promise<IndustryBuildId> {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { industryBuild: true } });
  return isIndustryBuildId(company.industryBuild) ? company.industryBuild : "WORKSHOP";
}

function modulePermissions(moduleKey: ModuleKey) {
  const prefixMap: Record<ModuleKey, string[]> = {
    DASHBOARD: ["DASHBOARD_VIEW"],
    CUSTOMERS: TENANT_PERMISSIONS.filter((p) => p.startsWith("CUSTOMER") || p.startsWith("CUSTOMERS")),
    SUPPLIERS: TENANT_PERMISSIONS.filter((p) => p.startsWith("SUPPLIER") || p.startsWith("SUPPLIERS")),
    JOBS_WIP: TENANT_PERMISSIONS.filter((p) => p.startsWith("JOBS_") || p.startsWith("JOB_")),
    // 2026-09-11 — STOCK_MOVEMENTS_VIEW doesn't start with "INVENTORY_"
    // (it's its own permission, granted by default to STORE_CONTROLLER
    // and FINANCE — see DEFAULT_TENANT_PERMISSIONS in permissions.ts) but
    // it's the Inventory module's stock-ledger view, so it belongs here.
    // Leaving it out meant it could never be re-entitled once
    // computeOverrides' auto-revocation swept it — see that fix below.
    INVENTORY: TENANT_PERMISSIONS.filter((p) => p.startsWith("INVENTORY_") || p.startsWith("PARTS_") || p.startsWith("MANUFACTURERS_") || p === "STOCK_MOVEMENTS_VIEW"),
    STORAGE: TENANT_PERMISSIONS.filter((p) => p.startsWith("STORAGE_")),
    JOB_KITS: TENANT_PERMISSIONS.filter((p) => p.startsWith("JOB_KITS_")),
    REBUILDS: [],
    PEX_STOCK: TENANT_PERMISSIONS.filter((p) => p.startsWith("PEX_STOCK")),
    PEX_TRACKING: TENANT_PERMISSIONS.filter((p) => p.startsWith("PEX_") || p === "PEX_TRACKING_VIEW"),
    PROCUREMENT: [],
    OUTWORK: [],
    WARRANTY: [],
    FIELD_SERVICE: [],
    NOTIFICATIONS: ["DASHBOARD_VIEW"],
    QUOTES: TENANT_PERMISSIONS.filter((p) => p.startsWith("QUOTES_") || p.startsWith("COMMERCIAL_TERMS") || p.startsWith("SERVICES_") || p === "NUMBERING_VIEW" || p === "NUMBERING_EDIT"),
    SALES_ORDERS: TENANT_PERMISSIONS.filter((p) => p.startsWith("SALES_ORDERS_")),
    // TAX_CODES_* has its own prefix (not "INVOICES_") but the tax-codes
    // master-data kind is policy-gated behind the INVOICES module (see
    // MASTER_DATA_POLICY in master-data/service.ts) — same class of gap
    // as STOCK_MOVEMENTS_VIEW above.
    INVOICES: TENANT_PERMISSIONS.filter((p) => p.startsWith("INVOICES_") || p.startsWith("PAYMENTS_") || p.startsWith("FINANCIAL_REPORTS_") || p.startsWith("TAX_CODES_")),
    PAYMENTS: TENANT_PERMISSIONS.filter((p) => p.startsWith("PAYMENTS_")),
    REPORTS: TENANT_PERMISSIONS.filter((p) => p.startsWith("REPORTS_") || p.startsWith("AUDIT_")),
    ATTACHMENTS: [],
    IMPORT_EXPORT: TENANT_PERMISSIONS.filter((p) => p.endsWith("_EXPORT")),
    JOB_PARTS: [],
    PICK_SLIPS: [],
    SPECIFICATIONS: [],
  };
  return new Set(prefixMap[moduleKey] ?? []);
}

// 2026-09-11 — the full set of permissions that belong to at least one
// module, across every ModuleKey (not just whichever modules a given user
// has selected). USERS_MANAGE, SETTINGS_MANAGE, COMPANY_SETTINGS_VIEW and
// COMPANY_SETTINGS_EDIT are real, actively-checked permissions (see
// requireTenantPermission call sites in this file and in
// company-settings-service.ts / repositories/company-settings.ts) but
// there is no "Users" or "Settings" entry in the ModuleKey enum for them
// to live under, so no module selection can ever grant them. Scoping
// computeOverrides' auto-revocation to only this covered set (below) is
// what stops those permissions from being swept on literally every Users
// tab Save — see that fix for the bug this caused.
const MODULE_COVERED_PERMISSIONS = new Set<string>(
  (Object.values(ModuleKey) as ModuleKey[]).flatMap((moduleKey) => Array.from(modulePermissions(moduleKey))),
);

// 2026-09-11 — "i see my permissions have been removed again": every save
// on the Users tab (create OR edit — see createTenantUser/updateTenantUser
// below) recomputes this membership's full override row set from scratch.
// The auto-revocation pass used to run over ALL of TENANT_PERMISSIONS, so
// any permission that no module's modulePermissions() happens to cover —
// regardless of which modules were selected — got an explicit
// {allowed:false} row written every single time, for every role including
// COMPANY_ADMIN. USERS_MANAGE/SETTINGS_MANAGE/COMPANY_SETTINGS_VIEW/
// COMPANY_SETTINGS_EDIT have no module at all (see
// MODULE_COVERED_PERMISSIONS above), so that was a one-way ratchet: saving
// any user — including a COMPANY_ADMIN saving themselves — silently
// stripped their own ability to manage users or settings, with no way to
// re-grant it since no module checkbox could ever cover it again.
// STOCK_MOVEMENTS_VIEW and TAX_CODES_* were hit the same way whenever the
// covering module (INVENTORY / INVOICES) was mapped by prefix and missed
// them — now fixed above, so those two are back to normal
// module-entitlement behavior. Restricting this sweep to
// MODULE_COVERED_PERMISSIONS leaves every module-less permission alone,
// governed only by the role default and any explicit override.
function computeOverrides(role: TenantRole, allowedModules: ModuleKey[], explicit: Array<{ permission: string; allowed: boolean }>) {
  const entitledPermissions = new Set<string>();
  for (const moduleKey of allowedModules) for (const permission of modulePermissions(moduleKey)) entitledPermissions.add(permission);
  const base = DEFAULT_TENANT_PERMISSIONS[role];
  const rows = explicit.filter((row) => TENANT_PERMISSIONS.includes(row.permission as never) && (entitledPermissions.has(row.permission) || !row.allowed));
  const effective = mergePermissionOverrides(base, rows);
  const autoRevocations = TENANT_PERMISSIONS.filter(
    (permission) => MODULE_COVERED_PERMISSIONS.has(permission) && !entitledPermissions.has(permission) && effective.has(permission as never),
  ).map((permission) => ({ permission, allowed: false }));
  return [...rows, ...autoRevocations];
}

// 2026-10-16, user request: every module can be switched on or off per user, whatever the company licence. A module is "on"
// for a user when it has not been switched off for them and, for modules that carry permissions, at least one of those
// permissions is in effect. Modules without permissions (RFQs, Outwork, Pick slips, Specifications...) are controlled only by
// the MODULE_OFF marker (see permissions.ts).
function moduleIsOn(moduleKey: ModuleKey, effective: ReadonlySet<string>, off: ReadonlySet<string>) {
  if (off.has(moduleKey)) return false;
  const permissions = modulePermissions(moduleKey);
  if (permissions.size === 0) return moduleKey === "DASHBOARD" ? effective.has("DASHBOARD_VIEW") : true;
  return Array.from(permissions).some((permission) => effective.has(permission)) || (moduleKey === "DASHBOARD" && effective.has("DASHBOARD_VIEW"));
}

// 2026-10-16, user request: "only modules enabled on platform admin should be visible to an org admin". The Users screen
// shows only the tiles the platform admin has switched on for the company (licensed, and with whatever they require also on);
// every module behind a shown tile can then be switched on or off per user.
function visibleTiles(build: IndustryBuildId, entitled: ReadonlySet<ModuleKey>) {
  const licensed = (tileId: string) => buildTiles(build).some((tile) => tile.id === tileId && tile.modules.some((key) => entitled.has(key)));
  return buildTiles(build).filter((tile) => licensed(tile.id) && tileWorking(build, tile.id, licensed));
}

function switchableModuleKeys(build: IndustryBuildId, entitled: ReadonlySet<ModuleKey>): ModuleKey[] {
  return Array.from(new Set(visibleTiles(build, entitled).flatMap((tile) => tile.modules)));
}

// The permission override rows to store for a save, plus a MODULE_OFF marker for every switchable module that is off.
// Modules that are not on the screen (their tile is not enabled for the company) are left as they are: never revoked, and
// any switch already stored for them is kept.
function overridesWithModuleSwitches(role: TenantRole, switchable: ModuleKey[], moduleKeys: ModuleKey[], explicit: Array<{ permission: string; allowed: boolean }>, existingOff: ReadonlySet<string> = new Set()) {
  const allowedForPermissions = [...moduleKeys, ...Object.values(ModuleKey).filter((key) => !switchable.includes(key))];
  const rows = computeOverrides(role, allowedForPermissions, explicit.filter((row) => !row.permission.startsWith(MODULE_OFF_PREFIX)));
  const off = new Set<string>(switchable.filter((key) => !moduleKeys.includes(key)));
  for (const key of existingOff) if (!switchable.includes(key as ModuleKey)) off.add(key);
  return [...rows, ...Array.from(off).map((key) => ({ permission: `${MODULE_OFF_PREFIX}${key}`, allowed: false }))];
}

export async function listTenantUsers(ctx: RequestContext) {
  const companyId = auth(ctx);
  const entitledModules = await companyEntitledModules(companyId);
  const roleLabels = tenantRoleLabelsFor(await companyIndustryBuild(companyId));
  const memberships = await prisma.companyMembership.findMany({ where: { companyId }, include: { user: true, permissions: true }, orderBy: [{ role: "asc" }, { createdAt: "asc" }] });
  return memberships.map((membership) => {
    const effective = mergePermissionOverrides(DEFAULT_TENANT_PERMISSIONS[membership.role], membership.permissions);
    const off = userDisabledModules(membership.permissions);
    const modules = Array.from(entitledModules).filter((moduleKey) => moduleIsOn(moduleKey, effective, off));
    return { id: membership.id, userId: membership.userId, email: membership.user.email, displayName: membership.user.displayName, active: membership.user.active, membershipStatus: membership.status, role: membership.role, roleLabel: roleLabels[membership.role], moduleKeys: modules, moduleLabels: modules.map((row) => MODULE_LABELS[row]), permissionOverrides: membership.permissions.filter((row) => !row.permission.startsWith(MODULE_OFF_PREFIX)) };
  });
}

export async function getTenantUserEditorData(ctx: RequestContext, membershipId?: string) {
  const companyId = auth(ctx);
  const entitled = Array.from(await companyEntitledModules(companyId)).sort();
  const availableModules = entitled.map((moduleKey) => ({ moduleKey, label: MODULE_LABELS[moduleKey], category: MODULE_CATEGORY[moduleKey] ?? "Other" }));
  const build = await companyIndustryBuild(companyId);
  const roleLabels = tenantRoleLabelsFor(build);
  // 2026-10-16, user request: module access shown the same way as on the platform admin's Industry build tab (the build's
  // module tiles). A tile is switched per user through the modules behind it that carry per-user permissions; a tile with
  // none ("controllable" empty) follows the company licence for everyone and is shown locked.
  const entitledSet = new Set(entitled);
  const shownTiles = visibleTiles(build, entitledSet);
  const tiles = shownTiles.map((tile) => ({ id: tile.id, label: tile.label, note: tile.note, core: Boolean(tile.core), moduleKeys: tile.modules, controllable: tile.modules, licensed: true }));
  const switchable = switchableModuleKeys(build, entitledSet);
  const editor = membershipId ? await prisma.companyMembership.findFirst({ where: { id: membershipId, companyId }, include: { user: true, permissions: true } }) : null;
  if (membershipId && !editor) throw new Error("NOT_FOUND");
  const selectedModuleKeys = editor
    ? switchable.filter((moduleKey) => moduleIsOn(moduleKey, mergePermissionOverrides(DEFAULT_TENANT_PERMISSIONS[editor.role], editor.permissions), userDisabledModules(editor.permissions)))
    : ["DASHBOARD", "JOBS_WIP"].filter((moduleKey) => entitled.includes(moduleKey as ModuleKey));
  return {
    availableModules,
    industryBuild: build,
    tiles,
    roles: (editor && !tenantRolesFor(build).includes(editor.role) ? [...tenantRolesFor(build), editor.role] : tenantRolesFor(build)).map((role) => ({ role, label: roleLabels[role] })),
    editor: editor ? { membershipId: editor.id, email: editor.user.email, displayName: editor.user.displayName, role: editor.role, active: editor.user.active, membershipStatus: editor.status, selectedModuleKeys } : null,
  };
}

export async function createTenantUser(ctx: RequestContext, raw: unknown) {
  const companyId = auth(ctx);
  return createTenantUserCore(ctx, companyId, "API", raw);
}

// Shared by Settings > Users (above) and Platform > Companies > company > Add user (platform/admin-service.ts), so a
// user added from the platform admin is created exactly like one added by the company's own admin.
export async function createTenantUserCore(ctx: RequestContext, companyId: string, source: "API" | "PLATFORM", raw: unknown) {
  const input = userInput.parse(raw);
  if (!tenantRolesFor(await companyIndustryBuild(companyId)).includes(input.role)) throw new Error("ROLE_NOT_ALLOWED");
  // 2026-10-16: any module can be switched on or off for a user, licensed or not. Access still needs the company licence at
  // run time (session.ts), so switching on an unlicensed module takes effect only once the company is licensed for it.
  const build = await companyIndustryBuild(companyId);
  const switchable = switchableModuleKeys(build, await companyEntitledModules(companyId));
  return prisma.$transaction(async (tx) => {
    const email = input.email.toLowerCase();
    let user = await tx.userIdentity.findUnique({ where: { email } });
    if (!user) {
      if (!input.password) throw new Error("PASSWORD_REQUIRED");
      user = await tx.userIdentity.create({ data: { email, displayName: input.displayName, passwordHash: await hashPassword(input.password), active: input.active } });
    } else {
      user = await tx.userIdentity.update({ where: { id: user.id }, data: { displayName: input.displayName, active: input.active } });
    }
    const membership = await tx.companyMembership.create({ data: { userId: user.id, companyId, role: input.role } });
    const overrides = overridesWithModuleSwitches(input.role, switchable, input.moduleKeys, input.permissionOverrides);
    if (overrides.length > 0) await tx.membershipPermission.createMany({ data: overrides.map((row) => ({ membershipId: membership.id, permission: row.permission, allowed: row.allowed })), skipDuplicates: true });
    await tx.auditEvent.create({ data: { companyId, actorId: ctx.userId, supportAccessId: ctx.supportAccessId, source, module: "USERS", entityType: "CompanyMembership", entityId: membership.id, action: "TENANT_USER_CREATED", correlationId: ctx.correlationId, afterData: { email, role: input.role, moduleKeys: input.moduleKeys } } });
    return membership;
  });
}

export async function updateTenantUser(ctx: RequestContext, membershipId: string, raw: unknown) {
  const companyId = auth(ctx);
  const input = userInput.partial({ email: true, displayName: true, role: true, password: true }).parse(raw);
  const build = await companyIndustryBuild(companyId);
  const switchable = switchableModuleKeys(build, await companyEntitledModules(companyId));
  return prisma.$transaction(async (tx) => {
    const before = await tx.companyMembership.findFirst({ where: { id: membershipId, companyId }, include: { user: true, permissions: true } });
    if (!before) throw new Error("NOT_FOUND");
    if (input.role && input.role !== before.role && !tenantRolesFor(await companyIndustryBuild(companyId)).includes(input.role)) throw new Error("ROLE_NOT_ALLOWED");
    if (input.displayName || input.active !== undefined || input.password) {
      await tx.userIdentity.update({ where: { id: before.userId }, data: { ...(input.displayName ? { displayName: input.displayName } : {}), ...(input.active !== undefined ? { active: input.active } : {}), ...(input.password ? { passwordHash: await hashPassword(input.password), sessionVersion: { increment: 1 } } : {}) } });
    }
    const membership = await tx.companyMembership.update({ where: { id: membershipId }, data: { ...(input.role ? { role: input.role } : {}), ...(raw && typeof raw === "object" && "membershipStatus" in (raw as Record<string, unknown>) ? { status: String((raw as Record<string, unknown>).membershipStatus) as never } : {}) } });
    if (input.moduleKeys || input.permissionOverrides) {
      await tx.membershipPermission.deleteMany({ where: { membershipId } });
      // Only the module switches that were sent are changed; when just permission overrides are sent, the user's existing
      // module switches are kept as they are.
      const overrides = input.moduleKeys
        ? overridesWithModuleSwitches(input.role ?? before.role, switchable, input.moduleKeys, input.permissionOverrides ?? [], userDisabledModules(before.permissions))
        : [...computeOverrides(input.role ?? before.role, [], input.permissionOverrides ?? []), ...Array.from(userDisabledModules(before.permissions)).map((key) => ({ permission: `${MODULE_OFF_PREFIX}${key}`, allowed: false }))];
      if (overrides.length > 0) await tx.membershipPermission.createMany({ data: overrides.map((row) => ({ membershipId, permission: row.permission, allowed: row.allowed })) });
    }
    await tx.auditEvent.create({ data: { companyId, actorId: ctx.userId, supportAccessId: ctx.supportAccessId, source: "API", module: "USERS", entityType: "CompanyMembership", entityId: membershipId, action: "TENANT_USER_UPDATED", correlationId: ctx.correlationId, beforeData: JSON.parse(JSON.stringify(before)) as Prisma.InputJsonValue, afterData: JSON.parse(JSON.stringify(membership)) as Prisma.InputJsonValue } });
    return membership;
  });
}

export async function resetTenantUserSessions(ctx: RequestContext, membershipId: string) {
  const companyId = auth(ctx);
  return prisma.$transaction(async (tx) => {
    const membership = await tx.companyMembership.findFirst({ where: { id: membershipId, companyId } });
    if (!membership) throw new Error("NOT_FOUND");
    await tx.userIdentity.update({ where: { id: membership.userId }, data: { sessionVersion: { increment: 1 } } });
    await tx.userSession.updateMany({ where: { membershipId, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.auditEvent.create({ data: { companyId, actorId: ctx.userId, supportAccessId: ctx.supportAccessId, source: "API", module: "USERS", entityType: "CompanyMembership", entityId: membershipId, action: "TENANT_USER_SESSIONS_RESET", correlationId: ctx.correlationId } });
    return { ok: true };
  });
}

// 2026-10-09 — user request: "Settings - Users, add a delete button next to
// reset". Deleting a user removes them from THIS company (their membership,
// permissions and sign-in sessions go with it) — it does not erase the person
// behind the login. Their name has to stay on everything they did (job
// history, stock movements, audit trail all point at the login), and the same
// login can belong to other companies. If the login is left with no company
// and no platform role it is also switched off, so it can't sign in anywhere.
// Guarded: you can't delete yourself, and the last active Company Admin can't
// be deleted (the company would be locked out of its own user list).
export async function deleteTenantUser(ctx: RequestContext, membershipId: string) {
  const companyId = auth(ctx);
  return prisma.$transaction(async (tx) => {
    const membership = await tx.companyMembership.findFirst({ where: { id: membershipId, companyId }, include: { user: true } });
    if (!membership) throw new Error("NOT_FOUND");
    if (membership.userId === ctx.userId) throw new Error("CANNOT_DELETE_SELF");
    if (membership.role === "COMPANY_ADMIN") {
      const otherAdmins = await tx.companyMembership.count({
        where: { companyId, role: "COMPANY_ADMIN", status: "ACTIVE", id: { not: membershipId }, user: { active: true } },
      });
      if (otherAdmins === 0) throw new Error("LAST_COMPANY_ADMIN_REQUIRED");
    }
    await tx.companyMembership.delete({ where: { id: membershipId } });
    const remainingMemberships = await tx.companyMembership.count({ where: { userId: membership.userId } });
    const platformRoles = await tx.platformRoleAssignment.count({ where: { userId: membership.userId } });
    const loginDisabled = remainingMemberships === 0 && platformRoles === 0;
    if (loginDisabled) {
      await tx.userIdentity.update({ where: { id: membership.userId }, data: { active: false, sessionVersion: { increment: 1 } } });
      await tx.userSession.updateMany({ where: { userId: membership.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await tx.auditEvent.create({
      data: {
        companyId, actorId: ctx.userId, supportAccessId: ctx.supportAccessId, source: "API", module: "USERS", entityType: "CompanyMembership", entityId: membershipId,
        action: "TENANT_USER_DELETED", correlationId: ctx.correlationId,
        beforeData: { email: membership.user.email, displayName: membership.user.displayName, role: membership.role },
        afterData: { loginDisabled },
      },
    });
    return { ok: true, loginDisabled };
  });
}

// 2026-09-19 — user request: "User Setup will be where an admin can setup
// Mechanic Names that the corresponding fields in jobs pickup." A
// lightweight named list (no login of its own — see the Mechanic model
// comment in schema.prisma) that Job.stripMechanicId/buildMechanicId now
// point at instead of a real UserIdentity/CompanyMembership. Reuses this
// file's existing USERS_MANAGE gate (auth(ctx)) rather than inventing a
// new permission, same reasoning as deleteJobKit reusing JOB_KITS_
// DEACTIVATE in job-kits/service.ts.
const mechanicInput = z.object({
  name: z.string().trim().min(1).max(120),
  active: z.boolean().optional().default(true),
});

export async function listMechanics(ctx: RequestContext) {
  const companyId = auth(ctx);
  return prisma.mechanic.findMany({ where: { companyId }, orderBy: { name: "asc" } });
}

export async function createMechanic(ctx: RequestContext, raw: unknown) {
  const companyId = auth(ctx);
  const input = mechanicInput.parse(raw);
  const mechanic = await prisma.mechanic.create({ data: { companyId, name: input.name, active: input.active } });
  await prisma.auditEvent.create({ data: { companyId, actorId: ctx.userId, supportAccessId: ctx.supportAccessId, source: "API", module: "USERS", entityType: "Mechanic", entityId: mechanic.id, action: "MECHANIC_CREATED", correlationId: ctx.correlationId, afterData: { name: mechanic.name, active: mechanic.active } } });
  return mechanic;
}

export async function updateMechanic(ctx: RequestContext, id: string, raw: unknown) {
  const companyId = auth(ctx);
  const input = mechanicInput.partial().parse(raw);
  const before = await prisma.mechanic.findFirst({ where: { id, companyId } });
  if (!before) throw new Error("NOT_FOUND");
  const mechanic = await prisma.mechanic.update({
    where: { id },
    data: { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.active !== undefined ? { active: input.active } : {}) },
  });
  await prisma.auditEvent.create({ data: { companyId, actorId: ctx.userId, supportAccessId: ctx.supportAccessId, source: "API", module: "USERS", entityType: "Mechanic", entityId: id, action: "MECHANIC_UPDATED", correlationId: ctx.correlationId, beforeData: { name: before.name, active: before.active }, afterData: { name: mechanic.name, active: mechanic.active } } });
  return mechanic;
}

export async function deleteMechanic(ctx: RequestContext, id: string) {
  const companyId = auth(ctx);
  const before = await prisma.mechanic.findFirst({ where: { id, companyId } });
  if (!before) throw new Error("NOT_FOUND");
  // Job.stripMechanicId/buildMechanicId are onDelete: SetNull, so deleting
  // a mechanic currently assigned to a job is never blocked — those jobs
  // just lose the assignment, same tradeoff as deleteJobKit.
  await prisma.mechanic.delete({ where: { id } });
  await prisma.auditEvent.create({ data: { companyId, actorId: ctx.userId, supportAccessId: ctx.supportAccessId, source: "API", module: "USERS", entityType: "Mechanic", entityId: id, action: "MECHANIC_DELETED", correlationId: ctx.correlationId, beforeData: { name: before.name } } });
  return { id };
}

// 2026-09-22 — user request: "under Settings-Users-User Setup, add Sales
// Representative same as mechanic field." Same shape and same USERS_MANAGE
// gate as the Mechanic block above — see the SalesRepresentative model
// comment in schema.prisma for why Job.salesRepresentative was retargeted
// from a free-text column to this lightweight named list.
const salesRepresentativeInput = z.object({
  name: z.string().trim().min(1).max(120),
  active: z.boolean().optional().default(true),
});

export async function listSalesRepresentatives(ctx: RequestContext) {
  const companyId = auth(ctx);
  return prisma.salesRepresentative.findMany({ where: { companyId }, orderBy: { name: "asc" } });
}

export async function createSalesRepresentative(ctx: RequestContext, raw: unknown) {
  const companyId = auth(ctx);
  const input = salesRepresentativeInput.parse(raw);
  const salesRep = await prisma.salesRepresentative.create({ data: { companyId, name: input.name, active: input.active } });
  await prisma.auditEvent.create({ data: { companyId, actorId: ctx.userId, supportAccessId: ctx.supportAccessId, source: "API", module: "USERS", entityType: "SalesRepresentative", entityId: salesRep.id, action: "SALES_REPRESENTATIVE_CREATED", correlationId: ctx.correlationId, afterData: { name: salesRep.name, active: salesRep.active } } });
  return salesRep;
}

export async function updateSalesRepresentative(ctx: RequestContext, id: string, raw: unknown) {
  const companyId = auth(ctx);
  const input = salesRepresentativeInput.partial().parse(raw);
  const before = await prisma.salesRepresentative.findFirst({ where: { id, companyId } });
  if (!before) throw new Error("NOT_FOUND");
  const salesRep = await prisma.salesRepresentative.update({
    where: { id },
    data: { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.active !== undefined ? { active: input.active } : {}) },
  });
  await prisma.auditEvent.create({ data: { companyId, actorId: ctx.userId, supportAccessId: ctx.supportAccessId, source: "API", module: "USERS", entityType: "SalesRepresentative", entityId: id, action: "SALES_REPRESENTATIVE_UPDATED", correlationId: ctx.correlationId, beforeData: { name: before.name, active: before.active }, afterData: { name: salesRep.name, active: salesRep.active } } });
  return salesRep;
}

export async function deleteSalesRepresentative(ctx: RequestContext, id: string) {
  const companyId = auth(ctx);
  const before = await prisma.salesRepresentative.findFirst({ where: { id, companyId } });
  if (!before) throw new Error("NOT_FOUND");
  // Job.salesRepresentativeId is onDelete: SetNull, so deleting a sales
  // representative currently assigned to a job is never blocked — those
  // jobs just lose the assignment, same tradeoff as deleteMechanic.
  await prisma.salesRepresentative.delete({ where: { id } });
  await prisma.auditEvent.create({ data: { companyId, actorId: ctx.userId, supportAccessId: ctx.supportAccessId, source: "API", module: "USERS", entityType: "SalesRepresentative", entityId: id, action: "SALES_REPRESENTATIVE_DELETED", correlationId: ctx.correlationId, beforeData: { name: before.name } } });
  return { id };
}