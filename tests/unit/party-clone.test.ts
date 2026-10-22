import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestContext } from "@/lib/auth/context-types";

// 2026-10-22, user request: clone a supplier to a customer (and a customer to a supplier) from the Suppliers / Customers pages.
const h = vi.hoisted(() => {
  const fn = () => vi.fn<(args: unknown) => Promise<unknown>>();
  return {
    customerFindFirst: fn(), customerCreate: fn(), customerAddressCreate: fn(), customerContactCreate: fn(),
    supplierFindFirst: fn(), supplierCreate: fn(), supplierAddressCreate: fn(), supplierContactCreate: fn(),
    auditCreate: fn(),
  };
});

vi.mock("@prisma/client", () => ({ Prisma: { sql: (...a: unknown[]) => a, join: (...a: unknown[]) => a, Decimal: class {} } }));
vi.mock("@/lib/prisma", () => {
  const tx = {
    customer: { findFirst: h.customerFindFirst, create: h.customerCreate },
    customerAddress: { create: h.customerAddressCreate },
    customerContact: { create: h.customerContactCreate },
    supplier: { findFirst: h.supplierFindFirst, create: h.supplierCreate },
    supplierAddress: { create: h.supplierAddressCreate },
    supplierContact: { create: h.supplierContactCreate },
    auditEvent: { create: h.auditCreate },
  };
  return { prisma: { $transaction: async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx) } };
});

import { clonePartyToOtherKind } from "@/lib/master-data/service";

function ctxWith(permissions: string[], modules: Array<[string, string]> = [["CUSTOMERS", "FULL"], ["SUPPLIERS", "FULL"]]): RequestContext {
  return { userId: "u1", companyId: "c1", tenantPermissions: new Set(permissions), moduleAccess: new Map(modules) } as unknown as RequestContext;
}
const ALL = ["CUSTOMERS_VIEW", "CUSTOMERS_CREATE", "SUPPLIERS_VIEW", "SUPPLIERS_CREATE"];

const supplierRow = {
  name: "Acme Hydraulics", accountCode: "AC01", registrationNumber: "2001/1", vatNumber: "4123", mainTelephone: "011", mainEmail: "a@acme.test",
  website: "acme.test", notes: "n", paymentTermId: "pt1", currencyCode: "ZAR",
  contacts: [{ firstName: "Jo", lastName: "Smith", position: "Buyer", telephone: null, mobile: "082", email: "jo@acme.test", notes: null, isPrimary: true }],
  addresses: [{ type: "BILLING", label: null, line1: "1 Main Rd", line2: null, city: "Joburg", province: "GP", postalCode: "2000", countryCode: "ZA", isPrimary: true }],
};

describe("clonePartyToOtherKind", () => {
  beforeEach(() => {
    for (const m of Object.values(h)) m.mockReset().mockResolvedValue(null);
    h.supplierFindFirst.mockImplementation(async (args) => ((args as { where: { id?: string } }).where.id ? supplierRow : null));
    h.customerCreate.mockResolvedValue({ id: "newC", name: "Acme Hydraulics" });
    h.supplierCreate.mockResolvedValue({ id: "newS", name: "Acme Hydraulics" });
    h.customerAddressCreate.mockResolvedValue({ id: "a1" });
    h.customerContactCreate.mockResolvedValue({ id: "k1" });
  });

  it("copies a supplier, its address and contacts into a new customer and leaves the supplier alone", async () => {
    const result = await clonePartyToOtherKind(ctxWith(ALL), "suppliers", "s1");

    expect(result).toMatchObject({ id: "newC", kind: "customers", contacts: 1, addresses: 1 });
    expect(h.customerCreate.mock.calls[0][0]).toMatchObject({ data: { companyId: "c1", name: "Acme Hydraulics", nameNormalized: "ACME HYDRAULICS", accountCode: "AC01", accountCodeNormalized: "AC01", vatNumber: "4123", paymentTermId: "pt1", currencyCode: "ZAR" } });
    expect(h.customerAddressCreate.mock.calls[0][0]).toMatchObject({ data: { companyId: "c1", customerId: "newC", line1: "1 Main Rd", isPrimary: true } });
    expect(h.customerContactCreate.mock.calls[0][0]).toMatchObject({ data: { companyId: "c1", customerId: "newC", firstName: "Jo", isPrimary: true } });
    expect(h.supplierCreate).not.toHaveBeenCalled();
  });

  it("copies a customer into a new supplier", async () => {
    h.customerFindFirst.mockImplementation(async (args) => ((args as { where: { id?: string } }).where.id ? { ...supplierRow, name: "Beta Mining", tradingName: "Beta", creditLimit: null } : null));
    h.supplierAddressCreate.mockResolvedValue({ id: "a2" });
    h.supplierContactCreate.mockResolvedValue({ id: "k2" });

    const result = await clonePartyToOtherKind(ctxWith(ALL), "customers", "c9");

    expect(result).toMatchObject({ id: "newS", kind: "suppliers" });
    expect(h.supplierCreate.mock.calls[0][0]).toMatchObject({ data: { name: "Beta Mining", nameNormalized: "BETA MINING" } });
    expect(h.supplierCreate.mock.calls[0][0]).not.toHaveProperty("data.tradingName");
    expect(h.supplierContactCreate.mock.calls[0][0]).toMatchObject({ data: { supplierId: "newS", firstName: "Jo" } });
  });

  it("refuses when the other list already has an active record with that name", async () => {
    h.customerFindFirst.mockResolvedValue({ id: "existing" });
    await expect(clonePartyToOtherKind(ctxWith(ALL), "suppliers", "s1")).rejects.toThrow(/already a customer called "Acme Hydraulics"/);
    expect(h.customerCreate).not.toHaveBeenCalled();
  });

  it("leaves the account code blank when the other list already uses it", async () => {
    h.customerFindFirst.mockImplementation(async (args) => ((args as { where: { accountCodeNormalized?: string } }).where.accountCodeNormalized ? { id: "codeHolder" } : null));
    const result = await clonePartyToOtherKind(ctxWith(ALL), "suppliers", "s1");
    expect(result.accountCodeKept).toBe(false);
    expect(h.customerCreate.mock.calls[0][0]).toMatchObject({ data: { accountCode: null, accountCodeNormalized: null } });
  });

  it("needs permission to create in the other list", async () => {
    await expect(clonePartyToOtherKind(ctxWith(["SUPPLIERS_VIEW"]), "suppliers", "s1")).rejects.toThrow();
    await expect(clonePartyToOtherKind(ctxWith(["SUPPLIERS_VIEW", "CUSTOMERS_CREATE"], [["SUPPLIERS", "FULL"], ["CUSTOMERS", "READ_ONLY"]]), "suppliers", "s1")).rejects.toThrow();
    expect(h.customerCreate).not.toHaveBeenCalled();
  });

  it("only works for customers and suppliers, and only for records in this company", async () => {
    await expect(clonePartyToOtherKind(ctxWith(ALL), "parts", "p1")).rejects.toThrow("NOT_FOUND");
    h.supplierFindFirst.mockResolvedValue(null);
    await expect(clonePartyToOtherKind(ctxWith(ALL), "suppliers", "nope")).rejects.toThrow("NOT_FOUND");
  });
});
