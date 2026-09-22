import { ModuleCatalogStatus, ModuleKey, Prisma } from "@prisma/client";
import { z } from "zod";
import type { RequestContext } from "@/lib/auth/context-types";
import { requirePlatformPermission } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { MODULE_LABELS } from "@/lib/constants";

const inputSchema = z.object({
  code: z.string().trim().min(2).max(60).regex(/^[A-Z0-9_]+$/),
  moduleKey: z.nativeEnum(ModuleKey).nullable().optional(),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  category: z.string().trim().min(2).max(80),
  status: z.nativeEnum(ModuleCatalogStatus).default(ModuleCatalogStatus.ACTIVE),
  version: z.string().trim().min(1).max(40).default("1.0.0"),
  icon: z.string().trim().max(40).optional().nullable(),
  navGroup: z.string().trim().max(80).optional().nullable(),
  navOrder: z.number().int().optional().nullable(),
  route: z.string().trim().max(120).optional().nullable(),
  assignableToTenants: z.boolean().default(false),
  userAssignable: z.boolean().default(true),
  dependsOn: z.array(z.nativeEnum(ModuleKey)).default([]),
});

function auth(ctx: RequestContext, write = false) {
  requirePlatformPermission(ctx, write ? "PLATFORM_CONFIGURATION_MANAGE" : "PLATFORM_COMPANIES_VIEW");
  if (ctx.companyId) throw new Error("PLATFORM_CONTEXT_REQUIRED");
}

export async function seedModuleCatalogIfEmpty(ctx: RequestContext) {
  auth(ctx, true);
  const count = await prisma.moduleCatalogEntry.count();
  if (count > 0) return;
  await prisma.moduleCatalogEntry.createMany({
    data: [
      ...Object.values(ModuleKey).map((moduleKey, index) => ({ code: moduleKey, moduleKey, name: MODULE_LABELS[moduleKey], description: `${MODULE_LABELS[moduleKey]} module`, category: ["JOBS_WIP", "JOB_KITS", "PEX_STOCK", "PEX_TRACKING", "REBUILDS", "FIELD_SERVICE", "WARRANTY"].includes(moduleKey) ? "Workshop" : ["QUOTES", "SALES_ORDERS", "INVOICES", "PAYMENTS", "REPORTS"].includes(moduleKey) ? "Commercial" : "Operations", status: ModuleCatalogStatus.ACTIVE, version: "1.0.0", navOrder: index + 1, assignableToTenants: moduleKey !== "DASHBOARD", userAssignable: true, dependsOn: [] })),
      { code: "EDU_STUDENTS", name: "Students", description: "Future education domain", category: "Education", status: ModuleCatalogStatus.PLANNED, version: "0.0.0", assignableToTenants: true, userAssignable: true, dependsOn: [] },
      { code: "MED_PATIENTS", name: "Patients", description: "Future medical domain", category: "Medical", status: ModuleCatalogStatus.PLANNED, version: "0.0.0", assignableToTenants: true, userAssignable: true, dependsOn: [] },
      { code: "ACC_GL", name: "General Ledger", description: "Future accounting domain", category: "Accounting", status: ModuleCatalogStatus.PLANNED, version: "0.0.0", assignableToTenants: true, userAssignable: false, dependsOn: [] },
    ], skipDuplicates: true,
  });
}

export async function listModuleCatalog(ctx: RequestContext, query: Record<string, unknown>) {
  auth(ctx);
  const q = String(query.q ?? "").trim();
  return prisma.moduleCatalogEntry.findMany({ where: { ...(query.status ? { status: String(query.status) as ModuleCatalogStatus } : {}), ...(query.category ? { category: String(query.category) } : {}), ...(q ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] } : {}) }, orderBy: [{ category: "asc" }, { navOrder: "asc" }, { name: "asc" }] });
}

