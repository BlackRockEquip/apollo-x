import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ModuleKey, PrismaClient } from "@prisma/client";
import type { RequestContext } from "@/lib/auth/context-types";
import { DEFAULT_TENANT_PERMISSIONS } from "@/lib/auth/permissions";
import { AuthorizationError } from "@/lib/auth/guards";
import { createMaster } from "@/lib/master-data/service";
import {
  receiveStock,
  transferStock,
  issueStock,
  issueReservedStock,
  returnStock,
  adjustStock,
  reserveStock,
  releaseReservation,
  countCreate,
  countComplete,
  countApprove,
  countCancel,
  listInventoryPositions,
  listStockMovements,
  getInventoryDetail,
  getLocationDetail,
} from "@/lib/inventory/service";

const url = process.env.DATABASE_URL_TEST;
if (!url) throw new Error("DATABASE_URL_TEST is required");
const db = new PrismaClient({ datasources: { db: { url } } });
const suffix = `p3_${Date.now()}_${Math.random().toString(36).slice(2)}`;

let a = "",
  b = "",
  ua = "",
  ub = "";
let partA: { id: string } = { id: "" };
let locA1: { id: string } = { id: "" };
let locA2: { id: string } = { id: "" };

function ctx(
  companyId: string,
  userId: string,
  permissions = DEFAULT_TENANT_PERMISSIONS.COMPANY_ADMIN,
  moduleAccess = new Map(Object.values(ModuleKey).map((k) => [k, "FULL" as const])),
): RequestContext {
  return {
    userId,
    displayName: "P3 test",
    companyId,
    companyInternalCode: suffix,
    tenantRole: "COMPANY_ADMIN",
    tenantPermissions: new Set(permissions),
    platformPermissions: new Set(),
    supportAccessId: null,
    supportMode: null,
    moduleAccess,
    correlationId: suffix,
  };
}

beforeAll(async () => {
  const [ca, cb] = await Promise.all([
    db.company.create({ data: { internalCode: `A_${suffix}`, legalName: "Tenant A", settings: { create: {} } } }),
    db.company.create({ data: { internalCode: `B_${suffix}`, legalName: "Tenant B", settings: { create: {} } } }),
  ]);
  a = ca.id;
  b = cb.id;

  const [x, y] = await Promise.all([
    db.userIdentity.create({ data: { email: `a-${suffix}@test.local`, displayName: "A", passwordHash: "x" } }),
    db.userIdentity.create({ data: { email: `b-${suffix}@test.local`, displayName: "B", passwordHash: "x" } }),
  ]);
  ua = x.id;
  ub = y.id;

  partA = (await createMaster(ctx(a, ua), "parts", {
    partNumber: "PART-A",
    description: "Part A",
    unitOfMeasure: "EA",
    reorderMinimum: "5",
  })) as { id: string };

  locA1 = (await createMaster(ctx(a, ua), "storage-locations", {
    code: "BIN-A1",
    name: "Bin A1",
    type: "BIN",
  })) as { id: string };
  locA2 = (await createMaster(ctx(a, ua), "storage-locations", {
    code: "BIN-A2",
    name: "Bin A2",
    type: "BIN",
  })) as { id: string };
  await receiveStock(ctx(a, ua), { partId: partA.id, locationId: locA1.id, quantity: "100" });
});

afterAll(async () => {
  await db.$executeRaw`
    TRUNCATE TABLE "StockCountLine", "StockCount", "StockReservation", "StockMovement", "StockBalance" RESTART IDENTITY CASCADE
  `;
  for (const companyId of [a, b]) {
    await db.auditEvent.deleteMany({ where: { companyId } });
    await db.part.deleteMany({ where: { companyId } });
    await db.storageLocation.deleteMany({ where: { companyId } });
    await db.manufacturer.deleteMany({ where: { companyId } });
    await db.companySettings.deleteMany({ where: { companyId } });
    await db.documentNumberSequence.deleteMany({ where: { companyId } });
    await db.taxCode.deleteMany({ where: { companyId } });
    await db.commercialTerm.deleteMany({ where: { companyId } });
  }
  await db.company.deleteMany({ where: { id: { in: [a, b] } } });
  await db.userIdentity.deleteMany({ where: { id: { in: [ua, ub] } } });
  await db.$disconnect();
});

