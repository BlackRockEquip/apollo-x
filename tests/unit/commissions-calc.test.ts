import { describe, expect, it } from "vitest";
import { computeMonth, computeRepMonths, endOfFollowingMonth, lineMonth, lineProfit, type CalcLine } from "@/lib/commissions/calc";

// Figures from the company's Commissions.xlsx (Vernon, Denis and Tim tabs).
function line(id: string, invoices: Array<[number, string, string | null]>, costs: number, fuel = 0, other = 0, extra: Partial<CalcLine> = {}): CalcLine {
  return { id, invoices: invoices.map(([amount, invoicedOn, clientPaidOn]) => ({ amount, invoicedOn, clientPaidOn })), costs, fuelCharge: fuel, otherExpenses: other, rateOverride: null, noCommission: false, ...extra };
}
const VERNON = { rate: 0.15, monthlyTarget: 45000 };

describe("commission maths - Vernon, November 2026 (the agreed method)", () => {
  const lines = [
    line("BRE1178", [[450000, "2026-11-13", null], [205000, "2026-11-13", null], [4000, "2026-11-13", null], [4648.71, "2026-11-13", null]], 631585.68, 5000),
    line("BRE1189", [[65000, "2026-11-09", null]], 60000),
    line("BRE1216", [[19617, "2026-11-17", null]], 15090, 500),
    line("BRE1218", [[40550, "2026-11-19", null]], 13238, 4400),
    line("BRE1238", [[25000, "2026-11-24", null]], 18000),
  ];
  const refs = Object.fromEntries(lines.map((l) => [l.id, l.id]));
  const month = computeMonth("2026-11", VERNON, lines, 0, "2026-11-25", refs);

  it("profit per line = invoices - costs - fuel charge - other", () => {
    expect(lineProfit(lines[0])).toBe(27063.03);
    expect(lineProfit(lines[3])).toBe(22912);
  });
  it("month profit R66 002.03 - target R45 000 = R21 002.03 x 15% = R3 150.30", () => {
    expect(month.profit).toBe(66002.03);
    expect(month.aboveTarget).toBe(21002.03);
    expect(month.commission).toBe(3150.3);
  });
  it("runs the target balance in invoice-date order and marks where it was met", () => {
    expect(month.lines.map((l) => l.id)).toEqual(["BRE1189", "BRE1178", "BRE1216", "BRE1218", "BRE1238"]);
    expect(month.lines.map((l) => l.balanceAfter)).toEqual([-40000, -12936.97, -8909.97, 14002.03, 21002.03]);
    expect(month.metById).toBe("BRE1218");
    expect(month.lines.find((l) => l.metTarget)?.id).toBe("BRE1218");
  });
  it("is waiting on the client while invoices are unpaid", () => {
    expect(month.status).toBe("WAITING_CLIENT");
    expect(month.dueOn).toBeNull();
  });
});

describe("commission maths - other months from the sheet", () => {
  it("Vernon August 2026: a loss adds to the target; the month earns R11 752.50", () => {
    const lines = [
      line("BRE1019", [[7200, "2026-08-03", null]], 10800),
      line("BRE989", [[110000, "2026-08-13", null]], 44000, 0, 5500),
      line("BRE1040", [[55000, "2026-08-19", null]], 6550),
      line("BRE1059", [[48000, "2026-08-19", null]], 30000),
    ];
    const month = computeMonth("2026-08", VERNON, lines, 0, "2026-11-25");
    expect(month.lines[0].balanceAfter).toBe(-48600);
    expect(month.commission).toBe(11752.5);
  });
  it("Vernon July 2026: target not met, no commission", () => {
    const lines = [
      line("BRE978", [[6500, "2026-07-06", null]], 0, 0, 3250),
      line("BRE979", [[6500, "2026-07-06", null]], 0),
      line("BRE981", [[22000, "2026-07-08", null]], 17600),
      line("BRE999", [[6500, "2026-07-23", null]], 0, 0, 2740),
      line("BRE1015", [[11000, "2026-07-31", null]], 6060),
    ];
    const month = computeMonth("2026-07", VERNON, lines, 0, "2026-11-25");
    expect(month.profit).toBe(22850);
    expect(month.targetMet).toBe(false);
    expect(month.commission).toBe(0);
    expect(month.status).toBe("NONE");
  });
  it("Vernon November 2025: paid in December, matching the sheet's R2 979.51", () => {
    const lines = [
      line("BRE688", [[220000, "2025-11-12", "2025-11-21"]], 160336.58),
      line("BRE699", [[16500, "2025-11-21", "2025-12-25"]], 11300),
    ];
    const month = computeMonth("2025-11", VERNON, lines, 2979.51, "2026-11-25");
    expect(month.commission).toBe(2979.51);
    expect(month.status).toBe("PAID");
    expect(month.owed).toBe(0);
  });
  it("Denis January 2026 (target R40 000): R4 452.59, part paid at R2 543.10", () => {
    const lines = [
      line("743", [[206954, "2026-01-05", "2026-01-15"]], 150000),
      line("746", [[25000, "2026-01-11", "2026-01-20"]], 17530),
      line("760", [[5500, "2026-01-22", "2026-01-22"]], 240.06),
    ];
    const month = computeMonth("2026-01", { rate: 0.15, monthlyTarget: 40000 }, lines, 2543.1, "2026-11-25");
    expect(month.commission).toBe(4452.59);
    expect(month.owed).toBe(1909.49);
    expect(month.status).toBe("PART_PAID");
  });
  it("Tim (no target): commission on each line, with a different rate on one line", () => {
    const lines = [
      line("BRE412", [[68000, "2024-12-07", "2024-12-07"], [42586.86, "2024-12-07", "2024-12-07"]], 33777, 500, 12000, { rateOverride: 0.15 }),
      line("BRE414", [[195000, "2024-12-07", "2024-12-07"]], 132050, 500),
    ];
    const month = computeMonth("2024-12", { rate: 0.2, monthlyTarget: 0 }, lines, 0, "2025-01-10");
    expect(month.lines.map((l) => l.commission)).toEqual([9646.48, 12490]);
    expect(month.commission).toBe(22136.48);
    expect(month.status).toBe("DUE");
    expect(month.dueOn).toBe("2025-01-31");
  });
  it("no-target rep: a loss earns nothing and 'no commission' lines earn nothing", () => {
    const lines = [line("a", [[1000, "2025-03-01", null]], 1500), line("b", [[1000, "2025-03-02", null]], 0, 0, 0, { noCommission: true })];
    expect(computeMonth("2025-03", { rate: 0.2, monthlyTarget: 0 }, lines, 0, "2025-03-10").commission).toBe(0);
  });
});

