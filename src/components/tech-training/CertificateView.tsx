"use client";

import "./tt.css";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Download, FileDown, Loader2, Printer } from "lucide-react";
import { errText, fmtDate, tt } from "./api";

type Cert = {
  certNo: string; status: string; holder: string; course: string; courseCode: string; revision: string; docNumber: string; completedAt: string | null; startedAt: string | null; approvedAt: string | null;
  signatoryName: string | null; signatoryTitle: string | null; signature: string | null; companyName: string; logo: string | null; revokedReason: string | null; revokedAt: string | null; own: boolean;
};

const W = 2000;
const H = 1414;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = src; });
}

function fit(ctx: CanvasRenderingContext2D, text: string, font: (size: number) => string, size: number, max: number): number {
  let s = size;
  do { ctx.font = font(s); if (ctx.measureText(text).width <= max) break; s -= 4; } while (s > 24);
  return s;
}

/** Draws the certificate. The logo is the employee's own company's logo (from its Flo X company settings). */
async function draw(canvas: HTMLCanvasElement, c: Cert) {
  canvas.width = W; canvas.height = H;
  const x = canvas.getContext("2d")!;
  const NAVY = "#0F1B2D", GOLD = "#C9A227", INK = "#172033", MUT = "#5B6577", PAPER = "#FBF8F0";
  const sans = (s: number, w = 400) => `${w} ${s}px "IBM Plex Sans", "Segoe UI", Arial, sans-serif`;
  const cond = (s: number, w = 700) => `${w} ${s}px "Barlow Condensed", "Arial Narrow", Arial, sans-serif`;
  x.fillStyle = PAPER; x.fillRect(0, 0, W, H);
  x.save(); x.strokeStyle = "rgba(15,27,45,.04)"; x.lineWidth = 2; for (let i = -H; i < W; i += 28) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + H, H); x.stroke(); } x.restore();
  x.fillStyle = NAVY; x.fillRect(0, 0, W, 34); x.fillRect(0, H - 34, W, 34); x.fillRect(0, 0, 34, H); x.fillRect(W - 34, 0, 34, H);
  x.strokeStyle = GOLD; x.lineWidth = 6; x.strokeRect(60, 60, W - 120, H - 120);
  x.strokeStyle = NAVY; x.lineWidth = 2; x.strokeRect(78, 78, W - 156, H - 156);
  x.fillStyle = GOLD;
  for (const [a, b, sx, sy] of [[34, 34, 1, 1], [W - 34, 34, -1, 1], [34, H - 34, 1, -1], [W - 34, H - 34, -1, -1]] as const) { x.beginPath(); x.moveTo(a, b); x.lineTo(a + 150 * sx, b); x.lineTo(a, b + 150 * sy); x.closePath(); x.fill(); }
  x.textAlign = "center"; x.textBaseline = "middle";
  const logo = c.logo ? await loadImage(c.logo) : null;
  if (logo) {
    const maxW = 420, maxH = 150;
    const r = Math.min(maxW / logo.width, maxH / logo.height);
    x.drawImage(logo, W / 2 - (logo.width * r) / 2, 205 - (logo.height * r) / 2, logo.width * r, logo.height * r);
  } else {
    x.fillStyle = NAVY; x.font = cond(54); x.fillText(c.companyName.toUpperCase(), W / 2, 205);
  }
  x.fillStyle = MUT; x.font = `500 26px ui-monospace, "IBM Plex Mono", Consolas, monospace`; x.fillText(`${c.companyName.toUpperCase()} · TECH TRAINING`, W / 2, 315);
  x.fillStyle = NAVY; x.font = cond(112); x.fillText("CERTIFICATE OF COMPLETION", W / 2, 415);
  x.fillStyle = GOLD; x.fillRect(W / 2 - 120, 480, 240, 6);
  x.fillStyle = MUT; x.font = sans(34); x.fillText("This certifies that", W / 2, 550);
  const ns = fit(x, c.holder, (s) => cond(s, 600), 112, W - 520);
  x.fillStyle = INK; x.font = cond(ns, 600); x.fillText(c.holder, W / 2, 640);
  x.strokeStyle = "#c9c4b6"; x.lineWidth = 2; x.beginPath(); x.moveTo(W / 2 - 560, 705); x.lineTo(W / 2 + 560, 705); x.stroke();
  x.fillStyle = MUT; x.font = sans(34); x.fillText("has successfully completed the course", W / 2, 768);
  const title = c.course.toUpperCase();
  const cs = fit(x, title, (s) => cond(s), 84, W - 460);
  x.fillStyle = NAVY; x.font = cond(cs); x.fillText(title, W / 2, 858);
  x.fillStyle = MUT; x.font = `500 26px ui-monospace, "IBM Plex Mono", Consolas, monospace`; x.fillText(`${c.courseCode} · ${c.revision} · ${c.docNumber}`, W / 2, 930);
  // Bottom: completed date (left), signature (right), seal (middle)
  const baseY = 1150;
  x.textAlign = "left";
  x.fillStyle = INK; x.font = sans(36, 600); x.fillText(c.completedAt ? new Date(c.completedAt).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" }) : "", 260, baseY);
  x.strokeStyle = NAVY; x.lineWidth = 2; x.beginPath(); x.moveTo(260, baseY + 34); x.lineTo(720, baseY + 34); x.stroke();
  x.fillStyle = MUT; x.font = sans(26); x.fillText("Date completed", 260, baseY + 70);
  const sig = c.signature ? await loadImage(c.signature) : null;
  if (sig) { const r = Math.min(380 / sig.width, 120 / sig.height); x.drawImage(sig, W - 260 - 460 + (460 - sig.width * r) / 2, baseY - 10 - sig.height * r + 30, sig.width * r, sig.height * r); }
  x.beginPath(); x.moveTo(W - 720, baseY + 34); x.lineTo(W - 260, baseY + 34); x.stroke();
  x.fillStyle = INK; x.font = sans(30, 600); x.fillText(c.signatoryName ?? "", W - 720, baseY + 72);
  x.fillStyle = MUT; x.font = sans(24); x.fillText(`${c.signatoryTitle ?? ""}${c.approvedAt ? ` · approved ${new Date(c.approvedAt).toLocaleDateString("en-ZA")}` : ""}`, W - 720, baseY + 106);
  x.textAlign = "center";
  x.fillStyle = GOLD; x.beginPath(); x.arc(W / 2, baseY + 20, 92, 0, Math.PI * 2); x.fill();
  x.strokeStyle = NAVY; x.lineWidth = 4; x.beginPath(); x.arc(W / 2, baseY + 20, 76, 0, Math.PI * 2); x.stroke();
  x.fillStyle = NAVY; x.font = cond(40); x.fillText("CERTIFIED", W / 2, baseY + 8); x.font = cond(26, 600); x.fillText("COMPETENT", W / 2, baseY + 44);
  x.fillStyle = MUT; x.font = `500 24px ui-monospace, "IBM Plex Mono", Consolas, monospace`;
  x.fillText(`Certificate ${c.certNo} · verify in Flo X: Tech Training > Verify certificate · non-credit-bearing training`, W / 2, H - 120);
  if (c.status === "REVOKED") {
    x.save(); x.translate(W / 2, H / 2); x.rotate(-0.35); x.fillStyle = "rgba(180,35,24,.22)"; x.font = cond(260); x.fillText("REVOKED", 0, 0); x.restore();
  }
}

