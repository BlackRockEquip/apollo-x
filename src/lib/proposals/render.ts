import { addDays, calcProposal, formatLongDate, formatMoney, type PriceRow, type ProposalData, type Totals } from "@/lib/proposals/model";

// 2026-10-21 — turns a proposal into HTML. One renderer feeds both the live preview next to the builder and the print
// window (Print / Save as PDF), so what is on screen is exactly what is printed. Every piece of text is escaped here.

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
const e = escapeHtml;

export const PROPOSAL_CSS = `
.px{--navy:#07111f;--blue:#155fca;--gold:#d6a83b;--green:#1f8a5b;--ink:#172033;--ink7:#3f4b60;--ink5:#6b7689;--line:#e3e7ee;--soft:#f3f5f9;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;font-size:13.5px;line-height:1.5;color:var(--ink)}
.px *{box-sizing:border-box}
.px .lh{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid var(--navy);padding-bottom:16px;margin-bottom:22px;gap:20px}
.px .brand{display:flex;align-items:center;gap:10px;font-weight:700;color:var(--navy)}
.px .mark{width:34px;height:34px;border-radius:9px;background:var(--blue);color:#fff;display:grid;place-items:center;font-weight:800;font-size:.9rem}
.px .brand small{display:block;color:#9a7211;font-size:.62rem;letter-spacing:.14em;text-transform:uppercase;margin-top:-2px}
.px .meta{text-align:right;font-size:.8rem;color:var(--ink7)}
.px .meta b{display:block;font-size:1.25rem;color:var(--navy);letter-spacing:-.01em}
.px h3{font-size:.78rem;text-transform:uppercase;letter-spacing:.12em;color:var(--blue);margin:26px 0 8px;border-bottom:1px solid var(--line);padding-bottom:5px}
.px .two{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.px .lbl{font-size:.7rem;text-transform:uppercase;letter-spacing:.1em;color:var(--ink5);font-weight:700}
.px .letter{margin-top:22px}
.px .letter p{margin:0 0 .8em;white-space:pre-line}
.px table{width:100%;border-collapse:collapse;margin:6px 0 8px;font-size:.92em}
.px th{text-align:left;background:var(--soft);padding:7px 9px;font-size:.78em;text-transform:uppercase;letter-spacing:.06em;color:var(--ink7)}
.px td{padding:7px 9px;border-bottom:1px solid var(--line);vertical-align:top}
.px td.r,.px th.r{text-align:right;white-space:nowrap}
.px .sub{color:var(--ink5);font-size:.85em}
.px tr.tot td{font-weight:700;border-bottom:0;background:var(--soft)}
.px tr.neg td{color:var(--green)}
.px .pn{font-weight:700;margin:14px 0 2px}
.px .box{background:var(--navy);color:#fff;border-radius:8px;padding:14px 18px;display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:12px}
.px .box span{display:block;font-size:.7rem;text-transform:uppercase;letter-spacing:.1em;color:#9fb0c8}
.px .box b{font-size:1.1rem;color:var(--gold)}
.px ul.inc{margin:6px 0;padding-left:18px;columns:2;column-gap:28px}
.px ul.inc li{margin-bottom:3px}
.px .terms p{margin:0 0 .5em;color:var(--ink7);font-size:.95em;white-space:pre-line}
.px .sign{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:20px}
.px .sign .line{border-bottom:1px solid var(--ink);height:34px}
.px .sign small{color:var(--ink5);font-size:.8em}
.px .empty{padding:30px;text-align:center;color:var(--ink5);background:var(--soft);border-radius:8px}
.px .foot{margin-top:26px;padding-top:10px;border-top:1px solid var(--line);font-size:.8em;color:var(--ink5);display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}
@media (max-width:640px){.px .two,.px .sign{grid-template-columns:1fr}.px .box{grid-template-columns:1fr}.px ul.inc{columns:1}.px .lh{flex-direction:column}.px .meta{text-align:left}}
@media print{.px{font-size:10.5pt}.px h3{break-after:avoid}.px .blk,.px .box,.px .sign,.px tr{break-inside:avoid}.px .box,.px th,.px tr.tot td,.px .mark{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`;

function priceTable(rows: PriceRow[], t: Totals, discountPct: number, vatPct: number, totalLabel: string): string {
  const body = rows.map((r) => `<tr><td>${e(r.label)}${r.note ? `<div class="sub">${e(r.note)}</div>` : ""}</td><td class="r">${r.qty}</td><td class="r">${formatMoney(r.unit)}</td><td class="r">${formatMoney(r.qty * r.unit)}</td></tr>`).join("");
  const line = (text: string, value: string, cls = "") => `<tr${cls ? ` class="${cls}"` : ""}><td colspan="3" style="text-align:right">${e(text)}</td><td class="r">${value}</td></tr>`;
  return `<table><thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Amount</th></tr></thead><tbody>${body}${line("Subtotal", formatMoney(t.sub))}${discountPct > 0 ? line(`Discount (${discountPct}%)`, `– ${formatMoney(t.discount)}`, "neg") : ""}${line(`VAT (${vatPct}%)`, formatMoney(t.vat))}${line(totalLabel, formatMoney(t.total), "tot")}</tbody></table>`;
}

