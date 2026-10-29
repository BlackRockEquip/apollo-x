// 2026-10-29, user request: Settings > Company / Branding has "Document header text" and "Document footer text" boxes that nothing
// printed. The header now sits at the very top of every page (above the logo and company details) and the footer at the bottom of
// every page (above the page number and the "Powered by" line), on every print window and every server-made PDF.
//
// This file is the one place that decides what those two bands look like, so the printed documents (lib/documents/powered-by.ts),
// the server PDFs (lib/documents/pdf.ts) and the live preview in Settings (components/DocTextPreview.tsx) cannot drift apart.

export const DOC_TEXT_MAX_LENGTH = 2000;

/** Page-level carriers: the signed-in pages put the company's texts on <html> so every print window can read them (see PoweredByFlag). */
export const DOC_HEADER_DATA_KEY = "docHeaderText";
export const DOC_FOOTER_DATA_KEY = "docFooterText";

/** Trims, normalises line breaks and drops a text that is only blank space. */
export function cleanDocText(value: string | null | undefined): string {
  return (value ?? "").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
}

export function escapeDocText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** The texts the signed-in page is carrying (browser only; empty on the server and in tests without a document). */
export function docTextsInPage(): { header: string; footer: string } {
  if (typeof document === "undefined" || !document.documentElement?.dataset) return { header: "", footer: "" };
  const data = document.documentElement.dataset;
  return { header: cleanDocText(data[DOC_HEADER_DATA_KEY]), footer: cleanDocText(data[DOC_FOOTER_DATA_KEY]) };
}

/** Called after the company saves its settings so print windows use the new wording without a reload. */
export function setDocTextsInPage(header: string | null | undefined, footer: string | null | undefined) {
  if (typeof document === "undefined") return;
  const data = document.documentElement.dataset;
  const h = cleanDocText(header);
  const f = cleanDocText(footer);
  if (h) data[DOC_HEADER_DATA_KEY] = h; else delete data[DOC_HEADER_DATA_KEY];
  if (f) data[DOC_FOOTER_DATA_KEY] = f; else delete data[DOC_FOOTER_DATA_KEY];
}

/**
 * Rough number of printed lines a text takes at a given line width (in characters): every typed line counts once, and a line longer
 * than the width wraps. Slightly generous on purpose - the space reserved for the footer must never be smaller than the footer.
 */
export function estimateTextLines(text: string, charsPerLine: number): number {
  const clean = cleanDocText(text);
  if (!clean) return 0;
  return clean.split("\n").reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
}

// Footer type is 8.5px on a 190 mm line (about 130 characters); 105 keeps the estimate on the safe side.
const FOOTER_CHARS_PER_LINE = 105;
const FOOTER_LINE_MM = 3.7;
/** Height in millimetres a printed footer text needs (text lines, its rule and a little air). */
export function footerTextHeightMm(text: string): number {
  const lines = estimateTextLines(text, FOOTER_CHARS_PER_LINE);
  return lines === 0 ? 0 : Math.ceil(lines * FOOTER_LINE_MM + 3);
}

export const DOC_TEXT_CSS = [
  ".fx-dochead{font:10px/1.4 Arial,Helvetica,sans-serif;color:#333;white-space:pre-line;text-align:left;border-bottom:1px solid #c9c9c9;padding:0 0 1.5mm;margin:0 0 3mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}",
  ".sheet>.fx-dochead{flex:none;margin:0}",
  ".fx-docfoot{position:fixed;left:0;right:0;font:8.5px/1.35 Arial,Helvetica,sans-serif;color:#555;white-space:pre-line;text-align:left;border-top:1px solid #c9c9c9;padding-top:1.2mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}",
  ".fx-docfoot.sheeted{left:13mm;right:13mm}",
  "@media screen{.fx-docfoot{position:static;margin:14px 0 0}.fx-docfoot.sheeted{margin:14px 13mm 0}}",
].join("");

export function docHeaderHtml(text: string | null | undefined): string {
  const clean = cleanDocText(text);
  return clean ? `<div class="fx-dochead">${escapeDocText(clean)}</div>` : "";
}

/** `bottomMm` is how far above the page edge the band sits (clear of the "Powered by" lines when those are shown). */
export function docFooterHtml(text: string | null | undefined, bottomMm: number, sheeted: boolean): string {
  const clean = cleanDocText(text);
  return clean ? `<div class="fx-docfoot${sheeted ? " sheeted" : ""}" style="bottom:${bottomMm}mm">${escapeDocText(clean)}</div>` : "";
}
