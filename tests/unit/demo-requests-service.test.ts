import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn(), count = vi.fn(), findUnique = vi.fn(), update = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { demoRequest: { findMany: (...a: unknown[]) => findMany(...a), count: (...a: unknown[]) => count(...a), findUnique: (...a: unknown[]) => findUnique(...a), update: (...a: unknown[]) => update(...a) } } }));

import { countDemoRequests, listDemoRequests, newDemoRequestCountSafe, setDemoRequestStatus } from "@/lib/platform/demo-requests-service";
import type { RequestContext } from "@/lib/auth/context-types";

const ctx = (permissions: string[], companyId: string | null = null) => ({ displayName: "Pat Admin", companyId, platformPermissions: new Set(permissions) }) as unknown as RequestContext;
const row = { id: "d1", name: "Anna", email: "a@b.co", company: null, phone: null, businessType: null, message: null, status: "NEW" as const, createdAt: new Date("2026-10-19T10:00:00Z"), movedToHistoryAt: null, movedToHistoryBy: null };

beforeEach(() => { findMany.mockReset(); count.mockReset(); findUnique.mockReset(); update.mockReset(); });

describe("demo requests screen", () => {
  it("lists New or History for platform staff and returns plain text dates", async () => {
    findMany.mockResolvedValue([row]);
    const result = await listDemoRequests(ctx(["PLATFORM_SUPPORT_READ"]), "NEW");
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: "NEW" } }));
    expect(result[0].createdAt).toBe("2026-10-19T10:00:00.000Z");
  });
  it("is not available to people without platform support access, or inside a company", async () => {
    await expect(listDemoRequests(ctx([]), "NEW")).rejects.toThrow();
    await expect(listDemoRequests(ctx(["PLATFORM_SUPPORT_READ"], "company1"), "NEW")).rejects.toThrow("PLATFORM_CONTEXT_REQUIRED");
    await expect(countDemoRequests(ctx([]))).rejects.toThrow();
    expect(findMany).not.toHaveBeenCalled();
  });
  it("moves a request to history, recording who and when, and back to New clears that", async () => {
    findUnique.mockResolvedValue({ id: "d1" });
    update.mockResolvedValue({ ...row, status: "HISTORY", movedToHistoryAt: new Date("2026-10-19T11:00:00Z"), movedToHistoryBy: "Pat Admin" });
    await setDemoRequestStatus(ctx(["PLATFORM_SUPPORT_WRITE"]), "d1", { status: "HISTORY" });
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: "d1" }, data: expect.objectContaining({ status: "HISTORY", movedToHistoryBy: "Pat Admin", movedToHistoryAt: expect.any(Date) }) }));
    update.mockResolvedValue(row);
    await setDemoRequestStatus(ctx(["PLATFORM_SUPPORT_WRITE"]), "d1", { status: "NEW" });
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { status: "NEW", movedToHistoryAt: null, movedToHistoryBy: null } }));
  });
  it("needs write access, a valid status and an existing request", async () => {
    await expect(setDemoRequestStatus(ctx(["PLATFORM_SUPPORT_READ"]), "d1", { status: "HISTORY" })).rejects.toThrow();
    await expect(setDemoRequestStatus(ctx(["PLATFORM_SUPPORT_WRITE"]), "d1", { status: "DELETED" })).rejects.toThrow();
    findUnique.mockResolvedValue(null);
    await expect(setDemoRequestStatus(ctx(["PLATFORM_SUPPORT_WRITE"]), "missing", { status: "HISTORY" })).rejects.toThrow("NOT_FOUND");
    expect(update).not.toHaveBeenCalled();
  });
  it("the sidebar count never breaks the page", async () => {
    count.mockRejectedValue(new Error("table missing"));
    expect(await newDemoRequestCountSafe(ctx(["PLATFORM_SUPPORT_READ"]))).toBe(0);
    expect(await newDemoRequestCountSafe(ctx([]))).toBe(0);
    count.mockResolvedValue(3);
    expect(await newDemoRequestCountSafe(ctx(["PLATFORM_SUPPORT_READ"]))).toBe(3);
  });
});
