import { DEFAULT_LABEL_SIZE_ID, expandCopies, labelSizeById, renderTagsHtml, type LabelSize, type TagLabel } from "@/lib/labels/job-tags";

// 2026-10-29, user request: job tags should be printable now, with a specific (thermal) label printer connectable later.
// A "driver" turns a list of tag labels into paper. Today there is one driver - the browser's own print dialog, where the person
// picks their label printer and the page is already sized to the label. A direct thermal printer (ZPL / ESC-POS over the network,
// USB, a print agent such as QZ Tray or Zebra Browser Print) is added by writing another LabelPrinterDriver and listing it in
// LABEL_PRINTERS: the Print job tags window offers every listed driver, and nothing else on the job screen has to change.
export type LabelPrintRequest = { labels: TagLabel[]; size: LabelSize; copies: number; title: string };
export type LabelPrintResult = { ok: boolean; message?: string };

export type LabelPrinterDriver = {
  id: string;
  name: string;
  description: string;
  /** Must start the print inside the click that asked for it (browsers block pop-ups opened later). */
  print: (request: LabelPrintRequest) => LabelPrintResult;
};

export const browserLabelPrinter: LabelPrinterDriver = {
  id: "browser",
  name: "Browser print dialog",
  description: "Opens the print dialog sized to the label. Choose your label printer there.",
  print: ({ labels, size, copies, title }) => {
    const win = window.open("", "_blank");
    if (!win) return { ok: false, message: "Enable pop-ups to print the tags." };
    win.document.write(renderTagsHtml(expandCopies(labels, copies), size, { title, autoPrint: true }));
    win.document.close();
    win.focus();
    return { ok: true };
  },
};

export const LABEL_PRINTERS: readonly LabelPrinterDriver[] = [browserLabelPrinter];

export function labelPrinterById(id: string | null | undefined): LabelPrinterDriver {
  return LABEL_PRINTERS.find((printer) => printer.id === id) ?? LABEL_PRINTERS[0];
}

// The printer and label size last used on THIS computer (a label printer is attached to one workstation, so the choice is kept in
// the browser rather than on the company).
export type LabelPrintSettings = { printerId: string; sizeId: string };
const SETTINGS_KEY = "workshop-track.label-print";

export function parseLabelPrintSettings(raw: string | null | undefined): LabelPrintSettings {
  const fallback: LabelPrintSettings = { printerId: LABEL_PRINTERS[0].id, sizeId: DEFAULT_LABEL_SIZE_ID };
  if (!raw) return fallback;
  try {
    const value = JSON.parse(raw) as Partial<LabelPrintSettings> | null;
    return { printerId: labelPrinterById(value?.printerId).id, sizeId: labelSizeById(value?.sizeId).id };
  } catch {
    return fallback;
  }
}

export function loadLabelPrintSettings(): LabelPrintSettings {
  try { return parseLabelPrintSettings(window.localStorage.getItem(SETTINGS_KEY)); } catch { return parseLabelPrintSettings(null); }
}

export function saveLabelPrintSettings(settings: LabelPrintSettings): void {
  try { window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* storage blocked: the choice just is not remembered */ }
}
