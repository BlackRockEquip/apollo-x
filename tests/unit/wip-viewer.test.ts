import { describe, expect, it } from "vitest";
import { WIP_VIEWER_COLUMNS, wipColumnLabel, wipColumnLabelsFor } from "@/lib/jobs/wip-columns";
import { machinistFieldLabels } from "@/lib/jobs/ui";

describe("WIP View user type (Engineering Business)", () => {
  it("sees exactly Job #, Job type, Status, Machine model, Component and Machinist ETA", () => {
    expect(WIP_VIEWER_COLUMNS).toEqual(["jobNumber", "type", "status", "machineModel", "component", "mechanicEtaDate"]);
    const labels = wipColumnLabelsFor("ENGINEERING");
    expect(WIP_VIEWER_COLUMNS.map((id) => labels[id])).toEqual(["Job #", "Job type", "Status", "Machine model", "Component", "Machinist ETA"]);
  });
  it("shows no customer columns", () => {
    for (const id of ["customerName", "customerTradingName", "customerReference", "customerPo"] as const) expect(WIP_VIEWER_COLUMNS).not.toContain(id);
  });
});

describe("Machinist ETA label", () => {
  it("Engineering reads Machinist ETA everywhere; Workshop keeps Mechanic ETA date", () => {
    expect(wipColumnLabel("mechanicEtaDate", "ENGINEERING")).toBe("Machinist ETA");
    expect(wipColumnLabel("mechanicEtaDate", "WORKSHOP")).toBe("Mechanic ETA date");
    expect(machinistFieldLabels("ENGINEERING").eta).toBe("Machinist ETA");
    expect(machinistFieldLabels("ENGINEERING").etaShort).toBe("Machinist ETA");
    expect(machinistFieldLabels("WORKSHOP").eta).toBe("Mechanic ETA date");
    expect(machinistFieldLabels(undefined).etaShort).toBe("Mechanic ETA");
  });
});
