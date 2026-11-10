import { describe, expect, it } from "vitest";
import { jobPartLineQuantityUpdateInput } from "@/lib/jobs/validation";

describe("changing a part line's quantity", () => {
  it("accepts a positive number, typed or as text, and rounds it to 4 places", () => {
    expect(jobPartLineQuantityUpdateInput.parse({ lineId: "l1", quantity: 4 }).quantity).toBe(4);
    expect(jobPartLineQuantityUpdateInput.parse({ lineId: "l1", quantity: "12" }).quantity).toBe(12);
    expect(jobPartLineQuantityUpdateInput.parse({ lineId: "l1", quantity: 2.123456 }).quantity).toBe(2.1235);
  });

  it("rejects zero, negative, empty and absurd quantities and a missing line", () => {
    for (const quantity of [0, -3, "", "abc", 5_000_000]) expect(() => jobPartLineQuantityUpdateInput.parse({ lineId: "l1", quantity })).toThrow();
    expect(() => jobPartLineQuantityUpdateInput.parse({ quantity: 2 })).toThrow();
  });
});
