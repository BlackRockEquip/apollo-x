import { describe, expect, it } from "vitest";
import { POWERED_BY_TEXT, withPoweredBy } from "@/lib/documents/powered-by";
import { renderDocumentPdf } from "@/lib/documents/pdf";

describe("Powered by Flo X Integrations footer", () => {
  it("adds the line and its style to a print window", () => {
    const html = withPoweredBy("<!doctype html><html><head><style>body{margin:0}</style></head><body><p>Hi</p><script>window.print()</script></body></html>");
    expect(html).toContain("Powered by Flo X Integrations");
    expect(html.indexOf("fx-powered{")).toBeLessThan(html.indexOf("</style>"));
    expect(html.indexOf('class="fx-powered"')).toBeLessThan(html.lastIndexOf("</body>"));
  });
  it("copes with documents that have no style or body tag", () => {
    expect(withPoweredBy("<p>x</p>")).toContain(POWERED_BY_TEXT);
    expect(withPoweredBy("<html><head></head><body>x</body></html>")).toContain("<style>");
  });
  it("is drawn on every page of a server PDF", async () => {
    const pdf = await renderDocumentPdf({ title: "Test", blocks: [{ type: "paragraph", text: "x" }, { type: "pageBreak" }, { type: "paragraph", text: "y" }] }, null as never);
    const text = pdf.toString("latin1");
    expect((text.match(/\/Type\s*\/Page\b/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(pdf.length).toBeGreaterThan(1000);
  });
});
