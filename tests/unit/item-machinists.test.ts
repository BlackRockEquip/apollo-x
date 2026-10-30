import { describe, expect, it } from "vitest";
import { itemMachinists, machinistSummary } from "@/lib/jobs/item-model";
import { blankDraft, draftToPayload, isBlankDraft, rowToDraft, type ItemRow } from "@/components/job-items/item-draft";
import { jobCardItemsTable } from "@/lib/documents/job-specs";
import { jobItemInput, jobItemUpdateInput } from "@/lib/jobs/validation";

describe("item machinists", () => {
  const job = { stripMechanicId: "m-job-strip", buildMechanicId: "m-job-build" };

  it("follow the job's machinists until the item has its own", () => {
    expect(itemMachinists({}, job)).toEqual({ strip: "m-job-strip", build: "m-job-build", stripInherited: true, buildInherited: true });
    expect(itemMachinists({ stripMechanicId: null, buildMechanicId: "" }, job).stripInherited).toBe(true);
  });

  it("use the item's own machinist for just the field that is set", () => {
    const m = itemMachinists({ stripMechanicId: "m-own" }, job);
    expect(m).toEqual({ strip: "m-own", build: "m-job-build", stripInherited: false, buildInherited: true });
  });

  it("are empty when neither the item nor the job has one", () => {
    expect(itemMachinists({}, {})).toEqual({ strip: null, build: null, stripInherited: true, buildInherited: true });
  });

  it("summarise as Assess / Final, leaving out what is not set", () => {
    expect(machinistSummary("Piet", "Sipho")).toBe("Piet / Sipho");
    expect(machinistSummary("Piet", "Piet")).toBe("Piet");
    expect(machinistSummary("Piet", "")).toBe("Piet");
    expect(machinistSummary(null, "Sipho")).toBe("Sipho");
    expect(machinistSummary("", undefined)).toBe("");
  });
});

describe("item machinists on the screens' data", () => {
  it("travel in the draft payload; blank means follow the job", () => {
    const draft = { ...blankDraft(), component: "Gearbox", stripMechanicId: "ckabc123def456ghi789jkl0m" };
    const payload = draftToPayload(draft);
    expect(payload.stripMechanicId).toBe("ckabc123def456ghi789jkl0m");
    expect(payload.buildMechanicId).toBeNull();
  });

  it("do not make an empty row count as an item", () => {
    expect(isBlankDraft({ ...blankDraft(), stripMechanicId: "ckabc123def456ghi789jkl0m" })).toBe(true);
  });

  it("come back from a saved item into the editor", () => {
    const row = { id: "i1", sequence: 2, status: "WORK_IN_PROGRESS", component: "Gearbox", componentModel: null, componentSerial: null, componentPartNumber: null, machineMake: null, machineModel: null, machineSerial: null, plantNumber: null, machineHours: null, workRequested: null, conditionOnReceipt: null, etaDate: null, mechanicEtaDate: null, stripMechanicId: "m1", buildMechanicId: null } as ItemRow;
    const draft = rowToDraft(row);
    expect(draft.stripMechanicId).toBe("m1");
    expect(draft.buildMechanicId).toBe("");
  });

  it("are accepted by the API for a new item and for an edit, and null clears them", () => {
    const id = "ckabc123def456ghi789jkl0m";
    expect(jobItemInput.parse({ component: "Gearbox", stripMechanicId: id }).stripMechanicId).toBe(id);
    expect(jobItemUpdateInput.parse({ buildMechanicId: null }).buildMechanicId).toBeNull();
    expect(jobItemUpdateInput.parse({ status: "WORK_IN_PROGRESS" }).stripMechanicId).toBeUndefined();
    expect(() => jobItemInput.parse({ stripMechanicId: "not-an-id" })).toThrow();
  });
});

describe("job card items table", () => {
  const job = { jobNumber: "BRE1", jobItems: [
    { sequence: 1, component: "Gearbox", stripMechanicId: "a" },
    { sequence: 2, component: "Differential", stripMechanicId: null },
  ] } as never;

  it("has no machinist column unless asked for (old behaviour)", () => {
    expect(jobCardItemsTable(job)?.headers).not.toContain("Machinists");
  });

  it("lists who works on each item", () => {
    const names: Record<string, string> = { a: "Piet / Sipho" };
    const table = jobCardItemsTable(job, { machinistHeader: "Machinists", machinistsOf: (item) => (item.stripMechanicId ? names[String(item.stripMechanicId)] : "Thabo") });
    expect(table?.headers).toEqual(["Item", "Component", "Model / serial / part no.", "Machine", "Machinists", "Work requested"]);
    expect(table?.rows[0][4]).toBe("Piet / Sipho");
    expect(table?.rows[1][4]).toBe("Thabo");
    expect(table?.rows.every((row) => row.length === table.headers.length)).toBe(true);
  });
});
