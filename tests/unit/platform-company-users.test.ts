import { beforeEach, describe, expect, it, vi } from "vitest";

const companyFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { company: { findUnique: (...a: unknown[]) => companyFindUnique(...a) } } }));

const core = {
  list: vi.fn(async () => [{ id: "m1" }]),
  editor: vi.fn(async () => ({ roles: [], tiles: [] })),
  create: vi.fn(async () => ({ id: "m2" })),
  update: vi.fn(async () => ({ id: "m1" })),
  reset: vi.fn(async () => ({ ok: true })),
  remove: vi.fn(async () => ({ ok: true, loginDisabled: false })),
};
vi.mock("@/lib/users/service", () => ({
  listTenantUsersCore: (...a: unknown[]) => (core.list as (...x: unknown[]) => unknown)(...a),
  getTenantUserEditorDataCore: (...a: unknown[]) => (core.editor as (...x: unknown[]) => unknown)(...a),
  createTenantUserCore: (...a: unknown[]) => (core.create as (...x: unknown[]) => unknown)(...a),
  updateTenantUserCore: (...a: unknown[]) => (core.update as (...x: unknown[]) => unknown)(...a),
  resetTenantUserSessionsCore: (...a: unknown[]) => (core.reset as (...x: unknown[]) => unknown)(...a),
  deleteTenantUserCore: (...a: unknown[]) => (core.remove as (...x: unknown[]) => unknown)(...a),
}));

import {
  addPlatformCompanyUser,
  getPlatformCompanyUserEditor,
  listPlatformCompanyUsers,
  removePlatformCompanyUser,
  resetPlatformCompanyUserSessions,
  updatePlatformCompanyUser,
} from "@/lib/platform/company-users-service";
import { allModuleKeys, filterUsers, missingTiles, moduleSummary, tileIsLocked, tileIsOn, toggleTile, userInitials, userStatus, type TileOption } from "@/lib/users/module-tiles";
import type { RequestContext } from "@/lib/auth/context-types";

function ctx(opts: { platform?: string[]; companyId?: string | null } = {}): RequestContext {
  return {
    userId: "p1", displayName: "Platform admin", companyId: opts.companyId ?? null, companyInternalCode: null, tenantRole: null,
    tenantPermissions: new Set() as never, platformPermissions: new Set(opts.platform ?? ["PLATFORM_TENANT_ADMINS_MANAGE"]) as never,
    supportAccessId: null, supportMode: null, moduleAccess: new Map() as never, correlationId: "c1",
  } as unknown as RequestContext;
}

describe("platform company users service", () => {
  beforeEach(() => { vi.clearAllMocks(); companyFindUnique.mockResolvedValue({ id: "co1", status: "ACTIVE" }); });

  it("lists the users and the editor data without a support session", async () => {
    const out = await listPlatformCompanyUsers(ctx(), "co1");
    expect(out.users).toEqual([{ id: "m1" }]);
    expect(core.list).toHaveBeenCalledWith("co1");
    expect(core.editor).toHaveBeenCalledWith("co1");
  });

  it("adds, edits, signs out and removes as a PLATFORM action on that company", async () => {
    await addPlatformCompanyUser(ctx(), "co1", { email: "a@b.co" });
    expect(core.create).toHaveBeenCalledWith(expect.objectContaining({ userId: "p1" }), "co1", "PLATFORM", { email: "a@b.co" });
    await updatePlatformCompanyUser(ctx(), "co1", "m1", { role: "USER" });
    expect(core.update).toHaveBeenCalledWith(expect.anything(), "co1", "PLATFORM", "m1", { role: "USER" });
    await resetPlatformCompanyUserSessions(ctx(), "co1", "m1");
    expect(core.reset).toHaveBeenCalledWith(expect.anything(), "co1", "PLATFORM", "m1");
    await removePlatformCompanyUser(ctx(), "co1", "m1");
    expect(core.remove).toHaveBeenCalledWith(expect.anything(), "co1", "PLATFORM", "m1");
  });

  it("needs the platform permission and a platform (not company) context", async () => {
    await expect(listPlatformCompanyUsers(ctx({ platform: [] }), "co1")).rejects.toThrow();
    await expect(addPlatformCompanyUser(ctx({ companyId: "co9" }), "co1", {})).rejects.toThrow("PLATFORM_CONTEXT_REQUIRED");
    expect(core.create).not.toHaveBeenCalled();
  });

  it("refuses an unknown company, and changes (but not viewing) for a deactivated one", async () => {
    companyFindUnique.mockResolvedValue(null);
    await expect(listPlatformCompanyUsers(ctx(), "nope")).rejects.toThrow("RESOURCE_NOT_FOUND");
    companyFindUnique.mockResolvedValue({ id: "co1", status: "SUSPENDED" });
    await expect(getPlatformCompanyUserEditor(ctx(), "co1", "m1")).resolves.toBeDefined();
    await expect(addPlatformCompanyUser(ctx(), "co1", {})).rejects.toThrow("COMPANY_NOT_ACTIVE");
    await expect(updatePlatformCompanyUser(ctx(), "co1", "m1", {})).rejects.toThrow("COMPANY_NOT_ACTIVE");
    await expect(removePlatformCompanyUser(ctx(), "co1", "m1")).rejects.toThrow("COMPANY_NOT_ACTIVE");
  });
});

