import { describe, expect, it } from "vitest";
import type { RequestContext } from "@/lib/auth/context-types";
import { AuthorizationError, requireModule, requireTenantPermission, tenantWhere } from "@/lib/auth/guards";

function context(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    userId: "user-a", displayName: "Tenant A", companyId: "tenant-a", companyInternalCode: "TENANT_A",
    tenantRole: "COMPANY_ADMIN", tenantPermissions: new Set(["CUSTOMERS_VIEW", "SETTINGS_MANAGE"]),
    platformPermissions: new Set(), supportAccessId: null, supportMode: null,
    moduleAccess: new Map([["CUSTOMERS", "FULL"], ["DASHBOARD", "FULL"]]), correlationId: "test",
    ...overrides,
  };
}

describe("central authorization guards", () => {
  it("overwrites no tenant context from browser input", () => {
    expect(tenantWhere(context(), { id: "record-b" })).toEqual({ id: "record-b", companyId: "tenant-a" });
  });

  it("blocks writes in read-only entitlement grace", () => {
    expect(() => requireModule(context({ moduleAccess: new Map([["CUSTOMERS", "READ_ONLY"]]) }), "CUSTOMERS", "WRITE")).toThrow(AuthorizationError);
  });

  it("allows reads in read-only entitlement grace", () => {
    expect(() => requireModule(context({ moduleAccess: new Map([["CUSTOMERS", "READ_ONLY"]]) }), "CUSTOMERS", "READ")).not.toThrow();
  });

  it("blocks mutation permissions in read-only platform support", () => {
    expect(() => requireTenantPermission(context({ supportAccessId: "support-1", supportMode: "READ_ONLY" }), "SETTINGS_MANAGE")).toThrow(AuthorizationError);
  });
});
