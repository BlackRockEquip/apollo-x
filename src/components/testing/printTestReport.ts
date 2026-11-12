import { poweredByHiddenInPage, withPoweredBy } from "@/lib/documents/powered-by";
import {
  evaluateAll, evaluateReading, failureSentence, formatLimit, limitNeedsValue, resultLabel, type ReadingEvaluation, type TestLimit, type TestReading,
} from "@/lib/testing/spec";
import { formatDate, type ReportDetail } from "./types";

// The printed / PDF test report, laid out like the Transmission Test Certificate (2026-11-12, "build according to this document"):
// company logo and details, the certificate number box, lettered sections A to E with navy headers (job details, unit identification,
// test data gauges, clutch pressures, comments and result), the big PASSED / FAILED boxes and the signature lines.
// Customer name and customer order / reference are shown only when the person printing could see them on screen.

function esc(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

const slashDateTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10).replace(/-/g, "/");
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export type GaugeShape = { bandLeft: number; bandWidth: number; marker: number; tone: "ok" | "bad" | "note" };

// Where the green spec window and the reading marker sit on a track, as percentages. A reading far outside the window is held at
// the edge of the track rather than drawn off it. Returns null when there is nothing to draw (no reading, or no window).
export function gaugeShape(ev: ReadingEvaluation): GaugeShape | null {
  if (ev.value === null || (ev.min === null && ev.max === null)) return null;
  const value = ev.value;
  let lo: number; let hi: number; let bandFrom: number; let bandTo: number;
  if (ev.min !== null && ev.max !== null) {
    const pad = Math.max((ev.max - ev.min) / 2, Math.abs(ev.min) * 0.05, 1);
    lo = ev.min - pad; hi = ev.max + pad; bandFrom = ev.min; bandTo = ev.max;
  } else if (ev.min !== null) {
    const span = Math.max(Math.abs(ev.min), 1);
    lo = ev.min - span * 0.6; hi = ev.min + span * 1.2; bandFrom = ev.min; bandTo = hi;
  } else {
    const max = ev.max as number;
    const span = Math.max(Math.abs(max), 1);
    lo = max - span * 1.2; hi = max + span * 0.6; bandFrom = lo; bandTo = max;
  }
  const width = hi - lo || 1;
  const pct = (n: number) => Math.max(0, Math.min(100, ((n - lo) / width) * 100));
  const tone = ev.state === "FAIL" || ev.state === "INVALID" ? "bad" : ev.state === "OVERRIDDEN" ? "note" : "ok";
  return { bandLeft: pct(bandFrom), bandWidth: Math.max(2, pct(bandTo) - pct(bandFrom)), marker: Math.max(3, Math.min(97, pct(value))), tone };
}

// A track with the spec window in green and a round marker where the reading landed.
function gauge(ev: ReadingEvaluation): string {
  const shape = gaugeShape(ev);
  if (!shape) return `<div class="track"></div>`;
  return `<div class="track"><i class="band" style="left:${shape.bandLeft.toFixed(1)}%;width:${shape.bandWidth.toFixed(1)}%"></i><i class="mk ${shape.tone}" style="left:${shape.marker.toFixed(1)}%"></i></div>`;
}

const PILL: Record<string, { text: string; tone: string }> = {
  PASS: { text: "IN SPEC", tone: "ok" },
  FAIL: { text: "OUT OF SPEC", tone: "bad" },
  OVERRIDDEN: { text: "PASSED WITH NOTE", tone: "note" },
  RECORDED: { text: "RECORDED", tone: "dim" },
  EMPTY: { text: "NOT ENTERED", tone: "dim" },
  WAITING: { text: "WAITING", tone: "dim" },
  INVALID: { text: "NOT A NUMBER", tone: "bad" },
  NA: { text: "N/A", tone: "dim" },
};

function waitForImages(win: Window): Promise<void> {
  const images = Array.from(win.document.images ?? []);
  const loading = images.filter((img) => !img.complete).map((img) => new Promise<void>((resolve) => { img.onload = () => resolve(); img.onerror = () => resolve(); }));
  if (loading.length === 0) return Promise.resolve();
  // The print dialog opens only once the logo has loaded (printing sooner gave a grey box), but never waits more than a few seconds.
  return Promise.race([Promise.all(loading).then(() => undefined), new Promise<void>((resolve) => setTimeout(resolve, 5000))]);
}

type PrintDetails = { name: string; addressLines: string[]; contact: string; website: string; email: string };

