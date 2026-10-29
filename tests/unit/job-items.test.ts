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
