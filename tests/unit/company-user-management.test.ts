import { describe, expect, it } from "vitest";
import { canManageCompanyUsers } from "@/lib/users/access";
import { SETTINGS_NAV_ITEMS } from "@/lib/settings-nav";

describe("company user management is for Flo X platform admins only", () => {
  it("allows changes only in a read-write support session", () => {
    expect(canManageCompanyUsers({ supportMode: "READ_WRITE" })).toBe(true);
    expect(canManageCompanyUsers({ supportMode: "READ_ONLY" })).toBe(false);
    expect(canManageCompanyUsers({ supportMode: null })).toBe(false);
  });

  it("hides the Users settings tab unless in a read-write support session", () => {
    const users = SETTINGS_NAV_ITEMS.find((item) => item.key === "users");
    expect(users?.supportWriteOnly).toBe(true);
  });
});
