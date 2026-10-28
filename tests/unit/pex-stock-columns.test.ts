import { describe, expect, it } from "vitest";
import { PEX_STOCK_DEFAULT_COLUMNS, normalizePexStockColumns, pexModelText } from "@/lib/pex/stock-columns";
import { jobNumberSortValue, sortPexStockNewestFirst } from "@/lib/pex/stock-order";

const LOCKED = ["jobNumber", "unit", "make", "model", "status"];

describe("PEX Stock columns", () => {
  it("always includes the five fixed columns, first and in order", () => {
    expect(normalizePexStockColumns([])).toEqual(LOCKED);
    expect(normalizePexStockColumns(["notes"])).toEqual([...LOCKED, "notes"]);
    expect(normalizePexStockColumns(["received", "unit"]).slice(0, 5)).toEqual(LOCKED);
  });

  it("can only add: dropping a fixed column from a saved list brings it back", () => {
    expect(normalizePexStockColumns(["received", "supplyJob"])).toEqual(PEX_STOCK_DEFAULT_COLUMNS);
  });

  it("drops unknown ids and duplicates, and uses catalogue order", () => {
    expect(normalizePexStockColumns(["notes", "bogus", "notes", 7, "machineSerial"])).toEqual([...LOCKED, "machineSerial", "notes"]);
    expect(normalizePexStockColumns("junk")).toEqual(LOCKED);
  });

  it("defaults to the columns the table always had", () => {
    expect(PEX_STOCK_DEFAULT_COLUMNS).toEqual([...LOCKED, "received", "supplyJob"]);
  });
});

describe("PEX Stock model column", () => {
  it("lists machine model and component model together", () => {
    expect(pexModelText("R1700G", "C6.6")).toBe("R1700G / C6.6");
  });
  it("shows just the one that exists", () => {
    expect(pexModelText("R1700G", null)).toBe("R1700G");
    expect(pexModelText("", "C6.6")).toBe("C6.6");
    expect(pexModelText(" R1700G ", "  ")).toBe("R1700G");
  });
  it("is empty when neither is set", () => {
    expect(pexModelText(null, undefined)).toBe("");
  });
});

describe("PEX Stock order", () => {
  it("reads the trailing digits of a job number", () => {
    expect(jobNumberSortValue("BRE1000")).toBe(1000);
    expect(jobNumberSortValue("BRE999")).toBe(999);
    expect(jobNumberSortValue(null)).toBe(-1);
    expect(jobNumberSortValue("DRAFT")).toBe(-1);
  });

  it("puts the newest job first, BRE1000 ahead of BRE999", () => {
    const rows = [
      { id: "a", returnJob: { jobNumber: "BRE999" } },
      { id: "b", returnJob: { jobNumber: "BRE1000" } },
      { id: "c", returnJob: { jobNumber: "BRE250" } },
    ];
    expect(sortPexStockNewestFirst(rows).map((r) => r.id)).toEqual(["b", "a", "c"]);
  });

  it("puts units without a numbered job last, newest update first among equals", () => {
    const rows = [
      { id: "x", updatedAt: "2026-10-01T00:00:00Z", returnJob: null },
      { id: "y", updatedAt: "2026-10-20T00:00:00Z", returnJob: { jobNumber: null } },
      { id: "z", updatedAt: "2026-09-01T00:00:00Z", returnJob: { jobNumber: "BRE5" } },
    ];
    expect(sortPexStockNewestFirst(rows).map((r) => r.id)).toEqual(["z", "y", "x"]);
  });

  it("does not change the list it is given", () => {
    const rows = [{ returnJob: { jobNumber: "BRE1" } }, { returnJob: { jobNumber: "BRE2" } }];
    sortPexStockNewestFirst(rows);
    expect(rows[0].returnJob.jobNumber).toBe("BRE1");
  });
});
