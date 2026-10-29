import { itemTag } from "@/lib/jobs/item-model";
import { code128Svg } from "@/lib/labels/code128";

// 2026-10-29, user request: "a button to print job tags", with a thermal (or other specific) label printer to be connectable later.
// This file is the printer-independent half: what is on a tag (buildJobTagLabels), the label sizes on offer, and how a tag is drawn
// as HTML (renderTagsHtml). Getting the result to a printer is src/lib/printing/label-printers.ts - a driver there takes the same
// TagLabel list, so a thermal driver can render the labels its own way (e.g. ZPL) without touching the screens or the tag contents.

export type LabelSize = { id: string; name: string; widthMm: number; heightMm: number };

export const LABEL_SIZES: readonly LabelSize[] = [
  { id: "100x50", name: "100 x 50 mm (standard thermal)", widthMm: 100, heightMm: 50 },
  { id: "76x51", name: "76 x 51 mm (3 x 2 in)", widthMm: 76, heightMm: 51 },
  { id: "100x150", name: "100 x 150 mm (4 x 6 in)", widthMm: 100, heightMm: 150 },
];
export const DEFAULT_LABEL_SIZE_ID = "100x50";

export function labelSizeById(id: string | null | undefined): LabelSize {
  return LABEL_SIZES.find((size) => size.id === id) ?? LABEL_SIZES[0];
}

export type TagItemInput = {
  sequence: number;
  component?: string | null;
  componentModel?: string | null;
  componentSerial?: string | null;
  componentPartNumber?: string | null;
  machineMake?: string | null;
  machineModel?: string | null;
  plantNumber?: string | null;
};

export type TagLabel = {
  /** BRE1122-2, also the text of the barcode. */
  tag: string;
  jobNumber: string;
  /** "Item 2 of 5". */
  position: string;
  component: string;
  /** Model, serial and part number on one line. */
  componentLine: string;
  /** Machine make / model and plant number on one line. */
  machineLine: string;
  customer: string;
  /** Date the item was received, already formatted. */
  received: string;
};

const clean = (value: string | null | undefined) => (value ?? "").trim();

export function buildJobTagLabels(input: { jobNumber: string | null | undefined; customerName?: string | null; received?: string | null; items: readonly TagItemInput[]; totalItems?: number }): TagLabel[] {
  const total = input.totalItems ?? input.items.length;
  const received = input.received ? new Date(input.received) : null;
  return [...input.items].sort((a, b) => a.sequence - b.sequence).map((item) => {
    const tag = itemTag(input.jobNumber, item.sequence);
    const machine = [clean(item.machineMake), clean(item.machineModel)].filter(Boolean).join(" ");
    return {
      tag,
      jobNumber: clean(input.jobNumber),
      position: `Item ${item.sequence} of ${Math.max(total, item.sequence)}`,
      component: clean(item.component) || "Item",
      componentLine: [clean(item.componentModel), clean(item.componentSerial) ? `S/N ${clean(item.componentSerial)}` : "", clean(item.componentPartNumber) ? `P/N ${clean(item.componentPartNumber)}` : ""].filter(Boolean).join(" · "),
      machineLine: [machine, clean(item.plantNumber) ? `Plant ${clean(item.plantNumber)}` : ""].filter(Boolean).join(" · "),
      customer: clean(input.customerName),
      received: received && !Number.isNaN(received.getTime()) ? received.toLocaleDateString("en-ZA") : "",
    };
  });
}

// The same label printed `copies` times in a row (1-20), in item order.
export function expandCopies(labels: readonly TagLabel[], copies: number): TagLabel[] {
  const count = Math.min(20, Math.max(1, Math.floor(Number.isFinite(copies) ? copies : 1)));
  return labels.flatMap((label) => Array.from({ length: count }, () => label));
}

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// One label as HTML. Sizes are in mm and scale with the label's width, so the three label sizes share this layout.
function labelHtml(label: TagLabel, size: LabelSize): string {
  let barcode = "";
  try { barcode = code128Svg(label.tag, { height: 30 }); } catch { barcode = ""; }
  const scale = size.widthMm / 100;
  const px = (n: number) => `${(n * scale).toFixed(2)}mm`;
  return `<section class="label" style="width:${size.widthMm}mm;height:${size.heightMm}mm">
    <div class="top"><span class="job">${escapeHtml(label.jobNumber ? `JOB ${label.jobNumber}` : "JOB")}</span><span class="pos">${escapeHtml(label.position)}</span></div>
    <div class="tag" style="font-size:${px(8)}">${escapeHtml(label.tag)}</div>
    <div class="component" style="font-size:${px(4.6)}">${escapeHtml(label.component)}</div>
    ${label.componentLine ? `<div class="line" style="font-size:${px(3.3)}">${escapeHtml(label.componentLine)}</div>` : ""}
    ${label.machineLine ? `<div class="line" style="font-size:${px(3.3)}">${escapeHtml(label.machineLine)}</div>` : ""}
    <div class="spacer"></div>
    <div class="barcode" style="height:${px(8)}">${barcode}</div>
    <div class="foot" style="font-size:${px(3.2)}"><span>${escapeHtml(label.customer)}</span><span>${escapeHtml(label.received ? `In ${label.received}` : "")}</span></div>
  </section>`;
}

// A whole print document: one page per label, page size = label size. `autoPrint` opens the print dialog as soon as it loads.
export function renderTagsHtml(labels: readonly TagLabel[], size: LabelSize, options: { title?: string; autoPrint?: boolean; preview?: boolean } = {}): string {
  return `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(options.title ?? "Job tags")}</title><style>
    @page{size:${size.widthMm}mm ${size.heightMm}mm;margin:0}
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;background:#fff;font-family:Arial,Helvetica,sans-serif;color:#000}
    .label{display:flex;flex-direction:column;padding:2.5mm 4mm;overflow:hidden;page-break-after:always;break-after:page;background:#fff}
    .label:last-child{page-break-after:auto;break-after:auto}
    .top{display:flex;justify-content:space-between;align-items:baseline;font-size:3.2mm;font-weight:700;letter-spacing:.06em}
    .pos{font-weight:600;letter-spacing:0}
    .tag{font-family:"Courier New",Consolas,monospace;font-weight:700;line-height:1.1;margin-top:1mm;white-space:nowrap}
    .component{font-weight:700;line-height:1.15;margin-top:.8mm;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
    .line{line-height:1.25;margin-top:.5mm;color:#222;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
    .label > *{flex:none}
    .label > .spacer{flex:1 1 0;min-height:0}
    .barcode svg{display:block;width:100%;height:100%}
    .foot{display:flex;justify-content:space-between;gap:3mm;margin-top:1mm;color:#222;white-space:nowrap}
    .foot span:first-child{overflow:hidden;text-overflow:ellipsis}
    @media screen{body{background:#e9ecf1;padding:8mm}.label{margin:0 auto 6mm;box-shadow:0 1px 4px rgba(0,0,0,.25);border:1px solid #cfd4dc}body.pv{padding:2mm}.pv .label{margin:0}}
  </style></head><body${options.preview ? ' class="pv"' : ""}>${labels.map((label) => labelHtml(label, size)).join("")}${options.autoPrint ? "<script>window.onload=function(){window.print();};</script>" : ""}</body></html>`;
}