async function loadPrintDetails(): Promise<PrintDetails> {
  const empty: PrintDetails = { name: "", addressLines: [], contact: "", website: "", email: "" };
  try {
    const r = await fetch("/api/v1/company-settings/print-details", { cache: "no-store" });
    if (!r.ok) return empty;
    const body = await r.json();
    return {
      name: String(body.name || ""),
      addressLines: Array.isArray(body.addressLines) ? body.addressLines.map(String) : [],
      contact: String(body.contact || ""),
      website: String(body.website || ""),
      email: String(body.email || ""),
    };
  } catch { return empty; /* the sheet still prints without the company details */ }
}

const CHECK = `<svg viewBox="0 0 48 48" width="46" height="46" aria-hidden="true"><path d="M8 25l11 11L40 12" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const CROSS = `<svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true"><path d="M10 10l28 28M38 10L10 38" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/></svg>`;

export async function printTestReport(report: ReportDetail): Promise<string | null> {
  const win = window.open("", "_blank");
  if (!win) return "Enable pop-ups to print the report.";
  const company = await loadPrintDetails();
  const orgName = company.name;
  const logo = `${window.location.origin}/api/v1/company-settings/logo`;
  const { spec, readings, summary } = report;
  const rows = evaluateAll(spec, readings);
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const result = report.result;
  const passed = result === "PASS" || result === "PASS_WITH_NOTE";
  const failed = result === "FAIL";
  const resultWord = resultLabel(result, !!report.passedOnComments);

  // ---- Result boxes -------------------------------------------------------------------------------------------------------
  const sentences = summary.failures.map((f) => failureSentence(f));
  const shown = (list: string[], max: number) => `${list.slice(0, max).map((line) => esc(line)).join("<br>")}${list.length > max ? `<br>and ${list.length - max} more out of spec` : ""}`;
  let passedSub = ""; let failedSub = "";
  if (result === "PASS") passedSub = `ALL READINGS IN SPEC &middot; ${summary.total} OF ${summary.total} WITHIN THE SPEC WINDOW`;
  else if (result === "PASS_WITH_NOTE" && report.passedOnComments) passedSub = `PASSED ON COMMENTS BY ${esc(report.passedOnComments.by.toUpperCase())} &middot; ${summary.fail} OUT OF SPEC`;
  else if (result === "PASS_WITH_NOTE") passedSub = `PASSED WITH NOTE &middot; ${summary.overridden} READING${summary.overridden === 1 ? "" : "S"} PASSED WITH A REASON`;
  if (failed) failedSub = `${summary.pass + summary.overridden} OF ${summary.total} IN SPEC &middot; ${summary.fail} OUT OF SPEC`;
  const noResult = !passed && !failed;
  const resultStrip = `<section class="result"><div class="rlabel"><span>RESULT</span></div>
    <div class="rbox pass ${passed ? (result === "PASS_WITH_NOTE" ? "on note" : "on") : "off"}">${passed ? `<div class="rmain">${CHECK}<b>PASSED</b></div><small>${passedSub}</small>` : `<div class="rmain"><b>PASSED</b></div>${noResult ? `<small>${summary.entered} OF ${summary.total} READINGS ENTERED &middot; RESULT SHOWS ONCE EVERY READING IS IN</small>` : ""}`}</div>
    <div class="rbox fail ${failed ? "on" : "off"}">${failed ? `<div class="rmain">${CROSS}<b>FAILED</b></div><small>${failedSub}</small>` : `<div class="rmain"><b>FAILED</b></div>`}</div></section>
    ${failed && sentences.length ? `<div class="reasons">${shown(sentences, 3)}</div>` : ""}`;

  // ---- A and B: job details and unit identification ------------------------------------------------------------------------
  const cell = (label: string, value: string, span = 1) => `<div class="cell" style="grid-column:span ${span}"><small>${esc(label)}</small><b>${esc(value || "—")}</b></div>`;
  const jobDetails = `<section><div class="sh">A &middot; JOB DETAILS</div><div class="fgrid g4">
    ${cell("Job no.", report.job?.jobNumber ?? "")}${cell("Test date", formatDate(report.testDate))}${cell("Test type", report.testType)}${cell("Technician", report.testers.join(" / "))}
    ${cell("Customer", report.customerName, 3)}${cell("Customer order / ref.", report.customerReference)}</div></section>`;
  const unit = `<section><div class="sh">B &middot; UNIT IDENTIFICATION</div><div class="fgrid u4">
    ${cell("Make", report.machineMake)}${cell("Model", spec.name)}${cell("Machine model", report.machineModel)}${cell("Serial no.", report.serialNumber)}
    ${cell("Input RPM", report.inputRpm != null ? String(report.inputRpm) : "", 2)}${cell("Spec revision", String(spec.revision), 2)}</div></section>`;

  // ---- C: test data gauges ------------------------------------------------------------------------------------------------
  const params = spec.parameters.filter((p) => p.limit.type !== "NA");
  const paramCards = params.map((p) => {
    const reading = readings.params?.[p.id];
    const ev = byKey.get(`p:${p.id}`)?.evaluation ?? evaluateReading(p.limit, reading);
    const pill = PILL[ev.state] ?? PILL.EMPTY;
    const unitText = p.unit ? esc(p.unit) : "";
    const cls = pill.tone === "bad" ? "bad" : pill.tone === "note" ? "note" : "";
    const specLine = p.limit.type === "RECORD" ? "Record only &mdash; no pass/fail window" : `${p.note ? `${esc(p.note)} &middot; ` : ""}Spec ${esc(formatLimit(p.limit, spec.labelA))}${unitText ? ` ${unitText}` : ""}`;
    return `<div class="card"><div class="ctop"><span class="cname">${esc(p.name)}</span><span class="pill ${pill.tone}">${pill.text}</span></div>
      <div class="big"><b class="${cls}">${esc(reading?.actual ?? "")}</b><span>${unitText}</span></div>
      ${limitNeedsValue(p.limit) ? gauge(ev) : `<div class="track none"></div>`}<div class="cspec">${specLine}</div>
      ${reading?.note ? `<div class="cspec">Note: ${esc(reading.note)}</div>` : ""}${ev.state === "OVERRIDDEN" && reading?.override ? `<div class="cspec">Passed by ${esc(reading.override.by)}: ${esc(reading.override.reason)}</div>` : ""}</div>`;
  }).join("");
  const hasRecordOnly = params.some((p) => p.limit.type === "RECORD");
  const dataBlock = paramCards ? `<section><div class="sh">C &middot; TEST DATA</div><div class="cards">${paramCards}</div>
    <p class="foot">Green band is the specification window. The marker is where the reading landed.${hasRecordOnly ? " Readings marked record only are written down and not assessed against a window." : ""}</p></section>` : "";

  // ---- D: clutch pressures ------------------------------------------------------------------------------------------------
  const sideCells = (limit: TestLimit | null, reading: TestReading | undefined, key: string) => {
    if (!limit || limit.type === "NA") return `<span class="sp none">&mdash;</span><span></span><span class="act none">&mdash;</span>`;
    const ev = byKey.get(key)?.evaluation ?? evaluateReading(limit, reading);
    const cls = ev.state === "FAIL" || ev.state === "INVALID" ? "bad" : ev.state === "OVERRIDDEN" ? "note" : "";
    return `<span class="sp">${esc(formatLimit(limit, spec.labelA))}</span><div>${limitNeedsValue(limit) ? gauge(ev) : ""}</div><span class="act ${cls}">${esc(reading?.actual ?? "")}</span>`;
  };
  const clutchRows = spec.clutchRows.map((row) => {
    const c = readings.clutches?.[row.id];
    return `<div class="crow${/neutral/i.test(row.name) ? " neutral" : ""}"><span class="cn">${esc(row.name)}</span>${sideCells(row.a, c?.a, `c:${row.id}:a`)}${sideCells(row.b, c?.b, `c:${row.id}:b`)}</div>`;
  }).join("");
  const engagedRows = spec.layout === "ENGAGED" ? spec.clutchRows.map((row) => {
    const c = readings.clutches?.[row.id];
    const parts = (row.cells ?? []).map((x) => {
      if (x.limit.type === "NA") return `<div class="ecell"><div class="etop"><b>${esc(x.label)}</b><span>N/A</span></div></div>`;
      const reading = c?.cells?.[x.id];
      const ev = byKey.get(`c:${row.id}:x:${x.id}`)?.evaluation ?? evaluateReading(x.limit, reading);
      const cls = ev.state === "FAIL" || ev.state === "INVALID" ? "bad" : ev.state === "OVERRIDDEN" ? "note" : "";
      return `<div class="ecell"><div class="etop"><b>${esc(x.label)}</b><span>${esc(formatLimit(x.limit, spec.labelA))}</span></div>${limitNeedsValue(x.limit) ? gauge(ev) : ""}<div class="act ${cls}">${esc(reading?.actual ?? "")}</div></div>`;
    }).join("");
    return `<div class="erow"><span class="cn">${esc(row.name)}</span><div class="ecells">${parts}</div></div>`;
  }).join("") : "";
  let clutchBlock = "";
  if (spec.clutchRows.length > 0 && spec.layout === "ENGAGED") {
    clutchBlock = `<section><div class="sh">D &middot; CLUTCH PRESSURES</div><div class="ctable"><div class="chead eh"><span>GEAR</span><span>ENGAGED CLUTCHES</span></div>${engagedRows}</div>
      <p class="foot">Each gear lists the clutches engaged in it. Green band is the specification window. The marker is where the reading landed.</p></section>`;
  } else if (spec.clutchRows.length > 0) {
    const a = esc(spec.labelA.toUpperCase()); const b = esc(spec.labelB.toUpperCase());
    clutchBlock = `<section><div class="sh">D &middot; CLUTCH PRESSURES</div><div class="ctable"><div class="chead"><span>CLUTCH</span><span>${a} SPEC</span><span>${a} WINDOW</span><span class="r">${a} ACTUAL</span><span>${b} SPEC</span><span>${b} WINDOW</span><span class="r">${b} ACTUAL</span></div>${clutchRows}</div>
      <p class="foot">Green band is the specification window. The marker is where the reading landed. All pressures as recorded on the bench.</p></section>`;
  }

  // ---- E: comments and result, signatures ---------------------------------------------------------------------------------
  const commentsBox = `<section><div class="sh">E &middot; COMMENTS AND RESULT</div><div class="comments"><small>COMMENTS</small><p>${esc(report.comments || "")}</p>${report.passedOnComments ? `<span class="meta">Passed on these comments by ${esc(report.passedOnComments.by)}${report.passedOnComments.at ? `, ${esc(slashDateTime(report.passedOnComments.at))}` : ""}</span>` : ""}</div></section>`;
  const signDate = formatDate((report.completedAt ?? report.testDate ?? "").slice(0, 10));
  const sign = `<section class="sign"><div class="sline"><b>${esc(report.testers.join(" / "))}</b><small>TECHNICIAN &mdash; NAME &amp; SIGNATURE</small></div><div class="sline"><b>&nbsp;</b><small>SUPERVISOR &mdash; NAME &amp; SIGNATURE</small></div><div class="sline date"><b>${esc(signDate)}</b><small>DATE</small></div></section>
    <p class="foot">Results apply to the unit identified on this certificate only.${report.completedAt ? "" : " This test has not been completed yet."}</p>`;

  // ---- Page ---------------------------------------------------------------------------------------------------------------
  const hidePowered = poweredByHiddenInPage();
  const contactLine = [company.contact ? `Tel ${company.contact}` : "", company.website || company.email].filter(Boolean).join(" · ");
  const subtitle = `Transmission bench test${orgName ? ` — ${orgName}` : ""}${report.retestOf ? ` · retest of ${report.retestOf.label}` : ""}`;
  win.document.write(withPoweredBy(`<!doctype html><html><head><meta charset="utf-8" /><title>${esc(`${report.job?.jobNumber ? `${report.job.jobNumber} - ` : ""}${report.label} - Transmission test certificate`)}</title><style>
    @page{size:A4 portrait;margin:0}
    *{box-sizing:border-box}
    html,body{margin:0}
    :root{--navy:#14224a;--blue:#1d3a8f;--gold:#d6a83b;--line:#d5dae3;--soft:#f3f5f9;--ink:#172033;--grey:#6b7689;--ok:#1e8e3e;--bad:#c2323c;--note:#b8871f}
    body{font-family:Inter,"Segoe UI",system-ui,Arial,Helvetica,sans-serif;color:var(--ink);font-size:11px;-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#e9ecf1}
    .sheet{position:relative;display:flex;flex-direction:column;width:210mm;min-height:297mm;margin:0 auto;background:#fff;padding:9mm 10mm ${hidePowered ? 6 : 12}mm}
    @media print{body{background:#fff}.sheet{margin:0}}
    .top{display:flex;justify-content:space-between;align-items:flex-start;gap:18px}
    .top img{max-width:190px;max-height:72px;object-fit:contain;display:block}
    .co{text-align:right;line-height:1.5;font-size:9.5px;color:var(--grey)}.co b{display:block;font-size:12.5px;color:var(--navy);font-weight:800}
    .head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin:8px 0 8px;border-bottom:0}
    .head h1{margin:0;font-size:23px;font-weight:800;letter-spacing:.005em;color:var(--navy);line-height:1.1}.head p{margin:3px 0 0;color:var(--grey);font-size:10.5px}
    .certno{flex:none;min-width:150px;border:1.5px solid var(--navy);border-radius:4px;padding:4px 12px 5px;text-align:center}
    .certno small{display:block;font-size:6.5px;letter-spacing:.08em;font-weight:700;color:var(--grey)}.certno b{font-size:16px;font-weight:800;color:var(--blue);letter-spacing:.02em}
    .stack{display:flex;flex-direction:column;gap:7px;flex:1}
    .sh{background:var(--navy);color:#fff;font-size:9px;font-weight:800;letter-spacing:.09em;padding:4px 9px;border-radius:2px 2px 0 0}
    .fgrid{display:grid;border:1px solid var(--line);border-top:0}.g4{grid-template-columns:1fr 1fr 1fr 1.4fr}.u4{grid-template-columns:.8fr 2.4fr 1.3fr 1fr}
    .cell{padding:4px 8px 5px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);display:flex;flex-direction:column;gap:1px;min-width:0}
    .cell small{font-size:6.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--grey)}.cell b{font-size:11.5px;font-weight:500;color:var(--blue);overflow-wrap:anywhere}
    .fgrid .cell:nth-last-child(-n+2){border-bottom:0}
    .cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;border:1px solid var(--line);border-top:0;padding:8px}
    .card{border:1px solid var(--line);border-radius:8px;padding:8px 10px;display:flex;flex-direction:column;gap:4px;break-inside:avoid;min-width:0}
    .ctop{display:flex;justify-content:space-between;align-items:center;gap:6px}.cname{font-size:9.5px;font-weight:600;color:var(--ink)}
    .pill{font-size:6.5px;font-weight:800;letter-spacing:.05em;border-radius:6px;padding:1px 6px;white-space:nowrap;border:1px solid}
    .pill.ok{color:#1f6b42;background:#eaf7ee;border-color:#8fcca6}.pill.bad{color:#9a1c12;background:#fdecee;border-color:#e8a7ad}.pill.note{color:#7a5200;background:#fff1c9;border-color:#e6c46a}.pill.dim{color:#4b5565;background:#eef1f5;border-color:#c9d0db}
    .big{display:flex;align-items:baseline;gap:4px}.big b{font-size:24px;font-weight:800;letter-spacing:-.01em;color:var(--navy)}.big b.bad{color:var(--bad)}.big b.note{color:var(--note)}.big span{font-size:10px;color:var(--grey)}
    .track{position:relative;height:14px;display:flex;align-items:center}
    .track:before{content:"";position:absolute;left:0;right:0;top:50%;height:7px;margin-top:-3.5px;background:#e4e8ef;border-radius:4px}
    .track.none:before{background:transparent}
    .band{position:absolute;top:50%;height:7px;margin-top:-3.5px;background:#79c795;border-radius:4px}
    .mk{position:absolute;top:50%;width:13px;height:13px;margin:-6.5px 0 0 -6.5px;border-radius:50%;background:var(--gold);border:3px solid var(--navy)}.mk.bad{border-color:var(--bad)}.mk.note{border-color:var(--note)}
    .cspec{font-size:8px;color:var(--grey);line-height:1.35}
    .foot{margin:3px 0 0;font-size:8px;color:var(--grey);font-style:italic}
    .ctable{border:1px solid var(--line);border-top:0}
    .chead,.crow{display:grid;grid-template-columns:1.35fr .75fr 1.7fr .6fr .85fr 1.7fr .6fr;gap:8px;align-items:center;padding:0 10px}
    .chead{height:21px;background:var(--soft);font-size:7px;font-weight:800;letter-spacing:.07em;color:var(--grey);border-bottom:1px solid var(--line)}.r{text-align:right}
    .crow{height:24px;border-top:1px solid #e8ebf1;break-inside:avoid}.crow:first-of-type{border-top:0}.crow.neutral{background:#fff6d6}
    .cn{font-weight:800;font-size:9.5px;color:var(--navy)}.sp{color:var(--ink);font-size:9px}.none{color:#b8c0cd}
    .act{text-align:right;font-weight:800;font-size:12px;color:var(--blue)}.act.bad{color:var(--bad)}.act.note{color:var(--note)}.act.none{font-weight:500}
    .erow{display:grid;grid-template-columns:70px minmax(0,1fr);gap:8px;align-items:center;padding:5px 10px;border-top:1px solid #e8ebf1;break-inside:avoid}.chead.eh{grid-template-columns:70px minmax(0,1fr)}
    .ecells{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.ecell{display:flex;flex-direction:column;gap:2px;min-width:0}.etop{display:flex;justify-content:space-between;gap:4px;font-size:8.5px;color:var(--grey)}.etop b{color:var(--navy);font-weight:800}.ecell .act{font-size:11.5px}
    .comments{border:1px solid var(--line);border-top:0;padding:5px 9px 7px;min-height:44px;display:flex;flex-direction:column;gap:2px}.comments small{font-size:6.5px;font-weight:700;letter-spacing:.07em;color:var(--grey)}
    .comments p{margin:0;font-size:11px;line-height:1.45;color:var(--blue);white-space:pre-wrap}.comments .meta{font-size:8.5px;color:var(--grey)}
    .result{display:flex;gap:8px;align-items:stretch;margin-top:2px;break-inside:avoid}
    .rlabel{flex:none;width:26px;background:var(--navy);border-radius:3px;display:flex;align-items:center;justify-content:center}
    .rlabel span{writing-mode:vertical-rl;transform:rotate(180deg);color:var(--gold);font-size:11px;font-weight:800;letter-spacing:.14em}
    .rbox{border-radius:12px;padding:10px 16px;display:flex;flex-direction:column;justify-content:center;gap:5px;min-height:92px;border:2.5px solid}
    .rbox.pass{flex:1 1 0}.rbox.fail{flex:0 0 31%}
    .rbox .rmain{display:flex;align-items:center;gap:10px}.rbox b{font-size:46px;font-weight:900;letter-spacing:-.005em;line-height:1}.rbox small{font-size:7.5px;font-weight:800;letter-spacing:.08em;line-height:1.4}
    .rbox.on{color:#fff;border-color:transparent}.rbox.pass.on{background:var(--ok)}.rbox.pass.on.note{background:var(--note)}.rbox.fail.on{background:var(--bad)}
    .rbox.off{color:#c3cad6;border-color:#d8dde6;background:#fff;align-items:center}.rbox.off b{font-size:30px}.rbox.pass.off b{font-size:38px}
    .reasons{font-size:9px;line-height:1.5;color:#7d1f27;background:#fdecee;border:1px solid #f1b6bb;border-radius:6px;padding:5px 9px}
    .sign{display:grid;grid-template-columns:1.3fr 1.3fr .7fr;gap:26px;margin-top:6px}
    .sline{display:flex;flex-direction:column;gap:3px}.sline b{font-size:12px;font-weight:500;color:var(--blue);min-height:17px;border-bottom:1px solid var(--navy);padding-bottom:2px}
    .sline small{font-size:6.5px;font-weight:700;letter-spacing:.07em;color:var(--grey)}
    footer{flex:none;margin-top:10px;border-top:2px solid var(--gold);padding-top:5px;display:flex;align-items:center;justify-content:space-between;font-size:8px;color:var(--grey)}
  </style></head><body><div class="sheet">
    <div class="top"><img src="${esc(logo)}" alt="${esc(orgName)}" onerror="this.style.display='none'" /><div class="co"><b>${esc(orgName)}</b>${company.addressLines.length ? `${esc(company.addressLines.join(", "))}<br>` : ""}${contactLine ? esc(contactLine) : ""}</div></div>
    <div class="head"><div><h1>TRANSMISSION TEST CERTIFICATE</h1><p>${esc(subtitle)}</p></div><div class="certno"><small>CERTIFICATE / REPORT NO.</small><b>${esc(report.label)}</b></div></div>
    <div class="stack">${jobDetails}${unit}${dataBlock}${clutchBlock}${commentsBox}${resultStrip}${sign}</div>
    <footer><span>${esc(orgName)}</span><span>${esc(report.label)} &middot; ${esc(resultWord)} &middot; spec rev ${spec.revision}</span></footer>
  </div></body></html>`));
  win.document.close();
  await waitForImages(win);
  win.focus();
  win.print();
  return null;
}
