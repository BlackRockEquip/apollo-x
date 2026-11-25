import { describe, expect, it } from "vitest";
import { COMMISSIONS_OPT_IN, commissionsAllowedForMember, isOptInModule, optInRows } from "@/lib/commissions/access";
import { DEFAULT_TENANT_PERMISSIONS, userDisabledModules } from "@/lib/auth/permissions";
import { BUILDS, TILES, initialModuleKeys } from "@/lib/builds/definitions";
import { evaluateModuleAccess } from "@/lib/entitlements/policy";
import { allModuleKeys, tileBlockedForRole, type TileOption } from "@/lib/users/module-tiles";

const ON = [{ permission: COMMISSIONS_OPT_IN, allowed: true }];

describe("Commissions access: Company Admins with it switched on in their profile", () => {
  it("is off for a Company Admin until switched on for them", () => {
    expect(commissionsAllowedForMember({ role: "COMPANY_ADMIN", rows: [] })).toBe(false);
    expect(commissionsAllowedForMember({ role: "COMPANY_ADMIN", rows: ON })).toBe(true);
  });
  it("is never on for any other user type, even with the switch stored", () => {
    for (const role of ["MANAGER", "USER", "STORE_CONTROLLER", "SALES", "FINANCE", "WIP_VIEWER", "TESTING_TECHNICIAN"] as const) {
      expect(commissionsAllowedForMember({ role, rows: ON })).toBe(false);
    }
  });
  it("is never on in a platform support session", () => {
    expect(commissionsAllowedForMember({ role: "COMPANY_ADMIN", rows: ON, supportSession: true })).toBe(false);
  });
  it("a switched-off marker row does not count", () => {
    expect(commissionsAllowedForMember({ role: "COMPANY_ADMIN", rows: [{ permission: COMMISSIONS_OPT_IN, allowed: false }] })).toBe(false);
  });
  it("only stores the switch for a Company Admin who has Commissions selected", () => {
    expect(optInRows("COMPANY_ADMIN", ["COMMISSIONS", "JOBS_WIP"])).toEqual(ON);
    expect(optInRows("COMPANY_ADMIN", ["JOBS_WIP"])).toEqual([]);
    expect(optInRows("MANAGER", ["COMMISSIONS"])).toEqual([]);
  });
  it("the MODULE_ON marker is not read as a module switched off", () => {
    expect(userDisabledModules(ON).size).toBe(0);
  });
});

describe("Commissions permissions and module tile", () => {
  it("Company Admins hold the permissions; Managers and every other type do not", () => {
    expect(DEFAULT_TENANT_PERMISSIONS.COMPANY_ADMIN.has("COMMISSIONS_VIEW")).toBe(true);
    expect(DEFAULT_TENANT_PERMISSIONS.COMPANY_ADMIN.has("COMMISSIONS_EDIT")).toBe(true);
    for (const role of ["MANAGER", "USER", "STORE_CONTROLLER", "SALES", "FINANCE", "WIP_VIEWER", "TESTING_TECHNICIAN"] as const) {
      expect(DEFAULT_TENANT_PERMISSIONS[role].has("COMMISSIONS_VIEW")).toBe(false);
      expect(DEFAULT_TENANT_PERMISSIONS[role].has("COMMISSIONS_EDIT")).toBe(false);
    }
  });
  it("is a tile in both builds the platform admin can switch on and off, off for new companies", () => {
    expect(TILES.COMMISSIONS.modules).toEqual(["COMMISSIONS"]);
    expect(TILES.COMMISSIONS.core).toBeFalsy();
    expect(BUILDS.WORKSHOP.tiles).toContain("COMMISSIONS");
    expect(BUILDS.ENGINEERING.tiles).toContain("COMMISSIONS");
    expect(initialModuleKeys("WORKSHOP")).not.toContain("COMMISSIONS");
    expect(initialModuleKeys("ENGINEERING")).not.toContain("COMMISSIONS");
  });
  it("is licensed in full for Black Rock (each admin still has to switch it on)", () => {
    expect(evaluateModuleAccess({ companyInternalCode: "BLACK_ROCK_EQUIPMENT", companyActive: true, module: "COMMISSIONS" })).toBe("FULL");
  });
  it("is an opt-in module", () => {
    expect(isOptInModule("COMMISSIONS")).toBe(true);
    expect(isOptInModule("JOBS_WIP")).toBe(false);
  });
  it("user screens: blocked for non-admin types, and 'select all' leaves it off", () => {
    const tiles: TileOption[] = [
      { id: "JOBS", label: "Jobs", note: "", core: false, moduleKeys: ["JOBS_WIP"], controllable: ["JOBS_WIP"] },
      { id: "COMMISSIONS", label: "Commissions", note: "", core: false, moduleKeys: ["COMMISSIONS"], controllable: ["COMMISSIONS"], adminOnly: true },
    ];
    expect(tileBlockedForRole(tiles[1], "MANAGER")).toBe(true);
    expect(tileBlockedForRole(tiles[1], "COMPANY_ADMIN")).toBe(false);
    expect(tileBlockedForRole(tiles[0], "MANAGER")).toBe(false);
    expect(allModuleKeys(tiles)).toEqual(["JOBS_WIP"]);
  });
});
