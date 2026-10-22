import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestContext } from "@/lib/auth/context-types";

// 2026-10-22 - dashboard values: what each card counts. Runs the real getDashboardData against a stand-in for the database and
// checks the filters it asks for (completed = status Complete/Closed, Outstanding outwork = outwork only, open tickets only,
// no scrapped PEX units, ETA cards not hidden by a stale closedAt).
type Where = { where: Record<string, unknown> };
const h = vi.hoisted(() => ({
  doneAt: [] as string[],
  jobCount: vi.fn<(args: unknown) => Promise<number>>(),
  outworkCount: vi.fn<(args: unknown) => Promise<number>>(),
  pexGroupBy: vi.fn<(args: unknown) => Promise<unknown>>(),
  ticketGroupBy: vi.fn<(args: unknown) => Promise<unknown>>(),
}));

vi.mock("@prisma/client", () => ({
  Prisma: {
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ text: strings.join("?"), values }),
    join: (values: unknown[]) => values,
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    userDashboardConfig: { findUnique: async () => null },
    $queryRaw: async (query: { text: string }) => (query.text.includes('"doneAt"') ? h.doneAt.map((doneAt) => ({ doneAt: new Date(doneAt) })) : []),
    job: { groupBy: async () => [], findMany: async () => [], count: h.jobCount },
    outworkItem: { count: h.outworkCount },
    pexRecord: { groupBy: h.pexGroupBy },
    supportTicket: { groupBy: h.ticketGroupBy, findMany: async () => [] },
  },
}));

import { getDashboardData } from "@/lib/dashboard/service";

const ctx = {
  userId: "u1",
  companyId: "c1",
  tenantPermissions: new Set(["DASHBOARD_VIEW", "JOBS_VIEW", "PEX_TRACKING_VIEW", "USERS_MANAGE"]),
  moduleAccess: new Map([["DASHBOARD", "FULL"], ["JOBS_WIP", "FULL"], ["PEX_TRACKING", "FULL"], ["OUTWORK", "FULL"], ["NOTIFICATIONS", "FULL"]]),
} as unknown as RequestContext;

describe("dashboard values", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-22T10:00:00Z"));
    h.doneAt = [];
    h.jobCount.mockReset().mockResolvedValue(0);
    h.outworkCount.mockReset().mockResolvedValue(3);
    h.pexGroupBy.mockReset().mockResolvedValue([{ status: "RECEIVED", _count: { _all: 1 } }]);
    h.ticketGroupBy.mockReset().mockResolvedValue([{ status: "OPEN", _count: { _all: 2 } }]);
  });
  afterEach(() => vi.useRealTimers());

  it("counts completed jobs by their delivery/completion date this month and last month", async () => {
    h.doneAt = ["2026-10-05T00:00:00Z", "2026-10-20T00:00:00Z", "2026-09-15T00:00:00Z", "2026-08-30T00:00:00Z"];
    const { data } = await getDashboardData(ctx);
    expect(data.completedThisMonth).toMatchObject({ count: 2, previous: 1 });
    expect(data.completedThisMonth?.previousLabel).toMatch(/^Sep/);
  });

  it("Outstanding outwork counts outwork still out with the supplier, nothing else", async () => {
    const { data } = await getDashboardData(ctx);
    expect(data.outworkOutstanding).toBe(3);
    expect(h.outworkCount.mock.calls[0][0]).toEqual({ where: { companyId: "c1", status: "SENT_OUT" } });
  });

  it("support tickets exclude Resolved and Closed", async () => {
    await getDashboardData(ctx);
    const where = (h.ticketGroupBy.mock.calls[0][0] as Where).where;
    expect(where.status).toEqual({ notIn: ["RESOLVED", "CLOSED"] });
  });

  it("PEX units leave out Completed and Scrapped", async () => {
    await getDashboardData(ctx);
    const where = (h.pexGroupBy.mock.calls[0][0] as Where).where;
    expect(where.status).toEqual({ notIn: ["COMPLETED", "SCRAPPED"] });
  });

  it("ETA cards do not depend on closedAt (it is not cleared when a job is reopened)", async () => {
    await getDashboardData(ctx);
    const wheres = h.jobCount.mock.calls.map((call) => (call[0] as Where).where);
    expect(wheres.length).toBe(2);
    for (const where of wheres) expect(where).not.toHaveProperty("closedAt");
  });
});
