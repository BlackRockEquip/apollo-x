import { describe, expect, it } from "vitest";
import { buildJobTabs, hashForTab, resolveActiveTab, tabFromHash, type JobTabInput } from "@/components/job-screen/job-tabs";
import { countParts, isOnPickSlip, isOutstanding, matchesPartFilter, partTone, summaryParts } from "@/components/job-screen/parts-summary";
import { buildFacts, daysFrom, formatFactDate, parseDateOnly, partsFact, relativeDaysNote } from "@/components/job-screen/job-facts";

const base: JobTabInput = { showParts: true, showPickSlips: false, showFollowup: false, showOutwork: false, showSpecifications: false, showPex: false, showWarranty: false, showActivity: true, partsCount: 4, pickSlipsCount: 0, followupCount: 0, outworkCount: 0, attachmentsCount: 2 };

describe("job tabs", () => {
  it("always has Overview first and Attachments", () => {
    const tabs = buildJobTabs({ ...base, showParts: false, showActivity: false });
    expect(tabs.map((t) => t.key)).toEqual(["overview", "attachments"]);
  });
  it("orders optional tabs and carries counts", () => {
    const tabs = buildJobTabs({ ...base, showPickSlips: true, pickSlipsCount: 1, showFollowup: true, followupCount: 3, showOutwork: true, outworkCount: 2, showSpecifications: true, showPex: true, showWarranty: true });
    expect(tabs.map((t) => t.key)).toEqual(["overview", "parts", "pickslips", "followup", "outwork", "specifications", "attachments", "pex", "warranty", "activity"]);
    expect(tabs.find((t) => t.key === "parts")?.count).toBe(4);
    expect(tabs.find((t) => t.key === "followup")?.count).toBe(3);
    expect(tabs.find((t) => t.key === "overview")?.count).toBeUndefined();
  });
  it("falls back to Overview when the requested tab is missing", () => {
    const tabs = buildJobTabs(base);
    expect(resolveActiveTab("parts", tabs)).toBe("parts");
    expect(resolveActiveTab("followup", tabs)).toBe("overview");
    expect(resolveActiveTab(null, tabs)).toBe("overview");
    expect(resolveActiveTab("bogus", tabs)).toBe("overview");
  });
  it("round-trips the URL hash", () => {
    expect(tabFromHash("#tab=parts")).toBe("parts");
    expect(tabFromHash("tab=activity")).toBe("activity");
    expect(tabFromHash("#tab=nope")).toBeNull();
    expect(tabFromHash("#other")).toBeNull();
    expect(tabFromHash("")).toBeNull();
    expect(tabFromHash(undefined)).toBeNull();
    expect(hashForTab("overview")).toBe("");
    expect(hashForTab("pickslips")).toBe("#tab=pickslips");
    expect(tabFromHash(hashForTab("outwork"))).toBe("outwork");
  });
});

describe("parts summary", () => {
  const lines = [
    { status: "RECEIVED", quantity: 2, receivedQuantity: 2 },
    { status: "PARTIALLY_RECEIVED", quantity: 4, receivedQuantity: 1 },
    { status: "PICKED", quantity: 3, receivedQuantity: 0, pickedQuantity: 3 },
    { status: "ON_ORDER", quantity: 1, receivedQuantity: null },
    { status: "PENDING", quantity: "5", receivedQuantity: "0" },
    { status: "IN_STOCK", quantity: 1, receivedQuantity: 0, pickedQuantity: 1 },
  ];
  it("classifies lines", () => {
    expect(isOutstanding(lines[0])).toBe(false);
    expect(isOutstanding(lines[1])).toBe(true);
    expect(isOutstanding({ quantity: "abc" })).toBe(false);
    expect(isOnPickSlip(lines[2])).toBe(true);
    expect(isOnPickSlip(lines[5])).toBe(true);
    expect(isOnPickSlip(lines[4])).toBe(false);
    expect(partTone("RECEIVED")).toBe("received");
    expect(partTone("PARTIALLY_RECEIVED")).toBe("partial");
    expect(partTone("PICKED")).toBe("picked");
    expect(partTone("ON_ORDER")).toBe("ordered");
    expect(partTone("PENDING")).toBe("none");
    expect(partTone(undefined)).toBe("none");
  });
  it("filters", () => {
    expect(lines.filter((l) => matchesPartFilter(l, "all")).length).toBe(6);
    expect(lines.filter((l) => matchesPartFilter(l, "outstanding")).length).toBe(5);
    expect(lines.filter((l) => matchesPartFilter(l, "pickslip")).length).toBe(2);
    expect(lines.filter((l) => matchesPartFilter(l, "received")).length).toBe(1);
  });
  it("counts and summarises", () => {
    const c = countParts(lines);
    expect(c).toEqual({ total: 6, outstanding: 5, onPickSlip: 2, received: 1, partial: 1, picked: 1, ordered: 1, none: 2 });
    expect(summaryParts(c)).toEqual(["1 received", "1 partly received", "1 on pick slip", "1 ordered", "2 to be ordered"]);
    expect(summaryParts(countParts([]))).toEqual([]);
  });
});

