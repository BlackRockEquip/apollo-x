import { describe, expect, it } from "vitest";
import { ccWithSender } from "@/lib/email-template-fields";

describe("RFQ email CC with the requesting user", () => {
  it("copies the requester in alongside the template's CC list", () => {
    expect(ccWithSender("buyer@acme.co.za", "mornay@blackrock.co.za", "sales@supplier.co.za")).toBe("buyer@acme.co.za, mornay@blackrock.co.za");
  });

  it("copies the requester when the template has no CC list at all", () => {
    expect(ccWithSender(null, "mornay@blackrock.co.za", "sales@supplier.co.za")).toBe("mornay@blackrock.co.za");
    expect(ccWithSender("", "mornay@blackrock.co.za", "sales@supplier.co.za")).toBe("mornay@blackrock.co.za");
  });

  it("never lists anybody twice, whatever the capitals, and never copies someone who is already on the To line", () => {
    expect(ccWithSender("Mornay@BlackRock.co.za", "mornay@blackrock.co.za", "sales@supplier.co.za")).toBe("mornay@blackrock.co.za");
    expect(ccWithSender(null, "mornay@blackrock.co.za", "mornay@blackrock.co.za, sales@supplier.co.za")).toBeUndefined();
  });

  it("keeps the company's sending address and the requester together for follow-ups", () => {
    const both = ["office@blackrock.co.za", "mornay@blackrock.co.za"].filter(Boolean).join(", ");
    expect(ccWithSender("buyer@acme.co.za", both, "sales@supplier.co.za")).toBe("buyer@acme.co.za, office@blackrock.co.za, mornay@blackrock.co.za");
  });

  it("copes with no requester address", () => {
    expect(ccWithSender("buyer@acme.co.za", null, "sales@supplier.co.za")).toBe("buyer@acme.co.za");
    expect(ccWithSender(null, null, "sales@supplier.co.za")).toBeUndefined();
  });
});
