import { describe, expect, it } from "vitest";
import { DEFAULT_TENANT_PERMISSIONS, mergePermissionOverrides } from "@/lib/auth/permissions";

describe("permission overrides", () => {
  it("can revoke an inherited permission and grant an exception", () => {
    const permissions = mergePermissionOverrides(DEFAULT_TENANT_PERMISSIONS.USER, [
      { permission: "JOBS_EDIT", allowed: false },
      { permission: "QUOTES_VIEW", allowed: true },
    ]);
    expect(permissions.has("JOBS_EDIT")).toBe(false);
    expect(permissions.has("QUOTES_VIEW")).toBe(true);
  });
});
