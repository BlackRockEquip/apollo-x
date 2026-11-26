"use client";

import "./failure-reports.css";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Loader2, Printer, X } from "lucide-react";
import { buildPptx, type BuildInput } from "./buildPptx";
import type { ProfileLike } from "./theme";

// Print preview (2026-11-26): the report's pages drawn on screen from the same layout code that builds the PowerPoint
// (buildPptx with a recording "deck" instead of PptxGenJS), at real size in inches and points, so Print gives the same pages.

/* eslint-disable @typescript-eslint/no-explicit-any -- the recorder mirrors PptxGenJS's loose option objects */
type Item = { k: "shape"; shape: string; o: any } | { k: "text"; t: any; o: any } | { k: "image"; o: any } | { k: "table"; rows: any[][]; o: any };
type Slide = { items: Item[] };
const PAGE_W = 190.5 / 25.4, PAGE_H = 275.1667 / 25.4; // inches, as in buildPptx

function recorder() {
  const slides: Slide[] = [];
  const deck = {
    slides, ShapeType: { rect: "rect", ellipse: "ellipse" }, layout: "", author: "", company: "", title: "",
    defineLayout() { /* fixed page size */ },
    addSlide() {
      const s: Slide & Record<string, unknown> = { items: [], background: null };
      s.addShape = (shape: string, o: any) => { s.items.push({ k: "shape", shape, o }); };
      s.addText = (t: any, o: any) => { s.items.push({ k: "text", t, o }); };
      s.addImage = (o: any) => { s.items.push({ k: "image", o }); };
      s.addTable = (rows: any[][], o: any) => { s.items.push({ k: "table", rows, o }); };
      slides.push(s);
      return s;
    },
  };
  return deck;
}

const col = (c?: { color?: string; type?: string }) => (c && c.color && c.type !== "none" ? `#${c.color}` : "transparent");
const box = (o: any): CSSProperties => ({ position: "absolute", left: `${o.x}in`, top: `${o.y}in`, width: `${o.w}in`, height: `${o.h}in` });

function runsOf(t: any, o: any): Array<{ text: string; options: any }> {
  if (typeof t === "string") return [{ text: t, options: { fontSize: o.fontSize, bold: o.bold, color: o.color } }];
  return t as Array<{ text: string; options: any }>;
}

function paragraphs(runs: Array<{ text: string; options: any }>) {
  const out: Array<{ runs: typeof runs; after: number }> = [];
  let cur: typeof runs = [];
  for (const r of runs) {
    cur.push(r);
    if (r.options?.breakLine) { out.push({ runs: cur, after: r.options?.paraSpaceAfter || 0 }); cur = []; }
  }
  if (cur.length) out.push({ runs: cur, after: 0 });
  return out;
}

function TextBlock({ t, o }: { t: any; o: any }) {
  const m = Array.isArray(o.margin) ? o.margin : [0, 0, 0, 0]; // points for text boxes
  const style: CSSProperties = {
    ...box(o), display: "flex", flexDirection: "column", justifyContent: o.valign === "middle" ? "center" : o.valign === "bottom" ? "flex-end" : "flex-start",
    textAlign: o.align || "left", whiteSpace: o.wrap === false ? "nowrap" : "pre-wrap", overflow: "hidden", fontFamily: "Calibri, Carlito, 'Segoe UI', Arial, sans-serif",
    padding: `${m[0]}pt ${m[1]}pt ${m[2]}pt ${m[3]}pt`, boxSizing: "border-box", lineHeight: 1.18,
    background: o.fill ? col(o.fill) : undefined, border: o.line && o.line.color ? `${o.line.width || 0.75}pt solid #${o.line.color}` : undefined,
  };
  return (
    <div style={style}>
      {paragraphs(runsOf(t, o)).map((p, i) => (
        <div key={i} style={{ marginBottom: `${p.after}pt` }}>
          {p.runs.map((r, j) => <span key={j} style={{ fontSize: `${r.options?.fontSize || o.fontSize || 10}pt`, fontWeight: r.options?.bold ? 700 : 400, color: `#${r.options?.color || o.color || "1F2937"}` }}>{r.text || "​"}</span>)}
        </div>
      ))}
    </div>
  );
}

