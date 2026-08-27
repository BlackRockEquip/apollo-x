import { describe, expect, it } from "vitest";
import { evaluateModuleAccess } from "@/lib/entitlements/policy";
import { BLACK_ROCK_INTERNAL_CODE } from "@/lib/constants";

const now = new Date("2026-08-26T10:00:00Z");

describe("module entitlement policy", () => {
  it("permanently grants Black Rock full module availability", () => {
    expect(evaluateModuleAccess({ companyInternalCode: BLACK_ROCK_INTERNAL_CODE, companyActive: true, module: "INVOICES", status: "EXPIRED", effectiveFrom: new Date("2020-01-01") }, now)).toBe("FULL");
  });

  it("does not bypass a suspended company", () => {
    expect(evaluateModuleAccess({ companyInternalCode: BLACK_ROCK_INTERNAL_CODE, companyActive: false, module: "INVENTORY" }, now)).toBe("DENIED");
  });

  it("grants external tenants read-only access during the 30-day grace period", () => {
    expect(evaluateModuleAccess({ companyInternalCode: "TENANT_A", companyActive: true, module: "QUOTES", status: "ACTIVE", effectiveFrom: new Date("2026-01-01"), expiresAt: new Date("2026-08-10"), gracePeriodDays: 30 }, now)).toBe("READ_ONLY");
  });

  it("denies external tenants after grace expires", () => {
    expect(evaluateModuleAccess({ companyInternalCode: "TENANT_A", companyActive: true, module: "QUOTES", status: "ACTIVE", effectiveFrom: new Date("2026-01-01"), expiresAt: new Date("2026-06-01"), gracePeriodDays: 30 }, now)).toBe("DENIED");
  });
});
