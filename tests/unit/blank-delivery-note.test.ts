import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestContext } from "@/lib/auth/context-types";

// 2026-10-22, user request: Outwork page > Blank Delivery Note.
const h = vi.hoisted(() => ({
  customerFindFirst: vi.fn<(args: unknown) => Promise<unknown>>(),
  supplierFindFirst: vi.fn<(args: unknown) => Promise<unknown>>(),
}));

vi.mock("@prisma/client", () => ({ Prisma: { sql: (...a: unknown[]) => a, join: (...a: unknown[]) => a } }));
vi.mock("@/lib/prisma", () => ({ prisma: { customer: { findFirst: h.customerFindFirst }, supplier: { findFirst: h.supplierFindFirst } } }));
vi.mock("@/lib/documents/titles-service", () => ({ getDocumentTitlesForCompany: async () => ({ JOB_DELIVERY_NOTE: "Delivery Note" }) }));
vi.mock("@/lib/master-data/company-settings-service", () => ({ getCompanyLetterhead: async () => ({ name: "Acme Workshop", addressLines: ["1 Road"], registrationNumber: null, vatNumber: null, contact: null, email: null, logo: null, hidePoweredBy: true }) }));
vi.mock("@/lib/attachments/blob-store", () => ({ sanitizeSegment: (v: string) => v.replace(/[<>:"/\\|?*]/g, "_") }));

import { renderBlankDeliveryNote } from "@/lib/outwork/blank-delivery-note";
import { buildBlankDeliveryNoteSpec } from "@/lib/documents/job-specs";

function ctxWith(permissions: string[], outwork = "FULL"): RequestContext {
  return { userId: "u1", companyId: "c1", tenantPermissions: new Set(permissions), moduleAccess: new Map([["OUTWORK", outwork]]) } as unknown as RequestContext;
}
const base = { partyKind: "SUPPLIER", partyId: "s1", jobNumber: "BRE1152", poReference: "PO-77", deliveryDate: "2026-10-22", items: [{ description: "Hydraulic ram", quantity: "2" }], notes: "Handle with care" };
const supplier = { name: "Acme Hydraulics", vatNumber: "4123", mainTelephone: "011 555", addresses: [{ line1: "1 Main Rd", line2: null, city: "Joburg", province: "GP", postalCode: "2000" }] };

describe("Blank delivery note", () => {
  beforeEach(() => {
    h.customerFindFirst.mockReset().mockResolvedValue(null);
    h.supplierFindFirst.mockReset().mockResolvedValue(supplier);
  });

  it("builds the page from what was typed: party, job number, PO reference, items, notes and signature fields", () => {
    const spec = buildBlankDeliveryNoteSpec({
      title: "Delivery Note", party: { kind: "SUPPLIER", name: "Acme Hydraulics", addressLines: ["1 Main Rd"], vatNumber: "4123", telephone: "011 555" },
      jobNumber: "BRE1152", poReference: "PO-77", deliveryDate: "2026-10-22", items: [{ description: "Hydraulic ram", quantity: "2" }, { description: " ", quantity: "" }], notes: "Handle with care",
    });
    expect(spec.rightLines).toEqual(expect.arrayContaining(["Job BRE1152", "PO reference: PO-77"]));
    expect(spec.blocks).toContainEqual({ type: "heading", text: "Supplier details" });
    expect(spec.blocks).toContainEqual({ type: "lines", lines: ["Acme Hydraulics", "1 Main Rd", "VAT: 4123", "Tel: 011 555"] });
    expect(spec.blocks).toContainEqual(expect.objectContaining({ type: "table", headers: ["Description", "Qty"], rows: [["Hydraulic ram", "2"]] }));
    expect(spec.blocks).toContainEqual({ type: "paragraph", text: "Handle with care" });
    expect(spec.blocks).toContainEqual({ type: "signatures", labels: ["Dispatched by", "Received by"], fields: ["Name", "Signature", "Date"] });
  });

  it("renders a PDF for a supplier, looked up in this company only", async () => {
    const result = await renderBlankDeliveryNote(ctxWith(["JOBS_VIEW", "SUPPLIERS_VIEW"]), base);

    expect(h.supplierFindFirst.mock.calls[0][0]).toMatchObject({ where: { id: "s1", companyId: "c1" } });
    expect(result.fileName).toBe("BRE1152 - Delivery Note - Acme Hydraulics.pdf");
    expect(Buffer.from(result.contentBase64, "base64").subarray(0, 4).toString()).toBe("%PDF");
  });

  it("uses the customer record when delivering to a customer", async () => {
    h.customerFindFirst.mockResolvedValue({ ...supplier, name: "Beta Mining", tradingName: "Beta" });
    const result = await renderBlankDeliveryNote(ctxWith(["JOBS_VIEW", "CUSTOMERS_VIEW"]), { ...base, partyKind: "CUSTOMER", partyId: "c5" });
    expect(h.customerFindFirst).toHaveBeenCalled();
    expect(result.fileName).toContain("Beta Mining");
  });

  it("requires the PO reference and job number to be typed in", async () => {
    const ctx = ctxWith(["JOBS_VIEW", "SUPPLIERS_VIEW"]);
    await expect(renderBlankDeliveryNote(ctx, { ...base, poReference: "  " })).rejects.toThrow();
    await expect(renderBlankDeliveryNote(ctx, { ...base, jobNumber: "" })).rejects.toThrow();
  });

  it("needs at least one item", async () => {
    await expect(renderBlankDeliveryNote(ctxWith(["JOBS_VIEW", "SUPPLIERS_VIEW"]), { ...base, items: [{ description: "", quantity: "" }] })).rejects.toThrow(/at least one item/);
  });

  it("checks permissions and the Outwork licence", async () => {
    await expect(renderBlankDeliveryNote(ctxWith(["JOBS_VIEW"]), base)).rejects.toThrow();
    await expect(renderBlankDeliveryNote(ctxWith(["JOBS_VIEW", "SUPPLIERS_VIEW"], "DENIED"), base)).rejects.toThrow();
    expect(h.supplierFindFirst).not.toHaveBeenCalled();
  });

  it("does not find a party from another company", async () => {
    h.supplierFindFirst.mockResolvedValue(null);
    await expect(renderBlankDeliveryNote(ctxWith(["JOBS_VIEW", "SUPPLIERS_VIEW"]), base)).rejects.toThrow("NOT_FOUND");
  });
});
