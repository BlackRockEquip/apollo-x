import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ModuleKey, PrismaClient, TicketMessageKind, TicketPriority, TicketStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { RequestContext } from "@/lib/auth/context-types";
import { DEFAULT_PLATFORM_PERMISSIONS, DEFAULT_TENANT_PERMISSIONS } from "@/lib/auth/permissions";
import { createSupportTicket, getPlatformSupportTicket, getTenantSupportTicket, updatePlatformSupportTicket, addPlatformSupportMessage } from "@/lib/support/service";
import { createTenantUser, getTenantUserEditorData, updateTenantUser } from "@/lib/users/service";
import { getDashboardConfig, saveDashboardConfig } from "@/lib/dashboard/service";

const connection = process.env.DATABASE_URL_TEST;
if (!connection) throw new Error("DATABASE_URL_TEST is required");
const db = new PrismaClient({ datasources: { db: { url: connection } } });
const suffix = `final_${Date.now()}_${Math.random().toString(36).slice(2)}`;
const fixture = {} as Record<string, string>;
function tenantContext(companyId: string, userId: string, code: string, perms = DEFAULT_TENANT_PERMISSIONS.COMPANY_ADMIN): RequestContext { return { userId, displayName: "Tenant", companyId, companyInternalCode: code, companyName: code, tenantRole: "COMPANY_ADMIN", tenantPermissions: new Set(perms), platformPermissions: new Set(), supportAccessId: null, supportMode: null, moduleAccess: new Map(Object.values(ModuleKey).map((key) => [key, "FULL"])), correlationId: randomUUID() }; }
function tenantUserContext(companyId: string, userId: string, code: string): RequestContext { return { userId, displayName: "Tenant User", companyId, companyInternalCode: code, companyName: code, tenantRole: "USER", tenantPermissions: new Set(["DASHBOARD_VIEW"]), platformPermissions: new Set(), supportAccessId: null, supportMode: null, moduleAccess: new Map([["DASHBOARD","FULL"],["NOTIFICATIONS","FULL"]]), correlationId: randomUUID() } as RequestContext; }
function platformContext(userId: string): RequestContext { return { userId, displayName: "Platform", companyId: null, companyInternalCode: null, companyName: null, tenantRole: null, tenantPermissions: new Set(), platformPermissions: new Set(DEFAULT_PLATFORM_PERMISSIONS.PLATFORM_ADMIN), supportAccessId: null, supportMode: null, moduleAccess: new Map(), correlationId: randomUUID() }; }

beforeAll(async () => {
  const companyA = await db.company.create({ data: { internalCode: `SUPA_${suffix}`, legalName: "Support A", settings: { create: { themeColor: "#123456" } }, entitlements: { create: [{ module: "JOBS_WIP", source: "MODULE", status: "ACTIVE", effectiveFrom: new Date("2026-01-01") }, { module: "INVENTORY", source: "MODULE", status: "ACTIVE", effectiveFrom: new Date("2026-01-01") }, { module: "NOTIFICATIONS", source: "MODULE", status: "ACTIVE", effectiveFrom: new Date("2026-01-01") }] } } });
  const companyB = await db.company.create({ data: { internalCode: `SUPB_${suffix}`, legalName: "Support B", settings: { create: { themeColor: "#654321" } }, entitlements: { create: [{ module: "DASHBOARD", source: "MODULE", status: "ACTIVE", effectiveFrom: new Date("2026-01-01") }] } } });
  const [userA, userB, platformUser] = await Promise.all([
    db.userIdentity.create({ data: { email: `a_${suffix}@example.test`, displayName: "User A", passwordHash: "x", active: true } }),
    db.userIdentity.create({ data: { email: `b_${suffix}@example.test`, displayName: "User B", passwordHash: "x", active: true } }),
    db.userIdentity.create({ data: { email: `platform_${suffix}@example.test`, displayName: "Platform", passwordHash: "x", active: true } }),
  ]);
  const membershipA = await db.companyMembership.create({ data: { companyId: companyA.id, userId: userA.id, role: "COMPANY_ADMIN", status: "ACTIVE" } });
  const membershipB = await db.companyMembership.create({ data: { companyId: companyB.id, userId: userB.id, role: "COMPANY_ADMIN", status: "ACTIVE" } });
  await db.platformRoleAssignment.create({ data: { userId: platformUser.id, role: "PLATFORM_ADMIN", active: true } });
  Object.assign(fixture, { companyA: companyA.id, companyB: companyB.id, codeA: companyA.internalCode, codeB: companyB.internalCode, userA: userA.id, userB: userB.id, platformUser: platformUser.id, membershipA: membershipA.id, membershipB: membershipB.id });
});

