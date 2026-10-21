import { beforeEach, describe, expect, it, vi } from "vitest";

// 2026-10-21 - a printed pick slip listed parts in a different order from the Parts list. The queries behind the slip
// had no sort order; these tests pin the order down so it cannot drift again.
const db = vi.hoisted(() => {
  const tx = {
    jobActivity: { findMany: vi.fn(async () => []) },
    jobPartLine: { findMany: vi.fn(async () => []) },
  };
  return {
    tx,
    job: { findFirst: vi.fn() },
    jobPartLine: { findMany: vi.fn(async () => []) },
    pickSlip: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) },
    $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  };
});
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@prisma/client", () => ({ Prisma: { Decimal: class { constructor(public v: unknown) {} } } }));
vi.mock("@/lib/audit/service", () => ({ recordAudit: vi.fn() }));

import { createPickSlipForJob, listPickSlips, previewPickSlipForJob } from "@/lib/inventory/service";
import type { RequestContext } from "@/lib/auth/context-types";

const ctx = {
  companyId: "c1", userId: "u1", displayName: "T", correlationId: "x",
  tenantPermissions: new Set(["INVENTORY_ISSUE", "INVENTORY_VIEW"]),
  moduleAccess: new Map([["INVENTORY", "FULL"], ["PICK_SLIPS", "FULL"]]),
  platformPermissions: new Set(),
} as unknown as RequestContext;

describe("pick slip line order", () => {
  beforeEach(() => { vi.clearAllMocks(); db.job.findFirst.mockResolvedValue({ id: "j1", jobNumber: "J1", draftNumber: null, customer: null }); });

  it("creating a slip reads the job's part lines oldest first, like the Parts list", async () => {
    await createPickSlipForJob(ctx, "j1");
    const arg = db.jobPartLine.findMany.mock.calls[0][0] as { orderBy: unknown };
    expect(arg.orderBy).toEqual([{ createdAt: "asc" }, { id: "asc" }]);
  });

  it("the reserved-parts preview uses the same order", async () => {
    await previewPickSlipForJob(ctx, "j1");
    const arg = db.jobPartLine.findMany.mock.calls[0][0] as { orderBy: unknown };
    expect(arg.orderBy).toEqual([{ createdAt: "asc" }, { id: "asc" }]);
  });

  it("a saved slip's lines come back in Parts list order", async () => {
    await listPickSlips(ctx, { page: 1, pageSize: 10, jobId: "j1" } as never);
    const arg = db.pickSlip.findMany.mock.calls[0][0] as { include: { lines: { orderBy: unknown } } };
    expect(arg.include.lines.orderBy).toEqual([{ jobPartLine: { createdAt: "asc" } }, { createdAt: "asc" }, { id: "asc" }]);
  });
});
