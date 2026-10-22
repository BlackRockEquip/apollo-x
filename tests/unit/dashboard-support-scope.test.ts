import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestContext } from "@/lib/auth/context-types";

// 2026-10-22 - dashboard check. The Support page shows every company ticket to people who can manage users and only their own
// tickets to everyone else, so the dashboard's support numbers (the tickets card and the "support tickets opened" line) must
// follow the same rule or the card says 5 while the page shows 1.
const h = vi.hoisted(() => ({
  groupBy: vi.fn<(args: unknown) => Promise<unknown>>(),
  findMany: vi.fn<(args: unknown) => Promise<unknown>>(),
}));

vi.mock("@prisma/client", () => ({ Prisma: { sql: (...args: unknown[]) => args, join: (...args: unknown[]) => args } }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    userDashboardConfig: { findUnique: async () => null },
    supportTicket: { groupBy: h.groupBy, findMany: h.findMany },
  },
}));

import { getDashboardData } from "@/lib/dashboard/service";

function ctxWith(permissions: string[]): RequestContext {
  return {
    userId: "u1",
    companyId: "c1",
    tenantPermissions: new Set(["DASHBOARD_VIEW", ...permissions]),
    moduleAccess: new Map([["DASHBOARD", "FULL"], ["NOTIFICATIONS", "FULL"]]),
  } as unknown as RequestContext;
}

type TicketWhere = { companyId: string; tenantDeletedAt: null; status?: unknown; reportedById?: string };
const firstWhere = (mock: { mock: { calls: unknown[][] } }) => (mock.mock.calls[0][0] as { where: TicketWhere }).where;

describe("dashboard support ticket scope", () => {
  beforeEach(() => {
    h.groupBy.mockReset().mockResolvedValue([{ status: "OPEN", _count: { _all: 2 } }]);
    h.findMany.mockReset().mockResolvedValue([]);
  });

  it("counts only their own tickets for someone who cannot manage users", async () => {
    const result = await getDashboardData(ctxWith([]));

    expect(firstWhere(h.groupBy)).toMatchObject({ companyId: "c1", tenantDeletedAt: null, reportedById: "u1" });
    expect(firstWhere(h.findMany).reportedById).toBe("u1");
    expect(result.data.supportTickets).toEqual({ OPEN: 2 });
  });

  it("counts every company ticket for someone who can manage users", async () => {
    await getDashboardData(ctxWith(["USERS_MANAGE"]));

    expect(firstWhere(h.groupBy)).not.toHaveProperty("reportedById");
    expect(firstWhere(h.findMany)).not.toHaveProperty("reportedById");
  });
});
