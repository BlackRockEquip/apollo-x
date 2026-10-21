import { beforeEach, describe, expect, it, vi } from "vitest";

// 2026-10-21 - adjusting stock down below the quantity reserved for jobs. Runs the real adjustStock against a small in-memory
// stand-in for the database (one bin, one reservation held by one job part line).
const h = vi.hoisted(() => {
  const state = {
    balance: { id: "b1", onHand: "3", reserved: "3", version: 1 },
    reservation: { id: "r1", companyId: "c1", partId: "p1", locationId: "l1", quantity: "3", status: "ACTIVE", referenceType: "JOB", referenceId: "line1", referenceNumber: "BRE1116", reason: null as string | null, notes: null as string | null, createdAt: new Date() },
    released: [] as string[],
    movements: [] as { movementType: string; quantity: string }[],
    line: { id: "line1", jobId: "j1", partNumber: "PN1", status: "PICKED", quantity: "3", orderedQuantity: null as null, stockIssuedQuantity: null as null, pickedQuantity: "3", job: { jobNumber: "BRE1116", draftNumber: null as null } },
    lineUpdates: [] as Record<string, unknown>[],
    activities: [] as Record<string, unknown>[],
  };
  return { state };
});

vi.mock("@prisma/client", async () => {
  const lib = await import("@prisma/client/runtime/library");
  return { Prisma: { Decimal: lib.Decimal, PrismaClientKnownRequestError: class extends Error {} } };
});
vi.mock("@/lib/audit/service", () => ({ recordAudit: vi.fn() }));

vi.mock("@/lib/prisma", () => {
  const s = h.state;
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray) => {
      const sql = strings.join("?");
      if (sql.includes('FROM "StockBalance"')) return [{ id: s.balance.id, on_hand: s.balance.onHand, reserved: s.balance.reserved, version: s.balance.version }];
      if (sql.includes('FROM "StockReservation"')) return [{ ...s.reservation }];
      if (sql.includes('FROM "StockMovement"')) return s.movements.map((m) => ({ movementType: m.movementType, quantity: m.quantity }));
      throw new Error(`unexpected SQL: ${sql}`);
    },
    part: { findFirst: async () => ({ id: "p1", partNumber: "PN1", active: true }) },
    storageLocation: { findFirst: async () => ({ id: "l1", active: true }) },
    stockMovement: {
      findFirst: async () => null,
      create: async ({ data }: { data: { movementType: string; quantity: { toString(): string } } }) => {
        s.movements.push({ movementType: data.movementType, quantity: data.quantity.toString() });
        return { id: `m${s.movements.length}` };
      },
    },
    stockBalance: {
      findMany: async () => [],
      update: async ({ data }: { data: { quantityOnHand: { toString(): string }; quantityReserved: { toString(): string } } }) => {
        s.balance.onHand = data.quantityOnHand.toString();
        s.balance.reserved = data.quantityReserved.toString();
        s.balance.version += 1;
      },
    },
    stockReservation: {
      // Real rows carry a Decimal quantity.
      findMany: async () => (s.reservation.status === "ACTIVE" ? [{ ...s.reservation, quantity: new (await import("@prisma/client/runtime/library")).Decimal(s.reservation.quantity) }] : []),
      update: async ({ data }: { data: { status: string } }) => { s.reservation.status = data.status; return { id: s.reservation.id }; },
    },
    jobPartLine: {
      findFirst: async () => ({ ...s.line, quantity: new (await import("@prisma/client/runtime/library")).Decimal(s.line.quantity), pickedQuantity: new (await import("@prisma/client/runtime/library")).Decimal(s.line.pickedQuantity) }),
      update: async ({ data }: { data: Record<string, unknown> }) => { s.lineUpdates.push(data); },
    },
    jobActivity: { create: async ({ data }: { data: Record<string, unknown> }) => { s.activities.push(data); } },
  };
  return { prisma: { $transaction: async (fn: (t: unknown) => unknown) => fn(tx), stockMovement: { findUnique: async () => null } } };
});