afterAll(async () => {
  await db.auditEvent.deleteMany({ where: { companyId: { in: [fixture.companyA, fixture.companyB] } } });
  await db.supportTicketAttachment.deleteMany({ where: { companyId: { in: [fixture.companyA, fixture.companyB] } } });
  await db.supportTicketMessage.deleteMany({ where: { companyId: { in: [fixture.companyA, fixture.companyB] } } });
  await db.supportTicketEvent.deleteMany({ where: { companyId: { in: [fixture.companyA, fixture.companyB] } } });
  await db.supportTicket.deleteMany({ where: { companyId: { in: [fixture.companyA, fixture.companyB] } } });
  await db.userDashboardConfig.deleteMany({ where: { companyId: { in: [fixture.companyA, fixture.companyB] } } });
  await db.membershipPermission.deleteMany({ where: { membershipId: { in: [fixture.membershipA, fixture.membershipB] } } });
  await db.companyMembership.deleteMany({ where: { companyId: { in: [fixture.companyA, fixture.companyB] } } });
  await db.platformRoleAssignment.deleteMany({ where: { userId: fixture.platformUser } });
  await db.userIdentity.deleteMany({ where: { id: { in: [fixture.userA, fixture.userB, fixture.platformUser] } } });
  await db.companyModuleEntitlement.deleteMany({ where: { companyId: { in: [fixture.companyA, fixture.companyB] } } });
  await db.companySettings.deleteMany({ where: { companyId: { in: [fixture.companyA, fixture.companyB] } } });
  await db.company.deleteMany({ where: { id: { in: [fixture.companyA, fixture.companyB] } } });
  await db.$disconnect();
});

