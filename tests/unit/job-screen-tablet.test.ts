import { describe, expect, it } from "vitest";
import { buildTabletCard, buildTabletFacts, currentStepIndex, formatQty, latestNote, outstandingHeadline, tabletSegments, toneOf } from "@/components/job-screen/tablet-model";
import { countParts } from "@/components/job-screen/parts-summary";

describe("tablet part cards", () => {
  it("formats quantities", () => {
    expect(formatQty(12)).toBe("12");
    expect(formatQty("2.5")).toBe("2.5");
    expect(formatQty(0.333333)).toBe("0.3333");
    expect(formatQty(undefined)).toBe("0");
  });
  it("maps status to tone and label", () => {
    expect(toneOf("RECEIVED")).toBe("received");
    expect(toneOf("PICKED")).toBe("picked");
    expect(toneOf("IN_STOCK")).toBe("none");
    expect(buildTabletCard({ id: "1", status: "IN_STOCK", quantity: 1 }).statusLabel).toBe("In stock");
    expect(buildTabletCard({ id: "1", status: "PENDING", quantity: 1 }).statusLabel).toBe("Not ordered");
    expect(buildTabletCard({ id: "1", status: "PARTIALLY_RECEIVED", quantity: 2, receivedQuantity: 1 }).statusLabel).toBe("Partly received");
  });
  it("offers Choose supplier for an unordered part with no supplier", () => {
    const c = buildTabletCard({ id: "1", partNumber: "5474475", description: "Shaft", quantity: 1, status: "PENDING" });
    expect(c.action).toEqual({ kind: "supplier", label: "Choose supplier" });
    expect(c.note).toBe("No supplier yet");
    expect(c.qtyLabel).toBe("×1");
  });
  it("offers Mark received for an ordered part and shows supplier and order", () => {
    const c = buildTabletCard({ id: "1", partNumber: "2132410", quantity: 1, status: "ON_ORDER", supplierName: "Capital Equipment", orderNumber: "PO-9" });
    expect(c.action).toEqual({ kind: "receive", label: "Mark received" });
    expect(c.note).toBe("Capital Equipment · Order PO-9");
    expect(c.outstanding).toBe(1);
  });
  it("offers Receive n more when partly received", () => {
    const c = buildTabletCard({ id: "1", quantity: 12, receivedQuantity: 4, status: "PARTIALLY_RECEIVED", supplierName: "Blumaq" });
    expect(c.action).toEqual({ kind: "receive-rest", label: "Receive 8 more" });
    expect(c.note).toBe("4 of 12 in · Blumaq");
  });
  it("offers Undo receive once everything is in", () => {
    const c = buildTabletCard({ id: "1", quantity: 6, receivedQuantity: 6, status: "RECEIVED", supplierName: "Barloworld" });
    expect(c.action).toEqual({ kind: "undo", label: "Undo receive" });
    expect(c.note).toBe("6 of 6 · Barloworld");
    expect(c.outstanding).toBe(0);
  });
  it("lets a picked part still be marked received, and shows the pick slip", () => {
    const c = buildTabletCard({ id: "1", quantity: 1, pickedQuantity: 1, status: "PICKED" });
    expect(c.action?.kind).toBe("receive");
    expect(c.note).toBe("1 on pick slip");
    expect(c.statusLabel).toBe("On pick slip");
  });
  it("has no action for a fully received line with nothing received recorded", () => {
    expect(buildTabletCard({ id: "1", quantity: 0, status: "RECEIVED" }).action).toBeNull();
  });
  it("copes with missing part numbers", () => {
    expect(buildTabletCard({ id: "1", partNumber: null, quantity: 1 }).partNumber).toBe("—");
  });
});

describe("tablet summary", () => {
  it("lists only the facts that have values", () => {
    expect(buildTabletFacts({ machine: "CAT C9", machineSerial: "", componentSerial: "9HM", plantNumber: " SV-1 ", machineHours: "12 480" })).toEqual([
      { label: "Machine", value: "CAT C9" },
      { label: "Component serial", value: "9HM" },
      { label: "Plant number", value: "SV-1" },
      { label: "Machine hours", value: "12 480 h" },
    ]);
    expect(buildTabletFacts({})).toEqual([]);
  });
  it("shows Model, Component and Component model under the machine, in that order", () => {
    expect(buildTabletFacts({ machine: "CAT", model: "C9", component: "Turbo", componentModel: " GT4082 ", machineSerial: "S1" })).toEqual([
      { label: "Machine", value: "CAT" },
      { label: "Model", value: "C9" },
      { label: "Component", value: "Turbo" },
      { label: "Component model", value: "GT4082" },
      { label: "Machine serial", value: "S1" },
    ]);
    expect(buildTabletFacts({ model: "C9" }).map((f) => f.label)).toEqual(["Model"]);
    expect(buildTabletFacts({ component: " ", componentModel: "" })).toEqual([]);
  });
  it("adds field service facts only for field jobs", () => {
    expect(buildTabletFacts({ machine: "X", scheduled: "3 Nov 2026", technician: "Sam" }).map((f) => f.label)).toEqual(["Machine"]);
    expect(buildTabletFacts({ machine: "X", scheduled: "3 Nov 2026", technician: "Sam", fieldService: true }).map((f) => f.label)).toEqual(["Machine", "Scheduled", "Technician"]);
  });
  it("takes the last note line and shortens long ones", () => {
    expect(latestNote("first\n\nsecond line \n")).toBe("second line");
    expect(latestNote("")).toBe("");
    expect(latestNote(null)).toBe("");
    const long = "x".repeat(300);
    const out = latestNote(long, 50);
    expect(out.length).toBe(50);
    expect(out.endsWith("…")).toBe(true);
  });
  it("words the bottom-bar totals", () => {
    const lines = [{ status: "RECEIVED", quantity: 1, receivedQuantity: 1 }, { status: "ON_ORDER", quantity: 2, receivedQuantity: 0 }, { status: "PENDING", quantity: 1 }];
    const counts = countParts(lines);
    expect(outstandingHeadline(counts)).toEqual({ title: "2 parts outstanding", sub: "1 of 3 received" });
    expect(outstandingHeadline(countParts([lines[0]]))).toEqual({ title: "All parts received", sub: "1 of 1 received" });
    expect(outstandingHeadline(countParts([]))).toEqual({ title: "No parts yet", sub: "" });
    expect(outstandingHeadline(countParts([lines[1]])).title).toBe("1 part outstanding");
  });
  it("builds the four filter tabs", () => {
    const tabs = tabletSegments(countParts([{ status: "PICKED", quantity: 1, pickedQuantity: 1 }]));
    expect(tabs.map((t) => t.label)).toEqual(["All", "To receive", "On pick slip", "Received"]);
    expect(tabs.map((t) => t.count)).toEqual([1, 1, 1, 0]);
  });
  it("finds the current step", () => {
    expect(currentStepIndex(["A", "B", "C"], "B")).toBe(1);
    expect(currentStepIndex(["A"], "Z")).toBe(-1);
  });
});
