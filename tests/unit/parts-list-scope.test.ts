import { describe, expect, it } from "vitest";
import { buildPartsListSpec, isOutstandingPartLine, partLinesForScope, type JobDocJob } from "@/lib/documents/job-specs";

const line = (partNumber: string, quantity: unknown, receivedQuantity: unknown) => ({ partNumber, description: partNumber, quantity, receivedQuantity, status: "PENDING", orderNumber: null, orderedFromSupplier: null });
const job = (lines: ReturnType<typeof line>[]) => ({ type: "REPAIR", status: "OPEN", jobNumber: "J1", partLines: lines } as unknown as JobDocJob);

describe("parts list scope", () => {
  it("outstanding means not yet fully received", () => {
    expect(isOutstandingPartLine({ quantity: "5", receivedQuantity: "0" })).toBe(true);
    expect(isOutstandingPartLine({ quantity: "5", receivedQuantity: "3.5" })).toBe(true);
    expect(isOutstandingPartLine({ quantity: "5", receivedQuantity: "5" })).toBe(false);
    expect(isOutstandingPartLine({ quantity: "5", receivedQuantity: "6" })).toBe(false);
    expect(isOutstandingPartLine({ quantity: "2" })).toBe(true);
    expect(isOutstandingPartLine({ quantity: null, receivedQuantity: null })).toBe(false);
  });

  it("keeps everything for the complete list and only open lines for outstanding", () => {
    const lines = [line("A", "2", "2"), line("B", "4", "1"), line("C", "1", "0")];
    expect(partLinesForScope(lines, "ALL")).toHaveLength(3);
    expect(partLinesForScope(lines, undefined)).toHaveLength(3);
    expect(partLinesForScope(lines, "OUTSTANDING").map((l) => l.partNumber)).toEqual(["B", "C"]);
  });

  it("builds the PDF for either list", () => {
    const j = job([line("A", "2", "2"), line("B", "4", "1")]);
    const all = buildPartsListSpec({ title: "Parts List", jobLabel: "J1", job: j });
    const out = buildPartsListSpec({ title: "Parts List", jobLabel: "J1", job: j, scope: "OUTSTANDING" });
    const rows = (spec: typeof all) => (spec.blocks[0] as { rows: string[][] }).rows;
    expect(all.title).toBe("Parts List — Job J1");
    expect(rows(all)).toHaveLength(2);
    expect(out.title).toBe("Parts List (outstanding parts) — Job J1");
    expect(rows(out).map((r) => r[0])).toEqual(["B"]);
  });

  it("says so when nothing is outstanding", () => {
    const spec = buildPartsListSpec({ title: "Parts List", jobLabel: "J1", job: job([line("A", "2", "2")]), scope: "OUTSTANDING" });
    expect(spec.blocks[0]).toMatchObject({ type: "paragraph" });
    expect((spec.blocks[0] as { text: string }).text).toContain("No outstanding parts");
  });
});
