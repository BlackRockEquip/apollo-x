// The PowerPoint layout of the Failure Report Builder (v8), carried over line for line so a report made in Apollo looks exactly
// like one made in the builder: a cover page with the job details, warranty outcome and photo 1; page 2 with the opening remark
// and photo 2; the photo pages (1 to 4 photos per page, description beside each); and the Findings page (comments, REPLACE,
// REPAIR and MISSING). Built in the browser with PptxGenJS, loaded only when a report is made.

import type { PhotoMark, ReportFields, WarrantyValue } from "@/lib/failure-reports/model";
import { reportFileName } from "@/lib/failure-reports/model";
import { composite, readFile } from "./image";
import { themeOf, type ProfileLike } from "./theme";

export type BuildPhoto = { src: string; w: number; h: number; marks: PhotoMark[]; caption: string };
export type BuildInput = {
  fields: ReportFields; warranty: WarrantyValue; perPage: number; descHeading: string;
  replace: string[]; repair: string[]; missing: string[]; photos: BuildPhoto[];
};

const C0 = { GREY: "6B7280", LINE: "D9DEE5", LIGHT: "F4F6F8", WHITE: "FFFFFF", INK: "1F2937", GREEN: "16A34A", RED: "DC2626" };
const FONT = "Calibri";
const PW = 190.5, PH = 275.1667, L = 10, R = PW - 10, CW = R - L;
const I = (mm: number) => mm / 25.4;
const fmtDate = (v: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || ""); return m ? `${m[3]}/${m[2]}/${m[1]}` : (v || ""); };
const shortMake = (m: string) => (/^(caterpillar|cat)$/i.test((m || "").trim()) ? "CAT" : (m || "").trim());

export function estLines(txt: string, widthMm: number, pt: number) {
  const cpl = Math.max(10, Math.floor(widthMm / (pt * 0.185)));
  return (txt || "").split(/\n/).reduce((n, l) => n + Math.max(1, Math.ceil(l.length / cpl)), 0);
}
/** Picks a font size so the text fits; trims as a last resort. */
export function fitDesc(text: string, wMm: number, hMm: number, maxPt: number, minPt: number) {
  const lh = (pt: number) => pt * 0.3528 * 1.22 + 0.7;
  for (let pt = maxPt; pt >= minPt; pt -= 0.5) if (estLines(text, wMm, pt) * lh(pt) <= hMm) return { pt, text };
  let t = text;
  while (t.length > 10 && estLines(t + "…", wMm, minPt) * lh(minPt) > hMm) t = t.slice(0, Math.floor(t.length * 0.92));
  return { pt: minPt, text: t === text ? t : t.replace(/\s+\S*$/, "") + "…" };
}
const descNeedH = (text: string, wMm: number, pt: number) => estLines(text, wMm, pt) * (pt * 0.3528 * 1.22 + 0.7);

async function photoData(p: BuildPhoto): Promise<string> {
  if (p.marks.length) return composite(p.src, p.w, p.h, p.marks);
  const response = await fetch(p.src, { cache: "force-cache" });
  if (!response.ok) throw new Error("A photo could not be loaded. Refresh the page and try again.");
  return readFile(await response.blob());
}

