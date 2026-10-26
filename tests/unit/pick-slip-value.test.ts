import { beforeEach, describe, expect, it, vi } from "vitest";
import { canSeePickSlipValue, estimatePickValue } from "@/lib/inventory/pick-slip-value";

// 2026-10-26, user request: Picking Slip History > "Estimate Stock Price" (quantity picked x the part's cost price).
const db = vi.hoisted(() => ({ pickSlip: { findMany: vi.fn(), count: vi.fn(async () => 2) }, partAlternateNumber: { findMany: vi.fn(async () => []) } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@prisma/client", () => ({ Prisma: { Decimal: class { constructor(public v: unknown) {} } } }));
vi.mock("@/lib/audit/service", () => ({ recordAudit: vi.fn() }));

import { listPickSlips } from "@/lib/inventory/service";
import type { RequestContext } from "@/lib/auth/context-types";

const ctxWith = (perms: string[], tenantRole = "COMPANY_ADMIN") => ({
  companyId: "c1", userId: "u1", displayName: "T", correlationId: "x", tenantRole,
  tenantPermissions: new Set(["INVENTORY_VIEW", ...perms]),
  moduleAccess: new Map([["INVENTORY", "FULL"], ["PICK_SLIPS", "FULL"]]),
  platformPermissions: new Set(),
} as unknown as RequestContext);

const slip = (id: string, status: string) => ({
  id, jobId: "j1", job: { jobNumber: "J1", draftNumber: null, customer: null }, createdAt: new Date("2026-10-01T08:00:00Z"), status, cancelledAt: null, cancelReason: null,
  lines: [
    { partId: "p1", partNumber: "A", description: "a", quantity: { toString: () => "2" }, binLocation: null, part: { defaultPurchaseCost: { toString: () => "10.50" } } },
    { partId: "p2", partNumber: "B", description: "b", quantity: { toString: () => "3" }, binLocation: null, part: { defaultPurchaseCost: null } },
    { partId: "p3", partNumber: "C", description: "c", quantity: { toString: () => "0.5" }, binLocation: null, part: { defaultPurchaseCost: { toString: () => "7" } } },
  ],
});

describe("estimatePickValue", () => {
  it("adds quantity x cost price, a part with no cost counts as nothing, rounded to cents", () => {
    expect(estimatePickValue([{ quantity: "2", part: { defaultPurchaseCost: "10.50" } }, { quantity: "3", part: { defaultPurchaseCost: null } }, { quantity: "0.5", part: { defaultPurchaseCost: "7" } }])).toBe("24.50");
    expect(estimatePickValue([])).toBe("0.00");
    expect(estimatePickValue([{ quantity: "1", part: null }])).toBe("0.00");
  });
});

describe("picking slip history value", () => {
  beforeEach(() => { vi.clearAllMocks(); db.pickSlip.findMany.mockResolvedValue([slip("s1", "ACTIVE"), slip("s2", "CANCELLED")]); });

  it("people who can see cost prices get the estimated value; a cancelled slip has none", async () => {
    const result = await listPickSlips(ctxWith(["INVENTORY_VIEW_COST"]), { page: 1, pageSize: 50 } as never);
    expect(result.canViewCost).toBe(true);
    expect(result.items.map((i) => i.estimatedValue)).toEqual(["24.50", null]);
  });

  it("only company admins, managers and stock controllers see it", () => {
    const perms = new Set(["INVENTORY_VIEW_COST"]);
    for (const role of ["COMPANY_ADMIN", "MANAGER", "STORE_CONTROLLER"]) expect(canSeePickSlipValue({ tenantRole: role, tenantPermissions: perms })).toBe(true);
    for (const role of ["USER", "SALES", "FINANCE", "WIP_VIEWER"]) expect(canSeePickSlipValue({ tenantRole: role, tenantPermissions: perms })).toBe(false);
    expect(canSeePickSlipValue({ tenantRole: null, tenantPermissions: perms })).toBe(false);
    expect(canSeePickSlipValue({ tenantRole: "MANAGER", tenantPermissions: new Set() })).toBe(false);
  });

  it("another role (e.g. Finance) gets no value even with the cost permission", async () => {
    const result = await listPickSlips(ctxWith(["INVENTORY_VIEW_COST"], "FINANCE"), { page: 1, pageSize: 50 } as never);
    expect(result.canViewCost).toBe(false);
    expect(result.items.every((i) => i.estimatedValue === null)).toBe(true);
  });

  it("people without the cost permission get no value at all", async () => {
    const result = await listPickSlips(ctxWith([]), { page: 1, pageSize: 50 } as never);
    expect(result.canViewCost).toBe(false);
    expect(result.items.every((i) => i.estimatedValue === null)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("10.5");
  });

  it("reads the part's cost price with the lines", async () => {
    await listPickSlips(ctxWith(["INVENTORY_VIEW_COST"]), { page: 1, pageSize: 50 } as never);
    const arg = db.pickSlip.findMany.mock.calls[0][0] as { include: { lines: { include: { part: unknown } } } };
    expect(arg.include.lines.include.part).toEqual({ select: { defaultPurchaseCost: true } });
  });
});
