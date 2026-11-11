import { describe, expect, it } from "vitest";
import { WARRANTY_ELIGIBLE_TYPES, canBeWarranty, jobIsWarranty, normalizeWarranty } from "@/lib/jobs/warranty";
import { jobCreateInput, jobUpdateInput } from "@/lib/jobs/validation";
import { JOB_FORM_KEYS, RELATION_PAYLOAD_KEYS, diffPayload, jobPayloadFromForm } from "@/lib/jobs/job-autosave";
import { buildJobTabs } from "@/components/job-screen/job-tabs";

describe("warranty is a tickbox on a job, not a job type", () => {
  it("only Standard repair, Partial repair and Field service can be warranty", () => {
    expect([...WARRANTY_ELIGIBLE_TYPES]).toEqual(["STANDARD_REPAIR", "PARTIAL_REPAIR", "FIELD_SERVICE"]);
    for (const type of ["STANDARD_REPAIR", "PARTIAL_REPAIR", "FIELD_SERVICE"]) expect(canBeWarranty(type)).toBe(true);
    for (const type of ["PEX_SUPPLY", "PEX_RETURN", "OUTRIGHT_SALE", "WARRANTY", "", null, undefined]) expect(canBeWarranty(type)).toBe(false);
  });

  it("keeps the tickbox for a type that can be warranty, in the workshop and in the field", () => {
    expect(normalizeWarranty("STANDARD_REPAIR", true)).toEqual({ type: "STANDARD_REPAIR", isWarranty: true });
    expect(normalizeWarranty("FIELD_SERVICE", true)).toEqual({ type: "FIELD_SERVICE", isWarranty: true });
    expect(normalizeWarranty("PARTIAL_REPAIR", false)).toEqual({ type: "PARTIAL_REPAIR", isWarranty: false });
    expect(normalizeWarranty("FIELD_SERVICE", undefined)).toEqual({ type: "FIELD_SERVICE", isWarranty: false });
  });

  it("forces the tickbox off for a type that cannot be warranty", () => {
    expect(normalizeWarranty("PEX_SUPPLY", true)).toEqual({ type: "PEX_SUPPLY", isWarranty: false });
    expect(normalizeWarranty("PEX_RETURN", true)).toEqual({ type: "PEX_RETURN", isWarranty: false });
    expect(normalizeWarranty("OUTRIGHT_SALE", true)).toEqual({ type: "OUTRIGHT_SALE", isWarranty: false });
  });

  it("turns the retired Warranty type into a Standard repair with the tickbox on", () => {
    expect(normalizeWarranty("WARRANTY", undefined)).toEqual({ type: "STANDARD_REPAIR", isWarranty: true });
    expect(normalizeWarranty("WARRANTY", false)).toEqual({ type: "STANDARD_REPAIR", isWarranty: true });
  });

  it("counts a job as warranty by the tickbox, or by the old type until the migration has run", () => {
    expect(jobIsWarranty({ type: "FIELD_SERVICE", isWarranty: true })).toBe(true);
    expect(jobIsWarranty({ type: "WARRANTY", isWarranty: false })).toBe(true);
    expect(jobIsWarranty({ type: "STANDARD_REPAIR", isWarranty: false })).toBe(false);
    expect(jobIsWarranty({ type: "STANDARD_REPAIR" })).toBe(false);
    expect(jobIsWarranty(null)).toBe(false);
  });
});

describe("the job API takes the tickbox", () => {
  const base = { customerId: "ckx1234567890abcdefghijkl" };

  it("accepts isWarranty on create and update, and leaves it off when it is not sent", () => {
    expect(jobCreateInput.parse({ ...base, type: "FIELD_SERVICE", isWarranty: true }).isWarranty).toBe(true);
    expect(jobCreateInput.parse({ ...base, type: "STANDARD_REPAIR" }).isWarranty).toBeUndefined();
    expect(jobUpdateInput.parse({ isWarranty: false }).isWarranty).toBe(false);
    expect(jobUpdateInput.parse({ notes: "x" }).isWarranty).toBeUndefined();
  });

  it("still accepts the old Warranty type so an old client does not break (the server converts it)", () => {
    expect(jobCreateInput.parse({ ...base, type: "WARRANTY" }).type).toBe("WARRANTY");
  });

  it("rejects a tickbox that is not true or false", () => {
    expect(() => jobCreateInput.parse({ ...base, type: "STANDARD_REPAIR", isWarranty: "yes" })).toThrow();
  });
});

describe("the job screen autosaves the tickbox like any other field", () => {
  it("includes it in the form keys and the payload, and reloads the screen once it is saved", () => {
    expect(JOB_FORM_KEYS).toContain("isWarranty");
    expect(RELATION_PAYLOAD_KEYS).toContain("isWarranty");
    expect(jobPayloadFromForm({ customerId: "c1", type: "STANDARD_REPAIR", isWarranty: "true" }).isWarranty).toBe(true);
    expect(jobPayloadFromForm({ customerId: "c1", type: "STANDARD_REPAIR", isWarranty: "" }).isWarranty).toBe(false);
  });

  it("sends only the tickbox when only the tickbox changed", () => {
    const saved = jobPayloadFromForm({ customerId: "c1", type: "FIELD_SERVICE", isWarranty: "" });
    const next = jobPayloadFromForm({ customerId: "c1", type: "FIELD_SERVICE", isWarranty: "true" });
    expect(diffPayload(next, saved)).toEqual({ isWarranty: true });
  });
});

describe("the Warranty tab follows the tickbox", () => {
  const tabs = (showWarranty: boolean) => buildJobTabs({
    showParts: true, showPickSlips: false, showFollowup: false, showOutwork: false, showSpecifications: false, showPex: false,
    showWarranty, showActivity: true, partsCount: 0, pickSlipsCount: 0, followupCount: 0, outworkCount: 0, attachmentsCount: 0,
  }).map((tab) => tab.key);

  it("shows the tab when the job is warranty, and not otherwise", () => {
    expect(tabs(true)).toContain("warranty");
    expect(tabs(false)).not.toContain("warranty");
  });
});
