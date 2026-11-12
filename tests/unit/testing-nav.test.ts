import { describe, expect, it } from "vitest";
import { TESTING_KINDS } from "@/lib/testing/nav";

describe("the Testing sidebar group", () => {
  it("lists Transmissions, Engines, Brakes and Torque Converters in that order", () => {
    expect(TESTING_KINDS.map((k) => k.label)).toEqual(["Transmissions", "Engines", "Brakes", "Torque Converters"]);
  });

  it("keeps the transmission test sheets at their existing address", () => {
    expect(TESTING_KINDS[0].href).toBe("/testing-reports");
    expect(TESTING_KINDS[0].ready).toBe(true);
  });

  it("gives every item its own address, none of them inside another item's address", () => {
    const hrefs = TESTING_KINDS.map((k) => k.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const a of hrefs) for (const b of hrefs) if (a !== b) expect(a.startsWith(`${b}/`)).toBe(false);
  });

  it("marks only Transmissions as set up", () => {
    expect(TESTING_KINDS.filter((k) => k.ready).map((k) => k.key)).toEqual(["transmissions"]);
  });
});
