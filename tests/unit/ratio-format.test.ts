import { describe, expect, it } from "vitest";
import { ratioBarPercent, ratioGroups, splitRatioValue, type RatioStatLike } from "@/lib/reports/ratio-format";

const stat = (key: string, format: RatioStatLike["format"], value: number | null): RatioStatLike => ({ key, label: key, format, value, detail: "" });

describe("splitRatioValue", () => {
  it("splits percent and days into a number and a unit", () => {
    expect(splitRatioValue(stat("a", "percent", 75))).toEqual({ value: "75.0", unit: "%" });
    expect(splitRatioValue(stat("a", "days", 23.44))).toEqual({ value: "23.4", unit: "days" });
  });
  it("shows a dash when there is no data", () => {
    expect(splitRatioValue(stat("a", "percent", null))).toEqual({ value: "—", unit: "" });
  });
  it("formats currency as rand and counts as whole numbers", () => {
    expect(splitRatioValue(stat("a", "currency", 18420)).value).toContain("18");
    expect(splitRatioValue(stat("a", "currency", 18420)).unit).toBe("");
    expect(splitRatioValue(stat("a", "count", 12.4)).value).toBe("12");
  });
});

describe("ratioBarPercent", () => {
  it("only gives a bar for percentages, clamped to 0-100", () => {
    expect(ratioBarPercent(stat("a", "percent", 64.3))).toBe(64.3);
    expect(ratioBarPercent(stat("a", "percent", 140))).toBe(100);
    expect(ratioBarPercent(stat("a", "days", 5))).toBeNull();
    expect(ratioBarPercent(stat("a", "percent", null))).toBeNull();
  });
});

describe("ratioGroups", () => {
  it("orders the two known groups and keeps unknown ratios in More", () => {
    const groups = ratioGroups([
      stat("avg-parts-cost-per-job", "currency", 1),
      stat("warranty-ratio", "percent", 3),
      stat("brand-new", "percent", 9),
      stat("completion-rate", "percent", 4),
    ]);
    expect(groups.map((g) => g.title)).toEqual(["Delivery and quality", "Customers and procurement", "More"]);
    expect(groups[0].items.map((s) => s.key)).toEqual(["warranty-ratio", "completion-rate"]);
    expect(groups[2].items.map((s) => s.key)).toEqual(["brand-new"]);
  });
  it("drops empty groups", () => {
    expect(ratioGroups([stat("warranty-ratio", "percent", 3)]).map((g) => g.title)).toEqual(["Delivery and quality"]);
    expect(ratioGroups([])).toEqual([]);
  });
});