describe("final completion pass", () => {
  it("loads entitled module picker data and persists edits while rejecting unlicensed modules", async () => {
    const ctx = tenantContext(fixture.companyA, fixture.userA, fixture.codeA);
    const editor = await getTenantUserEditorData(ctx);
    expect(editor.availableModules.map((m) => m.moduleKey)).toEqual(expect.arrayContaining(["JOBS_WIP", "INVENTORY", "NOTIFICATIONS"]));
    expect(editor.availableModules.map((m) => m.moduleKey)).not.toContain("PEX_STOCK");
    const created = await createTenantUser(ctx, { email: `new_${suffix}@example.test`, displayName: "New User", role: "USER", password: "Password!2026", moduleKeys: ["JOBS_WIP"] });
    await updateTenantUser(ctx, created.id, { displayName: "Updated User", moduleKeys: ["JOBS_WIP", "INVENTORY"] });
    const updated = await db.companyMembership.findUniqueOrThrow({ where: { id: created.id }, include: { user: true, permissions: true } });
    expect(updated.user.displayName).toBe("Updated User");
    await expect(updateTenantUser(ctx, created.id, { moduleKeys: ["PEX_STOCK"] })).rejects.toThrow("UNLICENSED_MODULE_REQUESTED");
  });

  it("keeps dashboard config per-user within tenant isolation", async () => {
    const ctxA = tenantContext(fixture.companyA, fixture.userA, fixture.codeA);
    const ctxB = tenantContext(fixture.companyA, fixture.userB, fixture.codeA);
    await saveDashboardConfig(ctxA, [{ key: "jobs-summary", enabled: true, order: 0 }, { key: "recent-jobs", enabled: false, order: 1 }]);
    await saveDashboardConfig(ctxB, [{ key: "jobs-summary", enabled: false, order: 0 }, { key: "recent-jobs", enabled: true, order: 1 }]);
    const a = await getDashboardConfig(ctxA);
    const b = await getDashboardConfig(ctxB);
    expect(a.widgets.find((w) => w.key === "jobs-summary")?.enabled).toBe(true);
    expect(a.widgets.find((w) => w.key === "recent-jobs")?.enabled).toBe(false);
    expect(b.widgets.find((w) => w.key === "jobs-summary")?.enabled).toBe(false);
    expect(b.widgets.find((w) => w.key === "recent-jobs")?.enabled).toBe(true);

    await saveDashboardConfig(ctxA, [{ key: "jobs-summary", enabled: false, order: 0 }, { key: "recent-jobs", enabled: true, order: 1 }]);
    const aUpdated = await getDashboardConfig(ctxA);
    const bUnchanged = await getDashboardConfig(ctxB);
    expect(aUpdated.widgets.find((w) => w.key === "jobs-summary")?.enabled).toBe(false);
    expect(aUpdated.widgets.find((w) => w.key === "recent-jobs")?.enabled).toBe(true);
    expect(bUnchanged.widgets.find((w) => w.key === "jobs-summary")?.enabled).toBe(false);
    expect(bUnchanged.widgets.find((w) => w.key === "recent-jobs")?.enabled).toBe(true);
  });

  it("enforces support attachment visibility and tenant/platform isolation", async () => {
    const ctxA = tenantContext(fixture.companyA, fixture.userA, fixture.codeA);
    const ticket = await createSupportTicket(ctxA, { subject: "Attachment test", description: "Need help with screenshot", priority: TicketPriority.NORMAL, attachments: [{ fileName: "screen.png", mimeType: "image/png", contentBase64: Buffer.from("pngdata").toString("base64") }] });
    const detailA = await getTenantSupportTicket(ctxA, ticket.id);
    expect(detailA.attachments).toHaveLength(1);
    let denied: unknown;
    try {
      await getTenantSupportTicket(tenantContext(fixture.companyB, fixture.userB, fixture.codeB), ticket.id);
    } catch (error) {
      denied = error;
    }
    expect(denied).toBeTruthy();
    const platformDetail = await getPlatformSupportTicket(platformContext(fixture.platformUser), ticket.id);
    expect(platformDetail.attachments).toHaveLength(1);
    await expect(createSupportTicket(ctxA, { subject: "Bad", description: "This should fail due to invalid attachment type", attachments: [{ fileName: "evil.exe", mimeType: "application/x-msdownload", contentBase64: Buffer.from("x").toString("base64") }] })).rejects.toThrow("INVALID_ATTACHMENT_TYPE");
    await expect(createSupportTicket(ctxA, { subject: "Big", description: "This should fail due to oversize attachment", attachments: [{ fileName: "big.txt", mimeType: "text/plain", contentBase64: Buffer.alloc(4_000_001).toString("base64") }] })).rejects.toThrow("ATTACHMENT_TOO_LARGE");
  });

  it("supports platform reply/internal note/assignment/priority/status lifecycle while tenant users cannot see internal notes", async () => {
    const ctxA = tenantContext(fixture.companyA, fixture.userA, fixture.codeA);
    const ticket = await createSupportTicket(ctxA, { subject: "Lifecycle", description: "Please investigate this issue in detail", priority: TicketPriority.NORMAL });
    const pctx = platformContext(fixture.platformUser);
    await addPlatformSupportMessage(pctx, ticket.id, { body: "We are investigating", kind: TicketMessageKind.REPLY });
    await addPlatformSupportMessage(pctx, ticket.id, { body: "Internal triage note", kind: TicketMessageKind.INTERNAL_NOTE });
    await updatePlatformSupportTicket(pctx, ticket.id, { assignedSupportId: fixture.platformUser, priority: TicketPriority.HIGH, status: TicketStatus.IN_PROGRESS, note: "Taken by support" });
    await updatePlatformSupportTicket(pctx, ticket.id, { status: TicketStatus.RESOLVED, note: "Resolved" });
    await updatePlatformSupportTicket(pctx, ticket.id, { status: TicketStatus.CLOSED, note: "Closed" });
    await updatePlatformSupportTicket(pctx, ticket.id, { status: TicketStatus.OPEN, note: "Reopened" });
    const platformDetail = await getPlatformSupportTicket(pctx, ticket.id);
    expect(platformDetail.messages.some((m) => m.kind === "INTERNAL_NOTE")).toBe(true);
    expect(platformDetail.status).toBe("OPEN");
    const tenantView = await getTenantSupportTicket(tenantUserContext(fixture.companyA, fixture.userA, fixture.codeA), ticket.id);
    expect(tenantView.messages.some((m) => m.kind === "INTERNAL_NOTE")).toBe(false);
  });
});