const tile = (id: string, controllable: string[], extra: Partial<TileOption> = {}): TileOption => ({ id, label: id, note: "", core: false, moduleKeys: controllable, controllable, ...extra });

describe("module tiles on the user editor", () => {
  const jobs = tile("jobs", ["JOBS_WIP"]);
  const stock = tile("stock", ["INVENTORY"]);
  const pick = tile("pick", ["PICK_SLIPS"], { requires: ["jobs", "stock"], roleHas: false, permissionedKeys: [] });
  const core2 = tile("core", []);

  it("a tile is on when any of its modules is selected, and a tile with nothing to switch is always on and locked", () => {
    expect(tileIsOn(jobs, ["JOBS_WIP"])).toBe(true);
    expect(tileIsOn(jobs, [])).toBe(false);
    expect(tileIsLocked(core2)).toBe(true);
    expect(tileIsOn(core2, [])).toBe(true);
  });

  it("clicking a tile gives or takes away every module behind it; a locked tile does nothing", () => {
    const wide = tile("wide", ["JOB_KITS", "JOB_PARTS"]);
    expect(toggleTile(wide, ["JOBS_WIP"]).sort()).toEqual(["JOBS_WIP", "JOB_KITS", "JOB_PARTS"]);
    expect(toggleTile(wide, ["JOBS_WIP", "JOB_KITS", "JOB_PARTS"])).toEqual(["JOBS_WIP"]);
    expect(toggleTile(core2, ["X"])).toEqual(["X"]);
  });

  it("names the tiles a tile needs that are switched off", () => {
    expect(missingTiles(pick, [jobs, stock, pick], ["JOBS_WIP"]).map((t) => t.id)).toEqual(["stock"]);
    expect(missingTiles(pick, [jobs, stock, pick], ["JOBS_WIP", "INVENTORY"])).toEqual([]);
  });

  it("a new user starts with every switchable module", () => {
    expect(allModuleKeys([jobs, stock, core2]).sort()).toEqual(["INVENTORY", "JOBS_WIP"]);
    expect(allModuleKeys([], [{ moduleKey: "A" }, { moduleKey: "B" }, { moduleKey: "C" }])).toEqual(["A", "B"]);
  });

  it("summarises, initials and statuses read well", () => {
    expect(moduleSummary(0, 12)).toBe("No modules");
    expect(moduleSummary(1, 12)).toBe("1 module");
    expect(moduleSummary(5, 12)).toBe("5 modules");
    expect(moduleSummary(12, 12)).toBe("All 12 modules");
    expect(userInitials("Chris Maubane")).toBe("CM");
    expect(userInitials("michael")).toBe("M");
    expect(userInitials("  ")).toBe("?");
    expect(userStatus({ active: true, membershipStatus: "ACTIVE" })).toBe("active");
    expect(userStatus({ active: false, membershipStatus: "ACTIVE" })).toBe("disabled");
    expect(userStatus({ active: true, membershipStatus: "SUSPENDED" })).toBe("disabled");
  });

  it("filters by name or email, role and status", () => {
    const users = [
      { displayName: "Chris Maubane", email: "chris@x.co.za", role: "USER", active: true, membershipStatus: "ACTIVE" },
      { displayName: "Ann Admin", email: "ann@x.co.za", role: "COMPANY_ADMIN", active: true, membershipStatus: "ACTIVE" },
      { displayName: "Old Timer", email: "old@x.co.za", role: "USER", active: false, membershipStatus: "ACTIVE" },
    ];
    expect(filterUsers(users, { search: "CHRIS", role: "", status: "" })).toHaveLength(1);
    expect(filterUsers(users, { search: "x.co.za", role: "USER", status: "" })).toHaveLength(2);
    expect(filterUsers(users, { search: "", role: "", status: "disabled" }).map((u) => u.displayName)).toEqual(["Old Timer"]);
    expect(filterUsers(users, { search: "", role: "COMPANY_ADMIN", status: "active" })).toHaveLength(1);
  });
});
