import { describe, expect, it } from "vitest";
import {
  OUTWORK_OVERDUE_DAYS, avgTurnaroundDays, isOpenJob, isOverdueEta, monthsAgo, outworkDaysOut, outworkState, parseActivityFilter,
  startOfDay, summarizeCustomerJobs, summarizeSupplierOutwork,
} from "@/lib/master-data/party-model";
import { SENT_BACK_STATUSES, customerJobSide } from "@/lib/ui/job-tone";

const NOW = new Date("2026-10-29T10:30:00Z");

describe("isOpenJob", () => {
  it("is open until complete, closed or cancelled", () => {
    expect(isOpenJob("STRIPPING")).toBe(true);
    expect(isOpenJob("TO_BE_DELIVERED")).toBe(true);
    expect(isOpenJob("COMPLETE")).toBe(false);
    expect(isOpenJob("CLOSED")).toBe(false);
    expect(isOpenJob("CANCELLED")).toBe(false);
  });
  it("is not open once returned unrepaired", () => {
    expect(isOpenJob("AWAITING_GO_AHEAD", true)).toBe(false);
  });
});

describe("isOverdueEta", () => {
  it("is overdue when the ETA is before today and the job is still with us", () => {
    expect(isOverdueEta("2026-10-28T00:00:00Z", "ASSEMBLY", false, NOW)).toBe(true);
  });
  it("is not overdue on the ETA day itself", () => {
    expect(isOverdueEta("2026-10-29T00:00:00Z", "ASSEMBLY", false, NOW)).toBe(false);
    expect(isOverdueEta("2026-10-29T23:00:00Z", "ASSEMBLY", false, NOW)).toBe(false);
  });
  it("ignores jobs that have been sent back, or have no ETA", () => {
    expect(isOverdueEta("2026-01-01T00:00:00Z", "COMPLETE", false, NOW)).toBe(false);
    expect(isOverdueEta("2026-01-01T00:00:00Z", "ASSEMBLY", true, NOW)).toBe(false);
    expect(isOverdueEta(null, "ASSEMBLY", false, NOW)).toBe(false);
    expect(isOverdueEta("not a date", "ASSEMBLY", false, NOW)).toBe(false);
  });
});

describe("summarizeCustomerJobs", () => {
  it("splits status groups into in-workshop and sent-back", () => {
    const s = summarizeCustomerJobs(
      [
        { status: "STRIPPING", returnedUnrepaired: false, count: 10 },
        { status: "WAITING_FOR_PARTS", returnedUnrepaired: false, count: 5 },
        { status: "TO_BE_DELIVERED", returnedUnrepaired: false, count: 3 },
        { status: "COMPLETE", returnedUnrepaired: false, count: 20 },
        { status: "ASSEMBLY", returnedUnrepaired: true, count: 2 },
      ],
      4,
      6,
    );
    expect(s).toEqual({ total: 40, inWorkshop: 15, sentBack: 25, overdue: 4, warranty: 6, warrantyShare: "15.0%" });
  });
  it("never divides by zero", () => {
    expect(summarizeCustomerJobs([], 0, 0)).toEqual({ total: 0, inWorkshop: 0, sentBack: 0, overdue: 0, warranty: 0, warrantyShare: "0%" });
  });
  it("uses the same status list as the server-side filter", () => {
    for (const status of SENT_BACK_STATUSES) expect(customerJobSide(status)).toBe("sent");
    expect(customerJobSide("STRIPPING")).toBe("received");
  });
});

describe("outwork rules", () => {
  it("flags items out for more than the limit as overdue", () => {
    const sent = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * 86400000);
    expect(outworkState({ status: "SENT_OUT", dateSentOut: sent(OUTWORK_OVERDUE_DAYS) }, NOW)).toBe("out");
    expect(outworkState({ status: "SENT_OUT", dateSentOut: sent(OUTWORK_OVERDUE_DAYS + 1) }, NOW)).toBe("overdue");
    expect(outworkState({ status: "SENT_OUT", dateSentOut: null }, NOW)).toBe("out");
    expect(outworkState({ status: "RECEIVED", dateSentOut: sent(60) }, NOW)).toBe("received");
  });
  it("counts days sent to received for finished items and sent to today for the rest", () => {
    expect(outworkDaysOut({ status: "RECEIVED", dateSentOut: "2026-10-01T00:00:00Z", dateReceived: "2026-10-08T00:00:00Z" }, NOW)).toBe(7);
    expect(outworkDaysOut({ status: "SENT_OUT", dateSentOut: "2026-10-19T00:00:00Z", dateReceived: null }, NOW)).toBe(10);
    expect(outworkDaysOut({ status: "SENT_OUT", dateSentOut: null, dateReceived: null }, NOW)).toBe(0);
  });
  it("averages turnaround to one decimal and returns null with nothing to average", () => {
    expect(avgTurnaroundDays([])).toBeNull();
    expect(avgTurnaroundDays([{ dateSentOut: "2026-10-01T00:00:00Z", dateReceived: null }])).toBeNull();
    expect(avgTurnaroundDays([
      { dateSentOut: "2026-10-01T00:00:00Z", dateReceived: "2026-10-08T00:00:00Z" },
      { dateSentOut: "2026-10-01T00:00:00Z", dateReceived: "2026-10-09T00:00:00Z" },
      { dateSentOut: "2026-10-01T00:00:00Z", dateReceived: "2026-10-09T00:00:00Z" },
    ])).toBe(7.7);
  });
  it("summarizes a supplier's items", () => {
    const d = (day: number) => new Date(Date.UTC(2026, 9, day));
    const s = summarizeSupplierOutwork(
      [
        { status: "SENT_OUT", dateSentOut: d(27), dateReceived: null },
        { status: "SENT_OUT", dateSentOut: d(10), dateReceived: null },
        { status: "RECEIVED", dateSentOut: d(1), dateReceived: d(8) },
        { status: "RECEIVED", dateSentOut: new Date("2026-03-01T00:00:00Z"), dateReceived: new Date("2026-03-11T00:00:00Z") },
      ],
      NOW,
    );
    expect(s.out).toBe(2);
    expect(s.overdue).toBe(1);
    expect(s.receivedBack).toBe(1);
    expect(s.avgTurnaround).toBe(8.5);
  });
});

describe("date helpers", () => {
  it("startOfDay and monthsAgo", () => {
    expect(startOfDay(NOW).toISOString()).toBe("2026-10-29T00:00:00.000Z");
    expect(monthsAgo(NOW, 12).toISOString()).toBe("2025-10-29T10:30:00.000Z");
  });
  it("parseActivityFilter only accepts open", () => {
    expect(parseActivityFilter("open")).toBe("open");
    expect(parseActivityFilter("anything")).toBe("all");
    expect(parseActivityFilter(undefined)).toBe("all");
  });
});