describe("Phase 3 inventory operations", () => {
  it("receives stock and updates the balance", async () => {
    const result = await receiveStock(ctx(a, ua), {
      partId: partA.id,
      locationId: locA2.id,
      quantity: "25",
    });
    expect(result.replayed).toBe(false);
    expect(result.quantityOnHand.toString()).toBe("25");

    const detail = await getInventoryDetail(ctx(a, ua), partA.id);
    const loc = detail.locations.find((l) => l.locationId === locA2.id);
    expect(loc).toBeDefined();
    expect(loc!.quantityOnHand).toBe("25");
  });

  it("transfers stock atomically between locations", async () => {
    const result = await transferStock(ctx(a, ua), {
      partId: partA.id,
      fromLocationId: locA1.id,
      toLocationId: locA2.id,
      quantity: "10",
    });
    expect(result.replayed).toBe(false);

    const detail = await getInventoryDetail(ctx(a, ua), partA.id);
    const from = detail.locations.find((l) => l.locationId === locA1.id)!;
    const to = detail.locations.find((l) => l.locationId === locA2.id)!;
    expect(from.quantityOnHand).toBe("90");
    expect(to.quantityOnHand).toBe("35");
  });

  it("issues stock and reduces on-hand", async () => {
    const result = await issueStock(ctx(a, ua), {
      partId: partA.id,
      locationId: locA1.id,
      quantity: "5",
      referenceType: "GENERAL",
    });
    expect(result.replayed).toBe(false);

    const detail = await getInventoryDetail(ctx(a, ua), partA.id);
    const from = detail.locations.find((l) => l.locationId === locA1.id)!;
    expect(from.quantityOnHand).toBe("85");
  });

  it("returns stock and restores on-hand", async () => {
    const issue = await issueStock(ctx(a, ua), {
      partId: partA.id,
      locationId: locA1.id,
      quantity: "5",
      referenceType: "GENERAL",
    });

    const result = await returnStock(ctx(a, ua), {
      partId: partA.id,
      locationId: locA1.id,
      quantity: "3",
      sourceMovementId: issue.movementId,
    });
    expect(result.replayed).toBe(false);

    const detail = await getInventoryDetail(ctx(a, ua), partA.id);
    const loc = detail.locations.find((l) => l.locationId === locA1.id)!;
    expect(loc.quantityOnHand).toBe("83");
  });

  it("adjusts stock in both directions", async () => {
    await adjustStock(ctx(a, ua), {
      partId: partA.id,
      locationId: locA1.id,
      direction: "IN",
      quantity: "2",
      reason: "Found in storeroom",
    });
    await adjustStock(ctx(a, ua), {
      partId: partA.id,
      locationId: locA1.id,
      direction: "OUT",
      quantity: "1",
      reason: "Damaged",
    });

    const detail = await getInventoryDetail(ctx(a, ua), partA.id);
    const loc = detail.locations.find((l) => l.locationId === locA1.id)!;
    expect(loc.quantityOnHand).toBe("84");
  });

  it("reserves and releases stock without touching on-hand", async () => {
    const reserve = await reserveStock(ctx(a, ua), {
      partId: partA.id,
      locationId: locA1.id,
      quantity: "4",
      referenceType: "GENERAL",
    });
    expect(reserve.replayed).toBe(false);

    const detailBefore = await getInventoryDetail(ctx(a, ua), partA.id);
    const locBefore = detailBefore.locations.find((l) => l.locationId === locA1.id)!;
    expect(locBefore.quantityOnHand).toBe("84");
    expect(locBefore.quantityReserved).toBe("4");
    expect(locBefore.quantityAvailable).toBe("80");

    await releaseReservation(ctx(a, ua), reserve.reservationId, { reason: "No longer needed" });

    const detailAfter = await getInventoryDetail(ctx(a, ua), partA.id);
    const locAfter = detailAfter.locations.find((l) => l.locationId === locA1.id)!;
    expect(locAfter.quantityReserved).toBe("0");
    expect(locAfter.quantityAvailable).toBe("84");
  });

  it("completes a stock count and applies reconciliation movements", async () => {
    const count = await countCreate(ctx(a, ua), {
      locationId: locA1.id,
      lines: [{ partId: partA.id, countedQuantity: "99", reason: "Found extra" }],
    });
    expect(count.countId).toBeTruthy();

    const complete = await countComplete(ctx(a, ua), count.countId, { notes: "Count done" });
    expect(complete.movementIds.length).toBe(1);

    const detail = await getInventoryDetail(ctx(a, ua), partA.id);
    const loc = detail.locations.find((l) => l.locationId === locA1.id)!;
    expect(loc.quantityOnHand).toBe("99");

    await countApprove(ctx(a, ua), count.countId);
  });

  it("records ledger movements for every mutation", async () => {
    const freshPart = (await createMaster(ctx(a, ua), "parts", {
      partNumber: `LEDGER-${suffix}`,
      description: "Ledger Part",
      unitOfMeasure: "EA",
    })) as { id: string };
    const freshLoc = (await createMaster(ctx(a, ua), "storage-locations", {
      code: `LEDGER-${suffix}`,
      name: "Ledger Bin",
      type: "BIN",
    })) as { id: string };

    await receiveStock(ctx(a, ua), { partId: freshPart.id, locationId: freshLoc.id, quantity: "50" });
    await transferStock(ctx(a, ua), { partId: freshPart.id, fromLocationId: freshLoc.id, toLocationId: locA1.id, quantity: "10" });
    await issueStock(ctx(a, ua), { partId: freshPart.id, locationId: freshLoc.id, quantity: "5", referenceType: "GENERAL" });
    const issue = await issueStock(ctx(a, ua), { partId: freshPart.id, locationId: freshLoc.id, quantity: "5", referenceType: "GENERAL" });
    await returnStock(ctx(a, ua), { partId: freshPart.id, locationId: freshLoc.id, quantity: "3", sourceMovementId: issue.movementId });
    await adjustStock(ctx(a, ua), { partId: freshPart.id, locationId: freshLoc.id, direction: "IN", quantity: "2", reason: "Found" });
    await adjustStock(ctx(a, ua), { partId: freshPart.id, locationId: freshLoc.id, direction: "OUT", quantity: "1", reason: "Damaged" });
    const reserve = await reserveStock(ctx(a, ua), { partId: freshPart.id, locationId: freshLoc.id, quantity: "4", referenceType: "GENERAL" });
    await releaseReservation(ctx(a, ua), reserve.reservationId, { reason: "Cancelled" });

    const count = await countCreate(ctx(a, ua), { locationId: freshLoc.id, lines: [{ partId: freshPart.id, countedQuantity: "35", reason: "Count" }] });
    await countComplete(ctx(a, ua), count.countId, { notes: "Done" });

    const movements = await listStockMovements(ctx(a, ua), { partId: freshPart.id, page: 1, pageSize: 100 });
    const types = new Set(movements.items.map((m) => m.movementType));
    expect(types.has("RECEIPT")).toBe(true);
    expect(types.has("TRANSFER")).toBe(true);
    expect(types.has("ISSUE")).toBe(true);
    expect(types.has("RETURN")).toBe(true);
    expect(types.has("ADJUSTMENT_IN")).toBe(true);
    expect(types.has("ADJUSTMENT_OUT")).toBe(true);
    expect(types.has("RESERVATION")).toBe(true);
    expect(types.has("RESERVATION_RELEASE")).toBe(true);
    expect(types.has("RECONCILIATION")).toBe(true);
  });

  it("consumes a reservation in parts and converts only when fully issued", async () => {
    const freshPart = (await createMaster(ctx(a, ua), "parts", {
      partNumber: `RSV-ISS-${suffix}`,
      description: "Reserved Issue Part",
      unitOfMeasure: "EA",
    })) as { id: string };
    const freshLoc = (await createMaster(ctx(a, ua), "storage-locations", {
      code: `RSVI-${suffix}`,
      name: "Reserved Issue Bin",
      type: "BIN",
    })) as { id: string };

    await receiveStock(ctx(a, ua), { partId: freshPart.id, locationId: freshLoc.id, quantity: "10" });
    const reserve = await reserveStock(ctx(a, ua), {
      partId: freshPart.id,
      locationId: freshLoc.id,
      quantity: "10",
      referenceType: "JOB",
      idempotencyKey: `reserve-foundation-${suffix}`,
    });

    const partial = await issueReservedStock(ctx(a, ua), reserve.reservationId, {
      partId: freshPart.id,
      locationId: freshLoc.id,
      quantity: "4",
      referenceType: "JOB",
      idempotencyKey: `issue-reserved-partial-${suffix}`,
    });
    expect(partial.replayed).toBe(false);

    let detail = await getInventoryDetail(ctx(a, ua), freshPart.id);
    let loc = detail.locations.find((l) => l.locationId === freshLoc.id)!;
    expect(loc.quantityOnHand).toBe("6");
    expect(loc.quantityReserved).toBe("6");
    expect(loc.quantityAvailable).toBe("0");

    let reservation = await db.stockReservation.findFirstOrThrow({ where: { id: reserve.reservationId, companyId: a } });
    expect(reservation.status).toBe("ACTIVE");
    expect(String(reservation.quantity)).toBe("10");

    await issueReservedStock(ctx(a, ua), reserve.reservationId, {
      partId: freshPart.id,
      locationId: freshLoc.id,
      quantity: "6",
      referenceType: "JOB",
      idempotencyKey: `issue-reserved-final-${suffix}`,
    });

    detail = await getInventoryDetail(ctx(a, ua), freshPart.id);
    loc = detail.locations.find((l) => l.locationId === freshLoc.id)!;
    expect(loc.quantityOnHand).toBe("0");
    expect(loc.quantityReserved).toBe("0");
    expect(loc.quantityAvailable).toBe("0");

    reservation = await db.stockReservation.findFirstOrThrow({ where: { id: reserve.reservationId, companyId: a } });
    expect(reservation.status).toBe("CONVERTED");
    expect(String(reservation.quantity)).toBe("10");

    const issueMovements = await db.stockMovement.findMany({
      where: { companyId: a, referenceType: "RESERVATION", referenceId: reserve.reservationId, movementType: "ISSUE" },
      orderBy: { occurredAt: "asc" },
    });
    expect(issueMovements).toHaveLength(2);
    expect(issueMovements.map((m) => String(m.quantity))).toEqual(["4", "6"]);
  });

  it("releases only the remaining reserved quantity after a partial issue", async () => {
    const freshPart = (await createMaster(ctx(a, ua), "parts", {
      partNumber: `RSV-REL-${suffix}`,
      description: "Reserved Release Part",
      unitOfMeasure: "EA",
    })) as { id: string };
    const freshLoc = (await createMaster(ctx(a, ua), "storage-locations", {
      code: `RSVR-${suffix}`,
      name: "Reserved Release Bin",
      type: "BIN",
    })) as { id: string };

    await receiveStock(ctx(a, ua), { partId: freshPart.id, locationId: freshLoc.id, quantity: "10" });
    const reserve = await reserveStock(ctx(a, ua), {
      partId: freshPart.id,
      locationId: freshLoc.id,
      quantity: "10",
      referenceType: "JOB",
    });
    await issueReservedStock(ctx(a, ua), reserve.reservationId, {
      partId: freshPart.id,
      locationId: freshLoc.id,
      quantity: "4",
      referenceType: "JOB",
    });

    const release = await releaseReservation(ctx(a, ua), reserve.reservationId, { reason: "Unused balance" });
    expect(release.movementId).toBeTruthy();

    const detail = await getInventoryDetail(ctx(a, ua), freshPart.id);
    const loc = detail.locations.find((l) => l.locationId === freshLoc.id)!;
    expect(loc.quantityOnHand).toBe("6");
    expect(loc.quantityReserved).toBe("0");
    expect(loc.quantityAvailable).toBe("6");

    const releaseMovement = await db.stockMovement.findFirstOrThrow({ where: { id: release.movementId! } });
    expect(String(releaseMovement.quantity)).toBe("6");

    const reservation = await db.stockReservation.findFirstOrThrow({ where: { id: reserve.reservationId, companyId: a } });
    expect(reservation.status).toBe("RELEASED");
    expect(String(reservation.quantity)).toBe("10");
  });

  it("rejects issuing more than the remaining reservation quantity", async () => {
    const freshPart = (await createMaster(ctx(a, ua), "parts", {
      partNumber: `RSV-LIMIT-${suffix}`,
      description: "Reserved Limit Part",
      unitOfMeasure: "EA",
    })) as { id: string };
    const freshLoc = (await createMaster(ctx(a, ua), "storage-locations", {
      code: `RSVL-${suffix}`,
      name: "Reserved Limit Bin",
      type: "BIN",
    })) as { id: string };
    await receiveStock(ctx(a, ua), { partId: freshPart.id, locationId: freshLoc.id, quantity: "10" });
    const reserve = await reserveStock(ctx(a, ua), { partId: freshPart.id, locationId: freshLoc.id, quantity: "10", referenceType: "JOB" });
    await issueReservedStock(ctx(a, ua), reserve.reservationId, { partId: freshPart.id, locationId: freshLoc.id, quantity: "4", referenceType: "JOB" });

    await expect(
      issueReservedStock(ctx(a, ua), reserve.reservationId, { partId: freshPart.id, locationId: freshLoc.id, quantity: "7", referenceType: "JOB" }),
    ).rejects.toThrow();
  });

  it("rejects reserved issue for wrong tenant and wrong part/location", async () => {
    const freshPart = (await createMaster(ctx(a, ua), "parts", {
      partNumber: `RSV-SCOPE-${suffix}`,
      description: "Reserved Scope Part",
      unitOfMeasure: "EA",
    })) as { id: string };
    const otherPart = (await createMaster(ctx(a, ua), "parts", {
      partNumber: `RSV-SCOPE-OTHER-${suffix}`,
      description: "Reserved Scope Part Other",
      unitOfMeasure: "EA",
    })) as { id: string };
    const freshLoc = (await createMaster(ctx(a, ua), "storage-locations", {
      code: `RSVS-${suffix}`,
      name: "Reserved Scope Bin",
      type: "BIN",
    })) as { id: string };
    await receiveStock(ctx(a, ua), { partId: freshPart.id, locationId: freshLoc.id, quantity: "10" });
    const reserve = await reserveStock(ctx(a, ua), { partId: freshPart.id, locationId: freshLoc.id, quantity: "5", referenceType: "JOB" });

    await expect(
      issueReservedStock(ctx(b, ub), reserve.reservationId, { partId: freshPart.id, locationId: freshLoc.id, quantity: "1", referenceType: "JOB" }),
    ).rejects.toThrow("NOT_FOUND");
    await expect(
      issueReservedStock(ctx(a, ua), reserve.reservationId, { partId: otherPart.id, locationId: freshLoc.id, quantity: "1", referenceType: "JOB" }),
    ).rejects.toThrow("NOT_FOUND");
    await expect(
      issueReservedStock(ctx(a, ua), reserve.reservationId, { partId: freshPart.id, locationId: locA2.id, quantity: "1", referenceType: "JOB" }),
    ).rejects.toThrow("NOT_FOUND");
  });

  it("replays duplicate reserved issue requests without double issuing", async () => {
    const freshPart = (await createMaster(ctx(a, ua), "parts", {
      partNumber: `RSV-IDEM-${suffix}`,
      description: "Reserved Idempotent Part",
      unitOfMeasure: "EA",
    })) as { id: string };
    const freshLoc = (await createMaster(ctx(a, ua), "storage-locations", {
      code: `RSVID-${suffix}`,
      name: "Reserved Idempotent Bin",
      type: "BIN",
    })) as { id: string };
    await receiveStock(ctx(a, ua), { partId: freshPart.id, locationId: freshLoc.id, quantity: "10" });
    const reserve = await reserveStock(ctx(a, ua), { partId: freshPart.id, locationId: freshLoc.id, quantity: "10", referenceType: "JOB" });

    const key = `idem-rsv-issue-${suffix}`;
    const first = await issueReservedStock(ctx(a, ua), reserve.reservationId, {
      partId: freshPart.id,
      locationId: freshLoc.id,
      quantity: "4",
      referenceType: "JOB",
      idempotencyKey: key,
    });
    const second = await issueReservedStock(ctx(a, ua), reserve.reservationId, {
      partId: freshPart.id,
      locationId: freshLoc.id,
      quantity: "4",
      referenceType: "JOB",
      idempotencyKey: key,
    });
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(first.movementId).toBe(second.movementId);
  });

  it("prevents concurrent reserved consumption from over-issuing or negative balances", async () => {
    const freshPart = (await createMaster(ctx(a, ua), "parts", {
      partNumber: `RSV-CON-${suffix}`,
      description: "Reserved Concurrent Part",
      unitOfMeasure: "EA",
    })) as { id: string };
    const freshLoc = (await createMaster(ctx(a, ua), "storage-locations", {
      code: `RSVC-${suffix}`,
      name: "Reserved Concurrent Bin",
      type: "BIN",
    })) as { id: string };
    await receiveStock(ctx(a, ua), { partId: freshPart.id, locationId: freshLoc.id, quantity: "10" });
    const reserve = await reserveStock(ctx(a, ua), { partId: freshPart.id, locationId: freshLoc.id, quantity: "10", referenceType: "JOB" });

    const results = await Promise.allSettled([
      issueReservedStock(ctx(a, ua), reserve.reservationId, { partId: freshPart.id, locationId: freshLoc.id, quantity: "6", referenceType: "JOB", idempotencyKey: `rsv-con-1-${suffix}` }),
      issueReservedStock(ctx(a, ua), reserve.reservationId, { partId: freshPart.id, locationId: freshLoc.id, quantity: "6", referenceType: "JOB", idempotencyKey: `rsv-con-2-${suffix}` }),
      issueReservedStock(ctx(a, ua), reserve.reservationId, { partId: freshPart.id, locationId: freshLoc.id, quantity: "6", referenceType: "JOB", idempotencyKey: `rsv-con-3-${suffix}` }),
    ]);

    const succeeded = results.filter((r): r is PromiseFulfilledResult<{ movementId: string; replayed: boolean }> => r.status === "fulfilled");
    expect(succeeded.length).toBeLessThanOrEqual(1);

    const detail = await getInventoryDetail(ctx(a, ua), freshPart.id);
    const loc = detail.locations.find((l) => l.locationId === freshLoc.id)!;
    expect(parseFloat(loc.quantityOnHand)).toBeGreaterThanOrEqual(0);
    expect(parseFloat(loc.quantityReserved)).toBeGreaterThanOrEqual(0);
    expect(parseFloat(loc.quantityAvailable)).toBeGreaterThanOrEqual(0);
  });

  it("derives correct stock states for active stocked parts", async () => {
    const freshPart = (await createMaster(ctx(a, ua), "parts", {
      partNumber: `STATE-${suffix}`,
      description: "State Part",
      unitOfMeasure: "EA",
      reorderMinimum: "5",
    })) as { id: string };
    const freshLoc = (await createMaster(ctx(a, ua), "storage-locations", {
      code: `STATE-${suffix}`,
      name: "State Bin",
      type: "BIN",
    })) as { id: string };

    await receiveStock(ctx(a, ua), { partId: freshPart.id, locationId: freshLoc.id, quantity: "10" });

    const positions = await listInventoryPositions(ctx(a, ua), {
      active: "all",
      q: "",
      stockState: "ALL",
      page: 1,
      pageSize: 100,
    });
    const pos = positions.items.find((p) => p.id === freshPart.id);
    expect(pos).toBeDefined();
    expect(pos!.stockState).toBe("IN_STOCK");
    expect(parseFloat(pos!.quantityAvailable)).toBeGreaterThan(0);
  });

  it("blocks cross-tenant reads and mutations", async () => {
    await expect(getInventoryDetail(ctx(b, ub), partA.id)).rejects.toThrow("NOT_FOUND");
    await expect(getLocationDetail(ctx(b, ub), locA1.id)).rejects.toThrow("NOT_FOUND");

    await expect(
      issueStock(ctx(b, ub), { partId: partA.id, locationId: locA1.id, quantity: "1", referenceType: "GENERAL" }),
    ).rejects.toThrow("NOT_FOUND");
    await expect(
      transferStock(ctx(b, ub), { partId: partA.id, fromLocationId: locA1.id, toLocationId: locA2.id, quantity: "1" }),
    ).rejects.toThrow("NOT_FOUND");
  });
});

