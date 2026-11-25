// Photo and logo handling in the browser, carried over from the Failure Report Builder (v8): photos are downsized to 1600 px
// JPEG (the browser applies the camera's EXIF rotation while drawing), damage marks are drawn the same way on screen and on the
// report, and a logo is trimmed of empty edges and checked for a dark background.

import type { PhotoMark } from "@/lib/failure-reports/model";
import { hexOf, lum, rgbDist } from "./theme";

export const MAXPX = 1600;
export const JPEGQ = 0.82;

export function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("Could not read image"));
    im.src = src;
  });
}

export function readFile(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error("Could not read file"));
    r.readAsDataURL(file);
  });
}

export const base64Of = (dataUrl: string) => dataUrl.slice(dataUrl.indexOf(",") + 1);

/** Downsizes and re-compresses a photo: { data: JPEG data URL, w, h }. */
export async function normalisePhoto(src: string): Promise<{ data: string; w: number; h: number }> {
  const im = await loadImg(src);
  let w = im.naturalWidth, h = im.naturalHeight;
  const s = Math.min(1, MAXPX / Math.max(w, h));
  w = Math.round(w * s); h = Math.round(h * s);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.drawImage(im, 0, 0, w, h);
  return { data: c.toDataURL("image/jpeg", JPEGQ), w, h };
}

export const THICK: Record<number, number> = { 1: 0.006, 2: 0.010, 3: 0.016 };

export function drawMark(g: CanvasRenderingContext2D, m: PhotoMark, W: number, H: number) {
  const base = Math.max(W, H), lw = Math.max(3, base * (THICK[m.th] || THICK[2]));
  const x1 = m.x1 * W, y1 = m.y1 * H, x2 = (m.x2 ?? m.x1) * W, y2 = (m.y2 ?? m.y1) * H;
  g.save(); g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = m.c; g.fillStyle = m.c; g.lineWidth = lw;
  g.shadowColor = "rgba(0,0,0,.45)"; g.shadowBlur = lw * 0.8;
  if (m.t === "arrow") {
    const head = lw * 3.4, ang = Math.atan2(y2 - y1, x2 - x1), bx = x2 - Math.cos(ang) * head * 0.9, by = y2 - Math.sin(ang) * head * 0.9;
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(bx, by); g.stroke();
    g.beginPath(); g.moveTo(x2, y2); g.lineTo(x2 - head * Math.cos(ang - 0.45), y2 - head * Math.sin(ang - 0.45));
    g.lineTo(x2 - head * Math.cos(ang + 0.45), y2 - head * Math.sin(ang + 0.45)); g.closePath(); g.fill();
  } else if (m.t === "ellipse") {
    g.beginPath(); g.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2, 0, 0, Math.PI * 2); g.stroke();
  } else if (m.t === "box") {
    g.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
  } else if (m.t === "text" && m.text) {
    const fs = Math.round(base * 0.012 * (2 + (m.th || 2)));
    g.font = `bold ${fs}px "Segoe UI", Calibri, Arial, sans-serif`; g.textBaseline = "middle"; g.shadowBlur = 0;
    g.lineWidth = Math.max(2, fs * 0.16); g.strokeStyle = m.c.toUpperCase() === "#FFFFFF" || m.c.toUpperCase() === "#FFE600" ? "#000" : "#fff";
    g.strokeText(m.text, x1, y1); g.fillText(m.text, x1, y1);
  }
  g.restore();
}

/** The photo with its marks drawn on, as a JPEG data URL (full size for the report, or a small thumbnail). */
export async function composite(src: string, w: number, h: number, marks: PhotoMark[], maxSide?: number): Promise<string> {
  const im = await loadImg(src);
  const s = maxSide ? Math.min(1, maxSide / Math.max(w, h)) : 1;
  const cw = Math.round(w * s), ch = Math.round(h * s);
  const c = document.createElement("canvas"); c.width = cw; c.height = ch;
  const g = c.getContext("2d")!;
  g.drawImage(im, 0, 0, cw, ch);
  marks.forEach((m) => drawMark(g, m, cw, ch));
  return c.toDataURL("image/jpeg", maxSide ? 0.75 : 0.88);
}

