import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestContext } from "@/lib/auth/context-types";

// 2026-11-05, user request: saving on the job screen is slow. A save of a few fields should only do the work those fields need.
const h = vi.hoisted(() => ({
  jobFindFirst: vi.fn<(args: unknown) => Promise<unknown>>(),
  jobUpdate: vi.fn<(args: unknown) => Promise<unknown>>(),
  compFind: vi.fn<(args: unknown) => Promise<unknown>>(),
  compUpdate: vi.fn<(args: unknown) => Promise<unknown>>(),
  compCreate: vi.fn<(args: unknown) => Promise<unknown>>(),
  activityCreate: vi.fn<(args: unknown) => Promise<unknown>>(),
  pexCreate: vi.fn(), pexRedeploy: vi.fn(), pexDelivery: vi.fn(), pexUnit: vi.fn(), pexStatus: vi.fn(),
}));

vi.mock("@prisma/client", () => ({ Prisma: { sql: (...a: unknown[]) => a, join: (...a: unknown[]) => a } }));
vi.mock("@/lib/prisma", () => {
  const tx = { job: { update: h.jobUpdate }, jobComponent: { findFirst: h.compFind, update: h.compUpdate, create: h.compCreate }, jobActivity: { create: h.activityCreate } };
  return { prisma: { job: { findFirst: h.jobFindFirst }, $transaction: async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx) } };
});
vi.mock("@/lib/attachments/blob-store", () => ({ ensureJobFolder: vi.fn(), deleteStoredBlob: vi.fn(), readStoredBlob: vi.fn(), sanitizeSegment: (v: string) => v }));
vi.mock("@/lib/attachments/offload", () => ({ offloadJobAttachment: vi.fn(), offloadQuietly: vi.fn() }));
vi.mock("@/lib/notifications/service", () => ({ notifyAdminsAndManagers: vi.fn() }));
vi.mock("@/lib/email", () => ({ isCompanyEmailConfigured: vi.fn() }));
vi.mock("@/lib/audit/service", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/inventory/service", () => ({}));
vi.mock("@/lib/pex/service", () => ({
  createPexRecordForSupplyJob: h.pexCreate, syncPexRedeployment: h.pexRedeploy, syncPexAwaitCoreFromDeliveryDate: h.pexDelivery,
  syncPexUnitDescription: h.pexUnit, syncPexStatusFromJobStatus: h.pexStatus,
}));

import { updateJob } from "@/lib/jobs/service";

function ctx(role = "ADMIN"): RequestContext {
  return { userId: "u1", companyId: "c1", tenantRole: role, correlationId: "corr", tenantPermissions: new Set(["JOBS_EDIT"]), moduleAccess: new Map([["JOBS_WIP", "FULL"]]) } as unknown as RequestContext;
}

describe("updateJob does only the work a save needs", () => {
  beforeEach(() => {
    Object.values(h).forEach((fn) => fn.mockReset());
    h.jobFindFirst.mockResolvedValue({ id: "j1", type: "STANDARD_REPAIR", status: "TO_STRIP", stripMechanicId: null, buildMechanicId: null, salesRepresentativeId: null, component: "Gearbox", componentType: null, componentSerial: null, componentPartNumber: null, returnedUnrepaired: false, jobItems: [] });
    h.jobUpdate.mockResolvedValue({ id: "j1", type: "STANDARD_REPAIR", status: "TO_STRIP", component: "Gearbox", customerId: "c1", componentType: null, deliveryDate: null, previousJobNumber: null });
    h.compFind.mockResolvedValue(null);
    h.activityCreate.mockResolvedValue({});
  });

  it("looks the job up with a small select (no customer, contacts or addresses)", async () => {
    await updateJob(ctx(), "j1", { notes: "hello" });
    const args = h.jobFindFirst.mock.calls[0][0] as { select?: Record<string, unknown>; include?: unknown };
    expect(args.include).toBeUndefined();
    expect(args.select).toBeDefined();
    expect(Object.keys(args.select!)).not.toContain("customer");
  });

  it("a save of just the notes touches no component record and runs no PEX sync", async () => {
    await updateJob(ctx(), "j1", { notes: "hello" });
    expect(h.jobUpdate).toHaveBeenCalledTimes(1);
    expect((h.jobUpdate.mock.calls[0][0] as { data: Record<string, unknown> }).data).toMatchObject({ notes: "hello" });
    expect(h.compFind).not.toHaveBeenCalled();
    expect(h.compUpdate).not.toHaveBeenCalled();
    expect(h.compCreate).not.toHaveBeenCalled();
    for (const fn of [h.pexCreate, h.pexRedeploy, h.pexDelivery, h.pexUnit]) expect(fn).not.toHaveBeenCalled();
    expect(JSON.stringify(h.activityCreate.mock.calls[0][0])).toContain('"updatedFields":["notes"]');
  });

  it("each PEX sync runs when the save carries a field it reads", async () => {
    await updateJob(ctx(), "j1", { deliveryDate: "2026-11-05" });
    expect(h.pexCreate).toHaveBeenCalledTimes(1);
    expect(h.pexDelivery).toHaveBeenCalledTimes(1);
    expect(h.pexRedeploy).not.toHaveBeenCalled();
    expect(h.pexUnit).not.toHaveBeenCalled();

    Object.values(h).forEach((fn) => fn.mockClear());
    await updateJob(ctx(), "j1", { previousJobNumber: "BRE50" });
    expect(h.pexRedeploy).toHaveBeenCalledTimes(1);
    expect(h.pexDelivery).not.toHaveBeenCalled();

    Object.values(h).forEach((fn) => fn.mockClear());
    await updateJob(ctx(), "j1", { component: "Gearbox 2" });
    expect(h.pexUnit).toHaveBeenCalledTimes(1);
    expect(h.compFind).toHaveBeenCalledTimes(1);
    expect(h.compCreate).toHaveBeenCalledTimes(1);
  });

  it("a mechanic's save still only changes the notes", async () => {
    await updateJob(ctx("USER"), "j1", { notes: "n", machineSerial: "X", deliveryDate: "2026-11-05" });
    const data = (h.jobUpdate.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data).toMatchObject({ notes: "n" });
    expect(data).not.toHaveProperty("machineSerial");
    expect(h.pexDelivery).not.toHaveBeenCalled();
  });
});
