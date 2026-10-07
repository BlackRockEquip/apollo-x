import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

// Generic, dependency-light PDF renderer for the documents saved into a job's
// folder (Job Card, Job History, Delivery Note, Pick Slip, Parts List …).
// The browser builds a DocSpec from the same data its print view uses; this
// turns it into an A4 PDF with the company's letterhead (logo + details).
// pdf-lib is pure JavaScript and uses the built-in Helvetica fonts, so nothing
// here needs a browser, a font file or a native binary on the server.

export type DocBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "lines"; lines: string[]; /** Small bold text (8.5pt) instead of the normal 9pt regular. */ bold?: boolean }
  | { type: "kv"; rows: [string, string][] }
  | { type: "table"; headers: string[]; rows: string[][]; widths?: number[]; center?: number[] }
  | { type: "twoCol"; left: DocBlock[]; right: DocBlock[] }
  | { type: "signatures"; labels: string[]; fields: string[] }
  /** Empty ruled lines to write on (e.g. the mechanic's notes on the Job Card). */
  | { type: "lined"; count: number }
  | { type: "pageBreak" };

export type DocSpec = {
  /** Main heading, e.g. "Job History". */
  title: string;
  /** Lines shown top-right under the letterhead, e.g. "Job BRE1152", "Delivery date: 05/10/2026". */
  rightLines?: string[];
  blocks: DocBlock[];
};

export type DocLetterhead = {
  name: string;
  addressLines: string[];
  registrationNumber?: string | null;
  vatNumber?: string | null;
  contact?: string | null;
  email?: string | null;
  logo?: { bytes: Uint8Array; mimeType: string } | null;
};

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 36;
const CONTENT_W = PAGE_W - MARGIN * 2;
const INK = rgb(0.07, 0.09, 0.11);
const MUTED = rgb(0.33, 0.35, 0.38);
const RULE = rgb(0.8, 0.8, 0.8);
const HEAD_FILL = rgb(0.965, 0.965, 0.965);
const ACCENT = rgb(0.478, 0.361, 0.078);

