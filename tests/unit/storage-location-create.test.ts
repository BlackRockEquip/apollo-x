import { beforeEach, describe, expect, it, vi } from "vitest";

// 2026-10-26, user report: creating a storage location gave an error (blank "Display order" was sent as null).
const db = vi.hoisted(() => {
  const tx = {
    storageLocation: { findFirst: vi.fn(), create: vi.fn() },
    auditEvent: { create: vi.fn() },
  };
  return { tx, prisma: { $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) } };
});
vi.mock("@/lib/prisma", () => ({ prisma: db.prisma }));
vi.mock("@prisma/client", () => ({ Prisma: { Decimal: class {}, PrismaClientKnownRequestError: class extends Error {} } }));

import { locationInput } from "@/lib/master-data/validation";
import { createMaster } from "@/lib/master-data/service";
import { apiError } from "@/lib/http/errors";
import type { RequestContext } from "@/lib/auth/context-types";

const ctx = {
  companyId: "c1", userId: "u1", displayName: "T", correlationId: "x", tenantRole: "COMPANY_ADMIN",
  tenantPermissions: new Set(["STORAGE_LOCATIONS_CREATE"]), platformPermissions: new Set(), supportAccessId: null, supportMode: null,
  moduleAccess: new Map([["STORAGE", "FULL"]]),
} as unknown as RequestContext;

describe("locationInput display order", () => {
  const base = { code: "A1", name: "Shelf A1", type: "SHELF" };
  it("blank, missing or null display order means 0; a number is kept", () => {
    expect(locationInput.parse({ ...base, sortOrder: null }).sortOrder).toBe(0);
    expect(locationInput.parse(base).sortOrder).toBe(0);
    expect(locationInput.parse({ ...base, sortOrder: 7 }).sortOrder).toBe(7);
    expect(() => locationInput.parse({ ...base, sortOrder: -1 })).toThrow();
  });
});

describe("create storage location", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.tx.storageLocation.findFirst.mockResolvedValue(null);
    db.tx.storageLocation.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "l1", ...data }));
  });

  it("saves what the form sends with the display order left blank", async () => {
    const row = await createMaster(ctx, "storage-locations", { code: "a1", name: "Shelf A1", type: "SHELF", description: null, sortOrder: null, active: true });
    expect(row.id).toBe("l1");
    expect(db.tx.storageLocation.create.mock.calls[0][0].data).toMatchObject({ code: "a1", codeNormalized: "A1", sortOrder: 0, companyId: "c1" });
  });

  it("a code that is already taken gets a clear message; an inactive holder says so", async () => {
    db.tx.storageLocation.findFirst.mockResolvedValueOnce({ active: true });
    const err1 = await createMaster(ctx, "storage-locations", { code: "A1", name: "X", type: "BIN" }).catch((e) => e);
    expect(err1.message).toBe("LOCATION_CODE_EXISTS");
    expect((await apiError(err1).json()).error.message).toMatch(/already exists\. Use a different code/);
    db.tx.storageLocation.findFirst.mockResolvedValueOnce({ active: false });
    const err2 = await createMaster(ctx, "storage-locations", { code: "A1", name: "X", type: "BIN" }).catch((e) => e);
    expect((await apiError(err2).json()).error.message).toMatch(/inactive/);
    expect(db.tx.storageLocation.create).not.toHaveBeenCalled();
  });
});