/* eslint-disable @typescript-eslint/no-explicit-any -- PptxGenJS option objects are built the same loose way the builder does */
export async function buildPptx(st: BuildInput, profile: ProfileLike) {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const f = st.fields;
  const PROF = profile, T = themeOf(PROF), LG = T.logo;
  const C = { ...C0, NAVY: T.dark, GOLD: T.accent, GOLDDK: T.accentText, TITLE: T.title, ON_DARK: T.onDark, ON_ACCENT: T.onAccent, NA: T.naFill, NA_T: T.naText };
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "BRE", width: I(PW), height: I(PH) }); pptx.layout = "BRE";
  pptx.author = PROF.name; pptx.company = PROF.name;
  const job = (f.job || "").trim();
  pptx.title = `Failure Report ${job}` + ((f.make || f.model || f.component) ? " - " + [shortMake(f.make), f.model, f.component].filter(Boolean).join(" ") : "");
  const photos: Array<{ w: number; h: number; data: string; caption: string }> = [];
  for (const p of st.photos) photos.push({ w: p.w, h: p.h, data: await photoData(p), caption: p.caption || "" });
  const cover = photos[0], introPh = photos[1], rest = photos.slice(2), per = st.perPage || 4;
  const photoPages = Math.ceil(rest.length / per);
  const TOTAL = 1 + 1 + photoPages + 1;
  const mmc = [shortMake(f.make), f.model, f.component].filter(Boolean).join(" ");
  const jobline = [job ? `Job ${job}` : "", mmc].filter(Boolean).join("  ·  ");

  type Slide = any;
  const rect = (s: Slide, x: number, y: number, w: number, h: number, fill?: string | null, line?: string | null, lw?: number, name?: string | null, shape?: any) =>
    s.addShape(shape || pptx.ShapeType.rect, { x: I(x), y: I(y), w: I(w), h: I(h), fill: fill ? { color: fill } : { type: "none" }, line: line ? { color: line, width: lw || 0.75 } : { type: "none" }, ...(name ? { objectName: name } : {}) });
  const txt = (s: Slide, x: number, y: number, w: number, h: number, runs: any, o: { valign?: string; align?: string; wrap?: boolean; extra?: object } = {}) =>
    s.addText(runs, { x: I(x), y: I(y), w: I(w), h: I(h), margin: 0, fontFace: FONT, valign: o.valign || "top", align: o.align || "left", wrap: o.wrap !== false, ...(o.extra || {}) });
  const run = (t: string, o: { size?: number; bold?: boolean; color?: string; br?: boolean; space?: number }) => ({ text: t, options: { fontFace: FONT, fontSize: o.size || 10, bold: !!o.bold, color: o.color || C.INK, breakLine: !!o.br, paraSpaceAfter: o.space || 0 } });
  const cellBorder = { type: "solid", pt: 0.75, color: C.LINE };
  const cell = (t: string, fill: string, size: number, bold: boolean, color: string) => ({ text: t, options: { fill: { color: fill }, fontSize: size, bold, color, fontFace: FONT, valign: "middle", margin: [I(0.3), I(1.8), I(0.3), I(1.8)], border: [cellBorder, cellBorder, cellBorder, cellBorder] } });
  const HEAD = st.descHeading || "DESCRIPTION";
  const descRuns = (text: string, pt: number) => {
    const ls = text.split(/\n/);
    return [run(HEAD, { size: 8.5, bold: true, color: C.GOLDDK, space: 4, br: true }), ...ls.map((l, k) => run(l, { size: pt, color: C.INK, space: 2, br: k < ls.length - 1 }))];
  };
  function descBox(s: Slide, x: number, y: number, w: number, h: number, text: string, pt: number) { rect(s, x, y, w, h, C.LIGHT); rect(s, x, y, 1.5, h, C.GOLD); txt(s, x + 6, y + 3, w - 10, h - 6, descRuns(text, pt)); }
  function underDesc(text: string, w: number) { if (!text) return 0; return Math.min(42, Math.max(16, 6 + 4.5 + descNeedH(text, w - 10, 10.5))); }
  const fitIn = (iw: number, ih: number, sw: number, sh: number) => { const s = Math.min(sw / iw, sh / ih); return [iw * s, ih * s]; };
  const img = (s: Slide, data: string, x: number, y: number, w: number, h: number) => s.addImage({ data, x: I(x), y: I(y), w: I(w), h: I(h) });

  // Header geometry: logo beside a 25pt "FAILURE REPORT"; wide logos shrink (and the doc table narrows) so nothing collides.
  const LAR = LG ? LG.ar : 1.4, TITLE_W = 62;
  let TBW = 66, TBC = [40, 26], TBF = 7;
  if (19 * LAR > R - TBW - 1 - 2 - TITLE_W - 4 - L) { TBW = 58; TBC = [36, 22]; TBF = 6.5; }
  const LH = Math.min(19, (R - TBW - 1 - 2 - TITLE_W - 4 - L) / LAR), LW = LH * LAR;
  const FOOT = (PROF.footer || `${PROF.name} | Failure Report`).split("|");
  function chrome(s: Slide, n: number, section: string, sub: boolean) {
    if (T.band) { rect(s, 0, 0, PW, 28.3, C.NAVY); rect(s, 0, 28.3, PW, 0.8, C.GOLD); }
    else { rect(s, 0, 0, PW, 2.6, C.NAVY); rect(s, 0, 2.6, PW, 0.7, C.GOLD); }
    if (LG) img(s, LG.data, L, 6 + (19 - LH) / 2, LW, LH);
    const tx = L + LW + 4, tw = R - TBW - 1 - tx - 2;
    const tc = T.band ? C.ON_DARK : C.TITLE;
    if (sub) {
      txt(s, tx, 5.5, tw, 9.5, [run("FAILURE REPORT", { size: 21, bold: true, color: tc })], { valign: "middle", wrap: false });
      txt(s, tx, 15.3, tw, 5, [run(section.toUpperCase(), { size: 8.5, bold: true, color: T.band ? T.accentOnDark : C.GOLDDK })]);
      txt(s, tx, 19.5, tw, 5, [run(jobline, { size: 8, color: T.band ? T.subOnDark : C.GREY })]);
    } else {
      txt(s, tx, 6, tw, 19, [run("FAILURE REPORT", { size: 25, bold: true, color: tc })], { valign: "middle", wrap: false });
    }
    const dc = [["Reference Number", f.doc_no], ["Implementation Date", fmtDate(f.impl_date)], ["Revision / Amendment Number", f.rev_no], ["Revision / Amendment Date", fmtDate(f.rev_date)]];
    s.addTable(dc.map((r) => [cell(r[0], C.LIGHT, TBF, false, C.GREY), cell(r[1] || "", C.WHITE, TBF, true, C.TITLE)]), { x: I(R - TBW), y: I(6.2), colW: TBC.map(I), rowH: I(4.8), w: I(TBW) });
    if (!T.band) rect(s, L, 28.3, CW, 0.8, C.GOLD);
    rect(s, L, PH - 14.5, CW, 0.265, C.LINE);
    txt(s, L, PH - 12.5, 120, 5, [run(FOOT[0].trim(), { size: 8, bold: true, color: C.TITLE }), ...(FOOT.length > 1 ? [run("  |  " + FOOT.slice(1).join("|").trim(), { size: 8, color: C.GREY })] : [])], { valign: "middle" });
    txt(s, R - 40, PH - 12.5, 40, 5, [run(`Page ${n} of ${TOTAL}`, { size: 8, color: C.GREY })], { valign: "middle", align: "right" });
    rect(s, 0, PH - 2.6, PW, 2.6, C.NAVY); rect(s, 0, PH - 3.3, PW, 0.7, C.GOLD);
  }
  function pageTitle(s: Slide, t: string, y = 33) { rect(s, L, y + 0.8, 1.5, 6.6, C.GOLD); txt(s, L + 4, y, 150, 8, [run(t, { size: 15, bold: true, color: C.TITLE })], { valign: "middle" }); }
  function framed(s: Slide, p: { w: number; h: number; data: string }, sx: number, sy: number, sw: number, sh: number) {
    const [w, h] = fitIn(p.w, p.h, sw, sh), x = sx + (sw - w) / 2, y = sy;
    rect(s, x - 1, y - 1, w + 2, h + 2, C.WHITE, C.LINE); img(s, p.data, x, y, w, h); rect(s, x, y + h - 1.2, w, 1.2, C.GOLD);
    return y + h + 1;
  }
  function framedWithDesc(s: Slide, p: { w: number; h: number; data: string; caption: string }, sx: number, sy: number, sw: number, sh: number) {
    const text = (p.caption || "").trim(), dh = underDesc(text, sw);
    const bottom = framed(s, p, sx, sy, sw, sh - (dh ? dh + 4 : 0));
    if (dh) { const fd = fitDesc(text, sw - 10, dh - 6 - 4.5, 10.5, 8); descBox(s, sx, bottom + 3, sw, dh, fd.text, fd.pt); }
  }
  function woBlock(s: Slide, x: number, y: number, w: number, h: number, fill: string, label: string, size: number, bold: boolean, color: string, name: string) {
    s.addText(label, { shape: pptx.ShapeType.rect, x: I(x), y: I(y), w: I(w), h: I(h), fill: { color: fill }, line: { color: C.LINE, width: 0.75 }, fontFace: FONT, fontSize: size, bold, color, align: "center", valign: "middle", margin: [0, 2, 0, 2], objectName: name });
  }

  // ---- page 1 cover ----
  let s: Slide = pptx.addSlide(); s.background = { color: "FFFFFF" };
  chrome(s, 1, "Failure Photo Report", false);
  pageTitle(s, "FAILURE PHOTO REPORT");
  txt(s, L + 4, 41.5, 100, 6, [run("Observations & Comments", { size: 11, color: C.GREY })]);
  const wx = R - 63, wy = 33, cw = 21, rh = 6;
  woBlock(s, wx, wy, 63, rh, C.NAVY, "WARRANTY OUTCOME", 8, true, C.ON_DARK, "WO_HEADER");
  const opts: Array<[WarrantyValue, string, string, string]> = [["granted", "GRANTED", C.GREEN, C.WHITE], ["declined", "DECLINED", C.RED, C.WHITE], ["na", "N/A", C.NA, C.NA_T]];
  opts.forEach(([v, lab, fill, fc], k) => { const on = st.warranty === v; woBlock(s, wx + k * cw, wy + rh, cw, rh, on ? fill : C.WHITE, lab, on ? 9 : 8, on, on ? fc : C.GREY, "WO_" + (v === "na" ? "NA" : lab)); });
  const rows = [["Client Name", f.client, "Job Number", f.job], ["Component", f.component, "Serial Number", f.serial], ["Make", f.make, "Model", f.model],
    ["Plant Number", f.plant, "Site", f.site], ["Date of Delivery", fmtDate(f.date_delivery), "Date of Report", fmtDate(f.date_report)], ["Repair Type", f.repair_type, "Artisan", f.artisan]];
  s.addTable(rows.map((r) => r.map((v, j) => (j % 2 === 0 ? cell(v.toUpperCase(), C.LIGHT, 7.5, true, C.GREY) : cell(v || "", C.WHITE, 10.5, true, C.TITLE)))), { x: I(L), y: I(51), colW: [I(28), I(57.25), I(28), I(57.25)], rowH: I(8.5), w: I(170.5) });
  const D = PROF.details;
  const det1 = [PROF.legalName || PROF.name, D.address].filter((x) => (x || "").trim()).join("  ·  ");
  const det2 = [D.phone && "Tel: " + D.phone, D.email, D.website, D.coreg && "Co Reg: " + D.coreg, D.vat && "VAT: " + D.vat, D.extra].filter((x) => (x || "").trim()).join("  ·  ");
  const showDet = PROF.showDetails && !!(det2 || D.address);
  if (showDet) txt(s, L, 103.2, CW, 6.6, [run(det1, { size: 7.5, bold: true, color: C.TITLE, br: true }), run(det2, { size: 7, color: C.GREY })], { align: "center", valign: "middle" });
  if (cover) framedWithDesc(s, cover, L, showDet ? 111.5 : 110, CW, PH - 20 - (showDet ? 111.5 : 110));

  // ---- page 2 intro ----
  s = pptx.addSlide(); s.background = { color: "FFFFFF" };
  chrome(s, 2, "Component Photo Report", true);
  pageTitle(s, "COMPONENT PHOTO REPORT");
  const intro = (f.intro || "").trim();
  const ih = intro ? Math.max(28, estLines(intro, CW - 12, 13) * 6.2 + 10) : 0;
  if (intro) {
    rect(s, L, 47, CW, ih, C.LIGHT); rect(s, L, 47, 1.5, ih, C.GOLD);
    txt(s, L + 7, 47, CW - 12, ih, intro.split(/\n/).map((l, k, a) => run(l, { size: 13, color: C.INK, br: k < a.length - 1 })), { valign: "middle" });
  }
  if (introPh) { const top = intro ? 47 + ih + 5 : 46; framedWithDesc(s, introPh, L, top, CW, PH - 20 - top); }

  // ---- photo pages ----
  const TOP = 33, BOT = PH - 18, GAP = 3.5, CH = (BOT - TOP - (per - 1) * GAP) / per;
  const SW = per >= 4 ? 86 : per === 3 ? 100 : 112;
  for (let pg = 0; pg < photoPages; pg++) {
    s = pptx.addSlide(); s.background = { color: "FFFFFF" };
    chrome(s, 3 + pg, "Component Photo Report", true);
    rest.slice(pg * per, pg * per + per).forEach((p, r) => {
      const y = TOP + r * (CH + GAP);
      const text = (p.caption || "").trim();
      if (per !== 1) { rect(s, L, y, CW, CH, C.WHITE, C.LINE); rect(s, L, y, 1.5, CH, C.GOLD); }
      if (per === 1) { // one big photo, description directly under it; card hugs the content
        const dh = text ? Math.min(60, Math.max(18, 6 + 4.5 + descNeedH(text, CW - 18, 11))) : 0;
        const sx = L + 4, sy = y + 3, sw = CW - 7, maxH = CH - 6 - (dh ? dh + 3 : 0);
        const [w, h] = fitIn(p.w, p.h, sw, maxH), cardH = 3 + h + (dh ? 3 + dh : 0) + 3;
        rect(s, L, y, CW, cardH, C.WHITE, C.LINE); rect(s, L, y, 1.5, cardH, C.GOLD);
        rect(s, sx, sy, sw, h, C.LIGHT); img(s, p.data, sx + (sw - w) / 2, sy, w, h);
        if (dh) { const yy = sy + h + 3; rect(s, sx, yy, sw, 0.265, C.LINE); const fd = fitDesc(text, sw - 8, dh - 4 - 4.5, 11, 8); txt(s, sx + 4, yy + 3, sw - 8, dh - 4, descRuns(fd.text, fd.pt)); }
        return;
      }
      const sx = L + 4, sy = y + 2.5, sh = CH - 5; rect(s, sx, sy, SW, sh, C.LIGHT);
      const [w, h] = fitIn(p.w, p.h, SW, sh); img(s, p.data, sx + (SW - w) / 2, sy + (sh - h) / 2, w, h);
      if (!text) return; // no description: leave the space clean (no heading or divider)
      const cx = L + SW + 8; rect(s, cx, y + 4, 0.265, CH - 8, C.LINE);
      const fd = fitDesc(text, R - cx - 8, CH - 8 - 4.5, 10.5, 8);
      txt(s, cx + 4, y + 4, R - cx - 8, CH - 8, descRuns(fd.text, fd.pt));
    });
  }

  // ---- findings ----
  s = pptx.addSlide(); s.background = { color: "FFFFFF" };
  chrome(s, TOTAL, "Findings", true);
  pageTitle(s, "FINDINGS");
  const com = (f.comments || "").trim();
  const ch = Math.max(com.length > 160 ? 32 : 24, estLines(com, CW - 12, 11.5) * 5.0 + 10);
  rect(s, L, 47, CW, ch, C.LIGHT); rect(s, L, 47, 1.5, ch, C.GOLD);
  const cr = [run("COMMENTS", { size: 8.5, bold: true, color: C.GOLDDK, space: 4, br: true })];
  const cl = com.split(/\n/); cl.forEach((l, k) => cr.push(run(l, { size: 11.5, color: C.INK, br: k < cl.length - 1 })));
  txt(s, L + 7, 47, CW - 12, ch, cr, { valign: "middle" });
  function listCard(x: number, y: number, w: number, title: string, items: string[], dry?: boolean) {
    let disp = items.map((v) => (v || "").trim()).filter(Boolean); if (!disp.length) disp = ["", "", ""];
    const step = 6.6; const h0 = (n: number) => 12 + step * n + 4;
    const h = h0(disp.length); if (dry) return h;
    rect(s, x, y, w, h, C.WHITE, C.LINE); rect(s, x, y, w, 10, C.NAVY);
    txt(s, x + 5, y, w - 10, 10, [run(title, { size: 11, bold: true, color: C.ON_DARK })], { valign: "middle" });
    rect(s, x, y + 10, w, 0.9, C.GOLD);
    disp.forEach((it, k) => {
      const yy = y + 14 + step * k;
      if (it) { rect(s, x + 5, yy + 1.9, 1.8, 1.8, C.GOLD, null, 0, null, pptx.ShapeType.ellipse); txt(s, x + 9.5, yy, w - 14, 5.6, [run(it, { size: 10.5, color: C.INK })], { valign: "middle" }); }
      else rect(s, x + 5, yy + 3.2, w - 14, 0.265, C.LINE);
    });
    return h;
  }
  const CWH = (CW - 4) / 2, y0 = 47 + ch + 6, xR = L + CWH + 4;
  const hRep = listCard(L, y0, CWH, "REPLACE", st.replace, true), hRp = listCard(xR, y0, CWH, "REPAIR", st.repair, true);
  listCard(L, y0, CWH, "REPLACE", st.replace); listCard(xR, y0, CWH, "REPAIR", st.repair);
  if (hRp <= hRep) listCard(xR, y0 + hRp + 5, CWH, "MISSING", st.missing); else listCard(L, y0 + hRep + 5, CWH, "MISSING", st.missing);
  return { pptx, fileName: reportFileName(job), pages: TOTAL };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