describe("dates and status", () => {
  it("due at the end of the month after the client's final payment", () => {
    expect(endOfFollowingMonth("2025-11-21")).toBe("2025-12-31");
    expect(endOfFollowingMonth("2026-01-31")).toBe("2026-02-28");
    expect(endOfFollowingMonth("2026-12-03")).toBe("2027-01-31");
  });
  it("a line counts towards the month of its first invoice", () => {
    expect(lineMonth([{ invoicedOn: "2026-11-13" }, { invoicedOn: "2026-10-30" }])).toBe("2026-10");
    expect(lineMonth([])).toBeNull();
  });
  it("Vernon August 2026: paid R9 967.50 for a month that works out to R8 152.50 - overpaid R1 815, nothing carried over", () => {
    const lines = [
      line("BRE1019", [[7200, "2026-08-03", "2026-08-03"]], 10800),
      line("BRE989", [[110000, "2026-08-13", "2026-09-30"]], 49500),
      line("BRE1040", [[55000, "2026-08-19", "2026-09-30"]], 30550),
      line("BRE1059", [[48000, "2026-08-26", "2026-09-30"]], 30000),
    ];
    const month = computeMonth("2026-08", VERNON, lines, 9967.5, "2026-11-25");
    expect(month.commission).toBe(8152.5);
    expect(month.status).toBe("OVERPAID");
    expect(month.overpaid).toBe(1815);
    expect(month.owed).toBe(0);
    const months = computeRepMonths({ rep: VERNON, today: "2026-11-25", payouts: [{ month: "2026-08", amount: 9967.5 }], lines: [
      ...lines.map((l) => ({ ...l, periodMonth: "2026-08" })),
      { ...line("BRE1238", [[67500, "2026-11-24", null]], 0), periodMonth: "2026-11" },
    ] });
    expect(months["2026-11"].owed).toBe(3375);
  });
  it("a payment for a month with no commission shows as overpaid", () => {
    const month = computeMonth("2026-07", VERNON, [line("a", [[10000, "2026-07-01", null]], 0)], 500, "2026-11-25");
    expect(month.status).toBe("OVERPAID");
    expect(month.overpaid).toBe(500);
  });
  it("overdue once the due date has passed and nothing was paid", () => {
    const lines = [line("x", [[100000, "2026-08-19", "2026-08-25"]], 0)];
    const month = computeMonth("2026-08", VERNON, lines, 0, "2026-11-25");
    expect(month.dueOn).toBe("2026-09-30");
    expect(month.status).toBe("OVERDUE");
  });
  it("groups a rep's lines and payouts by month", () => {
    const months = computeRepMonths({
      rep: VERNON,
      today: "2026-11-25",
      lines: [{ ...line("a", [[60000, "2026-03-19", null]], 0), periodMonth: "2026-03", jobReference: "BRE1" }],
      payouts: [{ month: "2026-02", amount: 100 }],
    });
    expect(Object.keys(months)).toEqual(["2026-02", "2026-03"]);
    expect(months["2026-03"].commission).toBe(2250);
    expect(months["2026-03"].metById).toBe("BRE1");
  });
});