import { adjustStock } from "@/lib/inventory/service";
import type { RequestContext } from "@/lib/auth/context-types";

const ctx = {
  companyId: "c1", userId: "u1", displayName: "T", correlationId: "x",
  tenantPermissions: new Set(["INVENTORY_ADJUST"]),
  moduleAccess: new Map([["INVENTORY", "FULL"]]),
  platformPermissions: new Set(),
} as unknown as RequestContext;
const input = (over: Record<string, unknown> = {}) => ({ partId: "p1", locationId: "l1", direction: "OUT", quantity: "3", reason: "Physical count: none on shelf", ...over }) as never;

describe("adjusting stock below what is reserved for jobs", () => {
  beforeEach(() => {
    const s = h.state;
    s.balance = { id: "b1", onHand: "3", reserved: "3", version: 1 };
    s.reservation = { ...s.reservation, quantity: "3", status: "ACTIVE" };
    s.movements = [];
    s.line = { ...s.line, status: "PICKED", quantity: "3", pickedQuantity: "3" };
    s.lineUpdates = [];
    s.activities = [];
  });

  it("stops with a clear message that names the job when the release is not chosen", async () => {
    await expect(adjustStock(ctx, input())).rejects.toMatchObject({ code: "RESERVED_STOCK_SHORT" });
    await expect(adjustStock(ctx, input())).rejects.toThrow(/BRE1116/);
    expect(h.state.balance).toMatchObject({ onHand: "3", reserved: "3" });
    expect(h.state.activities).toHaveLength(0);
  });

  it("releases the reservation, sends the job line back to Pending and tells the job", async () => {
    const result = await adjustStock(ctx, input({ releaseReservations: true }));
    expect(result.replayed).toBe(false);
    expect(h.state.balance).toMatchObject({ onHand: "0", reserved: "0" });
    expect(h.state.reservation.status).toBe("RELEASED");
    expect(h.state.lineUpdates[0]).toMatchObject({ status: "PENDING" });
    expect(h.state.activities).toHaveLength(1);
    expect(h.state.activities[0]).toMatchObject({ type: "RESERVATION_RELEASED", jobId: "j1" });
    expect(String(h.state.activities[0].description)).toContain("Pending");
    expect(h.state.movements.map((m) => m.movementType)).toEqual(["RESERVATION_RELEASE", "ADJUSTMENT_OUT"]);
  });

  it("cuts the reservation by the shortfall when part of the stock is still there, and the short line goes Pending", async () => {
    h.state.balance = { id: "b1", onHand: "5", reserved: "3", version: 1 };
    await adjustStock(ctx, input({ quantity: "3", releaseReservations: true }));
    // 5 - 3 = 2 on hand: 1 of the 3 reserved had to go. The line needs 3 but only 2 are left, so it goes Pending and a
    // Pending line holds nothing - the 2 on the shelf are free again.
    expect(h.state.balance).toMatchObject({ onHand: "2", reserved: "0" });
    expect(h.state.lineUpdates[0]).toMatchObject({ status: "PENDING" });
    expect(h.state.movements.filter((m) => m.movementType === "RESERVATION_RELEASE").map((m) => m.quantity)).toEqual(["1", "2"]);
  });

  it("an ordinary decrease that leaves the reservation covered is untouched", async () => {
    h.state.balance = { id: "b1", onHand: "5", reserved: "3", version: 1 };
    await adjustStock(ctx, input({ quantity: "2" }));
    expect(h.state.balance).toMatchObject({ onHand: "3", reserved: "3" });
    expect(h.state.activities).toHaveLength(0);
    expect(h.state.movements.map((m) => m.movementType)).toEqual(["ADJUSTMENT_OUT"]);
  });

  it("never lets on-hand go negative, even with the release chosen", async () => {
    h.state.balance = { id: "b1", onHand: "1", reserved: "0", version: 1 };
    await expect(adjustStock(ctx, input({ quantity: "2", releaseReservations: true }))).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
  });
});
