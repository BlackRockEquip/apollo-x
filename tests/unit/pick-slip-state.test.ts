import { beforeEach, describe, expect, it, vi } from "vitest";
import { pickSlipPickState, pickedUnitsBySlipLine, PICK_SLIP_STATE_LABELS } from "@/lib/inventory/pick-slip-state";

const T1 = "2026-11-01T08:00:00Z";
const T2 = "2026-11-02T08:00:00Z";

describe("pick slip picked / awaiting picking", () => {
  it("is awaiting picking until a part on the slip is marked received", () => {
    const lines = [{ id: "s1", createdAt: T1, jobPartLineId: "p1", quantity: "2" }, { id: "s2", createdAt: T1, jobPartLineId: "p2", quantity: "1" }];
    const parts = [{ id: "p1", status: "IN_STOCK", stockIssuedQuantity: null }, { id: "p2", status: "PICKED", stockIssuedQuantity: null }];
    const picked = pickedUnitsBySlipLine(lines, parts);
    expect(pickSlipPickState(lines, picked)).toEqual({ state: "AWAITING", pickedLines: 0, totalLines: 2 });
  });

  it("is partly picked when some lines are, and picked when all are", () => {
    const lines = [{ id: "s1", createdAt: T1, jobPartLineId: "p1", quantity: "2" }, { id: "s2", createdAt: T1, jobPartLineId: "p2", quantity: "1" }];
    const some = pickedUnitsBySlipLine(lines, [{ id: "p1", status: "RECEIVED", stockIssuedQuantity: "2" }, { id: "p2", status: "PICKED", stockIssuedQuantity: null }]);
    expect(pickSlipPickState(lines, some)).toEqual({ state: "PARTLY", pickedLines: 1, totalLines: 2 });
    const all = pickedUnitsBySlipLine(lines, [{ id: "p1", status: "RECEIVED", stockIssuedQuantity: "2" }, { id: "p2", status: "RECEIVED", stockIssuedQuantity: "1" }]);
    expect(pickSlipPickState(lines, all)).toEqual({ state: "PICKED", pickedLines: 2, totalLines: 2 });
  });

  it("counts a line only part taken off the shelf as partly picked", () => {
    const lines = [{ id: "s1", createdAt: T1, jobPartLineId: "p1", quantity: "4" }];
    const picked = pickedUnitsBySlipLine(lines, [{ id: "p1", status: "PARTIALLY_RECEIVED", stockIssuedQuantity: "1" }]);
    expect(pickSlipPickState(lines, picked)).toEqual({ state: "PARTLY", pickedLines: 0, totalLines: 1 });
  });

  it("treats a fully received line as picked even when it came from a supplier", () => {
    const lines = [{ id: "s1", createdAt: T1, jobPartLineId: "p1", quantity: "2" }];
    const picked = pickedUnitsBySlipLine(lines, [{ id: "p1", status: "RECEIVED", stockIssuedQuantity: null }]);
    expect(pickSlipPickState(lines, picked).state).toBe("PICKED");
  });

  it("gives the units taken off the shelf to the oldest slip first when a part is on two slips", () => {
    const lines = [
      { id: "new", createdAt: T2, jobPartLineId: "p1", quantity: "2" },
      { id: "old", createdAt: T1, jobPartLineId: "p1", quantity: "2" },
    ];
    const picked = pickedUnitsBySlipLine(lines, [{ id: "p1", status: "PARTIALLY_RECEIVED", stockIssuedQuantity: "2" }]);
    expect(pickSlipPickState([{ id: "old", quantity: "2" }], picked).state).toBe("PICKED");
    expect(pickSlipPickState([{ id: "new", quantity: "2" }], picked).state).toBe("AWAITING");
  });

  it("counts slips whose stock was taken when they were made as picked", () => {
    const lines = [
      { id: "legacy", createdAt: T1, jobPartLineId: "p1", quantity: "2", stockMovementId: "m1" },
      { id: "stocklevels", createdAt: T1, jobPartLineId: null, quantity: "1" },
    ];
    const picked = pickedUnitsBySlipLine(lines, [{ id: "p1", status: "PICKED", stockIssuedQuantity: null }]);
    expect(pickSlipPickState(lines, picked).state).toBe("PICKED");
  });

  it("goes back to awaiting picking if a receive is undone", () => {
    const lines = [{ id: "s1", createdAt: T1, jobPartLineId: "p1", quantity: "2" }];
    expect(pickSlipPickState(lines, pickedUnitsBySlipLine(lines, [{ id: "p1", status: "RECEIVED", stockIssuedQuantity: "2" }])).state).toBe("PICKED");
    expect(pickSlipPickState(lines, pickedUnitsBySlipLine(lines, [{ id: "p1", status: "PICKED", stockIssuedQuantity: null }])).state).toBe("AWAITING");
  });

  it("has plain labels", () => {
    expect(PICK_SLIP_STATE_LABELS).toEqual({ AWAITING: "Awaiting picking", PARTLY: "Partly picked", PICKED: "Picked" });
  });
});

