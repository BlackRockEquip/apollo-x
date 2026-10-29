import { describe, expect, it } from "vitest";
import { followupErrorOutcome, followupOutcome } from "@/lib/jobs/followup-outcome";

describe("parts follow-up result window", () => {
  it("confirms success when everything was sent", () => {
    const o = followupOutcome({ sent: [{ supplierName: "Barloworld" }], skipped: [] });
    expect(o.tone).toBe("success");
    expect(o.title).toBe("Follow-up sent");
    expect(o.message).toBe("The follow-up email was sent to 1 supplier.");
    expect(o.sent).toEqual(["Barloworld"]);
  });

  it("warns when only some were sent", () => {
    const o = followupOutcome({ sent: [{ supplierName: "A" }, { supplierName: "B" }], skipped: [{ supplierName: "Unknown", reason: "No supplier assigned" }] });
    expect(o.tone).toBe("warning");
    expect(o.message).toBe("Sent to 2 suppliers, but 1 could not be sent.");
    expect(o.skipped).toHaveLength(1);
  });

  it("is an error when nothing was sent and there are reasons", () => {
    const o = followupOutcome({ sent: [], skipped: [{ supplierName: "Barloworld", reason: "This supplier has no email address on file." }] });
    expect(o.tone).toBe("error");
    expect(o.title).toBe("Follow-up not sent");
    expect(o.skipped[0].reason).toContain("no email address");
  });

  it("says so when there is nothing outstanding", () => {
    expect(followupOutcome({ sent: [], skipped: [] }).tone).toBe("info");
  });

  it("wraps a failure message", () => {
    const o = followupErrorOutcome("Email isn't set up for this company yet.");
    expect(o.tone).toBe("error");
    expect(o.title).toBe("Follow-up failed");
    expect(o.message).toBe("Email isn't set up for this company yet.");
    expect(followupErrorOutcome("").message).toBe("Unable to send the follow-up.");
  });
});