describe("Phase 3 inventory concurrency", () => {
  it("prevents concurrent issues from overspending stock", async () => {
    const freshPart = (await createMaster(ctx(a, ua), "parts", {
      partNumber: `CONC-${suffix}`,
      description: "Concurrency Part",
      unitOfMeasure: "EA",
    })) as { id: string };
    const freshLoc = (await createMaster(ctx(a, ua), "storage-locations", {
      code: `CONC-${suffix}`,
      name: "Concurrency Bin",
      type: "BIN",
    })) as { id: string };

    await receiveStock(ctx(a, ua), { partId: freshPart.id, locationId: freshLoc.id, quantity: "10" });

    const results = await Promise.allSettled([
      issueStock(ctx(a, ua), { partId: freshPart.id, locationId: freshLoc.id, quantity: "6", referenceType: "GENERAL" }),
      issueStock(ctx(a, ua), { partId: freshPart.id, locationId: freshLoc.id, quantity: "6", referenceType: "GENERAL" }),
      issueStock(ctx(a, ua), { partId: freshPart.id, locationId: freshLoc.id, quantity: "6", referenceType: "GENERAL" }),
    ]);

    const succeeded = results.filter((r): r is PromiseFulfilledResult<{ movementId: string; replayed: boolean }> => r.status === "fulfilled");
    expect(succeeded.length).toBeLessThanOrEqual(1);

    const detail = await getInventoryDetail(ctx(a, ua), freshPart.id);
    const loc = detail.locations.find((l) => l.locationId === freshLoc.id)!;
    expect(loc.quantityOnHand).toBe("4");
    expect(parseFloat(loc.quantityAvailable)).toBeGreaterThanOrEqual(0);
  });

  it("prevents concurrent transfers from creating negative stock", async () => {
    const freshPart = (await createMaster(ctx(a, ua), "parts", {
      partNumber: `XFER-${suffix}`,
      description: "Transfer Part",
      unitOfMeasure: "EA",
    })) as { id: string };
    const from = (await createMaster(ctx(a, ua), "storage-locations", {
      code: `XFER-F-${suffix}`,
      name: "From",
      type: "BIN",
    })) as { id: string };
    const to = (await createMaster(ctx(a, ua), "storage-locations", {
      code: `XFER-T-${suffix}`,
      name: "To",
      type: "BIN",
    })) as { id: string };

    await receiveStock(ctx(a, ua), { partId: freshPart.id, locationId: from.id, quantity: "5" });

    const results = await Promise.allSettled([
      transferStock(ctx(a, ua), { partId: freshPart.id, fromLocationId: from.id, toLocationId: to.id, quantity: "4" }),
      transferStock(ctx(a, ua), { partId: freshPart.id, fromLocationId: from.id, toLocationId: to.id, quantity: "4" }),
    ]);

    const succeeded = results.filter((r): r is PromiseFulfilledResult<{ movementId: string; replayed: boolean }> => r.status === "fulfilled");
    expect(succeeded.length).toBeLessThanOrEqual(1);

    const detail = await getInventoryDetail(ctx(a, ua), freshPart.id);
    const fromLoc = detail.locations.find((l) => l.locationId === from.id)!;
    const toLoc = detail.locations.find((l) => l.locationId === to.id)!;
    expect(parseFloat(fromLoc.quantityOnHand)).toBeGreaterThanOrEqual(0);
    expect(toLoc.quantityOnHand).toBe("4");
  });

  it("prevents concurrent reservations from over-reserving", async () => {
    const freshPart = (await createMaster(ctx(a, ua), "parts", {
      partNumber: `RSV-${suffix}`,
      description: "Reserve Part",
      unitOfMeasure: "EA",
    })) as { id: string };
    const freshLoc = (await createMaster(ctx(a, ua), "storage-locations", {
      code: `RSV-${suffix}`,
      name: "Reserve Bin",
      type: "BIN",
    })) as { id: string };

    await receiveStock(ctx(a, ua), { partId: freshPart.id, locationId: freshLoc.id, quantity: "10" });

    const results = await Promise.allSettled([
      reserveStock(ctx(a, ua), { partId: freshPart.id, locationId: freshLoc.id, quantity: "6", referenceType: "GENERAL", idempotencyKey: `rsv-1-${suffix}` }),
      reserveStock(ctx(a, ua), { partId: freshPart.id, locationId: freshLoc.id, quantity: "6", referenceType: "GENERAL", idempotencyKey: `rsv-2-${suffix}` }),
      reserveStock(ctx(a, ua), { partId: freshPart.id, locationId: freshLoc.id, quantity: "6", referenceType: "GENERAL", idempotencyKey: `rsv-3-${suffix}` }),
    ]);

    const succeeded = results.filter((r): r is PromiseFulfilledResult<{ reservationId: string; movementId: string; replayed: boolean }> => r.status === "fulfilled");
    expect(succeeded.length).toBeLessThanOrEqual(1);

    const detail = await getInventoryDetail(ctx(a, ua), freshPart.id);
    const loc = detail.locations.find((l) => l.locationId === freshLoc.id)!;
    expect(parseFloat(loc.quantityReserved)).toBeGreaterThanOrEqual(0);
    expect(parseFloat(loc.quantityAvailable)).toBeGreaterThanOrEqual(0);
  });

  it("produces correct balances under concurrent receipt and issue", async () => {
    const freshPart = (await createMaster(ctx(a, ua), "parts", {
      partNumber: `MIX-${suffix}`,
      description: "Mixed Ops",
      unitOfMeasure: "EA",
    })) as { id: string };
    const freshLoc = (await createMaster(ctx(a, ua), "storage-locations", {
      code: `MIX-${suffix}`,
      name: "Mix Bin",
      type: "BIN",
    })) as { id: string };

    await receiveStock(ctx(a, ua), { partId: freshPart.id, locationId: freshLoc.id, quantity: "10" });

    await Promise.allSettled([
      issueStock(ctx(a, ua), { partId: freshPart.id, locationId: freshLoc.id, quantity: "4", referenceType: "GENERAL" }),
      issueStock(ctx(a, ua), { partId: freshPart.id, locationId: freshLoc.id, quantity: "4", referenceType: "GENERAL" }),
      receiveStock(ctx(a, ua), { partId: freshPart.id, locationId: freshLoc.id, quantity: "3" }),
      receiveStock(ctx(a, ua), { partId: freshPart.id, locationId: freshLoc.id, quantity: "5" }),
    ]);

    const detail = await getInventoryDetail(ctx(a, ua), freshPart.id);
    const loc = detail.locations.find((l) => l.locationId === freshLoc.id)!;
    const finalOnHand = parseFloat(loc.quantityOnHand);
    const finalReserved = parseFloat(loc.quantityReserved);
    expect(finalOnHand).toBeGreaterThanOrEqual(0);
    expect(finalReserved).toBeGreaterThanOrEqual(0);
    expect(finalOnHand + finalReserved).toBeLessThanOrEqual(10 + 8);
  });
});