const db = vi.hoisted(() => ({
  pickSlip: { findMany: vi.fn(async (_a?: unknown) => [] as unknown[]), count: vi.fn(async () => 2) },
  pickSlipLine: { findMany: vi.fn(async (_a?: unknown) => [] as unknown[]) },
  jobPartLine: { findMany: vi.fn(async (_a?: unknown) => [] as unknown[]) },
  part: { findMany: vi.fn(async () => [] as unknown[]) },
  partAlternateNumber: { findMany: vi.fn(async () => [] as unknown[]) },
  jobItem: { findMany: vi.fn(async () => [] as unknown[]) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@prisma/client", () => ({ Prisma: { Decimal: class { constructor(public v: unknown) {} } } }));
vi.mock("@/lib/audit/service", () => ({ recordAudit: vi.fn() }));

describe("listPickSlips adds the picked status", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("reads every live slip line on the same part lines and marks each slip", async () => {
    const { listPickSlips } = await import("@/lib/inventory/service");
    const line = (id: string, partLineId: string, qty: string) => ({ id, partId: "pt", partNumber: "P", description: "d", binLocationId: null, binLocation: null, quantity: { toString: () => qty }, createdAt: new Date(T1), jobPartLineId: partLineId, stockMovementId: null, part: { defaultPurchaseCost: null } });
    const slip = (id: string, lines: unknown[]) => ({ id, jobId: "j1", companyId: "c1", createdAt: new Date(T2), status: "ACTIVE", cancelledAt: null, cancelReason: null, job: { jobNumber: "10482", draftNumber: null, customer: null }, lines });
    db.pickSlip.findMany.mockResolvedValue([slip("slipB", [line("b1", "p2", "1")]), slip("slipA", [line("a1", "p1", "2")])]);
    db.pickSlipLine.findMany.mockResolvedValue([
      { id: "a1", createdAt: new Date(T1), jobPartLineId: "p1", quantity: 2, stockMovementId: null },
      { id: "b1", createdAt: new Date(T1), jobPartLineId: "p2", quantity: 1, stockMovementId: null },
    ]);
    db.jobPartLine.findMany.mockResolvedValue([
      { id: "p1", status: "RECEIVED", stockIssuedQuantity: 2 },
      { id: "p2", status: "PICKED", stockIssuedQuantity: null },
    ]);
    const ctx = { companyId: "c1", userId: "u1", displayName: "T", correlationId: "x", tenantPermissions: new Set(["INVENTORY_VIEW"]), moduleAccess: new Map([["INVENTORY", "FULL"], ["PICK_SLIPS", "FULL"]]), platformPermissions: new Set() } as never;
    const out = await listPickSlips(ctx, { page: 1, pageSize: 50, jobId: "j1" } as never);
    const byId = Object.fromEntries(out.items.map((i) => [i.id, i.pickState]));
    expect(byId).toEqual({ slipA: "PICKED", slipB: "AWAITING" });
    const where = (db.pickSlipLine.findMany.mock.calls[0][0] as { where: { jobPartLineId: { in: string[] }; pickSlip: { status: unknown } } }).where;
    expect(where.jobPartLineId.in.sort()).toEqual(["p1", "p2"]);
    expect(where.pickSlip.status).toEqual({ not: "CANCELLED" });
  });
});
