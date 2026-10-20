import { describe, expect, it, vi } from "vitest";

// email-templates.ts also holds the database loader; these tests only use its pure text builders.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { renderDocumentPdf } from "@/lib/documents/pdf";
import { buildWipTableEmailMessage, renderTemplate, type CompanyEmailTemplates } from "@/lib/email-templates";
import { columnWeights, parseRecipients } from "@/lib/jobs/wip-email-helpers";

const noTemplates: CompanyEmailTemplates = { rfqSubject: null, rfqBody: null, followupSubject: null, followupBody: null, wipSubject: null, wipBody: null, signature: null };
const vars = { title: "Jobs & WIP", company: "Acme Engineering", date: "20/10/2026", count: "12 jobs", filters: "Status: Open" };

describe("Jobs & WIP table email", () => {
  it("uses the default subject, message and signature when no template is saved", () => {
    const { subject, text } = buildWipTableEmailMessage(noTemplates, vars);
    expect(subject).toBe("Jobs & WIP - Acme Engineering - 20/10/2026");
    expect(text).toContain("Please find attached the Jobs & WIP list (12 jobs).");
    expect(text).toContain("Status: Open");
    expect(text.endsWith("Thank you.")).toBe(true);
  });

  it("uses the company's own template, the shared signature and the sender's extra note", () => {
    const templates = { ...noTemplates, wipSubject: "WIP for {{company}} ({{count}})", wipBody: "Hello team,\n\n{{filters}}", signature: "Regards, Workshop" };
    const { subject, text } = buildWipTableEmailMessage(templates, vars, "Please check the red ones.");
    expect(subject).toBe("WIP for Acme Engineering (12 jobs)");
    expect(text).toBe("Hello team,\n\nStatus: Open\n\nPlease check the red ones.\n\nRegards, Workshop");
    expect(renderTemplate("{{unknown}}x", vars)).toBe("x");
  });

  it("accepts up to five valid addresses and rejects anything else", () => {
    expect(parseRecipients("a@x.co.za, B@X.co.za; a@x.co.za")).toEqual(["a@x.co.za", "b@x.co.za"]);
    expect(() => parseRecipients("not-an-email")).toThrow("INVALID_RECIPIENTS");
    expect(() => parseRecipients("a@x.com,b@x.com,c@x.com,d@x.com,e@x.com,f@x.com")).toThrow("INVALID_RECIPIENTS");
    expect(() => parseRecipients("  ")).toThrow("INVALID_RECIPIENTS");
  });

  it("gives longer columns more width, within limits", () => {
    const w = columnWeights(["Job #", "Component"], [["J1", "Hydraulic cylinder assembly rebuilt"], ["J2", "Pump"]]);
    expect(w[0]).toBe(6);
    expect(w[1]).toBe(30);
  });

  it("renders a landscape A4 PDF with a wide table over several pages", async () => {
    const headers = ["Job #", "Type", "Status", "Customer", "Machine", "Component", "ETA"];
    const rows = Array.from({ length: 80 }, (_, i) => [`J${1000 + i}`, "Rebuild", "In progress", "Customer " + i, "CAT 320", "Hydraulic pump with a long description " + i, "2026-10-30"]);
    const pdf = await renderDocumentPdf({ title: "Jobs & WIP", landscape: true, rightLines: ["80 jobs", "20/10/2026"], blocks: [{ type: "paragraph", text: "No filters" }, { type: "table", headers, rows, widths: columnWeights(headers, rows), size: 9 }] }, { name: "Acme", addressLines: [] });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.load(pdf);
    const first = doc.getPage(0).getSize();
    expect(Math.round(first.width)).toBe(842);
    expect(Math.round(first.height)).toBe(595);
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });
});
