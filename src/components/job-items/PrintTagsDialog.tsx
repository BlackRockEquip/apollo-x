"use client";

import { useMemo, useState } from "react";
import { Printer, X } from "lucide-react";
import { itemTag } from "@/lib/jobs/item-model";
import { LABEL_SIZES, buildJobTagLabels, expandCopies, labelSizeById, renderTagsHtml, type TagItemInput } from "@/lib/labels/job-tags";
import { LABEL_PRINTERS, labelPrinterById, loadLabelPrintSettings, saveLabelPrintSettings } from "@/lib/printing/label-printers";

// 2026-10-29, user request: print job tags. One tag per item (tag, component, model / serial, machine, customer, a scannable
// barcode of the tag). The person picks which items, how many copies of each and the label size; the printer choice lists every
// driver in src/lib/printing/label-printers.ts so a thermal printer can be added there later. Works for an ordinary one-item job too.
type Props = {
  jobNumber: string | null | undefined;
  customerName: string | null | undefined;
  received: string | null | undefined;
  items: Array<TagItemInput & { id: string }>;
  /** The item selected on the job screen: ticked by default, otherwise every item is. */
  selectedId?: string;
  onClose: () => void;
  onError: (message: string) => void;
};

export function PrintTagsDialog({ jobNumber, customerName, received, items, selectedId = "", onClose, onError }: Props) {
  const [picked, setPicked] = useState<string[]>(() => (items.some((item) => item.id === selectedId) ? [selectedId] : items.map((item) => item.id)));
  const [copies, setCopies] = useState("1");
  const [settings, setSettings] = useState(() => loadLabelPrintSettings());
  const size = labelSizeById(settings.sizeId);
  const printer = labelPrinterById(settings.printerId);
  const labels = useMemo(
    () => buildJobTagLabels({ jobNumber, customerName, received, items: items.filter((item) => picked.includes(item.id)), totalItems: items.length }),
    [jobNumber, customerName, received, items, picked],
  );
  const copyCount = Math.min(20, Math.max(1, Math.floor(Number(copies) || 1)));
  const total = labels.length * copyCount;

  function update(next: Partial<typeof settings>) {
    const merged = { ...settings, ...next };
    setSettings(merged);
    saveLabelPrintSettings(merged);
  }
  function print() {
    if (labels.length === 0) return;
    const result = printer.print({ labels, size, copies: copyCount, title: `${jobNumber || "Job"} tags` });
    if (!result.ok) { onError(result.message || "Unable to print the tags."); return; }
    onClose();
  }

  return (
    <div className="drawer-backdrop" role="dialog" aria-modal="true" aria-label="Print job tags">
      <aside className="form-drawer compact-dialog print-tags-dialog">
        <header>
          <div><p className="eyebrow">Job {jobNumber || ""}</p><h2>Print job tags</h2><p className="muted small-line">One tag per item, with a scannable barcode.</p></div>
          <button type="button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button>
        </header>
        <div className="drawer-fields">
          <div className="wide ji-pick">
            <p className="ji-pick-title">Items to print</p>
            <ul>
              {items.map((item) => (
                <li key={item.id}>
                  <label>
                    <input type="checkbox" checked={picked.includes(item.id)} onChange={() => setPicked((current) => (current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]))} />
                    <span className="ji-tag">{itemTag(jobNumber, item.sequence)}</span>
                    <span className="ji-pick-name">{item.component || "Item"}</span>
                  </label>
                </li>
              ))}
            </ul>
            {items.length > 1 && (
              <div className="ji-pick-options">
                <button type="button" className="quiet-button" onClick={() => setPicked(items.map((item) => item.id))}>All items</button>
                <button type="button" className="quiet-button" onClick={() => setPicked([])}>None</button>
              </div>
            )}
          </div>
          <label><span>Copies of each tag</span><input type="number" min={1} max={20} value={copies} onChange={(e) => setCopies(e.target.value)} /></label>
          <label><span>Label size</span>
            <select value={size.id} onChange={(e) => update({ sizeId: e.target.value })}>{LABEL_SIZES.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select>
          </label>
          <label className="wide"><span>Printer</span>
            <select value={printer.id} onChange={(e) => update({ printerId: e.target.value })} disabled={LABEL_PRINTERS.length < 2}>{LABEL_PRINTERS.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select>
            <small className="muted">{printer.description} The choice is remembered on this computer.</small>
          </label>
          {labels.length > 0 && (
            <div className="wide pt-preview">
              <span className="pt-preview-title">Preview of {labels[0].tag}</span>
              <iframe title="Tag preview" className="pt-frame" style={{ width: `${size.widthMm + 4}mm`, height: `${size.heightMm + 4}mm` }} srcDoc={renderTagsHtml(expandCopies(labels.slice(0, 1), 1), size, { title: "Preview", preview: true })} />
            </div>
          )}
        </div>
        <footer className="detail-actions">
          <button type="button" className="gold-button" disabled={total === 0} onClick={print}><Printer size={14} /> Print {total} {total === 1 ? "tag" : "tags"}</button>
          <button type="button" className="quiet-button" onClick={onClose}>Close</button>
        </footer>
      </aside>
    </div>
  );
}
