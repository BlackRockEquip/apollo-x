import { describe, expect, it } from "vitest";
import { ENGINEERING_STATUS_STEPS } from "@/lib/jobs/ui";
import { isItemReady, itemTag, jobFieldsFromFirstItem, MAX_ITEMS_PER_JOB, parseItemsPaste, summarizeItemStatuses } from "@/lib/jobs/item-model";

const steps = ENGINEERING_STATUS_STEPS;

describe("itemTag", () => {
  it("joins the job number and the item position", () => {
    expect(itemTag("BRE1122", 3)).toBe("BRE1122-3");
  });
  it("falls back to the position before a number exists", () => {
    expect(itemTag(null, 2)).toBe("#2");
    expect(itemTag("  ", 1)).toBe("#1");
  });
});

describe("isItemReady", () => {
  it("counts ready to deliver and everything after it", () => {
    expect(isItemReady("TO_BE_DELIVERED")).toBe(true);
    expect(isItemReady("DELIVERED_AWAITING_PAYMENT")).toBe(true);
    expect(isItemReady("COMPLETE")).toBe(true);
    expect(isItemReady("WORK_IN_PROGRESS")).toBe(false);
    expect(isItemReady("QC_CONTROL")).toBe(false);
  });
});

describe("summarizeItemStatuses", () => {
  it("is empty for no items", () => {
    expect(summarizeItemStatuses([], steps)).toEqual({ total: 0, ready: 0, mixed: false, status: null, counts: [] });
  });

  it("is not mixed when every item is at the same step", () => {
    const rollup = summarizeItemStatuses(["WORK_IN_PROGRESS", "WORK_IN_PROGRESS", "WORK_IN_PROGRESS"], steps);
    expect(rollup.mixed).toBe(false);
    expect(rollup.status).toBe("WORK_IN_PROGRESS");
    expect(rollup.counts).toEqual([{ status: "WORK_IN_PROGRESS", count: 3 }]);
  });

  it("is mixed, and follows the least advanced item, when items differ", () => {
    // Final drive, boom cylinder, swing motor, idler, drive shaft - the Blackrock example.
    const rollup = summarizeItemStatuses(["WORK_IN_PROGRESS", "AWAIT_OUTWORK", "AWAITING_GO_AHEAD", "QUOTE_IN_PROGRESS", "TO_BE_DELIVERED"], steps);
    expect(rollup.mixed).toBe(true);
    expect(rollup.total).toBe(5);
    expect(rollup.ready).toBe(1);
    expect(rollup.status).toBe("QUOTE_IN_PROGRESS");
  });

  it("lists the counts in flow order", () => {
    const rollup = summarizeItemStatuses(["QC_CONTROL", "TO_BE_RECEIVED", "QC_CONTROL", "AWAIT_ASSESSMENT"], steps);
    expect(rollup.counts.map((c) => c.status)).toEqual(["TO_BE_RECEIVED", "AWAIT_ASSESSMENT", "QC_CONTROL"]);
    expect(rollup.counts.find((c) => c.status === "QC_CONTROL")?.count).toBe(2);
  });

  it("ignores a cancelled item while others are still going", () => {
    const rollup = summarizeItemStatuses(["CANCELLED", "TO_BE_DELIVERED", "TO_BE_DELIVERED"], steps);
    expect(rollup.status).toBe("TO_BE_DELIVERED");
    expect(rollup.mixed).toBe(true);
  });

  it("cancels the job only when every item is cancelled", () => {
    expect(summarizeItemStatuses(["CANCELLED", "CANCELLED"], steps).status).toBe("CANCELLED");
  });

  it("moves to complete only when every item is complete", () => {
    expect(summarizeItemStatuses(["COMPLETE", "COMPLETE"], steps).status).toBe("COMPLETE");
    expect(summarizeItemStatuses(["COMPLETE", "TO_BE_DELIVERED"], steps).status).toBe("TO_BE_DELIVERED");
  });
});

describe("jobFieldsFromFirstItem", () => {
  it("copies item 1's machine and component details onto the job", () => {
    const fields = jobFieldsFromFirstItem({ component: "Swing motor", machineMake: "Komatsu", machineHours: "1200" });
    expect(fields.component).toBe("Swing motor");
    expect(fields.machineMake).toBe("Komatsu");
    expect(fields.machineHours).toBe("1200");
    expect(fields.plantNumber).toBeNull();
  });
  it("is all empty with no item", () => {
    expect(Object.values(jobFieldsFromFirstItem(undefined)).every((v) => v === null)).toBe(true);
  });
});

describe("parseItemsPaste", () => {
  it("reads tab separated rows from a spreadsheet", () => {
    const rows = parseItemsPaste("Final drive\tPC400-8\tSN1\tKomatsu\tPC400\tStrip and rebuild\nSwing motor\t\tSN2\tKomatsu\tPC400\tReseal");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ component: "Final drive", componentModel: "PC400-8", componentSerial: "SN1", machineMake: "Komatsu", machineModel: "PC400", workRequested: "Strip and rebuild" });
    expect(rows[1].componentModel).toBe("");
    expect(rows[1].workRequested).toBe("Reseal");
  });
  it("skips a header row", () => {
    const rows = parseItemsPaste("Component\tComponent model\tComponent serial\tMachine make\tMachine model\tWork requested\nIdler\tX\tY\tCAT\t349\tInspect");
    expect(rows).toHaveLength(1);
    expect(rows[0].component).toBe("Idler");
  });
  it("accepts semicolons and drops blank lines", () => {
    const rows = parseItemsPaste("Idler;;S1;CAT;349;Inspect\n\n   \nDrive shaft;;S2;CAT;349;Straighten");
    expect(rows.map((r) => r.component)).toEqual(["Idler", "Drive shaft"]);
  });
  it("is empty for nothing", () => {
    expect(parseItemsPaste("  \n \n")).toEqual([]);
  });
  it("never returns more than a job can hold", () => {
    const text = Array.from({ length: MAX_ITEMS_PER_JOB + 20 }, (_, i) => `Part ${i}\t\t\t\t\t`).join("\n");
    expect(parseItemsPaste(text)).toHaveLength(MAX_ITEMS_PER_JOB);
  });
});

import { DELIVERED_STATUS, defaultDeliveryPicks, deliveryNoteSuffix, itemDeliveryLine, itemsToMarkDelivered } from "@/lib/jobs/item-model";

const deliverable = [
  { id: "a", sequence: 1, status: "TO_BE_DELIVERED", component: "Final drive gearbox", componentModel: "PC400-8", componentSerial: "SN-1", machineMake: "Komatsu", machineModel: "PC400" },
  { id: "b", sequence: 2, status: "WORK_IN_PROGRESS", component: "Swing motor" },
  { id: "c", sequence: 3, status: "TO_BE_DELIVERED", component: "Idler wheel", componentSerial: "  " },
  { id: "d", sequence: 4, status: DELIVERED_STATUS, component: "Drive shaft" },
];

describe("delivery notes per item", () => {
  it("writes the line with the tag first and leaves out what is empty", () => {
    expect(itemDeliveryLine(deliverable[0], "BRE1122")).toBe("BRE1122-1 · Final drive gearbox · PC400-8 · S/N SN-1 · Komatsu PC400");
    expect(itemDeliveryLine(deliverable[2], "BRE1122")).toBe("BRE1122-3 · Idler wheel");
  });
  it("ticks only items that are ready and not yet delivered", () => {
    expect(defaultDeliveryPicks(deliverable)).toEqual(["a", "c"]);
  });
  it("moves on only the ticked items that were ready", () => {
    expect(itemsToMarkDelivered(deliverable, ["a", "b", "d"])).toEqual(["a"]);
    expect(itemsToMarkDelivered(deliverable, [])).toEqual([]);
  });
  it("names the saved note after the items on it", () => {
    expect(deliveryNoteSuffix(deliverable, ["c", "a"])).toBe("Items 1, 3");
    expect(deliveryNoteSuffix(deliverable, ["b"])).toBe("Item 2");
    expect(deliveryNoteSuffix(deliverable, [])).toBeUndefined();
  });
});

import { deliveryNoteItemCount, deliveryNoteNumber, readDeliveryNoteLines } from "@/lib/jobs/item-model";

describe("delivery note register", () => {
  it("numbers notes per job", () => {
    expect(deliveryNoteNumber("BRE1122", 1)).toBe("BRE1122-DN1");
    expect(deliveryNoteNumber(" BRE1122 ", 12)).toBe("BRE1122-DN12");
    expect(deliveryNoteNumber(null, 2)).toBe("JOB-DN2");
  });
  it("reads stored lines back safely", () => {
    expect(readDeliveryNoteLines(null)).toEqual([]);
    expect(readDeliveryNoteLines("nope")).toEqual([]);
    expect(readDeliveryNoteLines([{ description: "Swing motor", quantity: 1, itemId: "a" }, 7, null, { description: " ", quantity: "" }, { description: "Loose line", quantity: "2" }]))
      .toEqual([{ description: "Swing motor", quantity: "1", itemId: "a" }, { description: "Loose line", quantity: "2" }]);
  });
  it("counts the items on a note, not the typed lines", () => {
    expect(deliveryNoteItemCount([{ description: "a", quantity: "1", itemId: "x" }, { description: "b", quantity: "1", itemId: "x" }, { description: "c", quantity: "1", itemId: "y" }, { description: "d", quantity: "1" }])).toBe(2);
    expect(deliveryNoteItemCount([])).toBe(0);
  });
});

import { countItemLinks, ITEM_FILTER_ALL, ITEM_FILTER_JOB, itemLinkSummary, itemLinkTotal, itemOptionLabel, matchesItemFilter, normalizeItemFilter, withItemTag } from "@/lib/jobs/item-model";

describe("item links", () => {
  it("filters records by item", () => {
    expect(matchesItemFilter("a", ITEM_FILTER_ALL)).toBe(true);
    expect(matchesItemFilter(null, ITEM_FILTER_ALL)).toBe(true);
    expect(matchesItemFilter(null, ITEM_FILTER_JOB)).toBe(true);
    expect(matchesItemFilter("a", ITEM_FILTER_JOB)).toBe(false);
    expect(matchesItemFilter("a", "a")).toBe(true);
    expect(matchesItemFilter("b", "a")).toBe(false);
    expect(matchesItemFilter(undefined, "a")).toBe(false);
  });
  it("drops a filter for an item that is gone", () => {
    expect(normalizeItemFilter("a", ["a", "b"])).toBe("a");
    expect(normalizeItemFilter("x", ["a", "b"])).toBe(ITEM_FILTER_ALL);
    expect(normalizeItemFilter(ITEM_FILTER_JOB, [])).toBe(ITEM_FILTER_JOB);
  });
  it("labels an item for a select", () => {
    expect(itemOptionLabel({ sequence: 2, component: "Gearbox", componentModel: "GB-9" }, "BRE1122")).toBe("BRE1122-2 · Gearbox GB-9");
    expect(itemOptionLabel({ sequence: 3, component: null }, "BRE1122")).toBe("BRE1122-3");
    expect(itemOptionLabel({ sequence: 1, component: "Pump" }, null)).toBe("#1 · Pump");
  });
  it("counts what is tied to each item and ignores whole-job records", () => {
    const counts = countItemLinks({
      parts: [{ itemId: "a" }, { itemId: "a" }, { itemId: "b" }, { itemId: null }],
      outwork: [{ itemId: "a" }, {}],
      attachments: [{ itemId: "a", isPhoto: true }, { itemId: "a", isPhoto: false }, { itemId: "b", isPhoto: true }, { itemId: null, isPhoto: true }],
    });
    expect(counts).toEqual({ a: { parts: 2, outwork: 1, photos: 1, files: 1 }, b: { parts: 1, outwork: 0, photos: 1, files: 0 } });
    expect(itemLinkSummary(counts.a)).toBe("2 parts · 1 outwork · 1 photo · 1 file");
    expect(itemLinkSummary(counts.b)).toBe("1 part · 1 photo");
    expect(itemLinkSummary(undefined)).toBe("");
    expect(itemLinkTotal(counts.a)).toBe(5);
    expect(itemLinkTotal(undefined)).toBe(0);
  });
  it("puts the item tag in front of a line", () => {
    expect(withItemTag("BRE1122-2", "Seal kit")).toBe("[BRE1122-2] Seal kit");
    expect(withItemTag("BRE1122-2", " ")).toBe("[BRE1122-2]");
    expect(withItemTag(null, "Seal kit")).toBe("Seal kit");
    expect(withItemTag(undefined, null)).toBe("");
  });
});

import { buildPartsListSpec, type JobDocJob } from "@/lib/documents/job-specs";

describe("parts list with items", () => {
  const job = {
    type: "ENGINEERING", status: "IN_PROGRESS", jobNumber: "BRE1122", partLines: [
      { id: "p1", partNumber: "PN-1", description: "Seal kit", quantity: 2, itemId: "i2", status: "PENDING" },
      { id: "p2", partNumber: "PN-2", description: "Bearing", quantity: 1, itemId: null, status: "PENDING" },
    ],
    outworkItems: [],
    jobItems: [{ id: "i1", sequence: 1 }, { id: "i2", sequence: 2 }],
  } as unknown as JobDocJob;
  it("puts the item tag in front of a part tied to an item", () => {
    const spec = buildPartsListSpec({ title: "Parts list", jobLabel: "BRE1122", job });
    const table = spec.blocks.find((block) => block.type === "table") as { rows: string[][] };
    expect(table.rows[0][1]).toBe("[BRE1122-2] Seal kit");
    expect(table.rows[1][1]).toBe("Bearing");
  });
});