describe("Phase 3 inventory idempotency", () => {
  it("replays a receipt without duplicating the ledger row", async () => {
    const key = `idem-receipt-${suffix}`;
    const first = await receiveStock(ctx(a, ua), {
      partId: partA.id,
      locationId: locA2.id,
      quantity: "1",
      idempotencyKey: key,
    });
    const second = await receiveStock(ctx(a, ua), {
      partId: partA.id,
      locationId: locA2.id,
      quantity: "1",
      idempotencyKey: key,
    });
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(first.movementId).toBe(second.movementId);
  });

  it("replays a transfer without duplicating the ledger row", async () => {
    const key = `idem-transfer-${suffix}`;
    const first = await transferStock(ctx(a, ua), {
      partId: partA.id,
      fromLocationId: locA1.id,
      toLocationId: locA2.id,
      quantity: "1",
      idempotencyKey: key,
    });
    const second = await transferStock(ctx(a, ua), {
      partId: partA.id,
      fromLocationId: locA1.id,
      toLocationId: locA2.id,
      quantity: "1",
      idempotencyKey: key,
    });
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(first.movementId).toBe(second.movementId);
  });

  it("replays an issue without duplicating the ledger row", async () => {
    const key = `idem-issue-${suffix}`;
    const first = await issueStock(ctx(a, ua), {
      partId: partA.id,
      locationId: locA1.id,
      quantity: "1",
      referenceType: "GENERAL",
      idempotencyKey: key,
    });
    const second = await issueStock(ctx(a, ua), {
      partId: partA.id,
      locationId: locA1.id,
      quantity: "1",
      referenceType: "GENERAL",
      idempotencyKey: key,
    });
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(first.movementId).toBe(second.movementId);
  });
});

