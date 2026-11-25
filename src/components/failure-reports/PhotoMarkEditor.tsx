"use client";

import "./failure-reports.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { PhotoMark } from "@/lib/failure-reports/model";
import { drawMark, loadImg, rotatePhoto } from "./image";

type Tool = PhotoMark["t"];
const COLOURS = [{ c: "#FFE600", label: "Yellow" }, { c: "#E11D2E", label: "Red" }, { c: "#FFFFFF", label: "White" }];
const HINTS: Record<Tool, string> = {
  arrow: "Drag on the photo to draw an arrow. The arrow head goes where you let go.",
  ellipse: "Drag around the damaged area to circle it.",
  box: "Drag to draw a box around the area.",
  text: "Type the label, then click on the photo where it should go.",
};

export type MarkResult = { marks: PhotoMark[]; rotated: { data: string; w: number; h: number } | null };

// Mark damage / wear on a photo: arrows, circles, boxes and text labels in yellow, red or white, three thicknesses, undo
// (also Ctrl+Z), clear, and rotate left / right. Marks are stored apart from the photo, so they can be changed later.
export function PhotoMarkEditor({ src, width, height, marks: initialMarks, onCancel, onDone, readOnly }: {
  src: string; width: number; height: number; marks: PhotoMark[]; onCancel: () => void; onDone: (result: MarkResult) => void; readOnly?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [size, setSize] = useState({ w: width, h: height });
  const [rotated, setRotated] = useState<{ data: string; w: number; h: number } | null>(null);
  const [marks, setMarks] = useState<PhotoMark[]>(() => initialMarks.map((m) => ({ ...m })));
  const [drag, setDrag] = useState<PhotoMark | null>(null);
  const [tool, setTool] = useState<Tool>("arrow");
  const [colour, setColour] = useState("#FFE600");
  const [thick, setThick] = useState(2);
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => { let live = true; loadImg(src).then((im) => { if (live) setImg(im); }).catch(() => setNote("The photo could not be loaded.")); return () => { live = false; }; }, [src]);

  const draw = useCallback(() => {
    const c = canvasRef.current;
    if (!c || !img) return;
    if (c.width !== size.w) c.width = size.w;
    if (c.height !== size.h) c.height = size.h;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0, size.w, size.h);
    marks.forEach((m) => drawMark(g, m, size.w, size.h));
    if (drag && drag.x2 !== undefined) drawMark(g, drag, size.w, size.h);
  }, [img, size, marks, drag]);
  useEffect(() => { draw(); }, [draw]);

  const undo = useCallback(() => setMarks((list) => list.slice(0, -1)), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "z" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); undo(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [undo]);

  function pos(e: React.PointerEvent<HTMLCanvasElement>): [number, number] {
    const r = e.currentTarget.getBoundingClientRect();
    // object-fit: contain - the drawn photo may not fill the element, so work out where it sits.
    const scale = Math.min(r.width / size.w, r.height / size.h);
    const dw = size.w * scale, dh = size.h * scale, ox = (r.width - dw) / 2, oy = (r.height - dh) / 2;
    return [(e.clientX - r.left - ox) / dw, (e.clientY - r.top - oy) / dh];
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    if (readOnly) return;
    const [x, y] = pos(e);
    if (tool === "text") {
      const t = label.trim();
      if (!t) { setNote("Type the label text first."); return; }
      setMarks((list) => [...list, { t: "text", x1: x, y1: y, c: colour, th: thick, text: t }]);
      return;
    }
    setDrag({ t: tool, x1: x, y1: y, c: colour, th: thick });
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drag) return;
    const [x, y] = pos(e);
    setDrag({ ...drag, x2: x, y2: y });
  }
  function up() {
    if (!drag) return;
    const d = drag; setDrag(null);
    if (d.x2 !== undefined && d.y2 !== undefined && Math.hypot((d.x2 - d.x1) * size.w, (d.y2 - d.y1) * size.h) > Math.max(size.w, size.h) * 0.015) setMarks((list) => [...list, d]);
  }

  async function rotate(dir: 1 | -1) {
    if (!img) return;
    setWorking(true);
    try {
      const r = await rotatePhoto(rotated?.data ?? src, size.w, size.h, marks, dir);
      setRotated({ data: r.data, w: r.w, h: r.h });
      setSize({ w: r.w, h: r.h });
      setMarks(r.marks);
      setImg(await loadImg(r.data));
    } finally { setWorking(false); }
  }

  return (
    <div className="fr-modal" role="dialog" aria-modal="true" aria-label="Mark damage / wear">
      <div className="box">
        <div className="fr-bar"><h2 className="fr-grow">{readOnly ? "Photo" : "Mark damage / wear"}</h2><button type="button" className="fr-icon-btn" aria-label="Close" onClick={onCancel}><X size={15} /></button></div>
        {!readOnly && (
          <>
            <div className="fr-tools">
              {(["arrow", "ellipse", "box", "text"] as Tool[]).map((t) => (
                <button key={t} type="button" className="fr-tool" aria-pressed={tool === t} onClick={() => { setTool(t); setNote(""); }}>{t === "arrow" ? "➜ Arrow" : t === "ellipse" ? "◯ Circle" : t === "box" ? "▢ Box" : "T Text"}</button>
              ))}
              {tool === "text" && <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label text, then click on the photo" style={{ width: 240, minHeight: 32, border: "1px solid #c6cdd8", borderRadius: 7, padding: "4px 9px" }} />}
              <span className="fr-sep" />
              {COLOURS.map((s) => <button key={s.c} type="button" className="fr-sw" title={s.label} aria-label={s.label} aria-pressed={colour === s.c} style={{ background: s.c }} onClick={() => setColour(s.c)} />)}
              <span className="fr-sep" />
              <label className="fr-sub">Thickness <select value={thick} onChange={(e) => setThick(Number(e.target.value))}><option value={1}>Thin</option><option value={2}>Medium</option><option value={3}>Thick</option></select></label>
            </div>
            <div className="fr-sub">{note || HINTS[tool]}</div>
          </>
        )}
        <canvas ref={canvasRef} className="fr-canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => setDrag(null)} />
        {!readOnly && (
          <div className="fr-tools">
            <button type="button" className="quiet-button" onClick={undo} disabled={marks.length === 0}>↶ Undo</button>
            <button type="button" className="quiet-button" onClick={() => setMarks([])} disabled={marks.length === 0}>Clear all marks</button>
            <span className="fr-sep" />
            <button type="button" className="quiet-button" disabled={working} onClick={() => void rotate(-1)}>⟲ Rotate left</button>
            <button type="button" className="quiet-button" disabled={working} onClick={() => void rotate(1)}>⟳ Rotate right</button>
            <span className="fr-grow" />
            <button type="button" className="quiet-button" onClick={onCancel}>Cancel</button>
            <button type="button" className="gold-button" disabled={working} onClick={() => onDone({ marks, rotated })}>✔ Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
