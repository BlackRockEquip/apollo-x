import { describe, expect, it } from "vitest";
import { avatarTone, initialsOf, sharePercent } from "@/lib/ui/avatar";

describe("initialsOf", () => {
  it("uses the first letters of the first two words", () => {
    expect(initialsOf("Gold1 - NKGM")).toBe("GN");
    expect(initialsOf("Black Rock Equipment")).toBe("BR");
  });
  it("uses the first two letters of a single word", () => {
    expect(initialsOf("Danoher")).toBe("DA");
  });
  it("ignores punctuation and falls back to ?", () => {
    expect(initialsOf("Dozexc Parts & Components")).toBe("DP");
    expect(initialsOf("")).toBe("?");
    expect(initialsOf("  - ")).toBe("?");
  });
});

describe("avatarTone", () => {
  it("is stable for the same name and always returns a tone", () => {
    expect(avatarTone("Danoher")).toEqual(avatarTone("Danoher"));
    expect(avatarTone("Danoher").bg).toMatch(/^#[0-9a-f]{6}$/);
    expect(avatarTone("").fg).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("sharePercent", () => {
  it("formats a share with one decimal", () => {
    expect(sharePercent(213, 366)).toBe("58.2%");
    expect(sharePercent(1, 3, 0)).toBe("33%");
  });
  it("never shows NaN", () => {
    expect(sharePercent(5, 0)).toBe("0%");
  });
});

import { customerJobSide, daysBetween, statusTone } from "@/lib/ui/job-tone";

describe("statusTone", () => {
  it("groups statuses into pill colours", () => {
    expect(statusTone("ASSEMBLY")).toBe("work");
    expect(statusTone("AWAIT_OUTWORK")).toBe("wait");
    expect(statusTone("DELIVERED_AWAITING_PAYMENT")).toBe("done");
    expect(statusTone("CANCELLED")).toBe("neutral");
    expect(statusTone("SOMETHING_NEW")).toBe("work");
  });
});

describe("customerJobSide", () => {
  it("is received while the job is in the workshop and sent once it is on its way back", () => {
    expect(customerJobSide("TESTING")).toBe("received");
    expect(customerJobSide("AWAITING_GO_AHEAD")).toBe("received");
    expect(customerJobSide("TO_BE_DELIVERED")).toBe("sent");
    expect(customerJobSide("CLOSED")).toBe("sent");
    expect(customerJobSide("STRIPPING", true)).toBe("sent");
  });
});

describe("daysBetween", () => {
  it("counts whole UTC days and never goes negative", () => {
    expect(daysBetween("2026-10-20T08:00:00Z", "2026-10-29T01:00:00Z")).toBe(9);
    expect(daysBetween("2026-10-30", "2026-10-29")).toBe(0);
    expect(daysBetween(null)).toBe(0);
    expect(daysBetween("not a date")).toBe(0);
  });
});
