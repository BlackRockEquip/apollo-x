import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestContext } from "@/lib/auth/context-types";

// 2026-10-22 - un-scrapping a PEX unit, PEX Tracking leaving scrapped units out, and a scrapped unit staying scrapped when its
// return job's status changes.
type Args = { where?: Record<string, unknown>; data?: Record<string, unknown> };
const h = vi.hoisted(() => ({
  record: { current: null as Record<string, unknown> | null },
  update: vi.fn<(args: Args) => Promise<Record<string, unknown>>>(),
  notes: [] as Record<string, unknown>[],
  activities: [] as Record<string, unknown>[],
  trackingFindMany: vi.fn<(args: Args) => Promise<unknown[]>>(),
  trackingCount: vi.fn<(args: Args) => Promise<number>>(),
}));

vi.mock("@prisma/client", () => ({ Prisma: {} }));
vi.mock("@/lib/audit/service", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/master-data/service", () => ({ allocateDocumentNumberTx: vi.fn() }));
vi.mock("@/lib/prisma", () => {
  const tx = {
    pexRecord: { findFirst: async () => h.record.current, update: h.update },
    jobNote: { create: async ({ data }: { data: Record<string, unknown> }) => { h.notes.push(data); } },
    jobActivity: { create: async ({ data }: { data: Record<string, unknown> }) => { h.activities.push(data); } },
  };
  return {
    prisma: {
      $transaction: async (arg: unknown) => (typeof arg === "function" ? (arg as (t: typeof tx) => Promise<unknown>)(tx) : Promise.all(arg as Promise<unknown>[])),
      pexRecord: { findMany: h.trackingFindMany, count: h.trackingCount },
    },
  };
});

import { listPexTracking, syncPexStatusFromJobStatus, unscrapPexRecord } from "@/lib/pex/service";

const ctx = {
  userId: "u1",
  companyId: "c1",
  tenantPermissions: new Set(["PEX_STOCK_SCRAP", "PEX_TRACKING_VIEW"]),
  moduleAccess: new Map([["PEX_STOCK", "FULL"], ["PEX_TRACKING", "FULL"]]),
} as unknown as RequestContext;

function scrapped(over: Record<string, unknown>) {
  return { id: "p1", companyId: "c1", status: "SCRAPPED", supplyJobId: "s1", returnJobId: "r1", supplyJob: { id: "s1" }, returnJob: { id: "r1", status: "ASSEMBLY" }, ...over };
}

describe("un-scrap a PEX unit", () => {
  beforeEach(() => {
    h.notes.length = 0;
    h.activities.length = 0;
    h.update.mockReset().mockImplementation(async ({ data }) => ({ id: "p1", ...data }));
  });

  it("restores the status from the return job and logs it on both jobs", async () => {
    h.record.current = scrapped({});
    await unscrapPexRecord(ctx, "p1");
    expect(h.update.mock.calls[0][0].data).toMatchObject({ status: "IN_REPAIR", updatedById: "u1" });
    expect(h.notes).toHaveLength(1);
    expect(h.activities.map((a) => a.jobId).sort()).toEqual(["r1", "s1"]);
    expect(h.activities[0]).toMatchObject({ type: "PEX_UNIT_ALLOCATED_TO_INVENTORY" });
  });

  it("a completed return job puts the unit back on the shelf as Completed", async () => {
    h.record.current = scrapped({ returnJob: { id: "r1", status: "COMPLETE" } });
    await unscrapPexRecord(ctx, "p1");
    expect(h.update.mock.calls[0][0].data).toMatchObject({ status: "COMPLETED" });
  });

  it("falls back to Received (in a supply chain) or Completed (allocated directly) when the job status has no PEX equivalent", async () => {
    h.record.current = scrapped({ returnJob: { id: "r1", status: "CANCELLED" } });
    await unscrapPexRecord(ctx, "p1");
    expect(h.update.mock.calls[0][0].data).toMatchObject({ status: "RECEIVED" });

    h.update.mockClear();
    h.record.current = scrapped({ supplyJobId: null, supplyJob: null, returnJob: { id: "r1", status: "CANCELLED" } });
    await unscrapPexRecord(ctx, "p1");
    expect(h.update.mock.calls[0][0].data).toMatchObject({ status: "COMPLETED" });
  });

  it("refuses a unit that is not scrapped", async () => {
    h.record.current = scrapped({ status: "IN_REPAIR" });
    await expect(unscrapPexRecord(ctx, "p1")).rejects.toMatchObject({ code: "PEX_NOT_SCRAPPED" });
    expect(h.update).not.toHaveBeenCalled();
  });

  it("needs the scrap permission", async () => {
    h.record.current = scrapped({});
    const noPermission = { ...ctx, tenantPermissions: new Set(["PEX_TRACKING_VIEW"]) } as unknown as RequestContext;
    await expect(unscrapPexRecord(noPermission, "p1")).rejects.toThrow();
  });
});

describe("scrapped units stay out of the way", () => {
  beforeEach(() => {
    h.update.mockReset().mockResolvedValue({});
    h.trackingFindMany.mockReset().mockResolvedValue([]);
    h.trackingCount.mockReset().mockResolvedValue(0);
  });

  it("PEX Tracking leaves scrapped units out of the list and the cards", async () => {
    await listPexTracking(ctx, {});
    const wheres = [...h.trackingFindMany.mock.calls, ...h.trackingCount.mock.calls].map((call) => call[0].where).filter((where) => where && "companyId" in where); // (the by-id page load has no company filter of its own)
    expect(wheres.length).toBeGreaterThan(0);
    for (const where of wheres) expect(where).toMatchObject({ NOT: { status: { in: ["COMPLETED", "SCRAPPED"] } } });
  });

  it("a scrapped unit is not changed when its return job moves to another status", async () => {
    h.record.current = scrapped({});
    const tx = { pexRecord: { findFirst: async () => h.record.current, update: h.update } };
    await syncPexStatusFromJobStatus(tx as never, ctx, "c1", { id: "r1", deliveryDate: null }, "COMPLETE");
    expect(h.update).not.toHaveBeenCalled();
  });
});
