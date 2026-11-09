import { poweredByHiddenInPage, withPoweredBy } from "@/lib/documents/powered-by";
import {
  evaluateAll, evaluateReading, failureSentence, formatLimit, limitNeedsValue, resultLabel, type ReadingEvaluation, type TestLimit, type TestReading,
} from "@/lib/testing/spec";
import type { ReportDetail } from "./types";

// The printed / PDF test report, laid out like the approved mockup ("Print 2"): black top bar, logo with the yellow report tag, the
// machine and result tile, a fact strip, test data cards and a clutch table with segmented spec-window bars, comments and tested by,
// company name footer and a yellow bottom bar. Customer name is shown only when the person printing could see it on screen.

function esc(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

const slashDate = (iso: string) => (iso ? iso.slice(0, 10).replace(/-/g, "/") : "");
const slashDateTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return slashDate(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const CELLS = 20;

// A 20-cell bar: the spec window in green, the reading as a marker (green in spec, red out, gold passed with a note).
function bar(ev: ReadingEvaluation): string {
  if (ev.value === null || (ev.min === null && ev.max === null)) return "";
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
  // A reading far outside the window sits at the edge of the bar rather than off it.
  const width = hi - lo || 1;
  const marker = Math.max(0, Math.min(CELLS - 1, Math.floor(((value - lo) / width) * CELLS)));
  const tone = ev.state === "FAIL" || ev.state === "INVALID" ? "bad" : ev.state === "OVERRIDDEN" ? "note" : "ok";
  let cells = "";
  for (let i = 0; i < CELLS; i += 1) {
    const centre = lo + ((i + 0.5) / CELLS) * width;
    const inBand = centre >= bandFrom && centre <= bandTo;
    cells += i === marker ? `<i class="m ${tone}"></i>` : `<i class="${inBand ? "b" : "t"}"></i>`;
  }
  return `<div class="bar">${cells}</div>`;
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

export async function printTestReport(report: ReportDetail): Promise<string | null> {
  const win = window.open("", "_blank");
  if (!win) return "Enable pop-ups to print the report.";
  let orgName = "";
  try {
    const r = await fetch("/api/v1/company-settings/print-details", { cache: "no-store" });
    if (r.ok) orgName = String((await r.json()).name || "");
  } catch { /* the sheet still prints without the company name */ }
  const logo = `${window.location.origin}/api/v1/company-settings/logo`;
  const { spec, readings, summary } = report;
  const rows = evaluateAll(spec, readings);
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const result = report.result;
  const tone = result === "PASS" ? "ok" : result === "FAIL" ? "bad" : result === "PASS_WITH_NOTE" ? "note" : "dim";
  const tile = result === "PASS" || result === "PASS_WITH_NOTE" ? "PASS" : result === "FAIL" ? "FAIL" : "OPEN";

  // Result tile text: one headline and a short reason, never a wall of lines.
  const sentences = summary.failures.map((f) => failureSentence(f));
  const shown = (list: string[], max: number) => `${list.slice(0, max).map((line) => esc(line)).join("<br>")}${list.length > max ? `<br>and ${list.length - max} more out of spec (see the tables)` : ""}`;
  let headline: string; let detail: string;
  if (result === "FAIL") { headline = `${summary.pass + summary.overridden} of ${summary.total} readings in spec`; detail = shown(sentences, 3); }
  else if (result === "PASS_WITH_NOTE" && report.passedOnComments) { headline = `Pass with comment, by ${esc(report.passedOnComments.by)}`; detail = `${summary.fail} reading${summary.fail === 1 ? "" : "s"} out of spec.<br>${shown(sentences, 2)}`; }
  else if (result === "PASS_WITH_NOTE") { headline = `Pass with note (${summary.overridden} reading${summary.overridden === 1 ? "" : "s"})`; detail = "Readings marked with a note were passed with a reason."; }
  else if (result === "PASS") { headline = `${summary.total} of ${summary.total} readings in spec`; detail = "All readings are within the spec window."; }
  else { headline = `${summary.entered} of ${summary.total} readings entered`; detail = "The result shows once every reading is in."; }
  if (result === "FAIL") headline = esc(headline);

  const facts: Array<[string, string, boolean]> = [
    ["Test date", slashDate(report.testDate), true], ["Job number", report.job?.jobNumber ?? "", true], ["Customer", report.customerName, false], ["Machine model", report.machineModel, true],
    ["Serial no.", report.serialNumber, true], ["Input RPM", report.inputRpm != null ? String(report.inputRpm) : "", false], ["Test type", report.testType, false],
  ];
  const shownFacts = facts.filter(([, value, always]) => always || value);

  const paramCards = spec.parameters.filter((p) => p.limit.type !== "NA").map((p) => {
    const reading = readings.params?.[p.id];
    const ev = byKey.get(`p:${p.id}`)?.evaluation ?? evaluateReading(p.limit, reading);
    const pill = PILL[ev.state] ?? PILL.EMPTY;
    const unit = p.unit ? esc(p.unit) : "";
    return `<div class="card"><div class="cardtop"><span class="cname">${esc(p.name)}</span><span class="pill ${pill.tone}">${pill.text}</span></div>
      <div class="big"><b class="${pill.tone === "bad" ? "bad" : pill.tone === "note" ? "note" : ""}">${esc(reading?.actual ?? "")}</b><span>${unit}</span></div>
      ${bar(ev)}<div class="spec">${p.limit.type === "RECORD" ? "Record only" : `Spec ${esc(formatLimit(p.limit, spec.labelA))}${unit ? ` ${unit}` : ""}`}</div>
      ${reading?.note ? `<div class="spec">Note: ${esc(reading.note)}</div>` : ""}${ev.state === "OVERRIDDEN" && reading?.override ? `<div class="spec">Passed by ${esc(reading.override.by)}: ${esc(reading.override.reason)}</div>` : ""}</div>`;
  }).join("");

  const sideCells = (limit: TestLimit | null, reading: TestReading | undefined, key: string) => {
    if (!limit || limit.type === "NA") return `<span class="none">&mdash;</span><span></span><span class="none r">&mdash;</span>`;
    const ev = byKey.get(key)?.evaluation ?? evaluateReading(limit, reading);
    const cls = ev.state === "FAIL" || ev.state === "INVALID" ? "bad" : ev.state === "OVERRIDDEN" ? "note" : "";
    return `<span class="sp">${esc(formatLimit(limit, spec.labelA))}</span><div>${limitNeedsValue(limit) ? bar(ev) : ""}</div><span class="act ${cls}">${esc(reading?.actual ?? "")}</span>`;
  };
  const clutchRows = spec.clutchRows.map((row) => {
    const cell = readings.clutches?.[row.id];
    return `<div class="crow"><span class="cn">${esc(row.name)}</span>${sideCells(row.a, cell?.a, `c:${row.id}:a`)}${sideCells(row.b, cell?.b, `c:${row.id}:b`)}</div>`;
  }).join("");
  // Engaged-clutch layout: one line per gear holding only the clutches engaged in it, so the line is as long as that gear needs.
  const engagedRows = spec.layout === "ENGAGED" ? spec.clutchRows.map((row) => {
    const cell = readings.clutches?.[row.id];
    const parts = (row.cells ?? []).map((c) => {
      if (c.limit.type === "NA") return `<div class="ecell"><div class="etop"><b>${esc(c.label)}</b><span>N/A</span></div></div>`;
      const reading = cell?.cells?.[c.id];
      const ev = byKey.get(`c:${row.id}:x:${c.id}`)?.evaluation ?? evaluateReading(c.limit, reading);
      const cls = ev.state === "FAIL" || ev.state === "INVALID" ? "bad" : ev.state === "OVERRIDDEN" ? "note" : "";
      return `<div class="ecell"><div class="etop"><b>${esc(c.label)}</b><span>${esc(formatLimit(c.limit, spec.labelA))}</span></div>${limitNeedsValue(c.limit) ? bar(ev) : ""}<div class="act ${cls}">${esc(reading?.actual ?? "")}</div></div>`;
    }).join("");
    return `<div class="erow"><span class="cn">${esc(row.name)}</span><div class="ecells">${parts}</div></div>`;
  }).join("") : "";
  const engagedBlock = `<section><div class="sec"><span class="tick"></span>CLUTCH PRESSURES<em>Each gear lists the clutches engaged in it. Green band is the spec window. The marker is where the reading landed.</em></div>
    <div class="ctable"><div class="chead eh"><span>GEAR</span><span>ENGAGED CLUTCHES</span></div>${engagedRows}</div></section>`;
  const clutchBlock = spec.clutchRows.length === 0 ? "" : spec.layout === "ENGAGED" ? engagedBlock : `<section><div class="sec"><span class="tick"></span>CLUTCH PRESSURES<em>Green band is the spec window. The marker is where the reading landed.</em></div>
    <div class="ctable"><div class="chead"><span>CLUTCH</span><span class="g1">${esc(spec.labelA.toUpperCase())}</span><span class="g2">${esc(spec.labelB.toUpperCase())}</span></div>
    <div class="csub"><span></span><span>SPEC</span><span>WINDOW</span><span class="r">ACTUAL</span><span>SPEC</span><span>WINDOW</span><span class="r">ACTUAL</span></div>${clutchRows}</div></section>`;

  const hidePowered = poweredByHiddenInPage();
  const resultWord = resultLabel(result, !!report.passedOnComments);
  win.document.write(withPoweredBy(`<!doctype html><html><head><meta charset="utf-8" /><title>${esc(`${report.job?.jobNumber ? `${report.job.jobNumber} - ` : ""}${report.label} - Dyno test report`)}</title><style>
    @page{size:A4 portrait;margin:0}
    *{box-sizing:border-box}
    html,body{margin:0}
    body{font-family:Inter,"Segoe UI",system-ui,Arial,Helvetica,sans-serif;color:#111827;font-size:11px;-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#e9ecf1}
    .sheet{position:relative;display:flex;flex-direction:column;width:210mm;min-height:297mm;margin:0 auto;background:#fff;padding-bottom:${hidePowered ? 0 : 9}mm}
    @media print{body{background:#fff}.sheet{margin:0}}
    .bar0{height:8px;background:#0a0a0a;flex:none}.bar1{height:8px;background:#f2b705;flex:none}
    header{height:86px;flex:none;padding:0 36px;display:flex;align-items:center;justify-content:space-between;gap:16px}
    header img{max-width:200px;max-height:62px;object-fit:contain;display:block}
    .tag{position:relative;height:40px;display:flex;align-items:center;padding:0 28px 0 40px}
    .tag:before{content:"";position:absolute;left:0;top:0;right:-36px;bottom:0;background:#f2b705;clip-path:polygon(18px 0,100% 0,100% 100%,0 100%)}
    .tag div{position:relative;text-align:right;line-height:1.15}.tag b{display:block;font-size:13px;font-weight:800;letter-spacing:.08em;color:#0a0a0a}.tag span{font-size:10.5px;font-weight:600;color:#3a2c00}
    .body{flex:1;padding:6px 36px 0;display:flex;flex-direction:column;gap:14px}
    .top{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:18px;align-items:stretch}
    .eyebrow{font-size:11px;font-weight:700;letter-spacing:.12em;color:#1565a8}.title{font-size:30px;font-weight:800;letter-spacing:-.01em;line-height:1.05;margin:4px 0}.subtitle{font-size:13px;color:#4b5565}
    .res{border-radius:12px;padding:12px 14px;display:flex;gap:12px;align-items:center;border:1px solid}
    .res .tile{flex:none;width:58px;height:58px;border-radius:12px;color:#fff;display:grid;place-items:center;font-size:15px;font-weight:800;letter-spacing:.04em}
    .res b{display:block;font-size:13px;font-weight:700}.res span{display:block;font-size:11px;line-height:1.35;margin-top:2px}
    .res.bad{background:#fdecee;border-color:#f1b6bb;color:#7d1f27}.res.bad .tile{background:#c2323c}
    .res.ok{background:#e8f6ee;border-color:#b5e0c4;color:#14532d}.res.ok .tile{background:#17803d}
    .res.note{background:#fff6dc;border-color:#f0d58a;color:#5c3d00}.res.note .tile{background:#b8871f}
    .res.dim{background:#f2f4f8;border-color:#d9dfe8;color:#3f4b60}.res.dim .tile{background:#6b7686}
    .facts{display:grid;grid-template-columns:repeat(${shownFacts.length},minmax(0,1fr));border:1px solid #e1e5ec;border-radius:10px;overflow:hidden}
    .facts div{padding:8px 10px;border-right:1px solid #e1e5ec;background:#fafbfc;display:flex;flex-direction:column;gap:2px;min-width:0}.facts div:last-child{border-right:0}
    .facts small{font-size:8.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b7686}.facts b{font-size:11.5px;font-weight:600;overflow-wrap:anywhere}
    .sec{font-size:11px;font-weight:800;letter-spacing:.1em;color:#0a0a0a;display:flex;align-items:center;gap:8px;margin-bottom:8px}
    .sec .tick{width:4px;height:12px;background:#f2b705;border-radius:2px}.sec em{font-style:normal;font-weight:500;letter-spacing:0;color:#6b7686;font-size:9.5px;margin-left:6px}
    .cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
    .card{border:1px solid #e1e5ec;border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:5px;break-inside:avoid}
    .cardtop{display:flex;justify-content:space-between;align-items:baseline;gap:6px}.cname{font-size:10.5px;font-weight:700;color:#394559}
    .pill{font-size:8.5px;font-weight:700;border-radius:8px;padding:1px 7px;white-space:nowrap}
    .pill.ok{color:#1f6b42;background:#e6f6ec}.pill.bad{color:#9a1c12;background:#fdecee}.pill.note{color:#7a5200;background:#fff1c9}.pill.dim{color:#4b5565;background:#eef1f5}
    .big{display:flex;align-items:baseline;gap:5px}.big b{font-size:22px;font-weight:800;letter-spacing:-.01em}.big b.bad{color:#c2323c}.big b.note{color:#b8871f}.big span{font-size:10.5px;color:#6b7686}
    .bar{display:grid;grid-template-columns:repeat(${CELLS},minmax(0,1fr));gap:1px;align-items:center}
    .bar i{display:block;height:4px}.bar i.t{background:#e4e8ef}.bar i.b{background:#b9e3c8}.bar i.m{height:12px;border-radius:3px}.bar i.m.ok{background:#17803d}.bar i.m.bad{background:#c2323c}.bar i.m.note{background:#d49a00}
    .spec{font-size:9.5px;color:#6b7686}
    .ctable{border:1px solid #e1e5ec;border-radius:10px;overflow:hidden}
    .chead,.csub,.crow{display:grid;grid-template-columns:96px 78px minmax(0,1fr) 40px 78px minmax(0,1fr) 40px;gap:8px;align-items:center;padding:0 12px}
    .chead{height:24px;background:#0a0a0a;color:#fff;font-size:9px;font-weight:700;letter-spacing:.08em}.chead .g1{grid-column:2 / span 3}.chead .g2{grid-column:5 / span 3}
    .csub{height:22px;background:#f2f4f8;font-size:8.5px;font-weight:700;letter-spacing:.06em;color:#6b7686}.r{text-align:right}
    .erow{display:grid;grid-template-columns:70px minmax(0,1fr);gap:8px;align-items:center;padding:6px 12px;border-top:1px solid #edf0f4;break-inside:avoid}.chead.eh{grid-template-columns:70px minmax(0,1fr)}
    .ecells{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.ecell{display:flex;flex-direction:column;gap:2px;min-width:0}.etop{display:flex;justify-content:space-between;gap:4px;font-size:9px;color:#4b5565}.etop b{color:#7a5200;font-weight:800}.ecell .act{text-align:right;font-size:11.5px}
    .crow{height:34px;border-top:1px solid #edf0f4;break-inside:avoid}.cn{font-weight:700;font-size:10.5px}.sp{color:#4b5565;font-size:10px}.none{color:#c3cad5}
    .act{text-align:right;font-weight:800;font-size:12.5px}.act.bad{color:#c2323c}.act.note{color:#b8871f}
    .two{display:grid;grid-template-columns:minmax(0,1fr) 250px;gap:14px;align-items:stretch}
    .box{border:1px solid #e1e5ec;border-radius:10px;padding:10px 14px;display:flex;flex-direction:column;gap:4px;min-height:58px}
    .box.com{border-left:4px solid #f2b705}.box small{font-size:9px;font-weight:800;letter-spacing:.1em;color:#6b7686}
    .box p{margin:0;font-size:11.5px;line-height:1.45;white-space:pre-wrap}.box .who{font-size:13px;font-weight:700}.box .meta{font-size:9.5px;color:#6b7686}
    footer{flex:none;margin:12px 36px 0;height:40px;border-top:1px solid #e1e5ec;display:flex;align-items:center;justify-content:space-between;font-size:8.5px;color:#6b7686}
    footer strong{color:#111827}
  </style></head><body><div class="sheet">
    <div class="bar0"></div>
    <header><img src="${esc(logo)}" alt="${esc(orgName)}" onerror="this.outerHTML='<b>${esc(orgName)}</b>'" /><div class="tag"><div><b>DYNO TEST REPORT</b><span>${esc(report.label)} &middot; ${esc(slashDate(report.testDate))}</span></div></div></header>
    <div class="body">
      <section class="top">
        <div style="display:flex;flex-direction:column;justify-content:center"><div class="eyebrow">TRANSMISSION BENCH TEST DATA SHEET</div><div class="title">${esc(spec.name)}</div><div class="subtitle">${esc([report.testType, report.serialNumber ? `serial ${report.serialNumber}` : "", report.job?.jobNumber ? `job ${report.job.jobNumber}` : ""].filter(Boolean).join(" · "))}${report.retestOf ? ` · retest of ${esc(report.retestOf.label)}` : ""}</div></div>
        <div class="res ${tone}"><div class="tile">${tile}</div><div><b>${headline}</b><span>${detail}</span></div></div>
      </section>
      <section class="facts">${shownFacts.map(([label, value]) => `<div><small>${esc(label)}</small><b>${esc(value || "—")}</b></div>`).join("")}</section>
      ${paramCards ? `<section><div class="sec"><span class="tick"></span>TEST DATA</div><div class="cards">${paramCards}</div></section>` : ""}
      ${clutchBlock}
      <section class="two">
        <div class="box com"><small>COMMENTS</small><p>${esc(report.comments || "")}</p>${report.passedOnComments ? `<span class="meta">Passed on these comments by ${esc(report.passedOnComments.by)}${report.passedOnComments.at ? `, ${esc(slashDateTime(report.passedOnComments.at))}` : ""}</span>` : ""}</div>
        <div class="box"><small>TESTED BY</small><span class="who">${esc(report.testers.join(" / "))}</span><span class="meta">${report.completedAt ? `Signed ${esc(slashDateTime(report.completedAt))}` : "Not yet completed"}</span></div>
      </section>
    </div>
    <footer><span><strong>${esc(orgName)}</strong></span><span>${esc(report.label)} &middot; ${esc(resultWord)} &middot; spec rev ${spec.revision}</span></footer>
    <div class="bar1"></div>
  </div></body></html>`));
  win.document.close();
  await waitForImages(win);
  win.focus();
  win.print();
  return null;
}