export async function renderDocumentPdf(spec: DocSpec, letterhead: DocLetterhead | null): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  // Characters the built-in fonts cannot encode (anything outside WinAnsi) would throw: swap them for "?".
  const encodable = new Map<string, string>();
  const safe = (text: string) => {
    let out = "";
    for (const ch of text.replace(/\r/g, "")) {
      let ok = encodable.get(ch);
      if (ok === undefined) {
        try {
          if (ch !== "\n") regular.encodeText(ch);
          ok = ch;
        } catch {
          ok = "?";
        }
        encodable.set(ch, ok);
      }
      out += ok;
    }
    return out;
  };

  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;
  const bottom = MARGIN + 18;
  const newPage = () => { page = doc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; };
  const ensure = (height: number) => { if (y - height < bottom) newPage(); };

  const wrap = (text: string, font: PDFFont, size: number, width: number): string[] => {
    const lines: string[] = [];
    for (const paragraph of safe(text).split("\n")) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      if (words.length === 0) { lines.push(""); continue; }
      let line = "";
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= width) { line = candidate; continue; }
        if (line) lines.push(line);
        // A single very long token: break it by characters.
        let rest = word;
        while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
          let cut = rest.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut--;
          lines.push(rest.slice(0, cut));
          rest = rest.slice(cut);
        }
        line = rest;
      }
      lines.push(line);
    }
    return lines;
  };

  const text = (value: string, x: number, size: number, font: PDFFont, color = INK, align: "left" | "right" = "left", width = 0) => {
    const safeValue = safe(value);
    const drawX = align === "right" ? x + width - font.widthOfTextAtSize(safeValue, size) : x;
    page.drawText(safeValue, { x: drawX, y, size, font, color });
  };

  // ---- letterhead + title ---------------------------------------------------
  let logo: PDFImage | null = null;
  if (letterhead?.logo) {
    try {
      const mime = letterhead.logo.mimeType;
      if (mime === "image/png") logo = await doc.embedPng(letterhead.logo.bytes);
      else if (mime === "image/jpeg") logo = await doc.embedJpg(letterhead.logo.bytes);
    } catch {
      logo = null; // an unreadable logo never blocks the document
    }
  }
  const headTop = y;
  let leftBottom = y;
  if (logo) {
    const scale = Math.min(170 / logo.width, 56 / logo.height, 1);
    const w = logo.width * scale;
    const h = logo.height * scale;
    page.drawImage(logo, { x: MARGIN, y: y - h, width: w, height: h });
    leftBottom = y - h;
  } else if (letterhead) {
    y -= 14;
    text(letterhead.name, MARGIN, 13, bold);
    leftBottom = y - 4;
  }
  y = headTop;
  const rightX = MARGIN + CONTENT_W / 2;
  const rightW = CONTENT_W / 2;
  if (letterhead) {
    const orgLines = [
      letterhead.name,
      ...letterhead.addressLines,
      letterhead.registrationNumber ? `Reg: ${letterhead.registrationNumber}` : "",
      letterhead.vatNumber ? `VAT: ${letterhead.vatNumber}` : "",
      letterhead.contact ?? "",
      letterhead.email ?? "",
    ].filter(Boolean);
    orgLines.forEach((line, i) => {
      y -= i === 0 ? 11 : 9.5;
      text(line, rightX, i === 0 ? 9.5 : 8, i === 0 ? bold : regular, i === 0 ? INK : MUTED, "right", rightW);
    });
  }
  y = Math.min(y, leftBottom) - 16;

  // Title row: heading left, right lines (job number …) right-aligned.
  const titleY = y;
  y -= 16;
  text(spec.title, MARGIN, 16, bold);
  const leftTitleBottom = y;
  y = titleY;
  (spec.rightLines ?? []).forEach((line, i) => {
    y -= i === 0 ? 14 : 11;
    text(line, rightX, i === 0 ? 12 : 9.5, i === 0 ? bold : regular, i === 0 ? INK : MUTED, "right", rightW);
  });
  y = Math.min(y, leftTitleBottom) - 8;
  page.drawRectangle({ x: MARGIN, y, width: CONTENT_W, height: 2, color: ACCENT });
  y -= 12;

  // ---- blocks ---------------------------------------------------------------
  type Ctx = { x: number; w: number; draw: boolean };

  // Renders (or just measures) a block; returns nothing, moves `y`.
  const renderBlock = (block: DocBlock, c: Ctx) => {
    switch (block.type) {
      case "heading": {
        if (c.draw) ensure(30);
        y -= 12;
        if (c.draw) text(block.text.toUpperCase(), c.x, 9, bold, MUTED);
        y -= 5;
        return;
      }
      case "paragraph": {
        const lines = wrap(block.text || "—", regular, 9, c.w);
        for (const line of lines) {
          if (c.draw) ensure(12);
          y -= 11;
          if (c.draw) text(line, c.x, 9, regular);
        }
        y -= 4;
        return;
      }
      case "lines": {
        const lineFont = block.bold ? bold : regular;
        const lineSize = block.bold ? 8.5 : 9;
        for (const raw of block.lines.length ? block.lines : ["—"]) {
          for (const line of wrap(raw, lineFont, lineSize, c.w)) {
            if (c.draw) ensure(12);
            y -= 11;
            if (c.draw) text(line, c.x, lineSize, lineFont);
          }
        }
        y -= 4;
        return;
      }
      case "kv": {
        const labelW = c.w * 0.36;
        for (const [label, value] of block.rows) {
          const labelLines = wrap(label, bold, 8.5, labelW - 10);
          const valueLines = wrap(value || "—", regular, 9, c.w - labelW - 10);
          const rowH = Math.max(labelLines.length, valueLines.length) * 11 + 8;
          if (c.draw) ensure(rowH);
          if (c.draw) {
            page.drawRectangle({ x: c.x, y: y - rowH, width: labelW, height: rowH, color: HEAD_FILL, borderColor: RULE, borderWidth: 0.6 });
            page.drawRectangle({ x: c.x + labelW, y: y - rowH, width: c.w - labelW, height: rowH, borderColor: RULE, borderWidth: 0.6 });
            labelLines.forEach((line, i) => page.drawText(line, { x: c.x + 5, y: y - 12 - i * 11, size: 8.5, font: bold, color: INK }));
            valueLines.forEach((line, i) => page.drawText(line, { x: c.x + labelW + 5, y: y - 12 - i * 11, size: 9, font: regular, color: INK }));
          }
          y -= rowH;
        }
        y -= 6;
        return;
      }
      case "table": {
        const n = block.headers.length;
        const total = (block.widths ?? block.headers.map(() => 1)).reduce((a, b) => a + b, 0);
        const widths = (block.widths ?? block.headers.map(() => 1)).map((w) => (w / total) * c.w);
        const xs = widths.reduce<number[]>((acc, w, i) => { acc.push(i === 0 ? c.x : acc[i - 1] + widths[i - 1]); return acc; }, []);
        const drawRow = (cells: string[], header: boolean, repeating = false) => {
          const font = header ? bold : regular;
          const size = header ? 8.5 : 8.5;
          const wrapped = cells.map((cell, i) => wrap(cell, font, size, widths[i] - 8));
          const rowH = Math.max(1, ...wrapped.map((l) => l.length)) * 10.5 + 7;
          // A row that does not fit starts a new page, and the header row is repeated there.
          if (c.draw && !header && !repeating && y - rowH < bottom) { newPage(); drawRow(block.headers, true, true); }
          if (c.draw) ensure(rowH);
          if (c.draw) {
            cells.forEach((_, i) => {
              page.drawRectangle({ x: xs[i], y: y - rowH, width: widths[i], height: rowH, color: header ? HEAD_FILL : undefined, borderColor: RULE, borderWidth: 0.6 });
              wrapped[i].forEach((line, k) => {
                const centered = !header && block.center?.includes(i);
                const dx = centered ? (widths[i] - font.widthOfTextAtSize(line, size)) / 2 : 4;
                page.drawText(line, { x: xs[i] + Math.max(2, dx), y: y - 11 - k * 10.5, size, font, color: INK });
              });
            });
          }
          y -= rowH;
        };
        drawRow(block.headers, true);
        for (const row of block.rows) drawRow(Array.from({ length: n }, (_, i) => row[i] ?? ""), false);
        y -= 6;
        return;
      }
      case "twoCol": {
        const gap = 18;
        const colW = (c.w - gap) / 2;
        // Measure both sides, move to a new page if neither fits on the rest of this one, then draw side by side.
        const measure = (blocks: DocBlock[], x: number) => { const start = y; blocks.forEach((b) => renderBlock(b, { x, w: colW, draw: false })); const h = start - y; y = start; return h; };
        const hLeft = measure(block.left, c.x);
        const hRight = measure(block.right, c.x + colW + gap);
        const needed = Math.max(hLeft, hRight);
        if (c.draw && y - needed < bottom && needed < PAGE_H - MARGIN * 2) newPage();
        const startY = y;
        let startPageIndex = doc.getPageCount();
        block.left.forEach((b) => renderBlock(b, { x: c.x, w: colW, draw: c.draw }));
        const leftEnd = y;
        const leftPage = doc.getPageCount();
        y = startY;
        if (leftPage === startPageIndex) {
          block.right.forEach((b) => renderBlock(b, { x: c.x + colW + gap, w: colW, draw: c.draw }));
          if (doc.getPageCount() === startPageIndex) y = Math.min(y, leftEnd);
        } else {
          // Long content spilled over a page: carry on below the left column instead of overlapping.
          newPage();
          block.right.forEach((b) => renderBlock(b, { x: c.x, w: c.w, draw: c.draw }));
        }
        return;
      }
      case "signatures": {
        if (c.draw) ensure(30 + block.fields.length * 26);
        y -= 18;
        const colW = (c.w - 40 * (block.labels.length - 1)) / block.labels.length;
        const top = y;
        let lowest = y;
        block.labels.forEach((label, i) => {
          const x = c.x + i * (colW + 40);
          y = top;
          if (c.draw) text(label.toUpperCase(), x, 9, bold, MUTED);
          y -= 6;
          for (const field of block.fields) {
            y -= 26;
            if (c.draw) {
              page.drawLine({ start: { x, y }, end: { x: x + colW, y }, thickness: 0.7, color: INK });
              page.drawText(safe(field), { x, y: y - 9, size: 8, font: regular, color: MUTED });
            }
          }
          lowest = Math.min(lowest, y - 12);
        });
        y = lowest - 4;
        return;
      }
      case "lined": {
        for (let i = 0; i < block.count; i++) {
          if (c.draw) ensure(20);
          y -= 20;
          if (c.draw) page.drawLine({ start: { x: c.x, y }, end: { x: c.x + c.w, y }, thickness: 0.6, color: RULE });
        }
        y -= 6;
        return;
      }
      case "pageBreak":
        if (c.draw) newPage();
        return;
    }
  };

  for (const block of spec.blocks) renderBlock(block, { x: MARGIN, w: CONTENT_W, draw: true });

  // ---- footer ---------------------------------------------------------------
  const pages = doc.getPages();
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  pages.forEach((p, i) => {
    p.drawText(safe(`Page ${i + 1} of ${pages.length}`), { x: PAGE_W - MARGIN - 60, y: MARGIN - 6, size: 8, font: regular, color: MUTED });
    p.drawText(safe(`Saved ${stamp} UTC`), { x: MARGIN, y: MARGIN - 6, size: 8, font: regular, color: MUTED });
  });

  return Buffer.from(await doc.save());
}