// Certificate (2026-11-28): drawn on a canvas so the PNG, the PDF and the printout are the same picture.
export function CertificateView({ certNo }: { certNo: string }) {
  const [cert, setCert] = useState<Cert | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [png, setPng] = useState<string | null>(null);

  useEffect(() => { tt<Cert>(`certificates/by-number/${encodeURIComponent(certNo)}`).then(setCert).catch((e) => setError(errText(e, "Unable to load the certificate."))); }, [certNo]);
  useEffect(() => {
    if (!cert || !canvas.current) return;
    void (async () => {
      try { await document.fonts?.ready; } catch { /* system fonts */ }
      await draw(canvas.current!, cert);
      setPng(canvas.current!.toDataURL("image/png"));
    })();
  }, [cert]);

  function downloadPng() {
    if (!png) return;
    const a = document.createElement("a"); a.href = png; a.download = `${certNo}.png`; a.click();
  }

  async function downloadPdf() {
    if (!png) return;
    setBusy(true);
    try {
      const { PDFDocument } = await import("pdf-lib");
      const doc = await PDFDocument.create();
      const page = doc.addPage([841.89, 595.28]);
      const img = await doc.embedPng(png);
      page.drawImage(img, { x: 0, y: 0, width: 841.89, height: 595.28 });
      doc.setTitle(`Certificate ${certNo}`); doc.setSubject(cert?.course ?? ""); doc.setAuthor(cert?.companyName ?? "");
      const bytes = await doc.save();
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
      const a = document.createElement("a"); a.href = url; a.download = `${certNo}.pdf`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) { setError(errText(e, "Unable to make the PDF.")); }
    finally { setBusy(false); }
  }

  function print() {
    document.body.classList.add("tt-printing");
    const done = () => { document.body.classList.remove("tt-printing"); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    window.print();
  }

  if (error) return <div className="inline-error">{error}</div>;
  if (!cert) return <div className="table-state"><Loader2 className="spin" size={20} /> Loading certificate…</div>;
  return (
    <div className="tt">
      <header className="page-header compact">
        <div><p className="eyebrow">Tech Training · certificate</p><h1>{cert.course}</h1><p>{cert.holder} · <span className="tt-mono">{cert.certNo}</span></p></div>
        <div className="tt-bar">
          <Link className="quiet-button" href="/tech-training">Back to courses</Link>
          <button type="button" className="quiet-button" disabled={!png} onClick={downloadPng}><Download size={14} /> PNG</button>
          <button type="button" className="quiet-button" disabled={!png || busy} onClick={() => void downloadPdf()}><FileDown size={14} /> PDF</button>
          <button type="button" className="gold-button" disabled={!png} onClick={print}><Printer size={14} /> Print</button>
        </div>
      </header>
      {cert.status === "REVOKED" && <div className="tt-note bad">This certificate was revoked on {fmtDate(cert.revokedAt)}: {cert.revokedReason}</div>}
      {cert.status === "PENDING" && <div className="tt-note">This certificate is waiting for approval.</div>}
      {!cert.logo && <div className="tt-note info">No company logo is set, so the company name is printed instead. A Company Admin can add the logo under Settings &gt; Company.</div>}
      <div className="tt-cert-frame"><canvas ref={canvas} /></div>
      {/* eslint-disable-next-line @next/next/no-img-element -- the drawn certificate, used for printing only */}
      {png && <div className="tt-cert-print"><img src={png} alt="" /></div>}
    </div>
  );
}
