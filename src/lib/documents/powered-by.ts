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
  const styleEnd = out.indexOf("</style>");
  if (styleEnd >= 0) out = out.slice(0, styleEnd) + POWERED_BY_CSS + out.slice(styleEnd);
  else if (out.includes("</head>")) out = out.replace("</head>", `<style>${POWERED_BY_CSS}</style></head>`);
  const bodyEnd = out.lastIndexOf("</body>");
  out = bodyEnd >= 0 ? out.slice(0, bodyEnd) + POWERED_BY_HTML + out.slice(bodyEnd) : out + POWERED_BY_HTML;
  return out;
}
