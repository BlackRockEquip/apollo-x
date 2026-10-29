"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, X } from "lucide-react";
import { DOC_TEXT_CSS, cleanDocText } from "@/lib/documents/doc-text";

// 2026-10-29, user request: "add a preview next to the header and footer so a user can see what a document would look like".
// A sample delivery note drawn at real A4 size (794 x 1123 px) and scaled to fit the column. The header / footer bands use the very
// same CSS as the printed documents (lib/documents/doc-text.ts), so what shows here is what prints. "top" and "bottom" show only
// the part of the page the box changes, large enough to read; the enlarge button opens the whole page.
export type DocTextPreviewCompany = {
  name: string;
  detailLines: string[];
  logoSrc: string | null;
};

const PAGE_W = 794;
const PAGE_H = 1123;
const CROP_H = { top: 270, bottom: 250 } as const;

function SamplePage({ header, footer, company, highlight }: { header: string; footer: string; company: DocTextPreviewCompany; highlight: "header" | "footer" | null }) {
  const h = cleanDocText(header);
  const f = cleanDocText(footer);
  return (
    <div className="dtp-page" style={{ width: PAGE_W, height: PAGE_H }} aria-hidden="true">
      <div className={`dtp-slot${highlight === "header" ? " is-active" : ""}`}>
        {h ? <div className="fx-dochead">{h}</div> : <div className="dtp-empty">Document header text shows here, above the logo</div>}
      </div>
      <div className="dtp-top">
        <div className="dtp-brand">{company.logoSrc ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={company.logoSrc} alt="" /> : <strong>{company.name || "Your company"}</strong>}</div>
        <div className="dtp-org"><strong>{company.name || "Your company"}</strong>{company.detailLines.map((line, i) => <div key={i}>{line}</div>)}</div>
      </div>
      <div className="dtp-title"><b>Delivery Note</b><span>BRE1234 &middot; 29/10/2026</span></div>
      <table className="dtp-table">
        <thead><tr><th>Item</th><th>Description</th><th>Qty</th></tr></thead>
        <tbody>
          <tr><td>BRE1234-1</td><td>Gearbox, S/N 88213</td><td>1</td></tr>
          <tr><td>BRE1234-2</td><td>Differential, S/N 55120</td><td>1</td></tr>
          <tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
        </tbody>
      </table>
      <div className="dtp-sign"><div>Dispatched by</div><div>Received by</div></div>
      <div className="dtp-fill" />
      <div className={`dtp-slot${highlight === "footer" ? " is-active" : ""}`}>
        {f ? <div className="fx-docfoot">{f}</div> : <div className="dtp-empty">Document footer text shows here, above the page number</div>}
      </div>
      <div className="dtp-bar"><span>Printed 29/10/2026</span><span>Page 1 of 1</span></div>
    </div>
  );
}

function Scaled({ part, header, footer, company, active }: { part: "top" | "bottom" | "full"; header: string; footer: string; company: DocTextPreviewCompany; active: "header" | "footer" | null }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const update = () => setScale(Math.max(0.2, el.clientWidth / PAGE_W));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const cropH = part === "full" ? PAGE_H : CROP_H[part];
  const offset = part === "bottom" ? PAGE_H - cropH : 0;
  return (
    <div ref={box} className={`dtp-viewport dtp-${part}`} style={{ height: cropH * scale }}>
      <div style={{ width: PAGE_W, height: PAGE_H, transform: `scale(${scale})`, transformOrigin: "top left", marginTop: -offset * scale }}>
        <SamplePage header={header} footer={footer} company={company} highlight={active} />
      </div>
    </div>
  );
}

export function DocTextPreview({ part, header, footer, company, active }: { part: "top" | "bottom"; header: string; footer: string; company: DocTextPreviewCompany; active?: "header" | "footer" | null }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div className="dtp">
      <style>{DOC_TEXT_CSS}</style>
      <div className="dtp-head">
        <span>Preview &middot; sample delivery note</span>
        <button type="button" className="dtp-enlarge" onClick={() => setOpen(true)} title="Show the whole page"><Maximize2 size={13} /> Whole page</button>
      </div>
      <Scaled part={part} header={header} footer={footer} company={company} active={active ?? (part === "top" ? "header" : "footer")} />
      <p className="dtp-note">Prints at the {part === "top" ? "top" : "bottom"} of every page of delivery notes, job cards, pick slips, reports and saved PDFs.</p>
      {open && (
        <div className="dtp-modal" role="dialog" aria-modal="true" aria-label="Whole page preview" onClick={() => setOpen(false)}>
          <div className="dtp-modal-card" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="dtp-close" onClick={() => setOpen(false)} aria-label="Close preview"><X size={16} /></button>
            <Scaled part="full" header={header} footer={footer} company={company} active={part === "top" ? "header" : "footer"} />
          </div>
        </div>
      )}
    </div>
  );
}
