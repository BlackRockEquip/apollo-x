// 2026-11-25, "multiple jobs within a job": the rules for inside jobs of different job types (a field job and a repair inside one job).
import { describe, expect, it } from "vitest";
import {
  ITEM_JOB_TYPES,
  flowProgress,
  isItemJobType,
  itemEffectivePo,
  itemEffectiveType,
  itemsShareOneFlow,
  jobPoNumbers,
  jobTypeAllowsItems,
  summarizeFlowItems,
  summarizeItemStatuses,
} from "@/lib/jobs/item-model";
import { blankDraft, draftToPayload, rowToDraft } from "@/components/job-items/item-draft";
import { FIELD_SERVICE_STATUS_STEPS, MAIN_WORKSHOP_STATUS_STEPS, ENGINEERING_STATUS_STEPS, statusStepsForJobType } from "@/lib/jobs/ui";
import { jobItemInput, jobItemUpdateInput } from "@/lib/jobs/validation";

const repairSteps = statusStepsForJobType("STANDARD_REPAIR", null);
const fieldSteps = statusStepsForJobType("FIELD_SERVICE", null);

describe("inside job types", () => {
  it("offers repair, partial repair, field service and outright sale, never PEX or warranty", () => {
    expect([...ITEM_JOB_TYPES]).toEqual(["STANDARD_REPAIR", "PARTIAL_REPAIR", "FIELD_SERVICE", "OUTRIGHT_SALE"]);
    expect(isItemJobType("FIELD_SERVICE")).toBe(true);
    expect(isItemJobType("PEX_SUPPLY")).toBe(false);
    expect(isItemJobType("WARRANTY")).toBe(false);
    expect(isItemJobType(null)).toBe(false);
  });

  it("keeps PEX jobs from holding inside jobs", () => {
    expect(jobTypeAllowsItems("PEX_SUPPLY")).toBe(false);
    expect(jobTypeAllowsItems("PEX_RETURN")).toBe(false);
    expect(jobTypeAllowsItems("STANDARD_REPAIR")).toBe(true);
    expect(jobTypeAllowsItems("FIELD_SERVICE")).toBe(true);
  });

  it("works as the item's own type, else the job's", () => {
    expect(itemEffectiveType("FIELD_SERVICE", "STANDARD_REPAIR")).toBe("FIELD_SERVICE");
    expect(itemEffectiveType(null, "STANDARD_REPAIR")).toBe("STANDARD_REPAIR");
    expect(itemEffectiveType("", "OUTRIGHT_SALE")).toBe("OUTRIGHT_SALE");
    expect(itemEffectiveType(undefined, "FIELD_SERVICE")).toBe("FIELD_SERVICE");
  });

  it("accepts a type on an item and rejects PEX", () => {
    expect(jobItemInput.parse({ type: "FIELD_SERVICE" }).type).toBe("FIELD_SERVICE");
    expect(jobItemInput.parse({}).type).toBeUndefined();
    expect(jobItemInput.parse({ type: null }).type).toBeNull();
    expect(() => jobItemInput.parse({ type: "PEX_SUPPLY" })).toThrow();
    expect(jobItemUpdateInput.parse({ type: "STANDARD_REPAIR", status: "IN_PROGRESS" }).status).toBe("IN_PROGRESS");
  });
});

describe("how far through its own steps an inside job is", () => {
  it("is 0 at the first step and 1 at the last", () => {
    expect(flowProgress(fieldSteps[0], fieldSteps)).toBe(0);
    expect(flowProgress(fieldSteps[fieldSteps.length - 1], fieldSteps)).toBe(1);
    expect(flowProgress(repairSteps[0], repairSteps)).toBe(0);
    expect(flowProgress("COMPLETE", repairSteps)).toBe(1);
  });
  it("counts a status outside the list as finished", () => {
    expect(flowProgress("CLOSED", repairSteps)).toBe(1);
    expect(flowProgress("CANCELLED", fieldSteps)).toBe(1);
  });
  it("keeps the three flows apart", () => {
    expect(fieldSteps).toEqual(FIELD_SERVICE_STATUS_STEPS);
    expect(statusStepsForJobType("STANDARD_REPAIR", null)).toEqual(MAIN_WORKSHOP_STATUS_STEPS);
    expect(statusStepsForJobType("STANDARD_REPAIR", "ENGINEERING")).toEqual(ENGINEERING_STATUS_STEPS);
  });
});

