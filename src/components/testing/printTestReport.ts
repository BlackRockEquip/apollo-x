import { withPoweredBy } from "@/lib/documents/powered-by";
import {
  evaluateAll, evaluateReading, failureSentence, formatBounds, formatLimit, formatNumber, limitNeedsValue, TEST_RESULT_LABELS, type ReadingEvaluation, type TestLimit,
} from "@/lib/testing/spec";
import { formatDate, type ReportDetail } from "./types";

// The printed / PDF test report (the redesigned page from the approved mockup): result box, fact strip, test data with range bars,
// clutch table, comments and who tested. The customer's name is deliberately not on the sheet.

function esc(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

type OrgDetails = { name: string; addressLines: string[]; registrationNumber: string | null; vatNumber: string | null; contact: string | null; email: string | null };

const STATE_TEXT: Record<string, string> = { PASS: "In spec", FAIL: "Out of spec", OVERRIDDEN: "Passed with note", RECORDED: "Recorded", EMPTY: "Not entered", WAITING: "Waiting", INVALID: "Not a number", NA: "N/A" };

// A thin bar showing the allowed band and where the reading landed.
function rangeBar(limit: TestLimit | null, ev: ReadingEvaluation) {
  if (!limit || ev.value === null || (ev.min === null && ev.max === null)) return "";
  const value = ev.value;
  let lo: number; let hi: number; let bandFrom: number; let bandTo: number;
  if (ev.min !== null && ev.max !== null) {
    const pad = Math.max((ev.max - ev.min) * 0.6, 1);
    lo = Math.min(ev.min - pad, value); hi = Math.max(ev.max + pad, value); bandFrom = ev.min; bandTo = ev.max;
  } else if (ev.min !== null) {
    const pad = Math.max(Math.abs(ev.min) * 0.3, 1);
    lo = Math.min(ev.min - pad, value); hi = Math.max(ev.min + pad * 2, value); bandFrom = ev.min; bandTo = hi;
  } else {
    const max = ev.max as number;
    const pad = Math.max(Math.abs(max) * 0.3, 1);
    lo = Math.min(max - pad * 2, value); hi = Math.max(max + pad, value); bandFrom = lo; bandTo = max;
  }
  const span = hi - lo || 1;
  const pct = (n: number) => Math.max(0, Math.min(100, ((n - lo) / span) * 100));
  const bad = ev.state === "FAIL";
  return `<div class="bar"><i class="band" style="left:${pct(bandFrom).toFixed(1)}%;width:${Math.max(1, pct(bandTo) - pct(bandFrom)).toFixed(1)}%"></i><b class="${bad ? "bad" : ""}" style="left:${pct(value).toFixed(1)}%"></b></div>`;
}

function statusCell(ev: ReadingEvaluation) {
  const tone = ev.state === "PASS" ? "ok" : ev.state === "FAIL" || ev.state === "INVALID" ? "bad" : ev.state === "OVERRIDDEN" ? "note" : "dim";
  const extra = ev.state === "FAIL" && ev.outBy !== null ? ` (${formatNumber(ev.outBy)} ${ev.min !== null && ev.value !== null && ev.value < ev.min ? "under" : "over"})` : "";
  return `<span class="st ${tone}">${esc(STATE_TEXT[ev.state] ?? "")}${esc(extra)}</span>`;
}

export async function printTestReport(report: ReportDetail): Promise<string | null> {
  const win = window.open("", "_blank");
  if (!win) return "Enable pop-ups to print the report.";
  let org: OrgDetails | null = null;
  try {
    const r = await fetch("/api/v1/company-settings/print-details", { cache: "no-store" });
    if (r.ok) org = await r.json();
  } catch { /* the sheet still prints without the company details */ }
  const logo = `${window.location.origin}/api/v1/company-settings/logo`;
  const { spec, readings, summary } = report;
  const rows = evaluateAll(spec, readings);
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const result = report.result;
  const resultLabel = result ? TEST_RESULT_LABELS[result] : "In progress";
  const resultTone = result === "PASS" ? "ok" : result === "FAIL" ? "bad" : result === "PASS_WITH_NOTE" ? "note" : "dim";
  const failLines = summary.failures.map((f) => `<li>${esc(failureSentence(f))}</li>`).join("");
  const overrideLines = rows.filter((row) => row.evaluation.state === "OVERRIDDEN").map((row) => {
    const key = row.key;
    const reading = key.startsWith("p:") ? readings.params?.[key.slice(2)] : (() => { const [, id, col] = key.split(":"); const cell = readings.clutches?.[id]; return col === "a" ? cell?.a : cell?.b; })();
    return `<li>${esc(row.label)}: ${esc(reading?.actual ?? "")} passed by ${esc(reading?.override?.by ?? "")}. ${esc(reading?.override?.reason ?? "")}</li>`;
  }).join("");

  const paramRows = spec.parameters.map((p) => {
    const row = byKey.get(`p:${p.id}`);
    const ev = row?.evaluation ?? evaluateReading(p.limit, readings.params?.[p.id]);
    const reading = readings.params?.[p.id];
    if (p.limit.type === "NA") return `<tr class="dimrow"><td><b>${esc(p.name)}</b></td><td>N/A</td><td></td><td></td><td></td></tr>`;
    return `<tr><td><b>${esc(p.name)}</b>${p.note ? `<div class="sm">${esc(p.note)}</div>` : ""}${reading?.note ? `<div class="sm">Note: ${esc(reading.note)}</div>` : ""}</td>
      <td>${esc(formatLimit(p.limit))}${p.unit && p.limit.type !== "RECORD" ? ` ${esc(p.unit)}` : ""}${limitNeedsValue(p.limit) && formatBounds(p.limit) !== formatLimit(p.limit) ? `<div class="sm">${esc(formatBounds(p.limit))}</div>` : ""}</td>
      <td class="num">${esc(reading?.actual ?? "")}</td><td>${rangeBar(p.limit, ev)}</td><td>${statusCell(ev)}</td></tr>`;
  }).join("");

  const clutchBlock = (col: "a" | "b") => spec.clutchRows.map((row) => {
    const limit = col === "a" ? row.a : row.b;
    if (!limit || limit.type === "NA") return `<td class="dim">N/A</td><td></td><td></td>`;
    const ev = byKey.get(`c:${row.id}:${col}`)?.evaluation ?? evaluateReading(limit, undefined);
    const cell = readings.clutches?.[row.id];
    const reading = col === "a" ? cell?.a : cell?.b;
    const first = col === "b" && row.a ? evaluateReading(row.a, cell?.a).value : null;
    return `<td>${esc(formatLimit(limit, spec.labelA))}${formatBounds(limit, first) !== formatLimit(limit, spec.labelA) ? `<div class="sm">${esc(formatBounds(limit, first))}</div>` : ""}</td><td class="num">${esc(reading?.actual ?? "")}</td><td>${statusCell(ev)}</td>`;
  });
  const g2 = (cells: string) => cells.startsWith('<td class="') ? cells.replace('<td class="', '<td class="g2 ') : cells.replace(/^<td>/, '<td class="g2">');
  const colA = clutchBlock("a");
  const colB = clutchBlock("b");
  const clutchTable = spec.clutchRows.length ? `<h3>Clutch pressures</h3><table class="grid"><thead><tr><th rowspan="2">Clutch</th><th colspan="3" class="grp">${esc(spec.labelA)}</th><th colspan="3" class="grp g2">${esc(spec.labelB)}</th></tr><tr><th>Limit</th><th>Actual</th><th>Result</th><th class="g2">Limit</th><th>Actual</th><th>Result</th></tr></thead><tbody>${
    spec.clutchRows.map((row, i) => `<tr><td><b>${esc(row.name)}</b></td>${colA[i]}${g2(colB[i])}</tr>`).join("")}</tbody></table>` : "";

  const facts: Array<[string, string]> = [
    ["Job number", report.job?.jobNumber || "—"], ["Machine model", report.machineModel], ["Serial number", report.serialNumber || "—"],
    ["Test date", formatDate(report.testDate)], ["Input RPM", report.inputRpm != null ? String(report.inputRpm) : "—"], ["Test type", report.testType || "—"],
  ];
  const orgBlock = org ? `<div class="org"><b>${esc(org.name)}</b>${org.addressLines.map((l) => `<div>${esc(l)}</div>`).join("")}${org.registrationNumber ? `<div>Reg: ${esc(org.registrationNumber)}</div>` : ""}${org.vatNumber ? `<div>VAT: ${esc(org.vatNumber)}</div>` : ""}${org.contact ? `<div>${esc(org.contact)}</div>` : ""}${org.email ? `<div>${esc(org.email)}</div>` : ""}</div>` : "";

  win.document.write(withPoweredBy(`<!doctype html><html><head><meta charset="utf-8" /><title>${esc(`${report.job?.jobNumber ? `${report.job.jobNumber} - ` : ""}${report.label} - Test report`)}</title><style>
    @page{size:A4 portrait;margin:10mm}
    *{box-sizing:border-box}
    body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#172033;font-size:11px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .top{display:flex;align-items:center;justify-content:space-between;gap:14px;padding-bottom:10px;border-bottom:3px solid #d6a83b}
    .top img{max-height:54px;max-width:200px;object-fit:contain}
    .top .t{text-align:right}.top h1{margin:0;font-size:20px;letter-spacing:-.01em}.top .t div{color:#6b7689;margin-top:2px}
    .result{display:flex;align-items:flex-start;gap:14px;margin:12px 0;padding:11px 14px;border:1.5px solid;border-radius:8px}
    .result .big{font-size:22px;font-weight:800;line-height:1}.result ul{margin:5px 0 0;padding-left:16px}.result p{margin:4px 0 0}
    .result.ok{border-color:#6fcf9f;background:#f3fdf8;color:#065f42}.result.bad{border-color:#e0746b;background:#fff5f4;color:#9a1c12}.result.note{border-color:#d6a83b;background:#fffbef;color:#5c3d00}.result.dim{border-color:#c6cdd8;background:#f5f7fa;color:#3f4b60}
    .facts{display:grid;grid-template-columns:repeat(6,1fr);border:1px solid #c6cdd8;border-radius:8px;overflow:hidden;margin-bottom:12px}
    .facts div{padding:6px 9px;border-right:1px solid #e2e6ec}.facts div:last-child{border-right:0}.facts small{display:block;color:#6b7689;font-size:9px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px}.facts b{font-size:12px;overflow-wrap:anywhere}
    h3{margin:12px 0 5px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#3f4b60}
    table.grid{width:100%;border-collapse:collapse;border:1px solid #c6cdd8}
    table.grid th{background:#eef1f5;padding:5px 7px;font-size:9.5px;text-align:left;border:1px solid #d9dfe8;text-transform:uppercase;letter-spacing:.03em;color:#3f4b60}
    table.grid th.grp{text-align:center;background:#e4e9f0}
    table.grid td{padding:5px 7px;border:1px solid #e2e6ec;vertical-align:middle}
    table.grid td.num{font-weight:800;font-size:12.5px;text-align:center;font-variant-numeric:tabular-nums}
    table.grid .g2{border-left:2px solid #c6cdd8}
    .sm{color:#6b7689;font-size:9.5px;margin-top:1px}.dim,.dimrow td{color:#9aa4b4}
    .st{font-weight:700;white-space:nowrap}.st.ok{color:#087a55}.st.bad{color:#9a1c12}.st.note{color:#7a5200}.st.dim{color:#6b7689;font-weight:600}
    .bar{position:relative;height:8px;border-radius:4px;background:#e8ecf2;min-width:110px}.bar .band{position:absolute;top:0;bottom:0;background:#b9e6cf;border-radius:4px}.bar b{position:absolute;top:-3px;width:3px;height:14px;margin-left:-1px;background:#172033;border-radius:2px}.bar b.bad{background:#b42318}
    tr{break-inside:avoid}
    .two{display:grid;grid-template-columns:1.4fr 1fr;gap:14px;margin-top:12px}
    .box{border:1px solid #c6cdd8;border-radius:8px;padding:8px 10px;min-height:60px}.box h4{margin:0 0 4px;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#6b7689}.box p{margin:0;white-space:pre-wrap}
    .sign{display:grid;gap:3px}.sign span{display:block;border-bottom:1px solid #98a2b3;height:16px}
    .foot{display:flex;justify-content:space-between;gap:12px;margin-top:14px;padding-top:8px;border-top:1px solid #e2e6ec;color:#6b7689;font-size:9.5px}.org div{margin-top:1px}.org b{color:#172033}
  </style></head><body>
    <div class="top"><img src="${esc(logo)}" alt="${esc(org?.name ?? "")}" onerror="this.outerHTML='<b>${esc(org?.name ?? "")}</b>'" /><div class="t"><h1>Transmission Test Report</h1><div>${esc(report.label)} &middot; ${esc(spec.name)}${report.retestOf ? ` &middot; Retest of ${esc(report.retestOf.label)}` : ""}</div></div></div>
    <div class="result ${resultTone}"><div><div class="big">${esc(resultLabel)}</div></div><div style="flex:1">
      ${result === "FAIL" ? `<ul>${failLines}</ul>` : result === "PASS_WITH_NOTE" ? `<p>Passed with a note on ${summary.overridden} reading${summary.overridden === 1 ? "" : "s"}.</p>${overrideLines ? `<ul>${overrideLines}</ul>` : ""}` : result === "PASS" ? `<p>All ${summary.total} readings are within spec.</p>` : `<p>${summary.entered} of ${summary.total} readings entered.</p>`}
      ${result === "FAIL" && overrideLines ? `<ul>${overrideLines}</ul>` : ""}
    </div></div>
    <div class="facts">${facts.map(([label, value]) => `<div><small>${esc(label)}</small><b>${esc(value)}</b></div>`).join("")}</div>
    <h3>Test data</h3>
    <table class="grid"><thead><tr><th style="width:28%">Parameter</th><th style="width:22%">Limit</th><th style="width:11%;text-align:center">Actual</th><th style="width:22%">Within limit</th><th>Result</th></tr></thead><tbody>${paramRows}</tbody></table>
    ${clutchTable}
    <div class="two"><div class="box"><h4>Comments</h4><p>${esc(report.comments || "")}</p></div><div class="box sign"><h4>Tested by</h4><p><b>${esc(report.testers.join(", "))}</b></p><span></span><small class="sm">Signature</small></div></div>
    <div class="foot">${orgBlock}<div>Spec: ${esc(spec.name)} revision ${spec.revision}${report.completedAt ? ` &middot; Completed ${esc(formatDate(report.completedAt))}` : ""}</div></div>
  </body></html>`));
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
  return null;
}