describe("Phase 3 inventory permissions", () => {
  it("rejects inventory mutations without the required permission", async () => {
    const noPerms = new Set(DEFAULT_TENANT_PERMISSIONS.COMPANY_ADMIN);
    noPerms.delete("INVENTORY_RECEIVE");
    noPerms.delete("INVENTORY_TRANSFER");
    noPerms.delete("INVENTORY_ISSUE");
    noPerms.delete("INVENTORY_RETURN");
    noPerms.delete("INVENTORY_ADJUST");
    noPerms.delete("INVENTORY_RESERVE");
    noPerms.delete("INVENTORY_RELEASE_RESERVATION");
    noPerms.delete("INVENTORY_RECONCILE");

    await expect(
      receiveStock(ctx(a, ua, noPerms), { partId: partA.id, locationId: locA1.id, quantity: "1" }),
    ).rejects.toThrow(AuthorizationError);
    await expect(
      transferStock(ctx(a, ua, noPerms), { partId: partA.id, fromLocationId: locA1.id, toLocationId: locA2.id, quantity: "1" }),
    ).rejects.toThrow(AuthorizationError);
    await expect(
      issueStock(ctx(a, ua, noPerms), { partId: partA.id, locationId: locA1.id, quantity: "1", referenceType: "GENERAL" }),
    ).rejects.toThrow(AuthorizationError);
    await expect(
      returnStock(ctx(a, ua, noPerms), { partId: partA.id, locationId: locA1.id, quantity: "1" }),
    ).rejects.toThrow(AuthorizationError);
    await expect(
      adjustStock(ctx(a, ua, noPerms), { partId: partA.id, locationId: locA1.id, direction: "IN", quantity: "1", reason: "x" }),
    ).rejects.toThrow(AuthorizationError);
    await expect(
      reserveStock(ctx(a, ua, noPerms), { partId: partA.id, locationId: locA1.id, quantity: "1", referenceType: "GENERAL" }),
    ).rejects.toThrow(AuthorizationError);
  });
});

