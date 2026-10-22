import { describe, expect, it, vi } from "vitest";
import type { RequestContext } from "@/lib/auth/context-types";

// 2026-10-22 - Parts outstanding only counts from the job's Await outwork / parts stage upwards: the days-outstanding clock
// (outstandingSince) starts when the job reached that stage, not when the part line was added during quoting.
const h = vi.hoisted(() => {
  const line = (jobId: string, createdAt: string, orderedAt: string | null, jobCreatedAt: string) => ({
    jobId, status: "PENDING", quantity: 2, receivedQuantity: 0,
    orderedAt: orderedAt ? new Date(orderedAt) : null, createdAt: new Date(createdAt),
    orderedFromSupplier: null as null,
    job: { jobNumber: `J-${jobId}`, draftNumber: `D-${jobId}`, createdAt: new Date(jobCreatedAt) },
  });
  return {
    lines: [
      line("j1", "2026-09-20T08:00:00Z", null, "2026-09-01T08:00:00Z"), // typed in at quoting, job reached the stage on 15 Oct
      line("j2", "2026-09-30T08:00:00Z", null, "2026-10-10T08:00:00Z"), // no status history: counts from job creation
      line("j3", "2026-09-25T08:00:00Z", "2026-10-12T08:00:00Z", "2026-09-01T08:00:00Z"), // ordered after the job reached the stage
    ],
  };
});

vi.mock("@prisma/client", () => ({
  Prisma: {
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ text: strings.join("?"), values }),
    join: (values: unknown[]) => values,
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    jobPartLine: { findMany: async () => h.lines },
    jobRfqRequest: { findMany: async () => [] },
    $queryRaw: async () => [
      { jobId: "j1", since: new Date("2026-10-15T09:00:00Z") },
      { jobId: "j3", since: new Date("2026-10-01T09:00:00Z") },
    ],
  },
}));

import { listPartsOutstanding } from "@/lib/jobs/parts-outstanding";

const ctx = {
  userId: "u1",
  companyId: "c1",
  tenantPermissions: new Set(["JOBS_VIEW"]),
  moduleAccess: new Map([["JOBS_WIP", "FULL"], ["JOB_PARTS", "FULL"]]),
} as unknown as RequestContext;

describe("parts outstanding clock", () => {
  it("starts at the later of the line date and the date the job reached Await outwork / parts", async () => {
    const rows = await listPartsOutstanding(ctx);
    const since = Object.fromEntries(rows.map((row) => [row.jobId, row.outstandingSince]));
    expect(since.j1).toBe("2026-10-15T09:00:00.000Z");
    expect(since.j2).toBe("2026-10-10T08:00:00.000Z");
    expect(since.j3).toBe("2026-10-12T08:00:00.000Z");
  });
});