function paragraphs(text: string): string {
  return text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${e(p)}</p>`).join("");
}

/** The proposal document as an HTML fragment (wrapped in .px). Styles are in PROPOSAL_CSS. */
export function renderProposalHtml(data: ProposalData): string {
  const calc = calcProposal(data);
  const company = data.client.company.trim() || "your company";
  const contact = data.client.contact.trim() || "there";
  const validUntil = addDays(data.quote.date, Math.max(1, data.quote.validDays));
  const lines = (items: [string, string, boolean?][]) => items.filter((x) => x[1]).map((x) => `<div${x[2] ? ' style="font-weight:700"' : ""}>${e(x[1])}</div>`).join("");

  const letterText = data.letter.replace(/\{client\}/g, company).replace(/\{contact\}/g, contact);
  const parts: string[] = [];
  parts.push(`<div class="blk"><div class="lh"><div class="brand"><span class="mark">FX</span><span>Flo X<small>Integrations</small></span></div><div class="meta"><b>Proposal &amp; Quotation</b><div>Quote no.: ${e(data.quote.number)}</div><div>Date: ${e(formatLongDate(data.quote.date))}</div><div>Valid until: ${e(formatLongDate(validUntil))}</div></div></div>`);
  // The header and the Prepared for / Prepared by lines stay together; the next push closes the block.
  parts.push(`<div class="two"><div><div class="lbl">Prepared for</div>${lines([["", company === "your company" ? "" : company, true], ["", data.client.contact], ["", data.client.address], ["", data.client.email], ["", data.client.phone]])}</div><div><div class="lbl">Prepared by</div>${lines([["", "Flo X Integrations", true], ["", data.quote.preparedBy], ["", data.quote.preparedByEmail]])}</div></div></div>`);
  parts.push(`<div class="letter blk">${paragraphs(letterText)}<p style="font-weight:700">${e(data.quote.preparedBy)}</p></div>`);

  if (!calc.picks.length) {
    parts.push(`<div class="empty">Choose at least one product to build the scope and pricing.</div>`);
  } else {
    parts.push(`<h3>Scope of work</h3>`);
    for (const p of calc.picks) {
      const rows = p.modules.length
        ? p.modules.map((m) => `<tr><td style="font-weight:600;width:32%">${e(m.name)}</td><td>${e(m.description)}</td></tr>`).join("")
        : `<tr><td colspan="2">No modules selected yet.</td></tr>`;
      parts.push(`<div class="blk"><div class="pn">${e(p.name)}</div><div>${e(p.blurb)}</div><table><thead><tr><th>Module</th><th>What it does</th></tr></thead><tbody>${rows}</tbody></table></div>`);
    }
    if (data.included.length) parts.push(`<div class="blk"><h3>Included with every plan</h3><ul class="inc">${data.included.map((i) => `<li>${e(i)}</li>`).join("")}</ul></div>`);
    parts.push(`<div class="blk" style="margin-top:6px">Set-up: Flo X creates your company, loads your branding and numbering, creates your users and helps you import your existing customers, suppliers and parts.</div>`);
    parts.push(`<div class="blk"><h3>Investment</h3><div class="pn">Once-off fees</div>${priceTable(calc.once, calc.onceTotals, data.services.discountOnceOff, data.services.vatPercent, "Once-off total (incl. VAT)")}</div><div class="blk"><div class="pn">Monthly fees</div>${priceTable(calc.monthly, calc.monthlyTotals, data.services.discountMonthly, data.services.vatPercent, "Monthly total (incl. VAT)")}<div class="box"><div><span>Once-off (incl. VAT)</span><b>${formatMoney(calc.onceTotals.total)}</b></div><div><span>Per month (incl. VAT)</span><b>${formatMoney(calc.monthlyTotals.total)}</b></div></div></div>`);
  }

  parts.push(`<div class="blk"><h3>Terms &amp; conditions</h3><div class="terms">${data.terms.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => `<p>${e(l)}</p>`).join("")}</div></div>`);
  parts.push(`<div class="blk"><h3>Acceptance</h3><div>By signing below, ${e(company)} accepts this proposal (${e(data.quote.number)}) and the terms above.</div><div class="sign"><div><div class="line"></div><small>Name and position</small></div><div><div class="line"></div><small>Signature and date</small></div></div></div>`);
  parts.push(`<div class="foot"><span>Flo X Integrations${data.quote.preparedByEmail ? ` · ${e(data.quote.preparedByEmail)}` : ""}</span><span>Quote ${e(data.quote.number)}</span></div>`);
  return `<div class="px">${parts.join("")}</div>`;
}

/** A complete page for the print window. The caller opens it, writes it and prints. */
export function renderProposalPrintPage(data: ProposalData): string {
  // 2026-10-22: every printed page carries an "Initials" box bottom right. The box is position:fixed (repeats on every
  // page); the table footer is an empty spacer that repeats too, so the proposal text never runs underneath the box.
  const printCss = "@page{size:A4;margin:14mm}body{margin:0;background:#fff}table.pg{width:100%;border-collapse:collapse}table.pg>tbody>tr>td,table.pg>tfoot>tr>td{padding:0;border:0}.pg-space{height:20mm}.initials{position:fixed;right:0;bottom:0;width:42mm;height:15mm;border:1px solid #172033;border-radius:3px;font:8pt Arial,sans-serif;color:#6b7689;padding:2px 5px}";
  return `<!doctype html><html><head><meta charset="utf-8" /><title>${e(`${data.quote.number} - ${data.client.company || "Proposal"}`)}</title><style>${printCss}${PROPOSAL_CSS}</style></head><body><div class="initials">Initials</div><table class="pg"><tbody><tr><td>${renderProposalHtml(data)}</td></tr></tbody><tfoot><tr><td><div class="pg-space"></div></td></tr></tfoot></table><script>window.onload=function(){window.print();};</script></body></html>`;
}
