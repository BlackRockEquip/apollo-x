import { MONTH_STATUS_LABELS, type MonthResult } from "@/lib/commissions/calc";
import { formatDate, formatMoney, monthLabel, repRule, type LineView, type Overview, type RepView } from "./types";

// ---------------------------------------------------------------------------
// Commission statement for one sales rep (2026-11-25, user request: "Add on both tabs (Tracker and Payouts) a button to export
// this for a report that can be sent to Reps"). Opens a print window (Save as PDF to send it). One rep per statement, so a rep
// never sees anyone else's figures. The rep's own fuel used is internal cost tracking and is left out.
// ---------------------------------------------------------------------------

export type StatementOptions = { repId: string; months: string[]; includeJobs: boolean; title: string };
type Company = { name: string; addressLines: string[]; contact: string; email: string; website: string };

function esc(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

function differenceText(result: MonthResult) {
  if (result.overpaid > 0.004) return `${formatMoney(result.overpaid)} paid over`;
  if (result.owed > 0.004) return `${formatMoney(result.owed)} still owed`;
  return "—";
}

function statusText(result: MonthResult) {
  let text = MONTH_STATUS_LABELS[result.status];
  if ((result.status === "DUE" || result.status === "OVERDUE") && result.dueOn) text += ` ${formatDate(result.dueOn)}`;
  return text;
}

/** The statement page as HTML (no window needed - kept separate so it can be tested). */
export function buildStatementHtml(data: Overview, rep: RepView, options: StatementOptions, company: Company, logoUrl: string, printedOn: string): string {
  const target = rep.setting?.monthlyTarget ?? 0;
  const months = options.months.filter((m) => rep.months[m]).sort();
  const results = months.map((m) => rep.months[m]);
  const totals = results.reduce((t, r) => ({ profit: t.profit + r.profit, commission: t.commission + r.commission, paid: t.paid + r.paid, owed: t.owed + r.owed, overpaid: t.overpaid + r.overpaid }), { profit: 0, commission: 0, paid: 0, owed: 0, overpaid: 0 });
  const payments = data.payouts.filter((p) => p.salesRepresentativeId === rep.id && options.months.includes(p.month)).sort((a, b) => a.paidOn.localeCompare(b.paidOn));
  const contact = [company.contact ? `Tel ${company.contact}` : "", company.email, company.website].filter(Boolean).join(" · ");

  const summaryRows = results.map((r) => `<tr>
      <td>${esc(monthLabel(r.month, true))}</td>
      <td class="n">${formatMoney(r.profit)}</td>
      ${target > 0 ? `<td class="n">${formatMoney(r.aboveTarget)}</td>` : ""}
      <td class="n b">${formatMoney(r.commission)}</td>
      <td class="n">${r.paid ? formatMoney(r.paid) : "—"}</td>
      <td class="n">${esc(differenceText(r))}</td>
      <td>${esc(statusText(r))}</td>
    </tr>`).join("");

  const jobSections = options.includeJobs ? results.map((r) => {
    const byId = new Map(data.lines.filter((l) => l.salesRepresentativeId === rep.id && l.periodMonth === r.month).map((l) => [l.id, l] as const));
    const rows = r.lines.map((calc) => {
      const line = byId.get(calc.id) as LineView | undefined;
      if (!line) return "";
      const first = line.invoices.map((i) => i.invoicedOn).sort()[0] ?? null;
      const last = target > 0 && calc.balanceAfter !== null
        ? `${calc.balanceAfter < 0 ? `${formatMoney(-calc.balanceAfter)} to go` : `${formatMoney(calc.balanceAfter)} over`}${calc.metTarget ? "<br><em>Target met</em>" : ""}`
        : formatMoney(calc.commission ?? 0);
      return `<tr>
        <td><b>${esc(line.jobReference)}</b><br><small>Inv ${esc(line.invoices.map((i) => i.invoiceNumber).join(" / "))}</small></td>
        <td>${esc(formatDate(first))}</td>
        <td>${esc(line.description || "—")}</td>
        <td class="n">${formatMoney(calc.invoiced)}</td>
        <td class="n">${formatMoney(line.costsTotal + line.fuelCharge + line.otherExpenses)}</td>
        <td class="n b">${formatMoney(calc.profit)}</td>
        <td class="n">${last}</td>
      </tr>`;
    }).join("");
    const sum = target > 0
      ? `Profit ${formatMoney(r.profit)} − target ${formatMoney(target)} = ${formatMoney(r.aboveTarget)} above target × ${Math.round(r.rate * 10000) / 100}% = <b>${formatMoney(r.commission)}</b>`
      : `Commission on each job's profit = <b>${formatMoney(r.commission)}</b>`;
    return `<section class="month">
      <h3>${esc(monthLabel(r.month, true))}</h3>
      <table><thead><tr><th>Job</th><th>Invoiced</th><th>Description</th><th class="n">Amount ex VAT</th><th class="n">Costs &amp; expenses</th><th class="n">Profit</th><th class="n">${target > 0 ? "Target balance" : "Commission"}</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <p class="sum">${sum}</p>
    </section>`;
  }).join("") : "";

  const paymentRows = payments.map((p) => `<tr><td>${esc(formatDate(p.paidOn))}</td><td>${esc(monthLabel(p.month, true))}</td><td class="n">${formatMoney(p.amount)}</td><td>${esc(p.note || "")}</td></tr>`).join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(`Commission statement - ${rep.name} - ${options.title}`)}</title>
  <style>
    @page{size:A4;margin:14mm 12mm}
    *{box-sizing:border-box}body{margin:0;font-family:Inter,"Segoe UI",Arial,sans-serif;color:#172033;font-size:10px}
    .top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:3px solid #d6a83b;padding-bottom:10px}
    .top img{max-height:52px;max-width:200px}.co{text-align:right;font-size:9px;color:#5a6578;line-height:1.5}.co b{display:block;font-size:12px;color:#172033}
    h1{margin:14px 0 2px;font-size:20px;letter-spacing:.02em;color:#07111f}.sub{color:#5a6578;font-size:10.5px;margin:0 0 12px}
    .facts{display:flex;gap:10px;margin-bottom:14px}.fact{flex:1;border:1px solid #e2e7ef;border-radius:6px;padding:7px 9px}.fact small{display:block;color:#5a6578;font-size:8px;text-transform:uppercase;letter-spacing:.06em}.fact b{font-size:13px}
    h2{font-size:12px;margin:16px 0 6px;color:#07111f}h3{font-size:11px;margin:0 0 5px;color:#155fca}
    table{width:100%;border-collapse:collapse}th{text-align:left;font-size:8px;text-transform:uppercase;letter-spacing:.05em;color:#5a6578;border-bottom:1.5px solid #c6cdd8;padding:5px 5px}
    td{padding:5px 5px;border-bottom:1px solid #edf0f4;vertical-align:top}td small{color:#5a6578}td em{color:#087a55;font-style:normal;font-weight:700;font-size:8.5px}
    .n{text-align:right;white-space:nowrap}.b{font-weight:700}tfoot td{font-weight:700;border-top:1.5px solid #c6cdd8;border-bottom:0}
    .month{margin-top:14px;page-break-inside:avoid}.sum{margin:6px 0 0;background:#f6f8fb;border-radius:5px;padding:6px 8px;font-size:10px}
    .note{margin-top:16px;color:#5a6578;font-size:8.5px;line-height:1.5;border-top:1px solid #e2e7ef;padding-top:8px}
  </style></head><body>
  <div class="top"><img src="${esc(logoUrl)}" alt="" onerror="this.style.display='none'"><div class="co"><b>${esc(company.name)}</b>${company.addressLines.length ? `${esc(company.addressLines.join(", "))}<br>` : ""}${esc(contact)}</div></div>
  <h1>COMMISSION STATEMENT</h1>
  <p class="sub">${esc(rep.name)} · ${esc(options.title)} · ${esc(repRule(rep.setting))} · printed ${esc(formatDate(printedOn))}</p>
  <div class="facts">
    <div class="fact"><small>Commission due</small><b>${formatMoney(totals.commission)}</b></div>
    <div class="fact"><small>Commission paid</small><b>${formatMoney(totals.paid)}</b></div>
    <div class="fact"><small>Still owed</small><b>${formatMoney(totals.owed)}</b></div>
    ${totals.overpaid > 0.004 ? `<div class="fact"><small>Paid over</small><b>${formatMoney(totals.overpaid)}</b></div>` : ""}
  </div>
  <h2>Summary by month</h2>
  ${results.length === 0 ? "<p>No invoiced jobs or payments in this period.</p>" : `<table><thead><tr><th>Month</th><th class="n">Profit</th>${target > 0 ? '<th class="n">Above target</th>' : ""}<th class="n">Amount due</th><th class="n">Amount paid</th><th class="n">Difference</th><th>Status</th></tr></thead>
  <tbody>${summaryRows}</tbody>
  <tfoot><tr><td>Total</td><td class="n">${formatMoney(totals.profit)}</td>${target > 0 ? "<td></td>" : ""}<td class="n">${formatMoney(totals.commission)}</td><td class="n">${formatMoney(totals.paid)}</td><td class="n">${totals.owed > 0.004 ? `${formatMoney(totals.owed)} owed` : ""}${totals.owed > 0.004 && totals.overpaid > 0.004 ? "<br>" : ""}${totals.overpaid > 0.004 ? `${formatMoney(totals.overpaid)} paid over` : ""}</td><td></td></tr></tfoot></table>`}
  ${jobSections ? `<h2>Jobs per month</h2>${jobSections}` : ""}
  ${payments.length ? `<h2>Payments</h2><table><thead><tr><th>Paid on</th><th>For month</th><th class="n">Amount</th><th>Note</th></tr></thead><tbody>${paymentRows}</tbody></table>` : ""}
  <p class="note">Profit = invoiced amount (ex VAT) − costs − fuel charge (other than self) − other expenses. A job counts in the month of its first invoice.${target > 0 ? ` Each month's profit first covers the monthly target of ${formatMoney(target)}; commission is ${Math.round((rep.setting?.rate ?? 0) * 10000) / 100}% of what the month makes above it.` : " Commission is the rate on each job's profit."} Commission is due at the end of the month after the client's final payment. Each month stands on its own: a payment above what a month works out to is shown, not moved to another month.</p>
  </body></html>`;
}

async function loadCompany(): Promise<Company> {
  try {
    const response = await fetch("/api/v1/company-settings/print-details", { cache: "no-store" });
    if (!response.ok) throw new Error();
    const body = await response.json();
    return { name: String(body.name || ""), addressLines: Array.isArray(body.addressLines) ? body.addressLines.map(String) : [], contact: String(body.contact || ""), email: String(body.email || ""), website: String(body.website || "") };
  } catch {
    return { name: "", addressLines: [], contact: "", email: "", website: "" };
  }
}

/** Opens the statement in a new window and the print dialog (Save as PDF). Returns an error message, or null. */
export async function printRepStatement(data: Overview, options: StatementOptions): Promise<string | null> {
  const rep = data.reps.find((r) => r.id === options.repId);
  if (!rep) return "Pick a sales rep.";
  const win = window.open("", "_blank");
  if (!win) return "Allow pop-ups for this site to export the statement.";
  const company = await loadCompany();
  win.document.write(buildStatementHtml(data, rep, options, company, `${window.location.origin}/api/v1/company-settings/logo`, data.today));
  win.document.close();
  const images = Array.from(win.document.images ?? []).filter((img) => !img.complete);
  if (images.length) await Promise.race([Promise.all(images.map((img) => new Promise<void>((resolve) => { img.onload = () => resolve(); img.onerror = () => resolve(); }))), new Promise<void>((resolve) => setTimeout(resolve, 4000))]);
  win.focus();
  win.print();
  return null;
}
