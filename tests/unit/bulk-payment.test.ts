import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/jobs/service", () => ({ changeJobStatus: vi.fn(), closeJob: vi.fn(), updateJob: vi.fn() }));
vi.mock("@/lib/pex/service", () => ({ allocateJobToPexInventory: vi.fn() }));
import { jobsBulkInput, bulkUpdateJobs } from "@/lib/jobs/bulk";
import { prisma } from "@/lib/prisma";
import { updateJob } from "@/lib/jobs/service";
describe("bulk payment input", () => {
  it("accepts po status and/or date, rejects empty", () => {
    expect(jobsBulkInput.parse({ action: "payment", jobIds: ["a"], purchaseOrderStatus: "PAID" }).action).toBe("payment");
    const d = jobsBulkInput.parse({ action: "payment", jobIds: ["a"], paymentDateReceived: "2026-10-30" }) as any;
    expect(d.paymentDateReceived.toISOString().slice(0, 10)).toBe("2026-10-30");
    expect((jobsBulkInput.parse({ action: "payment", jobIds: ["a"], paymentDateReceived: null }) as any).paymentDateReceived).toBeNull();
    expect(() => jobsBulkInput.parse({ action: "payment", jobIds: ["a"] })).toThrow();
    expect(() => jobsBulkInput.parse({ action: "payment", jobIds: ["a"], purchaseOrderStatus: "BOGUS" })).toThrow();
    expect(jobsBulkInput.parse({ action: "status", jobIds: ["a"], status: "COMPLETE" }).action).toBe("status");
  });
});

const ctx = (role = "COMPANY_ADMIN") => ({ companyId: "c1", userId: "u1", tenantRole: role, tenantPermissions: new Set(["JOBS_EDIT"]), moduleAccess: new Map([["JOBS_WIP", "FULL"]]), platformPermissions: new Set() }) as never;
describe("bulkUpdateJobs payment", () => {
  it("updates only what changes, skips the rest, and refuses a Mechanic", async () => {
    (prisma as any).job = { findMany: vi.fn().mockResolvedValue([
      { id: "a", jobNumber: "J1", draftNumber: "D1", status: "COMPLETE", purchaseOrderStatus: "AWAIT_PAYMENT", paymentDateReceived: null },
      { id: "b", jobNumber: "J2", draftNumber: "D2", status: "COMPLETE", purchaseOrderStatus: "PAID", paymentDateReceived: new Date("2026-10-30") },
    ]) };
    const result = await bulkUpdateJobs(ctx(), { action: "payment", jobIds: ["a", "b", "zz"], purchaseOrderStatus: "PAID", paymentDateReceived: "2026-10-30" });
    expect(result.succeeded.map((r) => r.jobId)).toEqual(["a"]);
    expect(result.skipped.map((r) => r.jobId)).toEqual(["b"]);
    expect(result.failed.map((r) => r.jobId)).toEqual(["zz"]);
    const call = (updateJob as any).mock.calls[0];
    expect(call[1]).toBe("a");
    expect(call[2].purchaseOrderStatus).toBe("PAID");
    expect(call[2].paymentDateReceived.toISOString().slice(0, 10)).toBe("2026-10-30");
    await expect(bulkUpdateJobs(ctx("USER"), { action: "payment", jobIds: ["a"], purchaseOrderStatus: "PAID" })).rejects.toThrow();
  });
});
