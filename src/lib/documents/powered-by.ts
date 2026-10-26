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
export const POWERED_BY_TEXT = "Powered by Flo X Integrations";
// 2026-10-23, user request: the web address goes on the line below "Powered by Flo X Integrations".
export const POWERED_BY_URL_TEXT = "www.floxintegrations.co.za";
export const POWERED_BY_URL = "https://www.floxintegrations.co.za";

export const POWERED_BY_CSS = `.fx-powered{position:fixed;left:0;right:0;bottom:2mm;text-align:center;font:9px/1.3 Arial,Helvetica,sans-serif;color:#8a8f98;letter-spacing:.03em;-webkit-print-color-adjust:exact;print-color-adjust:exact}.fx-powered a{display:block;color:inherit;text-decoration:none}@media screen{.fx-powered{position:static;margin:22px 0 8px}}`;

// 2026-10-26, user report (Field Report print): the footer printed over the last lines of the page. `position: fixed` puts it inside
// the printed page area (inside the @page margin), so content that runs to the bottom of a page ran underneath it. Fix: the
// document body is wrapped in a one-cell table whose repeating footer row (tfoot) reserves room at the bottom of EVERY printed
// page, and the fixed line sits in that room. Documents that set `@page { margin: 0 }` and lay out their own full-size sheet
// (Job Card, Job History) are left alone - wrapping them would push their sheet onto an extra page; they leave their own bottom
// space. On screen the wrapper is invisible (no padding, no spacer).
export const POWERED_BY_WRAP_CSS = `.fx-wrap{width:100%;border-collapse:collapse;border-spacing:0}.fx-wrap>tbody>tr>td,.fx-wrap>tfoot>tr>td{padding:0;border:0}.fx-spacer{height:0}@media print{.fx-spacer{height:10mm}}`;

/** True when the print window's own @page rule sets a zero margin (it draws its own full-size sheet). */
function hasZeroPageMargin(html: string): boolean {
  const rules = html.match(/@page[^{]*\{[^}]*\}/g) ?? [];
  return rules.some((rule) => /margin\s*:\s*0(?:mm|px|cm|in|pt)?\s*(?:;|\})/.test(rule));
}

function wrapBodyForFooter(html: string): string {
  const open = html.match(/<body[^>]*>/i);
  const close = html.lastIndexOf("</body>");
  if (!open || open.index === undefined || close < 0) return html;
  const start = open.index + open[0].length;
  return html.slice(0, start) + '<table class="fx-wrap"><tbody><tr><td>' + html.slice(start, close) + '</td></tr></tbody><tfoot><tr><td><div class="fx-spacer"></div></td></tr></tfoot></table>' + html.slice(close);
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

/** Adds the "Powered by" line (and its style) to a complete HTML document string, unless the company has it switched off. */
export function withPoweredBy(html: string): string {
  if (poweredByHiddenInPage()) return html;
  let out = html;
  const wrap = !hasZeroPageMargin(out);
  const css = wrap ? POWERED_BY_CSS + POWERED_BY_WRAP_CSS : POWERED_BY_CSS;
  const styleEnd = out.indexOf("</style>");
  if (styleEnd >= 0) out = out.slice(0, styleEnd) + css + out.slice(styleEnd);
  else if (out.includes("</head>")) out = out.replace("</head>", `<style>${css}</style></head>`);
  if (wrap) out = wrapBodyForFooter(out);
  const bodyEnd = out.lastIndexOf("</body>");
  out = bodyEnd >= 0 ? out.slice(0, bodyEnd) + POWERED_BY_HTML + out.slice(bodyEnd) : out + POWERED_BY_HTML;
  return out;
}
