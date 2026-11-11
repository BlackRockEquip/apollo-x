import { describe, expect, it } from "vitest";
import { descriptionAfterTyped, isPlaceholderDescription, placeholderDescription, typedDescription } from "@/lib/job-kits/description";

describe("a typed description replaces the Imported part stand-in on a job kit", () => {
  it("recognises the stand-in, and an empty description, as a placeholder", () => {
    expect(isPlaceholderDescription(placeholderDescription("PN1001"))).toBe(true);
    expect(isPlaceholderDescription("Imported part PN1001")).toBe(true);
    expect(isPlaceholderDescription("imported part pn1001")).toBe(true);
    expect(isPlaceholderDescription("")).toBe(true);
    expect(isPlaceholderDescription(null)).toBe(true);
    expect(isPlaceholderDescription("   ")).toBe(true);
  });

  it("does not treat a real description as a placeholder", () => {
    expect(isPlaceholderDescription("Hydraulic seal")).toBe(false);
    expect(isPlaceholderDescription("Imported seal kit")).toBe(false);
  });

  it("only counts a description of two or more characters as typed", () => {
    expect(typedDescription("  Hydraulic seal ")).toBe("Hydraulic seal");
    expect(typedDescription("x")).toBeNull();
    expect(typedDescription("")).toBeNull();
    expect(typedDescription(undefined)).toBeNull();
  });

  it("swaps the stand-in for the typed description", () => {
    expect(descriptionAfterTyped("Imported part PN1001", "Hydraulic seal")).toBe("Hydraulic seal");
    expect(descriptionAfterTyped(null, "Hydraulic seal")).toBe("Hydraulic seal");
  });

  it("never overwrites a real description", () => {
    expect(descriptionAfterTyped("Dust seal", "Hydraulic seal")).toBe("Dust seal");
  });

  it("keeps the stand-in when nothing real was typed", () => {
    expect(descriptionAfterTyped("Imported part PN1001", null)).toBe("Imported part PN1001");
    expect(descriptionAfterTyped("Imported part PN1001", "x")).toBe("Imported part PN1001");
    expect(descriptionAfterTyped(null, null)).toBeNull();
  });
});
