import { describe, expect, it, vi } from "vitest";

vi.mock("@prisma/client", () => ({ Prisma: { JsonNull: null } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/storage", () => ({ getStorageBackendForCompany: vi.fn() }));
vi.mock("@/lib/attachments/blob-store", () => ({ readStoredBlob: vi.fn(), storeBlob: vi.fn() }));
vi.mock("@/lib/platform/industry-build-service", () => ({ grantInitialModules: vi.fn() }));

import { COMPANY_COPY_SUFFIX, RESET_CONFIRM_PHRASE, companyCopyName, isResetPhrase, pickFreeCopyCode } from "@/lib/platform/company-lifecycle-constants";
import { RESET_KEEP_TABLES } from "@/lib/platform/company-lifecycle-service";

describe("company reset confirmation", () => {
  it("needs exactly the phrase Reset Company (outer spaces ignored)", () => {
    expect(RESET_CONFIRM_PHRASE).toBe("Reset Company");
    expect(isResetPhrase("Reset Company")).toBe(true);
    expect(isResetPhrase("  Reset Company ")).toBe(true);
    expect(isResetPhrase("reset company")).toBe(false);
    expect(isResetPhrase("Reset")).toBe(false);
    expect(isResetPhrase("")).toBe(false);
  });
});

describe("company clone naming", () => {
  it("adds - copy to the end of the name", () => {
    expect(COMPANY_COPY_SUFFIX).toBe(" - copy");
    expect(companyCopyName("Acme Hydraulics")).toBe("Acme Hydraulics - copy");
    expect(companyCopyName("  Acme  ")).toBe("Acme - copy");
  });

  it("picks the first free internal code", () => {
    expect(pickFreeCopyCode("ACME", [])).toBe("ACME-COPY");
    expect(pickFreeCopyCode("ACME", ["ACME-COPY"])).toBe("ACME-COPY2");
    expect(pickFreeCopyCode("acme", ["acme-copy", "ACME-COPY2"])).toBe("ACME-COPY3");
  });
});

describe("what a reset keeps", () => {
  it("keeps setup and users, never keeps operational data", () => {
    for (const keep of ["CompanyMembership", "CompanySettings", "CompanyModuleEntitlement", "DocumentNumberSequence", "TaxCode", "CommercialTerm"]) {
      expect(RESET_KEEP_TABLES).toContain(keep);
    }
    for (const data of ["Job", "Customer", "Supplier", "Part", "StockBalance", "PexRecord", "AuditEvent", "Attachment", "SupportTicket", "Notification"]) {
      expect(RESET_KEEP_TABLES).not.toContain(data);
    }
  });
});
