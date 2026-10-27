import { describe, expect, it } from "vitest";
import { JOBS_WIP_DEFAULT_COLUMNS, moveWipColumn, normalizeJobsWipColumns } from "@/lib/jobs/wip-columns";

describe("Jobs & WIP column order", () => {
  it("keeps the order the user chose, with Job # always first", () => {
    expect(normalizeJobsWipColumns(["status", "customerName", "jobNumber", "machineModel"])).toEqual(["jobNumber", "status", "customerName", "machineModel"]);
  });

  it("adds Job # when it was not submitted", () => {
    expect(normalizeJobsWipColumns(["status", "type"])).toEqual(["jobNumber", "status", "type"]);
  });

  it("drops unknown ids and duplicates", () => {
    expect(normalizeJobsWipColumns(["status", "nope", "status", 42, "type"])).toEqual(["jobNumber", "status", "type"]);
    expect(normalizeJobsWipColumns("junk")).toEqual(["jobNumber"]);
  });

  it("leaves a selection saved in the old catalogue order unchanged", () => {
    expect(normalizeJobsWipColumns(JOBS_WIP_DEFAULT_COLUMNS)).toEqual(JOBS_WIP_DEFAULT_COLUMNS);
  });

  it("moves a column to where another one is", () => {
    const list = normalizeJobsWipColumns(["customerName", "type", "status", "machineModel"]);
    expect(moveWipColumn(list, "machineModel", "type")).toEqual(["jobNumber", "customerName", "machineModel", "type", "status"]);
    expect(moveWipColumn(list, "customerName", "machineModel")).toEqual(["jobNumber", "type", "status", "machineModel", "customerName"]);
  });

  it("never moves or displaces Job #", () => {
    const list = normalizeJobsWipColumns(["customerName", "type"]);
    expect(moveWipColumn(list, "type", "jobNumber")).toEqual(list);
    expect(moveWipColumn(list, "jobNumber", "type")).toEqual(list);
  });
});