function TableBlock({ rows, o }: { rows: any[][]; o: any }) {
  const colW: number[] = o.colW;
  return (
    <div style={{ position: "absolute", left: `${o.x}in`, top: `${o.y}in`, width: `${o.w}in`, display: "grid", gridTemplateColumns: colW.map((w) => `${w}in`).join(" ") }}>
      {rows.flatMap((row, i) => row.map((c, j) => {
        const co = c.options || {}, m = co.margin || [0, 0, 0, 0];
        return (
          <div key={`${i}-${j}`} style={{ minHeight: `${o.rowH}in`, background: col(co.fill), border: "0.75pt solid #D9DEE5", marginTop: i ? "-0.75pt" : 0, marginLeft: j ? "-0.75pt" : 0,
            padding: `${m[0]}in ${m[1]}in ${m[2]}in ${m[3]}in`, boxSizing: "border-box", display: "flex", alignItems: "center", fontFamily: "Calibri, Carlito, 'Segoe UI', Arial, sans-serif",
            fontSize: `${co.fontSize || 10}pt`, fontWeight: co.bold ? 700 : 400, color: `#${co.color || "1F2937"}`, lineHeight: 1.1, overflow: "hidden" }}>{c.text}</div>
        );
      }))}
    </div>
  );
}

function renderItem(it: Item, i: number): ReactNode {
  if (it.k === "shape") {
    const o = it.o;
    return <div key={i} style={{ ...box(o), background: col(o.fill), border: o.line && o.line.color ? `${o.line.width || 0.75}pt solid #${o.line.color}` : undefined, borderRadius: it.shape === "ellipse" ? "50%" : 0, boxSizing: "border-box" }} />;
  }
  if (it.k === "image") {
    // eslint-disable-next-line @next/next/no-img-element -- a photo or logo as a data URL
    return <img key={i} src={it.o.data} alt="" style={{ ...box(it.o), objectFit: "fill" }} />;
  }
  if (it.k === "table") return <TableBlock key={i} rows={it.rows} o={it.o} />;
  return <TextBlock key={i} t={it.t} o={it.o} />;
}

export function PrintPreview({ input, profile, onClose, onCreate }: { input: BuildInput; profile: ProfileLike; onClose: () => void; onCreate?: () => void }) {
  const [slides, setSlides] = useState<Slide[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const rec = recorder();
        await buildPptx(input, profile, () => rec);
        if (live) setSlides(rec.slides);
      } catch (e) { if (live) setError(e instanceof Error ? e.message : String(e)); }
    })();
    return () => { live = false; };
  }, [input, profile]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.classList.add("fr-printing");
    return () => { document.removeEventListener("keydown", onKey); document.body.classList.remove("fr-printing"); };
  }, [onClose]);

  return (
    <div className="fr-modal fr-preview" role="dialog" aria-modal="true" aria-label="Print preview">
      <div className="box">
        <div className="fr-bar fr-noprint">
          <h2 className="fr-grow">Print preview{slides ? ` · ${slides.length} pages` : ""}</h2>
          <span className="fr-sub">This is how the report will look. Fonts may differ slightly from PowerPoint.</span>
          <button type="button" className="quiet-button" disabled={!slides} onClick={() => window.print()}><Printer size={14} /> Print / Save as PDF</button>
          {onCreate && <button type="button" className="gold-button" onClick={onCreate}>Create Report</button>}
          <button type="button" className="fr-icon-btn" aria-label="Close preview" onClick={onClose}><X size={15} /></button>
        </div>
        {error && <div className="inline-error fr-noprint">Could not draw the preview: {error}</div>}
        {!slides && !error && <div className="table-state fr-noprint"><Loader2 className="spin" size={18} /> Laying out the pages…</div>}
        {slides && (
          <div className="fr-pages">
            {slides.map((s, i) => (
              <div key={i} className="fr-page" style={{ width: `${PAGE_W}in`, height: `${PAGE_H}in` }}>
                {s.items.map(renderItem)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */
