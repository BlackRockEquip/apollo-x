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

import { DELIVERED_STATUS, defaultDeliveryPicks, deliveryNoteSuffix, itemDeliveryLine, itemIdsOnNotes, itemsOfferedForDelivery, itemsToMarkDelivered } from "@/lib/jobs/item-model";

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
  it("moves on every ticked item that is not delivered yet, ready or not", () => {
    expect(itemsToMarkDelivered(deliverable, ["a", "b", "d"])).toEqual(["a", "b"]);
    expect(itemsToMarkDelivered(deliverable, [])).toEqual([]);
    expect(itemsToMarkDelivered([...deliverable, { id: "e", sequence: 5, status: "CANCELLED" }, { id: "f", sequence: 6, status: "COMPLETE" }], ["d", "e", "f"])).toEqual([]);
  });
  it("takes items that are already on a printed note out of the picker", () => {
    const notes = [{ lines: [{ description: "x", quantity: "1", itemId: "a" }, { description: "typed", quantity: "2" }] }, { lines: [{ description: "y", quantity: "1", itemId: "c" }] }];
    expect(itemIdsOnNotes(notes).sort()).toEqual(["a", "c"]);
    expect(itemIdsOnNotes([])).toEqual([]);
    expect(itemsOfferedForDelivery(deliverable, ["a"]).map((item) => item.id)).toEqual(["b", "c", "d"]);
    expect(itemsOfferedForDelivery([...deliverable, { id: "z", sequence: 9, status: "CANCELLED" }], []).map((item) => item.id)).toEqual(["a", "b", "c", "d"]);
    expect(defaultDeliveryPicks(itemsOfferedForDelivery(deliverable, ["a"]))).toEqual(["c"]);
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
      reports: [{ itemId: "a" }, { itemId: "a" }, { itemId: null }],
    });
    expect(counts).toEqual({ a: { parts: 2, outwork: 1, photos: 1, files: 1, reports: 2 }, b: { parts: 1, outwork: 0, photos: 1, files: 0, reports: 0 } });
    expect(itemLinkSummary(counts.a)).toBe("2 parts · 1 outwork · 2 reports · 1 photo · 1 file");
    expect(itemLinkSummary(counts.b)).toBe("1 part · 1 photo");
    expect(itemLinkSummary(undefined)).toBe("");
    expect(itemLinkTotal(counts.a)).toBe(7);
    expect(itemLinkTotal(undefined)).toBe(0);
  });
  it("still counts when no reports are passed", () => {
    expect(countItemLinks({ parts: [{ itemId: "a" }], outwork: [], attachments: [] })).toEqual({ a: { parts: 1, outwork: 0, photos: 0, files: 0, reports: 0 } });
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

// 2026-10-29: job tags, printers, tabs in item view, tablet card tag, job card with every item.
import { code128Modules, code128Svg } from "@/lib/labels/code128";
import { DEFAULT_LABEL_SIZE_ID, LABEL_SIZES, buildJobTagLabels, expandCopies, labelSizeById, renderTagsHtml } from "@/lib/labels/job-tags";
import { LABEL_PRINTERS, labelPrinterById, parseLabelPrintSettings } from "@/lib/printing/label-printers";
import { jobCardItemsTable } from "@/lib/documents/job-specs";
import { buildJobTabs } from "@/components/job-screen/job-tabs";
import { buildTabletCard } from "@/components/job-screen/tablet-model";

describe("Code 128 barcode", () => {
  it("encodes in code set B with the standard checksum (references from the python-barcode library)", () => {
    expect(code128Modules("BRE12-2")).toBe("1101001000010001011000110001011101000110100010011100110110011100101001101110011001110010101000111101100011101011");
    expect(code128Modules("HG1-3")).toBe("110100100001100010100011010001000100111001101001101110011001011100100011001001100011101011");
  });
  it("is 11 modules per symbol plus the 13-module stop", () => {
    expect(code128Modules("A").length).toBe(11 * 3 + 13);
    expect(code128Modules("BRE1122-12").length).toBe(11 * 12 + 13);
  });
  it("rejects characters it cannot show and empty values", () => {
    expect(() => code128Modules("")).toThrow();
    expect(() => code128Modules("café")).toThrow();
  });
  it("draws an SVG with one rect per bar", () => {
    const svg = code128Svg("BRE1122-2");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("<rect");
    expect(svg).not.toContain("<script");
  });
});

describe("job tags", () => {
  const items = [
    { sequence: 2, component: "Planetary Housing", componentModel: "AD30", componentSerial: "SN-2", machineMake: "Cat", machineModel: "AD30", plantNumber: "P12" },
    { sequence: 1, component: "Housing", componentModel: "AD30" },
  ];
  it("builds one label per item in item order with the tag, lines and position", () => {
    const labels = buildJobTagLabels({ jobNumber: "HG00001", customerName: " Black Rock ", received: "2026-10-29T08:00:00Z", items });
    expect(labels.map((label) => label.tag)).toEqual(["HG00001-1", "HG00001-2"]);
    expect(labels[1]).toMatchObject({ component: "Planetary Housing", componentLine: "AD30 · S/N SN-2", machineLine: "Cat AD30 · Plant P12", customer: "Black Rock", position: "Item 2 of 2" });
    expect(labels[0].machineLine).toBe("");
    expect(labels[0].received).not.toBe("");
  });
  it("uses the whole job's item count for the position when only some items are printed", () => {
    const labels = buildJobTagLabels({ jobNumber: "HG00001", items: [items[0]], totalItems: 5 });
    expect(labels[0].position).toBe("Item 2 of 5");
  });
  it("repeats each label for the copies asked (1 to 20)", () => {
    const labels = buildJobTagLabels({ jobNumber: "HG00001", items });
    expect(expandCopies(labels, 3)).toHaveLength(6);
    expect(expandCopies(labels, 0)).toHaveLength(2);
    expect(expandCopies(labels, 99)).toHaveLength(40);
    expect(expandCopies(labels, Number.NaN)).toHaveLength(2);
  });
  it("renders a page per label sized to the label, escaping text", () => {
    const labels = buildJobTagLabels({ jobNumber: "HG00001", customerName: "A & <B>", items });
    const html = renderTagsHtml(labels, labelSizeById("76x51"), { autoPrint: true });
    expect(html).toContain("@page{size:76mm 51mm;margin:0}");
    expect(html.match(/class="label"/g)).toHaveLength(2);
    expect(html).toContain("A &amp; &lt;B&gt;");
    expect(html).toContain("window.print()");
    expect(renderTagsHtml(labels, labelSizeById("76x51"))).not.toContain("window.print()");
  });
  it("knows its label sizes and falls back to the default", () => {
    expect(LABEL_SIZES.length).toBeGreaterThan(1);
    expect(labelSizeById("nope").id).toBe(DEFAULT_LABEL_SIZE_ID);
  });
});

describe("label printers", () => {
  it("lists the browser printer and falls back to it", () => {
    expect(LABEL_PRINTERS.map((printer) => printer.id)).toContain("browser");
    expect(labelPrinterById("zebra-not-installed").id).toBe("browser");
  });
  it("reads saved settings safely", () => {
    expect(parseLabelPrintSettings(null)).toEqual({ printerId: "browser", sizeId: DEFAULT_LABEL_SIZE_ID });
    expect(parseLabelPrintSettings("{not json")).toEqual({ printerId: "browser", sizeId: DEFAULT_LABEL_SIZE_ID });
    expect(parseLabelPrintSettings(JSON.stringify({ printerId: "browser", sizeId: "100x150" }))).toEqual({ printerId: "browser", sizeId: "100x150" });
    expect(parseLabelPrintSettings(JSON.stringify({ printerId: "gone", sizeId: "gone" }))).toEqual({ printerId: "browser", sizeId: DEFAULT_LABEL_SIZE_ID });
  });
});

describe("tabs in the item view", () => {
  const base = { showParts: true, showPickSlips: false, showFollowup: false, showOutwork: true, showSpecifications: true, showPex: false, showWarranty: false, showActivity: true, partsCount: 3, pickSlipsCount: 0, followupCount: 0, outworkCount: 0, attachmentsCount: 2 };
  it("keeps the usual names and counts without the item view", () => {
    const tabs = buildJobTabs(base);
    expect(tabs.map((tab) => tab.label)).toEqual(["Overview", "Parts list", "Outwork", "Specifications", "Photos & attachments", "Activity"]);
    expect(tabs.find((tab) => tab.key === "specifications")?.count).toBeUndefined();
  });
  it("names the tabs like the item mockup and counts reports and activity", () => {
    const tabs = buildJobTabs({ ...base, itemView: true, reportsCount: 1, activityCount: 3 });
    expect(tabs.map((tab) => tab.label)).toEqual(["Details", "Parts", "Outwork", "Specifications", "Photos & files", "Activity"]);
    expect(tabs.find((tab) => tab.key === "specifications")?.count).toBe(1);
    expect(tabs.find((tab) => tab.key === "activity")?.count).toBe(3);
    expect(tabs.find((tab) => tab.key === "outwork")?.count).toBe(0);
  });
});

describe("tablet card item tag", () => {
  it("carries the item tag, blank for a whole-job part", () => {
    expect(buildTabletCard({ id: "1", partNumber: "P1", quantity: 1, itemTag: " BRE1122-2 " }).itemTag).toBe("BRE1122-2");
    expect(buildTabletCard({ id: "2", partNumber: "P2", quantity: 1 }).itemTag).toBe("");
  });
});

describe("job card with every item", () => {
  const base = { type: "STANDARD_REPAIR", status: "TO_BE_RECEIVED", jobNumber: "BRE1122", partLines: [], outworkItems: [] };
  it("is not used for a one-item job", () => {
    expect(jobCardItemsTable(base)).toBeNull();
    expect(jobCardItemsTable({ ...base, jobItems: [{ sequence: 1 }] })).toBeNull();
  });
  it("lists every item in order with its tag, component, machine and work", () => {
    const table = jobCardItemsTable({
      ...base,
      jobItems: [
        { sequence: 2, component: "Gearbox", componentModel: "GB-9", componentSerial: "S2", machineMake: "Cat", machineModel: "D9", plantNumber: "P7", workRequested: "Reseal" },
        { sequence: 1, component: "Pump", workRequested: null },
      ],
    });
    expect(table?.headers).toHaveLength(5);
    expect(table?.rows[0]).toEqual(["BRE1122-1", "Pump", "—", "—", "—"]);
    expect(table?.rows[1]).toEqual(["BRE1122-2", "Gearbox", "GB-9 · S/N S2", "Cat D9 · Plant P7", "Reseal"]);
  });
});
