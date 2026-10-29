// 2026-10-20, user request: "On all printable documents, add the words
// "powered by Flo X Integrations" to the footer, recommend the best place."
//
// Placement: centred at the very bottom of every printed page, in small light
// grey type, on the same line as the page number / print date. It is quiet
// enough not to compete with the client's own letterhead and logo (which stay at
// the top) but is on every page, and it never moves the document content.
//
// Two ways it is applied:
//  * Print windows built as HTML (job card, delivery note, pick slip, reports,
//    table prints ...): wrap the finished HTML with withPoweredBy(html). The line
//    is `position: fixed` so the browser repeats it on every printed page.
//  * Server-made PDFs (lib/documents/pdf.ts): drawn in the footer of every page, with the web address on a second line.
import { DOC_TEXT_CSS, docFooterHtml, docHeaderHtml, docTextsInPage, footerTextHeightMm } from "@/lib/documents/doc-text";

export const POWERED_BY_TEXT = "Powered by Flo X Integrations";
// 2026-10-23, user request: the web address goes on the line below "Powered by Flo X Integrations".
export const POWERED_BY_URL_TEXT = "www.floxintegrations.co.za";
export const POWERED_BY_URL = "https://www.floxintegrations.co.za";

export const POWERED_BY_CSS = `.fx-powered{position:fixed;left:0;right:0;bottom:2mm;text-align:center;font:9px/1.3 Arial,Helvetica,sans-serif;color:#8a8f98;letter-spacing:.03em;-webkit-print-color-adjust:exact;print-color-adjust:exact}.fx-powered a{display:block;color:inherit;text-decoration:none}@media screen{.fx-powered{position:static;margin:22px 0 8px}}`;

// 2026-10-26, user report (Field Report print): the footer printed over the last lines of the page. `position: fixed` puts it inside
// the printed page area (inside the @page margin), so content that runs to the bottom of a page ran underneath it. Fix: the
// document body is wrapped in a one-cell table whose repeating footer row (tfoot) reserves room at the bottom of EVERY printed
// page, and the fixed line sits in that room. (A real <table> is needed: Chrome only repeats a real tfoot on every page. The
// print windows have their own `table{...}` / `td{...}` rules - borders, padding, font size, page-break-inside:avoid - so the wrapper
// resets itself with `all:unset !important`, which keeps those rules away from it.) Documents that set `@page { margin: 0 }` and lay out their own full-size sheet
// (Job Card, Job History) are left alone - wrapping them would push their sheet onto an extra page; they leave their own bottom
// space. On screen the wrapper is invisible (no padding, no spacer).
export const POWERED_BY_WRAP_CSS = `table.fx-wrap{all:unset!important;display:table!important;width:100%!important;border-collapse:collapse!important}table.fx-wrap>thead>tr>td,table.fx-wrap>tbody>tr>td,table.fx-wrap>tfoot>tr>td{all:unset!important;display:table-cell!important}.fx-spacer{height:0}@media print{.fx-spacer{height:10mm}}`;

/** True when the print window's own @page rule sets a zero margin (it draws its own full-size sheet). */
function hasZeroPageMargin(html: string): boolean {
  const rules = html.match(/@page[^{]*\{[^}]*\}/g) ?? [];
  return rules.some((rule) => /margin\s*:\s*0(?:mm|px|cm|in|pt)?\s*(?:;|\})/.test(rule));
}

// 2026-10-29: the company's "Document header text" rides in the wrapper's repeating thead, so it is printed at the top of EVERY page.
function wrapBodyForFooter(html: string, headerHtml = ""): string {
  const open = html.match(/<body[^>]*>/i);
  const close = html.lastIndexOf("</body>");
  if (!open || open.index === undefined || close < 0) return html;
  const start = open.index + open[0].length;
  const thead = headerHtml ? `<thead><tr><td>${headerHtml}</td></tr></thead>` : "";
  return html.slice(0, start) + '<table class="fx-wrap">' + thead + '<tbody><tr><td>' + html.slice(start, close) + '</td></tr></tbody><tfoot><tr><td><div class="fx-spacer"></div></td></tr></tfoot></table>' + html.slice(close);
}

// Sheet-style documents (Job Card, Job History) draw their own full-size pages, so the header goes inside each sheet instead.
function addHeaderToSheets(html: string, headerHtml: string): string {
  if (!headerHtml) return html;
  const sheet = /(<div class="sheet[^"]*"[^>]*>)/g;
  if (sheet.test(html)) return html.replace(/(<div class="sheet[^"]*"[^>]*>)/g, `$1${headerHtml}`);
  return html.replace(/(<body[^>]*>)/i, `$1${headerHtml}`);
}

export const POWERED_BY_HTML = `<div class="fx-powered">${POWERED_BY_TEXT}<a href="${POWERED_BY_URL}" target="_blank" rel="noopener">${POWERED_BY_URL_TEXT}</a></div>`;

/**
 * 2026-10-21, user request: a platform admin can switch the line off per company
 * (tick box on Platform > Companies > company). The signed-in pages carry the
 * company's choice as data-hide-powered-by on <html> (see PoweredByFlag), so every
 * print window picks it up without each caller having to pass it in.
 */
export function poweredByHiddenInPage(): boolean {
  return typeof document !== "undefined" && document.documentElement.dataset.hidePoweredBy === "1";
}

/**
 * Adds the "Powered by" line (unless the company has it switched off) and the company's own header / footer text (when it has set
 * any) to a complete HTML document string. See lib/documents/doc-text.ts for what the two bands look like.
 */
export function withPoweredBy(html: string): string {
  const hidePowered = poweredByHiddenInPage();
  const { header, footer } = docTextsInPage();
  if (hidePowered && !header && !footer) return html;
  let out = html;
  const sheeted = hasZeroPageMargin(out);
  const wrap = !sheeted;
  // The footer text sits just above the "Powered by" lines (which take the bottom ~8 mm), or near the page edge when those are off.
  const footerBottomMm = hidePowered ? 3 : 9.5;
  const footerMm = footerTextHeightMm(footer);
  const spacerMm = footerMm ? Math.ceil(footerBottomMm + footerMm + 1) : hidePowered ? 0 : 10;
  let css = hidePowered ? "" : POWERED_BY_CSS;
  if (wrap) css += POWERED_BY_WRAP_CSS + (footerMm || hidePowered ? `@media print{.fx-spacer{height:${spacerMm}mm}}` : "");
  if (header || footer) css += DOC_TEXT_CSS;
  if (sheeted && footerMm) css += `.sheet{padding-bottom:${Math.max(8, Math.ceil(footerBottomMm + footerMm + 1))}mm!important}`;
  const styleEnd = out.indexOf("</style>");
  if (styleEnd >= 0) out = out.slice(0, styleEnd) + css + out.slice(styleEnd);
  else if (out.includes("</head>")) out = out.replace("</head>", `<style>${css}</style></head>`);
  const headerHtml = docHeaderHtml(header);
  if (wrap) out = wrapBodyForFooter(out, headerHtml);
  else out = addHeaderToSheets(out, headerHtml);
  const tail = docFooterHtml(footer, footerBottomMm, sheeted) + (hidePowered ? "" : POWERED_BY_HTML);
  const bodyEnd = out.lastIndexOf("</body>");
  out = bodyEnd >= 0 ? out.slice(0, bodyEnd) + tail + out.slice(bodyEnd) : out + tail;
  return out;
}
