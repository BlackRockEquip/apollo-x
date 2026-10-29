import { afterEach, describe, expect, it } from "vitest";
import { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { cleanDocText, docFooterHtml, docHeaderHtml, estimateTextLines, footerTextHeightMm, setDocTextsInPage } from "@/lib/documents/doc-text";
import { POWERED_BY_TEXT, withPoweredBy } from "@/lib/documents/powered-by";
import { renderDocumentPdf } from "@/lib/documents/pdf";

// A stand-in for the signed-in page: print windows read the company's texts from <html data-...>.
function withPage<T>(data: Record<string, string>, run: () => T): T {
  const g = globalThis as { document?: unknown };
  const before = g.document;
  g.document = { documentElement: { dataset: data } };
  try { return run(); } finally { if (before === undefined) delete g.document; else g.document = before; }
}

const plain = "<!doctype html><html><head><style>body{margin:0}</style></head><body><p>Hi</p></body></html>";
const sheet = "<!doctype html><html><head><style>@page{size:A4;margin:0}.sheet{padding:10mm 13mm 8mm}</style></head><body><div class=\"sheet\"><p>One</p></div><div class=\"sheet p2\"><p>Two</p></div></body></html>";

async function pageContents(bytes: Buffer) {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((page) => {
    const contents = page.node.lookup(PDFName.of("Contents"));
    const streams = Array.isArray((contents as { asArray?: () => unknown[] }).asArray?.()) ? (contents as unknown as { asArray: () => unknown[] }).asArray() : [contents];
    return streams.map((ref) => Buffer.from(decodePDFRawStream(doc.context.lookup(ref as never) as PDFRawStream).decode()).toString("latin1")).join("\n");
  });
}
const hex = (text: string) => Buffer.from(text, "latin1").toString("hex").toUpperCase();

describe("document header / footer text helpers", () => {
  it("cleans line breaks and blank text", () => {
    expect(cleanDocText("  a \r\nb  \n")).toBe("a\nb");
    expect(cleanDocText("   ")).toBe("");
    expect(cleanDocText(null)).toBe("");
  });
  it("escapes the text so it can never add markup to a print window", () => {
    expect(docHeaderHtml("<b>x</b> & \"y\"")).toBe('<div class="fx-dochead">&lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;</div>');
    expect(docHeaderHtml("  ")).toBe("");
    expect(docFooterHtml("", 9.5, false)).toBe("");
  });
  it("reserves more room for a longer footer", () => {
    expect(footerTextHeightMm("")).toBe(0);
    const one = footerTextHeightMm("One line");
    expect(one).toBeGreaterThan(0);
    expect(footerTextHeightMm("a\nb\nc")).toBeGreaterThan(one);
    expect(footerTextHeightMm("x".repeat(500))).toBeGreaterThan(footerTextHeightMm("x".repeat(100)));
    expect(estimateTextLines("a\n\nb", 100)).toBe(3);
  });
});

describe("print windows", () => {
  it("are unchanged by the texts when the company has set none", () => {
    withPage({}, () => {
      const out = withPoweredBy(plain);
      expect(out).not.toContain("fx-dochead");
      expect(out).not.toContain("fx-docfoot");
      expect(out).toContain(POWERED_BY_TEXT);
    });
  });

  it("put the header in the repeating top row and the footer in the page bottom, above 'Powered by'", () => {
    withPage({ docHeaderText: "Tagline <here>", docFooterText: "Bank: 123\nTerms apply" }, () => {
      const out = withPoweredBy(plain);
      expect(out.indexOf("<thead>")).toBeGreaterThan(-1);
      expect(out.indexOf("<thead>")).toBeLessThan(out.indexOf("<tbody>"));
      expect(out.indexOf("Tagline &lt;here&gt;")).toBeLessThan(out.indexOf("<p>Hi</p>"));
      expect(out).not.toContain("Tagline <here>");
      expect(out.indexOf('class="fx-docfoot"')).toBeGreaterThan(out.indexOf("<p>Hi</p>"));
      expect(out.indexOf('class="fx-docfoot"')).toBeLessThan(out.indexOf('class="fx-powered"'));
      expect(out).toMatch(/@media print\{\.fx-spacer\{height:\d+mm\}\}/);
    });
  });

  it("keep the texts when only the 'Powered by' line is switched off", () => {
    withPage({ hidePoweredBy: "1", docHeaderText: "Top", docFooterText: "Bottom" }, () => {
      const out = withPoweredBy(plain);
      expect(out).not.toContain(POWERED_BY_TEXT);
      expect(out).toContain('<div class="fx-dochead">Top</div>');
      expect(out).toContain(">Bottom</div>");
    });
  });

  it("are left exactly as they were when everything is off", () => {
    withPage({ hidePoweredBy: "1" }, () => expect(withPoweredBy(plain)).toBe(plain));
  });

  it("put the header inside every sheet of a sheet-style document and make room for the footer", () => {
    withPage({ docHeaderText: "Top", docFooterText: "Bottom" }, () => {
      const out = withPoweredBy(sheet);
      expect(out.match(/<div class="sheet[^"]*"><div class="fx-dochead">Top<\/div>/g)).toHaveLength(2);
      expect(out).not.toContain("<thead>");
      expect(out).toMatch(/\.sheet\{padding-bottom:\d+mm!important\}/);
      expect(out).toContain('class="fx-docfoot sheeted"');
    });
  });

  it("pick up wording saved in Settings straight away", () => {
    const g = globalThis as { document?: unknown };
    const before = g.document;
    g.document = { documentElement: { dataset: {} } };
    try {
      setDocTextsInPage("New top", "");
      expect(withPoweredBy(plain)).toContain("New top");
      setDocTextsInPage("", "");
      expect(withPoweredBy(plain)).not.toContain("fx-dochead");
    } finally { if (before === undefined) delete g.document; else g.document = before; }
  });
});

describe("server PDFs", () => {
  const spec = { title: "Test", blocks: [{ type: "paragraph" as const, text: "x" }, { type: "pageBreak" as const }, { type: "paragraph" as const, text: "y" }] };
  const letterhead = { name: "Acme", addressLines: [] };
  afterEach(() => undefined);

  it("draw the header and footer on every page", async () => {
    const pages = await pageContents(await renderDocumentPdf(spec, { ...letterhead, headerText: "Company tagline", footerText: "Bank details line one\nTerms apply" }));
    expect(pages.length).toBeGreaterThanOrEqual(2);
    for (const content of pages) {
      expect(content).toContain(hex("Company tagline"));
      expect(content).toContain(hex("Terms apply"));
    }
  });

  it("are the same as before when no texts are set", async () => {
    const pages = await pageContents(await renderDocumentPdf(spec, letterhead));
    for (const content of pages) expect(content).not.toContain(hex("Company tagline"));
  });

  it("keep a long footer inside the page and never lose content", async () => {
    const footerText = Array.from({ length: 12 }, (_, i) => `Footer line ${i + 1}`).join("\n");
    const blocks = Array.from({ length: 80 }, (_, i) => ({ type: "paragraph" as const, text: `Row ${i + 1}` }));
    const bytes = await renderDocumentPdf({ title: "Long", blocks }, { ...letterhead, headerText: "Top\nSecond", footerText });
    const pages = await pageContents(bytes);
    for (const content of pages) expect(content).toContain(hex("Footer line 12"));
    expect(pages.join("")).toContain(hex("Row 80"));
  });
});
