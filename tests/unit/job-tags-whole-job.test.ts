import { describe, expect, it } from "vitest";
import { buildJobTagLabels, expandCopies, labelSizeById, renderTagsHtml } from "@/lib/labels/job-tags";

// 2026-11-02, user request: "add the print job tags to the workshop side as well" - a job without items gets one tag for the whole job.
describe("job tag for a whole job (Workshop build)", () => {
  const item = { sequence: 1, component: "Gearbox", componentModel: "GB-200", componentSerial: "S77", machineMake: "CAT", machineModel: "777", plantNumber: "P12" };

  it("uses the job number as the tag and has no 'Item 1 of 1'", () => {
    const [label] = buildJobTagLabels({ jobNumber: "BRE1182", customerName: "Acme", received: "2026-10-30", items: [item], wholeJob: true });
    expect(label.tag).toBe("BRE1182");
    expect(label.position).toBe("");
    expect(label.component).toBe("Gearbox");
    expect(label.componentLine).toBe("GB-200 · S/N S77");
    expect(label.machineLine).toBe("CAT 777 · Plant P12");
  });

  it("still tags items as BRE1182-1 when wholeJob is off (Engineering)", () => {
    const [label] = buildJobTagLabels({ jobNumber: "BRE1182", items: [item] });
    expect(label.tag).toBe("BRE1182-1");
    expect(label.position).toBe("Item 1 of 1");
  });

  it("falls back to JOB for a job with no number yet and draws the page without an item position", () => {
    const labels = buildJobTagLabels({ jobNumber: "", items: [item], wholeJob: true });
    expect(labels[0].tag).toBe("JOB");
    const html = renderTagsHtml(expandCopies(buildJobTagLabels({ jobNumber: "BRE1182", items: [item], wholeJob: true }), 2), labelSizeById("100x50"));
    expect(html.match(/<section class="label"/g)).toHaveLength(2);
    expect(html).not.toContain('class="pos"');
    expect(html).toContain("BRE1182");
  });
});