/** The photo turned a quarter (dir 1 = clockwise), with its marks moved to match. */
export async function rotatePhoto(src: string, w: number, h: number, marks: PhotoMark[], dir: 1 | -1) {
  const im = await loadImg(src);
  const c = document.createElement("canvas"); c.width = h; c.height = w;
  const g = c.getContext("2d")!;
  g.translate(c.width / 2, c.height / 2); g.rotate((dir * Math.PI) / 2); g.drawImage(im, -w / 2, -h / 2, w, h);
  const tp = (x: number, y: number): [number, number] => (dir === 1 ? [1 - y, x] : [y, 1 - x]);
  const moved = marks.map((m) => {
    const [a, b] = tp(m.x1, m.y1);
    const o: PhotoMark = { ...m, x1: a, y1: b };
    if (m.x2 !== undefined && m.y2 !== undefined) { const [c2, d2] = tp(m.x2, m.y2); o.x2 = c2; o.y2 = d2; }
    return o;
  });
  return { data: c.toDataURL("image/jpeg", JPEGQ), w: h, h: w, marks: moved };
}

/** Trims edges that match the corner colour, downsizes, and reports the aspect ratio and whether the background is dark. */
export async function processLogo(src: string, trim: boolean): Promise<{ data: string; ar: number; dark: boolean }> {
  const im = await loadImg(src);
  const w = im.naturalWidth, h = im.naturalHeight;
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d")!; g.drawImage(im, 0, 0);
  const px = g.getImageData(0, 0, w, h).data, at = (x: number, y: number) => (y * w + x) * 4;
  const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]].map(([x, y]) => [px[at(x, y)], px[at(x, y) + 1], px[at(x, y) + 2], px[at(x, y) + 3]]);
  const bg = corners[0].map((_, i) => corners.reduce((a, cc) => a + cc[i], 0) / 4), transparent = bg[3] < 40;
  let x0 = 0, y0 = 0, x1 = w - 1, y1 = h - 1;
  if (trim) {
    x0 = w; y0 = h; x1 = -1; y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = at(x, y);
      const diff = transparent ? px[i + 3] > 40 : (px[i + 3] > 40 && Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]) > 60);
      if (diff) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) { x0 = 0; y0 = 0; x1 = w - 1; y1 = h - 1; }
    const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.02);
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  }
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, sc = Math.min(1, 1100 / cw, 500 / ch);
  const o = document.createElement("canvas"); o.width = Math.round(cw * sc); o.height = Math.round(ch * sc);
  o.getContext("2d")!.drawImage(c, x0, y0, cw, ch, 0, 0, o.width, o.height);
  const bgLum = transparent ? 1 : lum(hexOf(bg.slice(0, 3)));
  return { data: o.toDataURL("image/png"), ar: o.width / o.height, dark: !transparent && bgLum < 0.35 };
}

/** The logo's main colours, most used first (for "Pick colours from logo"). */
export async function logoColours(src: string): Promise<string[]> {
  const im = await loadImg(src), c = document.createElement("canvas"), n = 240;
  c.width = n; c.height = Math.max(1, Math.round(n / ((im.naturalWidth / im.naturalHeight) || 1)));
  const g = c.getContext("2d")!; g.drawImage(im, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const buckets: Record<string, { n: number; r: number; g: number; b: number }> = {};
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    const k = [d[i] >> 4, d[i + 1] >> 4, d[i + 2] >> 4].join(",");
    const b = (buckets[k] ??= { n: 0, r: 0, g: 0, b: 0 });
    b.n++; b.r += d[i]; b.g += d[i + 1]; b.b += d[i + 2];
  }
  const cols = Object.values(buckets).map((b) => ({ hex: hexOf([b.r / b.n, b.g / b.n, b.b / b.n]), n: b.n })).sort((a, b) => b.n - a.n);
  const out: string[] = [];
  cols.forEach((col) => { if (out.length < 8 && !out.some((o) => rgbDist(o, col.hex) < 60)) out.push(col.hex); });
  return out;
}

/** A logo's real aspect ratio (a profile made from the company settings has none stored yet). */
export async function aspectOf(src: string): Promise<number> {
  try { const im = await loadImg(src); return im.naturalWidth && im.naturalHeight ? im.naturalWidth / im.naturalHeight : 1.4; } catch { return 1.4; }
}