export async function getModuleCatalogEntry(ctx: RequestContext, id: string) {
  auth(ctx);
  const entry = await prisma.moduleCatalogEntry.findUniqueOrThrow({ where: { id } });
  // Every moduleKey in the catalog today is a WORKSHOP module (see
  // ModuleKey/Product in schema.prisma) — scoped explicitly so this stays
  // correct once the Sports League product adds its own module keys.
  const assignmentCount = entry.moduleKey ? await prisma.companyModuleEntitlement.count({ where: { product: "WORKSHOP", module: entry.moduleKey, status: { in: ["ACTIVE", "GRACE_READ_ONLY"] } } }) : 0;
  return { ...entry, assignmentCount };
}

export async function createModuleCatalogEntry(ctx: RequestContext, raw: unknown) {
  auth(ctx, true);
  const input = inputSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    const created = await tx.moduleCatalogEntry.create({ data: { ...input, code: input.code.toUpperCase(), createdById: ctx.userId } });
    await tx.auditEvent.create({ data: { actorId: ctx.userId, source: "PLATFORM", module: "PLATFORM", entityType: "ModuleCatalogEntry", entityId: created.id, action: "MODULE_CATALOG_CREATED", correlationId: ctx.correlationId, afterData: created as Prisma.InputJsonValue } });
    return created;
  });
}

export async function updateModuleCatalogEntry(ctx: RequestContext, id: string, raw: unknown) {
  auth(ctx, true);
  const input = inputSchema.partial().parse(raw);
  return prisma.$transaction(async (tx) => {
    const before = await tx.moduleCatalogEntry.findUnique({ where: { id } });
    if (!before) throw new Error("NOT_FOUND");
    const updated = await tx.moduleCatalogEntry.update({ where: { id }, data: { ...input, ...(input.code ? { code: input.code.toUpperCase() } : {}) } });
    await tx.auditEvent.create({ data: { actorId: ctx.userId, source: "PLATFORM", module: "PLATFORM", entityType: "ModuleCatalogEntry", entityId: id, action: "MODULE_CATALOG_UPDATED", correlationId: ctx.correlationId, beforeData: before as Prisma.InputJsonValue, afterData: updated as Prisma.InputJsonValue } });
    return updated;
  });
}

// 2026-09-22, user request: "on modules menu, make modules editable
// (Enable/disable/delete)." Enable/disable is just updateModuleCatalogEntry
// above with { status: "ACTIVE" | "INACTIVE" } — no new function needed.
// Delete is new. Guarded against deleting an entry that's still doing real
// work: if it's mapped to a real ModuleKey (moduleKey is only set for the
// genuine Workshop modules seeded 1:1 from the ModuleKey enum — see
// seedModuleCatalogIfEmpty above; the Education/Medical/Accounting rows are
// deliberately moduleKey: null placeholders) AND any company currently has
// an active/grace-period entitlement for it, deleting the catalog row would
// remove its only documentation (name/description/category) while it's
// still actively licensed to real tenants — same assignmentCount check
// getModuleCatalogEntry already exposes to the UI, enforced here too so
// this can't be bypassed by calling the API directly.
export async function deleteModuleCatalogEntry(ctx: RequestContext, id: string) {
  auth(ctx, true);
  return prisma.$transaction(async (tx) => {
    const before = await tx.moduleCatalogEntry.findUnique({ where: { id } });
    if (!before) throw new Error("NOT_FOUND");
    if (before.moduleKey) {
      const assignmentCount = await tx.companyModuleEntitlement.count({ where: { product: "WORKSHOP", module: before.moduleKey, status: { in: ["ACTIVE", "GRACE_READ_ONLY"] } } });
      if (assignmentCount > 0) throw new Error("MODULE_HAS_ACTIVE_ENTITLEMENTS");
    }
    await tx.moduleCatalogEntry.delete({ where: { id } });
    await tx.auditEvent.create({ data: { actorId: ctx.userId, source: "PLATFORM", module: "PLATFORM", entityType: "ModuleCatalogEntry", entityId: id, action: "MODULE_CATALOG_DELETED", correlationId: ctx.correlationId, beforeData: before as Prisma.InputJsonValue } });
    return { ok: true };
  });
}