// 2026-10-29: the "Where the items are" stepper and the per-item activity filter.
import { activityMatchesItemFilter, buildStepperNodes, stepperDisplayStatus } from "@/lib/jobs/item-model";

describe("where the items are (stepper)", () => {
  const steps = ENGINEERING_STATUS_STEPS as unknown as string[];

  it("counts items per step and marks steps before the least advanced item as done", () => {
    const nodes = buildStepperNodes(steps, ["AWAIT_ASSESSMENT", "AWAIT_ASSESSMENT", "WORK_IN_PROGRESS", "TO_BE_DELIVERED"]);
    const byStep = Object.fromEntries(nodes.map((node) => [node.step, node]));
    expect(byStep.AWAIT_ASSESSMENT.count).toBe(2);
    expect(byStep.AWAIT_ASSESSMENT.state).toBe("current");
    expect(byStep.TO_BE_RECEIVED.state).toBe("done");
    expect(byStep.WORK_IN_PROGRESS.state).toBe("ahead");
    expect(byStep.QUOTE_IN_PROGRESS.count).toBe(0);
    expect(nodes.every((node) => node.count === 0 || node.state !== "done")).toBe(true);
  });

  it("ignores cancelled items", () => {
    const nodes = buildStepperNodes(steps, ["CANCELLED", "WORK_IN_PROGRESS"]);
    expect(nodes.find((node) => node.state === "current")?.step).toBe("WORK_IN_PROGRESS");
    expect(nodes.reduce((sum, node) => sum + node.count, 0)).toBe(1);
  });

  it("shows an empty flow when nothing is live", () => {
    expect(buildStepperNodes(steps, []).every((node) => node.state === "idle" && node.count === 0)).toBe(true);
    expect(buildStepperNodes(steps, ["CANCELLED"]).every((node) => node.state === "idle")).toBe(true);
  });

  it("folds the two merged statuses onto their stepper step and rings the selected item's step", () => {
    expect(stepperDisplayStatus("WAITING_FOR_PARTS")).toBe("AWAIT_OUTWORK");
    expect(stepperDisplayStatus("TO_BE_COLLECTED")).toBe("TO_BE_RECEIVED");
    expect(stepperDisplayStatus("QUOTE_IN_PROGRESS")).toBe("QUOTE_IN_PROGRESS");
    const nodes = buildStepperNodes(steps, ["WAITING_FOR_PARTS", "WORK_IN_PROGRESS"], "WAITING_FOR_PARTS");
    expect(nodes.find((node) => node.selected)?.step).toBe("AWAIT_OUTWORK");
    expect(nodes.find((node) => node.step === "AWAIT_OUTWORK")?.count).toBe(1);
  });

  it("a one-item job puts its single item on the job's step", () => {
    const nodes = buildStepperNodes(steps, ["QUOTE_IN_PROGRESS"]);
    expect(nodes.find((node) => node.step === "QUOTE_IN_PROGRESS")).toMatchObject({ count: 1, state: "current" });
  });
});

describe("activity follows the selected item", () => {
  it("shows everything for all items", () => {
    expect(activityMatchesItemFilter({ itemId: "a" }, ITEM_FILTER_ALL)).toBe(true);
    expect(activityMatchesItemFilter(null, ITEM_FILTER_ALL)).toBe(true);
  });
  it("shows the item's own entries and the job-wide ones for a selected item", () => {
    expect(activityMatchesItemFilter({ itemId: "a" }, "a")).toBe(true);
    expect(activityMatchesItemFilter({ itemId: "b" }, "a")).toBe(false);
    expect(activityMatchesItemFilter(null, "a")).toBe(true);
    expect(activityMatchesItemFilter({ from: "X" }, "a")).toBe(true);
  });
  it("shows only job-wide entries for the whole-job filter", () => {
    expect(activityMatchesItemFilter({ itemId: "a" }, ITEM_FILTER_JOB)).toBe(false);
    expect(activityMatchesItemFilter(undefined, ITEM_FILTER_JOB)).toBe(true);
  });
});
