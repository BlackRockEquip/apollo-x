import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestContext } from "@/lib/auth/context-types";

// 2026-10-22, user request: Machine make on a job - "if a manufacturer is not listed it adds to list".
const h = vi.hoisted(() => ({
  findFirst: vi.fn<(args: unknown) => Promise<unknown>>(),
  create: vi.fn<(args: unknown) => Promise<unknown>>(),
  auditCreate: vi.fn<(args: unknown) => Promise<unknown>>(),
}));

vi.mock("@prisma/client", () => ({ Prisma: { sql: (...a: unknown[]) => a, join: (...a: unknown[]) => a } }));
vi.mock("@/lib/prisma", () => {
  const tx = { manufacturer: { findFirst: h.findFirst, create: h.create }, auditEvent: { create: h.auditCreate } };
  return { prisma: { $transaction: async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx) } };
});
// jobs/service.ts pulls in a lot that is irrelevant here.
vi.mock("@/lib/attachments/blob-store", () => ({ ensureJobFolder: vi.fn(), deleteStoredBlob: vi.fn(), readStoredBlob: vi.fn(), sanitizeSegment: (v: string) => v }));
vi.mock("@/lib/attachments/offload", () => ({ offloadJobAttachment: vi.fn(), offloadQuietly: vi.fn() }));
vi.mock("@/lib/notifications/service", () => ({ notifyAdminsAndManagers: vi.fn() }));
vi.mock("@/lib/email", () => ({ isCompanyEmailConfigured: vi.fn() }));
vi.mock("@/lib/audit/service", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/pex/service", () => ({ createPexRecordForSupplyJob: vi.fn(), syncPexRedeployment: vi.fn(), syncPexStatusFromJobStatus: vi.fn(), syncPexAwaitCoreFromDeliveryDate: vi.fn(), syncPexUnitDescription: vi.fn() }));

import { addMachineMakeToManufacturers } from "@/lib/jobs/service";

function ctxWith(permissions: string[]): RequestContext {
  return { userId: "u1", companyId: "c1", correlationId: "corr", tenantPermissions: new Set(permissions), moduleAccess: new Map([["JOBS_WIP", "FULL"]]) } as unknown as RequestContext;
}

describe("addMachineMakeToManufacturers", () => {
  beforeEach(() => {
    h.findFirst.mockReset().mockResolvedValue(null);
    h.create.mockReset().mockResolvedValue({ id: "m1" });
    h.auditCreate.mockReset().mockResolvedValue({});
  });

  it("adds a make that is not in the manufacturers list", async () => {
    const result = await addMachineMakeToManufacturers(ctxWith(["JOBS_EDIT"]), { name: "  Caterpillar " });

    expect(result).toEqual({ created: true, name: "Caterpillar" });
    expect(h.findFirst.mock.calls[0][0]).toMatchObject({ where: { companyId: "c1", nameNormalized: "CATERPILLAR" } });
    expect(h.create.mock.calls[0][0]).toMatchObject({ data: { companyId: "c1", name: "Caterpillar", nameNormalized: "CATERPILLAR" } });
    expect(h.auditCreate.mock.calls[0][0]).toMatchObject({ data: { companyId: "c1", entityType: "manufacturers", action: "CREATE" } });
  });

  it("does nothing when the make is already listed, whatever the case (including a switched-off manufacturer)", async () => {
    h.findFirst.mockResolvedValue({ id: "existing" });
    const result = await addMachineMakeToManufacturers(ctxWith(["JOBS_EDIT"]), { name: "caterpillar" });
    expect(result.created).toBe(false);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("needs permission to edit jobs and a real name", async () => {
    await expect(addMachineMakeToManufacturers(ctxWith(["JOBS_VIEW"]), { name: "Komatsu" })).rejects.toThrow();
    await expect(addMachineMakeToManufacturers(ctxWith(["JOBS_EDIT"]), { name: "K" })).rejects.toThrow();
    expect(h.create).not.toHaveBeenCalled();
  });
});
