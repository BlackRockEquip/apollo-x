import { describe, expect, it } from "vitest";
import { WIP_VIEWER_COLUMNS, wipColumnLabel, wipColumnLabelsFor } from "@/lib/jobs/wip-columns";
import { tenantRoleLabelsFor, tenantRolesFor } from "@/lib/constants";
import { DOCUMENT_CHECK_CONFIRM, etaOverdueDays, machinistFieldLabels, needsDocumentCheck } from "@/lib/jobs/ui";

describe("WIP View user type (Engineering Business)", () => {
  it("sees exactly Job #, Job type, Status, Machine model, Component and Machinist ETA", () => {
    expect(WIP_VIEWER_COLUMNS).toEqual(["jobNumber", "type", "status", "machineModel", "component", "mechanicEtaDate", "etaOverdue"]);
    const labels = wipColumnLabelsFor("ENGINEERING");
    expect(WIP_VIEWER_COLUMNS.map((id) => labels[id])).toEqual(["Job #", "Job type", "Status", "Machine model", "Component", "Machinist ETA", "ETA Overdue"]);
  });
  it("shows no customer columns", () => {
    for (const id of ["customerName", "customerTradingName", "customerReference", "customerPo"] as const) expect(WIP_VIEWER_COLUMNS).not.toContain(id);
  });
});

describe("ETA Overdue column", () => {
  const now = new Date("2026-10-20T10:00:00Z");
  it("counts whole days past the ETA and is empty while not yet overdue", () => {
    expect(etaOverdueDays("2026-10-17T00:00:00Z", "WORK_IN_PROGRESS", now)).toBe(3);
    expect(etaOverdueDays("2026-10-19T00:00:00Z", "WORK_IN_PROGRESS", now)).toBe(1);
    expect(etaOverdueDays("2026-10-20T00:00:00Z", "WORK_IN_PROGRESS", now)).toBeNull();
    expect(etaOverdueDays("2026-10-25T00:00:00Z", "WORK_IN_PROGRESS", now)).toBeNull();
    expect(etaOverdueDays(null, "WORK_IN_PROGRESS", now)).toBeNull();
  });
  it("is not overdue once the work is finished", () => {
    expect(etaOverdueDays("2026-10-01T00:00:00Z", "TO_BE_DELIVERED", now)).toBeNull();
    expect(etaOverdueDays("2026-10-01T00:00:00Z", "COMPLETE", now)).toBeNull();
  });
});

describe("Documents check when moving to To be delivered or later (Engineering)", () => {
  it("asks only for Engineering, only from To be delivered upwards", () => {
    for (const status of ["TO_BE_DELIVERED", "DELIVERED_AWAITING_PAYMENT", "COMPLETE", "CLOSED"]) expect(needsDocumentCheck("ENGINEERING", status)).toBe(true);
    for (const status of ["TO_BE_RECEIVED", "WORK_IN_PROGRESS", "QC_CONTROL", "AWAIT_OUTWORK"]) expect(needsDocumentCheck("ENGINEERING", status)).toBe(false);
    expect(needsDocumentCheck("WORKSHOP", "TO_BE_DELIVERED")).toBe(false);
    expect(needsDocumentCheck(null, "COMPLETE")).toBe(false);
  });
  it("uses the wording asked for", () => {
    expect(DOCUMENT_CHECK_CONFIRM.message).toBe("Are all documents, specification sheets uploaded that are required?");
    expect([DOCUMENT_CHECK_CONFIRM.confirmLabel, DOCUMENT_CHECK_CONFIRM.cancelLabel]).toEqual(["Confirmed", "Cancel"]);
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

describe("WIP View (View Only) is offered to both builds", () => {
  it("Workshop and Engineering companies can both be given the view-only type", () => {
    expect(tenantRolesFor("WORKSHOP")).toContain("WIP_VIEWER");
    expect(tenantRolesFor("ENGINEERING")).toContain("WIP_VIEWER");
    expect(tenantRolesFor(null)).toContain("WIP_VIEWER");
  });
  it("uses the same label in both builds", () => {
    expect(tenantRoleLabelsFor("WORKSHOP").WIP_VIEWER).toBe("WIP View (View Only)");
    expect(tenantRoleLabelsFor("ENGINEERING").WIP_VIEWER).toBe("WIP View (View Only)");
  });
  it("Workshop keeps its other user types", () => {
    expect(tenantRolesFor("WORKSHOP")).toEqual(["COMPANY_ADMIN", "MANAGER", "USER", "STORE_CONTROLLER", "SALES", "FINANCE", "WIP_VIEWER"]);
  });
  it("Workshop view-only users see the Mechanic ETA date wording", () => {
    const labels = wipColumnLabelsFor("WORKSHOP");
    expect(WIP_VIEWER_COLUMNS.map((id) => labels[id])).toEqual(["Job #", "Job type", "Status", "Machine model", "Component", "Mechanic ETA date", "ETA Overdue"]);
  });
});