describe("job facts", () => {
  const now = new Date(2026, 9, 27, 15, 30);
  it("parses date-only values without timezone drift", () => {
    expect(parseDateOnly("2026-10-27")?.getDate()).toBe(27);
    expect(parseDateOnly("2026-10-27T22:00:00.000Z")?.getDate()).toBe(27);
    expect(parseDateOnly("2026-02-31")).toBeNull();
    expect(parseDateOnly("")).toBeNull();
    expect(parseDateOnly(undefined)).toBeNull();
    expect(formatFactDate("2026-03-05")).toBe("5 Mar 2026");
    expect(formatFactDate("nope")).toBe("");
  });
  it("counts days from today", () => {
    expect(daysFrom("2026-10-27", now)).toBe(0);
    expect(daysFrom("2026-10-30", now)).toBe(3);
    expect(daysFrom("2026-10-25", now)).toBe(-2);
    expect(daysFrom("2026-11-01", now)).toBe(5);
    expect(daysFrom("", now)).toBeNull();
  });
  it("words the note", () => {
    expect(relativeDaysNote(0)).toBe("today");
    expect(relativeDaysNote(1)).toBe("tomorrow");
    expect(relativeDaysNote(4)).toBe("in 4 days");
    expect(relativeDaysNote(-1)).toBe("1 day overdue");
    expect(relativeDaysNote(-6)).toBe("6 days overdue");
    expect(relativeDaysNote(null)).toBe("");
  });
  it("builds workshop facts", () => {
    const facts = buildFacts({ fieldService: false, closed: false, etaDate: "2026-10-30", quoteNumber: "Q-1", quoteDate: "2026-10-01", salesOrderNumber: "", purchaseOrderNumber: "PO9", purchaseOrderStatus: "AWAIT_PAYMENT", machineHours: "1200", partsTotal: 5, partsReceived: 2, now });
    expect(facts.map((f) => f.key)).toEqual(["eta", "quote", "so", "po", "hours", "parts"]);
    expect(facts[0]).toMatchObject({ value: "30 Oct 2026", note: "in 3 days", tone: "default" });
    expect(facts[1]).toMatchObject({ value: "Q-1", note: "1 Oct 2026" });
    expect(facts[2].value).toBe("—");
    expect(facts[3]).toMatchObject({ value: "PO9", note: "Awaiting payment", tone: "warn" });
    expect(facts[5]).toMatchObject({ value: "2 of 5", note: "received" });
  });
  it("flags overdue and soon ETAs, and ignores them once closed", () => {
    const f = (eta: string, closed = false) => buildFacts({ fieldService: false, closed, etaDate: eta, partsTotal: 0, partsReceived: 0, now })[0];
    expect(f("2026-10-25")).toMatchObject({ tone: "bad", note: "2 days overdue" });
    expect(f("2026-10-28")).toMatchObject({ tone: "warn", note: "tomorrow" });
    expect(f("2026-10-25", true)).toMatchObject({ tone: "default", note: undefined });
    expect(f("")).toMatchObject({ value: "—" });
  });
  it("leaves out the day notes until the current date is known", () => {
    const eta = buildFacts({ fieldService: false, closed: false, etaDate: "2026-10-30", partsTotal: 0, partsReceived: 0 })[0];
    expect(eta).toMatchObject({ value: "30 Oct 2026", tone: "default" });
    expect(eta.note).toBeUndefined();
  });
  it("builds field service facts", () => {
    const facts = buildFacts({ fieldService: true, closed: false, scheduledDate: "2026-10-27", technician: "Sam", siteLine: "Mine 4", machine: "CAT 320", hoursTotal: "6.5", partsTotal: 0, partsReceived: 0, now });
    expect(facts.map((f) => f.key)).toEqual(["scheduled", "technician", "site", "machine", "hours", "parts"]);
    expect(facts[0]).toMatchObject({ value: "27 Oct 2026", note: "today" });
    expect(facts[5].value).toBe("—");
  });
  it("shows parts as good when everything is in", () => {
    expect(partsFact(3, 3).tone).toBe("good");
    expect(partsFact(3, 1).tone).toBe("default");
  });
});