describe("Phase 3 inventory business rules", () => {
  it("rejects receipt with zero or negative quantity", async () => {
    await expect(
      receiveStock(ctx(a, ua), { partId: partA.id, locationId: locA1.id, quantity: "0" }),
    ).rejects.toThrow();
  });

  it("rejects issue when available stock is insufficient", async () => {
    await expect(
      issueStock(ctx(a, ua), { partId: partA.id, locationId: locA1.id, quantity: "999999", referenceType: "GENERAL" }),
    ).rejects.toThrow();
  });

  it("rejects transfer when source and destination are the same", async () => {
    await expect(
      transferStock(ctx(a, ua), { partId: partA.id, fromLocationId: locA1.id, toLocationId: locA1.id, quantity: "1" }),
    ).rejects.toThrow();
  });

  it("allows adjustment with short reason when called directly on the service", async () => {
    const result = await adjustStock(ctx(a, ua), {
      partId: partA.id,
      locationId: locA1.id,
      direction: "IN",
      quantity: "1",
      reason: "ok",
    });
    expect(result.movementId).toBeTruthy();
  });

  it("cancels an open stock count", async () => {
    const count = await countCreate(ctx(a, ua), {
      locationId: locA1.id,
      lines: [],
    });
    await countCancel(ctx(a, ua), count.countId, { notes: "Cancelled" });
  });
});
