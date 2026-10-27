import { describe, expect, it } from "vitest";
import { attachmentVisibleTo, photoTypeAllowed, uploadAsPhoto } from "@/lib/jobs/attachment-visibility";
import { canHandlePickSlipRequests, mergeRequestLines, pickSlipRequestCreateInput, pickSlipRequestQuery } from "@/lib/inventory/pick-request-rules";
import { buildJobTabs } from "@/components/job-screen/job-tabs";

const cuid = "cjld2cjxh0000qzrmn831i7rn";
const cuid2 = "cjld2cyuq0000t3rmniod1foy";

describe("photos and attachments (Mechanic view)", () => {
  it("a mechanic sees photos only; everyone else sees both", () => {
    expect(attachmentVisibleTo({ tenantRole: "USER" }, { isPhoto: true })).toBe(true);
    expect(attachmentVisibleTo({ tenantRole: "USER" }, { isPhoto: false })).toBe(false);
    for (const role of ["COMPANY_ADMIN", "MANAGER", "STORE_CONTROLLER", "SALES", "FINANCE"]) {
      expect(attachmentVisibleTo({ tenantRole: role }, { isPhoto: false })).toBe(true);
      expect(attachmentVisibleTo({ tenantRole: role }, { isPhoto: true })).toBe(true);
    }
  });
  it("a mechanic can only add photos, and photos must be images", () => {
    expect(uploadAsPhoto({ tenantRole: "USER" }, undefined)).toBe(true);
    expect(uploadAsPhoto({ tenantRole: "USER" }, false)).toBe(true);
    expect(uploadAsPhoto({ tenantRole: "MANAGER" }, undefined)).toBe(false);
    expect(uploadAsPhoto({ tenantRole: "MANAGER" }, true)).toBe(true);
    expect(photoTypeAllowed("image/jpeg")).toBe(true);
    expect(photoTypeAllowed("image/png")).toBe(true);
    expect(photoTypeAllowed("application/pdf")).toBe(false);
  });
  it("the job tab covers both sections", () => {
    const tabs = buildJobTabs({ showParts: false, showPickSlips: false, showFollowup: false, showOutwork: false, showSpecifications: false, showPex: false, showWarranty: false, showActivity: false, partsCount: 0, pickSlipsCount: 0, followupCount: 0, outworkCount: 0, attachmentsCount: 3 });
    expect(tabs.find((t) => t.key === "attachments")).toMatchObject({ label: "Photos & attachments", count: 3 });
  });
});

describe("picking slip requests (Mechanic view)", () => {
  it("a mechanic can ask but not handle; store team, managers and admins can handle", () => {
    const issue = new Set(["INVENTORY_ISSUE"]) as never;
    expect(canHandlePickSlipRequests({ tenantRole: "USER", tenantPermissions: issue })).toBe(false);
    expect(canHandlePickSlipRequests({ tenantRole: "STORE_CONTROLLER", tenantPermissions: issue })).toBe(true);
    expect(canHandlePickSlipRequests({ tenantRole: "MANAGER", tenantPermissions: issue })).toBe(true);
    expect(canHandlePickSlipRequests({ tenantRole: "MANAGER", tenantPermissions: new Set() as never })).toBe(false);
  });
  it("merges a part picked twice into one line", () => {
    expect(mergeRequestLines([{ partId: "a", quantity: "2" }, { partId: "b", quantity: "1.5" }, { partId: "a", quantity: "3" }])).toEqual([
      { partId: "a", quantity: "5" },
      { partId: "b", quantity: "1.5" },
    ]);
  });
  it("needs a job and at least one part with a quantity above zero", () => {
    expect(pickSlipRequestCreateInput.safeParse({ jobId: cuid, lines: [{ partId: cuid2, quantity: 2 }] }).success).toBe(true);
    expect(pickSlipRequestCreateInput.safeParse({ jobId: cuid, lines: [] }).success).toBe(false);
    expect(pickSlipRequestCreateInput.safeParse({ jobId: cuid, lines: [{ partId: cuid2, quantity: 0 }] }).success).toBe(false);
    expect(pickSlipRequestCreateInput.safeParse({ jobId: "nope", lines: [{ partId: cuid2, quantity: 1 }] }).success).toBe(false);
    const parsed = pickSlipRequestCreateInput.parse({ jobId: cuid, lines: [{ partId: cuid2, quantity: "2.5" }], note: "  urgent " });
    expect(parsed.lines[0].quantity).toBe("2.5");
    expect(parsed.note).toBe("urgent");
  });
  it("lists waiting requests by default", () => {
    expect(pickSlipRequestQuery.parse({}).status).toBe("PENDING");
    expect(pickSlipRequestQuery.safeParse({ status: "BOGUS" }).success).toBe(false);
  });
});
