import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { job: { findMany: (...args: unknown[]) => findMany(...args) } } }));

import { jobHref } from "@/lib/jobs/job-href";
import { canonicalJobPath, resolveJobRouteKey } from "@/lib/jobs/route-key";

describe("job address", () => {
  it("uses the job number, and the id only when there is no number yet", () => {
    expect(jobHref({ id: "cmvz7ovqv055d6x135i5hggxk", jobNumber: "BRE1182" })).toBe("/jobs/BRE1182");
    expect(jobHref({ id: "abc", jobNumber: null })).toBe("/jobs/abc");
    expect(jobHref({ id: "abc", jobNumber: "  " })).toBe("/jobs/abc");
    expect(jobHref({ id: "abc", jobNumber: "A B/1" })).toBe("/jobs/A%20B%2F1");
  });

  it("moves an id address (or a different spelling) to the job-number address, keeping the query", () => {
    const match = { id: "cmvz7", jobNumber: "BRE1182" };
    expect(canonicalJobPath(match, "cmvz7")).toBe("/jobs/BRE1182");
    expect(canonicalJobPath(match, "bre1182")).toBe("/jobs/BRE1182");
    expect(canonicalJobPath(match, "BRE1182")).toBeNull();
    expect(canonicalJobPath(match, "BRE1182")).toBeNull();
    expect(canonicalJobPath(match, "cmvz7", { tab: "parts", item: ["a", "b"], empty: undefined })).toBe("/jobs/BRE1182?tab=parts&item=a&item=b");
    expect(canonicalJobPath({ id: "x", jobNumber: null }, "x")).toBeNull();
  });
});

describe("resolveJobRouteKey", () => {
  beforeEach(() => findMany.mockReset());

  it("finds a job by its number or its id inside the company", async () => {
    findMany.mockResolvedValue([{ id: "cm1", jobNumber: "BRE1182" }]);
    expect(await resolveJobRouteKey("co1", "BRE1182")).toEqual({ id: "cm1", jobNumber: "BRE1182" });
    const where = findMany.mock.calls[0][0].where;
    expect(where.companyId).toBe("co1");
    expect(where.OR).toEqual([{ jobNumber: { equals: "BRE1182", mode: "insensitive" } }, { id: "BRE1182" }]);
  });

  it("decodes the address and prefers an exact job-number match", async () => {
    findMany.mockResolvedValue([{ id: "x", jobNumber: "OTHER" }, { id: "y", jobNumber: "A B" }]);
    expect(await resolveJobRouteKey("co1", "A%20B")).toEqual({ id: "y", jobNumber: "A B" });
  });

  it("returns null when nothing matches or the address is empty", async () => {
    findMany.mockResolvedValue([]);
    expect(await resolveJobRouteKey("co1", "nope")).toBeNull();
    expect(await resolveJobRouteKey("co1", "  ")).toBeNull();
  });
});
