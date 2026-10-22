import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestContext } from "@/lib/auth/context-types";

// 2026-10-22 - PEX Stock > Scrapped jobs tab: lists SCRAPPED units with when / who / why taken from the scrap entry on the job.
type FindManyArgs = { where: Record<string, unknown>; orderBy: unknown[]; skip: number; take: number };
const h = vi.hoisted(() => ({
  findMany: vi.fn<(args: FindManyArgs) => Promise<unknown[]>>(),
  count: vi.fn<(args: unknown) => Promise<number>>(),
  activityFindMany: vi.fn<(args: unknown) => Promise<unknown[]>>(),
}));

vi.mock("@prisma/client", () => ({ Prisma: {} }));
vi.mock("@/lib/audit/service", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/master-data/service", () => ({ allocateDocumentNumberTx: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
    pexRecord: { findMany: h.findMany, count: h.count },
    jobActivity: { findMany: h.activityFindMany },
  },
}));

import { listPexScrapped } from "@/lib/pex/service";

const ctx = {
  userId: "u1",
  companyId: "c1",
  tenantPermissions: new Set(["PEX_STOCK_VIEW"]),
  moduleAccess: new Map([["PEX_STOCK", "FULL"]]),
} as unknown as RequestContext;

const updatedAt = new Date("2026-10-01T08:00:00Z");

describe("PEX Stock - scrapped jobs", () => {
  beforeEach(() => {
    h.findMany.mockReset().mockResolvedValue([
      { id: "p1", returnJobId: "r1", supplyJobId: "s1", unitDescription: "Gearbox", updatedAt },
      { id: "p2", returnJobId: "r2", supplyJobId: null, unitDescription: "Pump", updatedAt },
    ]);
    h.count.mockReset().mockResolvedValue(2);
    h.activityFindMany.mockReset().mockResolvedValue([
      // newest first; the same scrap is logged on the return job and the supply job
      { createdAt: new Date("2026-10-10T09:00:00Z"), metadata: { pexId: "p1", reason: "Cracked housing" }, actor: { displayName: "Sam Store" } },
      { createdAt: new Date("2026-10-10T09:00:00Z"), metadata: { pexId: "p1", reason: "Cracked housing" }, actor: { displayName: "Sam Store" } },
    ]);
  });

  it("asks only for this company's SCRAPPED units, newest first with a stable tie-break", async () => {
    await listPexScrapped(ctx, {});
    const args = h.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ companyId: "c1", status: "SCRAPPED" });
    expect(args.orderBy).toEqual([{ updatedAt: "desc" }, { id: "asc" }]);
  });

  it("adds when, who and why from the scrap entry, and falls back to the last update", async () => {
    const result = await listPexScrapped(ctx, {});
    const [p1, p2] = result.items as Array<{ id: string; scrappedAt: Date; scrappedBy: string | null; reason: string | null }>;
    expect(p1).toMatchObject({ id: "p1", scrappedBy: "Sam Store", reason: "Cracked housing" });
    expect(p1.scrappedAt).toEqual(new Date("2026-10-10T09:00:00Z"));
    expect(p2).toMatchObject({ id: "p2", scrappedBy: null, reason: null });
    expect(p2.scrappedAt).toEqual(updatedAt);
    expect(result.total).toBe(2);
  });

  it("searches unit, job numbers and machine make/model", async () => {
    await listPexScrapped(ctx, { q: "gear" });
    const where = h.findMany.mock.calls[0][0].where as { OR: unknown[] };
    expect(where.OR).toHaveLength(5);
  });
});