describe("rolling up inside jobs that follow different steps", () => {
  it("matches the old roll-up when every inside job uses the same steps", () => {
    const statuses = ["TO_STRIP", "STRIPPING", "TESTING"];
    const old = summarizeItemStatuses(statuses, repairSteps);
    const flow = summarizeFlowItems(statuses.map((status) => ({ status, steps: repairSteps })));
    expect(flow).toEqual(old);
    expect(itemsShareOneFlow(statuses.map((status) => ({ status, steps: repairSteps })))).toBe(true);
  });

  it("follows the job that is least far along its own steps", () => {
    // Field job is on step 2 of 5 (25%); the repair is on step 9 of 13 (about 67%). The field job holds the job back.
    const rollup = summarizeFlowItems([
      { status: "ON_ROUTE", steps: fieldSteps },
      { status: "TESTING", steps: repairSteps },
    ]);
    expect(rollup.status).toBe("ON_ROUTE");
    expect(rollup.mixed).toBe(true);
    expect(rollup.total).toBe(2);
  });

  it("follows the repair when it is the one behind", () => {
    const rollup = summarizeFlowItems([
      { status: "COMPLETE", steps: fieldSteps },
      { status: "TO_STRIP", steps: repairSteps },
    ]);
    expect(rollup.status).toBe("TO_STRIP");
  });

  it("lets item 1 win a tie", () => {
    const rollup = summarizeFlowItems([
      { status: fieldSteps[0], steps: fieldSteps },
      { status: repairSteps[0], steps: repairSteps },
    ]);
    expect(rollup.status).toBe(fieldSteps[0]);
  });

  it("ignores a cancelled inside job while another is still going", () => {
    const rollup = summarizeFlowItems([
      { status: "CANCELLED", steps: fieldSteps },
      { status: "ASSEMBLY", steps: repairSteps },
    ]);
    expect(rollup.status).toBe("ASSEMBLY");
  });

  it("is cancelled when every inside job is cancelled", () => {
    expect(summarizeFlowItems([
      { status: "CANCELLED", steps: fieldSteps },
      { status: "CANCELLED", steps: repairSteps },
    ]).status).toBe("CANCELLED");
  });

  it("counts the ones ready to deliver or finished", () => {
    const rollup = summarizeFlowItems([
      { status: "COMPLETE", steps: fieldSteps },
      { status: "TO_BE_DELIVERED", steps: repairSteps },
      { status: "ASSEMBLY", steps: repairSteps },
    ]);
    expect(rollup.ready).toBe(2);
    expect(rollup.total).toBe(3);
  });

  it("lists the counts furthest-behind first", () => {
    const rollup = summarizeFlowItems([
      { status: "COMPLETE", steps: fieldSteps },
      { status: "TO_STRIP", steps: repairSteps },
    ]);
    expect(rollup.counts.map((entry) => entry.status)).toEqual(["TO_STRIP", "COMPLETE"]);
  });

  it("handles no inside jobs", () => {
    expect(summarizeFlowItems([])).toEqual({ total: 0, ready: 0, mixed: false, status: null, counts: [] });
  });
});

// 2026-11-25: each inside job can have its own customer PO; the job's own PO is the default for one without.
describe("customer PO on an inside job", () => {
  it("uses the job's own PO unless the inside job has one", () => {
    expect(itemEffectivePo("PO-77311", "PO-77204")).toBe("PO-77311");
    expect(itemEffectivePo(null, "PO-77204")).toBe("PO-77204");
    expect(itemEffectivePo("  ", "PO-77204")).toBe("PO-77204");
    expect(itemEffectivePo(undefined, null)).toBe("");
  });

  it("lists every distinct PO across the jobs, in order", () => {
    expect(jobPoNumbers("PO-1", [{ customerPo: null }, { customerPo: "PO-2" }, { customerPo: "PO-2" }])).toEqual(["PO-1", "PO-2"]);
    expect(jobPoNumbers("PO-1", [{ customerPo: "PO-2" }, { customerPo: "PO-3" }])).toEqual(["PO-2", "PO-3"]);
    expect(jobPoNumbers("PO-1", [])).toEqual(["PO-1"]);
    expect(jobPoNumbers(null, [{ customerPo: null }])).toEqual([]);
  });

  it("is accepted on an item, trimmed, and is optional", () => {
    expect(jobItemInput.parse({ customerPo: "  PO-77311 " }).customerPo).toBe("PO-77311");
    expect(jobItemInput.parse({}).customerPo).toBeUndefined();
    expect(jobItemInput.parse({ customerPo: null }).customerPo).toBeNull();
  });

  it("goes to and from the screen's draft", () => {
    const draft = { ...blankDraft(), customerPo: " PO-9 " };
    expect(draftToPayload(draft).customerPo).toBe("PO-9");
    expect(draftToPayload(blankDraft()).customerPo).toBeNull();
    const row = { id: "x", sequence: 2, status: "TO_BE_RECEIVED", customerPo: "PO-5", component: null, componentModel: null, componentSerial: null, componentPartNumber: null, machineMake: null, machineModel: null, machineSerial: null, plantNumber: null, machineHours: null, workRequested: null, conditionOnReceipt: null, etaDate: null, mechanicEtaDate: null };
    expect(rowToDraft(row).customerPo).toBe("PO-5");
    expect(rowToDraft({ ...row, customerPo: null }).customerPo).toBe("");
  });
});
