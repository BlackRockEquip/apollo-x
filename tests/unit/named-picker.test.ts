import { describe, expect, it } from "vitest";
import { canAddName, filterNamedOptions } from "@/components/NamedPicker";
import { staffNameInput } from "@/lib/jobs/validation";

const options = [{ id: "1", label: "Piet Naude" }, { id: "2", label: "Sipho Dlamini" }, { id: "3", label: "Thabo Piet" }];

describe("NamedPicker rules", () => {
  it("lists everything when nothing is typed, otherwise what contains the text (any capitals)", () => {
    expect(filterNamedOptions(options, "")).toHaveLength(3);
    expect(filterNamedOptions(options, "  ")).toHaveLength(3);
    expect(filterNamedOptions(options, "piet").map((o) => o.id)).toEqual(["1", "3"]);
    expect(filterNamedOptions(options, "zzz")).toEqual([]);
  });

  it("offers to add only a new name of at least two letters", () => {
    expect(canAddName(options, "Johan Botha")).toBe(true);
    expect(canAddName(options, "J")).toBe(false);
    expect(canAddName(options, "")).toBe(false);
    expect(canAddName(options, "  piet naude ")).toBe(false);
    expect(canAddName(options, "Piet")).toBe(true); // only part of a listed name: still a different person
  });
});

describe("adding a name to the list (API input)", () => {
  it("trims and needs two letters", () => {
    expect(staffNameInput.parse({ name: "  Johan Botha " }).name).toBe("Johan Botha");
    expect(() => staffNameInput.parse({ name: "J" })).toThrow();
    expect(() => staffNameInput.parse({ name: "   " })).toThrow();
    expect(() => staffNameInput.parse({ name: "x".repeat(121) })).toThrow();
  });
});
