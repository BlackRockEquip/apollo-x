"use client";

// Compare quotes — "enter prices" screen (design B, 2026-10-27). One column of
// suppliers on the left, one supplier's prices at a time on the right, each
// price shown next to how it compares with the other suppliers. Purely
// presentational: JobWorkspace owns the drafts, saving and file import and
// passes them in. User request: "I like B with C, the look and flow look more
// professional and neatly tidied up".

import { useMemo, useState, type KeyboardEvent } from "react";
import { AlertCircle, Check, Columns3, FileText, Loader2, Maximize2, Minimize2, Save, Upload, X } from "lucide-react";
import { bestMix, draftToCell, entryCompare, formatRand, parseDraftPrice, sanitizePriceInput, shortSupplierName, supplierStats, type GridRow } from "./compare-model";

export type EntrySupplier = {
  id: string;
  name: string;
  /** Request status label, shown while the supplier has not answered anything yet. */
  statusLabel: string;
  statusTone: "green" | "blue" | "red" | "neutral";
  savedFileName: string;
  pendingFileName: string;
  analyzing: boolean;
  saving: boolean;
  dirty: boolean;
  importNote: string;
  notes: string;
};

export type EntryLine = { id: string; partNumber: string; description: string; quantity: number };
export type EntryDraft = { unitPrice: string; available: boolean; leadTime: string };

type Props = {
  subtitle: string;
  suppliers: EntrySupplier[];
  lines: EntryLine[];
  drafts: Record<string, Record<string, EntryDraft | undefined> | undefined>;
  maximized: boolean;
  savingAll: boolean;
  anySaving: boolean;
  canCompare: boolean;
  error: string;
  onToggleMaximize: () => void;
  onPriceChange: (supplierId: string, lineId: string, unitPrice: string) => void;
  onNaChange: (supplierId: string, lineId: string, notAvailable: boolean) => void;
  onLeadTimeChange: (supplierId: string, lineId: string, leadTime: string) => void;
  onNotesChange: (supplierId: string, notes: string) => void;
  onImportFile: (supplierId: string, file: File) => Promise<void>;
  onViewFile: (supplierId: string) => void;
  onSaveSupplier: (supplierId: string) => void;
  onComparePrices: () => void;
  onCancel: () => void;
  onDone: () => void;
};

// A price box that shows 158,10 once you leave it (a saved 158.1 would otherwise
// read as 158,1) but lets you type freely while it has focus.
function PriceInput({ value, label, onChange, onKeyDown }: { value: string; label: string; onChange: (v: string) => void; onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void }) {
  const [focused, setFocused] = useState(false);
  const parsed = parseDraftPrice(value);
  const shown = focused || parsed === null ? value.replace(".", ",") : parsed.toFixed(2).replace(".", ",");
  return (
    <input
      type="text"
      inputMode="decimal"
      data-qc-price=""
      value={shown}
      placeholder="0,00"
      aria-label={label}
      onFocus={(e) => { setFocused(true); e.currentTarget.select(); }}
      onBlur={() => setFocused(false)}
      onChange={(e) => onChange(sanitizePriceInput(e.target.value))}
      onKeyDown={onKeyDown}
    />
  );
}

const lineQty = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3))));

export function QuoteEntryDialog(props: Props) {
  const { suppliers, lines, drafts } = props;
  const [selectedId, setSelectedId] = useState("");
  const selectedIndex = Math.max(0, suppliers.findIndex((s) => s.id === selectedId));
  const selected = suppliers[selectedIndex];

  const rows: GridRow[] = useMemo(
    () => lines.map((line) => ({ qty: line.quantity, cells: suppliers.map((s) => draftToCell(drafts[s.id]?.[line.id])) })),
    [lines, suppliers, drafts],
  );
  const stats = useMemo(() => supplierStats(rows, suppliers.length), [rows, suppliers.length]);
  const mix = useMemo(() => bestMix(rows), [rows]);

  const header = (
    <header className="qc-head">
      <div className="qc-head-title">
        <h2>Compare quotes</h2>
        <p>{props.subtitle}</p>
      </div>
      <button type="button" className="qc-icon-btn" onClick={props.onToggleMaximize} aria-label={props.maximized ? "Restore dialog size" : "Maximize dialog"} title={props.maximized ? "Restore" : "Maximize"}>
        {props.maximized ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
      </button>
      <button type="button" className="qc-icon-btn" onClick={props.onCancel} aria-label="Close dialog" disabled={props.savingAll}><X size={18} /></button>
    </header>
  );

  if (!selected || lines.length === 0) {
    return (
      <div className="qc-backdrop" role="dialog" aria-modal="true" aria-label="Compare quotes">
        <div className={`qc-dialog${props.maximized ? " is-max" : ""}`}>
          {header}
          <div className="qc-empty">
            {suppliers.length === 0
              ? "No suppliers have been asked to quote this job yet. Use “Request quotes (RFQ)” first."
              : "This job has no parts to price yet."}
          </div>
        </div>
      </div>
    );
  }

  const selectedStat = stats[selectedIndex];
  const selectedDrafts = drafts[selected.id] || {};
  const pricedLines = selectedStat.priced;
  const naLines = selectedStat.answered - selectedStat.priced;
  const waiting = lines.length - selectedStat.answered;

  function pillFor(index: number): { text: string; tone: string } {
    const s = suppliers[index];
    const answered = stats[index].answered;
    if (answered === 0) return { text: s.statusLabel, tone: s.statusTone === "neutral" ? "" : `tone-${s.statusTone}` };
    if (answered < lines.length) return { text: "Partial", tone: "tone-amber" };
    return { text: "Complete", tone: "tone-green" };
  }

  // Enter in a price box jumps to the next line's price box; Enter in an availability box, to the next line's.
  function jumpToNext(e: KeyboardEvent<HTMLInputElement>, selector: string) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const boxes = Array.from(e.currentTarget.closest(".qc-rows")?.querySelectorAll<HTMLInputElement>(selector) ?? []);
    const at = boxes.indexOf(e.currentTarget);
    boxes[at + 1]?.focus();
    boxes[at + 1]?.select();
  }
  const onPriceKey = (e: KeyboardEvent<HTMLInputElement>) => jumpToNext(e, "input[data-qc-price]");
  const onLeadKey = (e: KeyboardEvent<HTMLInputElement>) => jumpToNext(e, "input[data-qc-lead]");

  const selectedPill = pillFor(selectedIndex);
  const fileName = selected.pendingFileName || selected.savedFileName;
  const busy = props.savingAll || props.anySaving;

  return (
    <div className="qc-backdrop" role="dialog" aria-modal="true" aria-label="Compare quotes">
      <div className={`qc-dialog${props.maximized ? " is-max" : ""}`}>
        {header}

        <div className="qc-body">
          <aside className="qc-side" aria-label="Suppliers asked to quote">
            <div className="qc-side-list">
            <div className="qc-eyebrow">Suppliers asked to quote</div>
            {suppliers.map((s, i) => {
              const pill = pillFor(i);
              const on = i === selectedIndex;
              return (
                <button key={s.id} type="button" className={`qc-supplier${on ? " is-on" : ""}`} aria-pressed={on} onClick={() => setSelectedId(s.id)}>
                  <span className="qc-supplier-top">
                    <span className="qc-supplier-name">{s.name}</span>
                    {s.dirty ? <span className="qc-unsaved">Unsaved</span> : on ? <span className="qc-dot" /> : null}
                  </span>
                  <span className="qc-supplier-mid">
                    <span className={`qc-pill ${pill.tone}`}>{pill.text}</span>
                    <span>{stats[i].answered} of {lines.length} answered</span>
                  </span>
                  <span className="qc-supplier-bot">
                    <strong className="qc-num">{formatRand(stats[i].total)}</strong>
                    <span>lowest on {stats[i].lowestOn}</span>
                  </span>
                </button>
              );
            })}
            </div>
            <div className="qc-mix">
              <span className="qc-eyebrow">Best mix, lowest on every line</span>
              <strong className="qc-num">{formatRand(mix.total)}</strong>
              <span>across {mix.supplierCount} {mix.supplierCount === 1 ? "supplier" : "suppliers"} · {mix.pricedLines} of {lines.length} parts priced</span>
            </div>
          </aside>

          <section className="qc-pane" aria-label={`Prices from ${selected.name}`}>
            <div className="qc-pane-head">
              <div className="qc-pane-head-main">
                <div className="qc-pane-title">
                  <h3>{selected.name}</h3>
                  <span className={`qc-pill ${selectedPill.tone}`}>{selectedPill.text}</span>
                </div>
                <div className="qc-pane-tools">
                  {fileName && (
                    <span className={`qc-chip${selected.pendingFileName ? " is-pending" : ""}`} title={fileName}>
                      <FileText size={14} />
                      <span>{fileName}</span>
                      {selected.pendingFileName ? <em style={{ fontStyle: "normal", color: "#8a6410", fontSize: 11.5 }}>not saved yet</em> : (
                        <button type="button" onClick={() => props.onViewFile(selected.id)} disabled={busy}>View</button>
                      )}
                    </span>
                  )}
                  <label className={`qc-upload${selected.analyzing ? " is-busy" : ""}`}>
                    <Upload size={14} />
                    <span>{selected.savedFileName || selected.pendingFileName ? "Replace quote file" : "Import quote file"}</span>
                    <input
                      type="file"
                      disabled={selected.analyzing}
                      onChange={async (e) => {
                        const input = e.currentTarget;
                        const file = input.files?.[0] || null;
                        if (!file) return;
                        try { await props.onImportFile(selected.id, file); } finally { input.value = ""; }
                      }}
                    />
                  </label>
                  <input className="qc-note" value={selected.notes} onChange={(e) => props.onNotesChange(selected.id, e.target.value)} placeholder="Add a note for this supplier (optional)" aria-label="Supplier note" />
                </div>
              </div>
              <button type="button" className="qc-btn is-primary" disabled={!selected.dirty || selected.saving || busy} onClick={() => props.onSaveSupplier(selected.id)}>
                {selected.saving ? <Loader2 className="spin" size={15} /> : <Save size={15} />} {selected.saving ? "Saving…" : "Save this supplier"}
              </button>
            </div>

            {selected.analyzing ? (
              <div className="qc-banner qc-pane-banner"><Loader2 className="spin" size={16} /><span>Reading prices and availability from the file…</span></div>
            ) : selected.importNote ? (
              <div className="qc-banner qc-pane-banner"><AlertCircle size={16} /><span>{selected.importNote}</span></div>
            ) : null}

            <div className="qc-cols qc-cols-head">
              <div>Part</div>
              <div style={{ textAlign: "center" }}>Qty</div>
              <div style={{ paddingLeft: 6 }}>Unit price</div>
              <div>Availability</div>
              <div style={{ textAlign: "right", paddingRight: 16 }}>Line total</div>
              <div style={{ paddingLeft: 6 }}>Compared with other suppliers</div>
            </div>

            <div className="qc-rows">
              {lines.map((line, li) => {
                const cell = rows[li].cells[selectedIndex];
                const draft = selectedDrafts[line.id];
                const cmp = entryCompare(rows[li].cells, selectedIndex);
                return (
                  <div key={line.id} className="qc-cols qc-row">
                    <div className="qc-part"><strong>{line.partNumber || "—"}</strong>{line.description ? <span title={line.description}>{line.description}</span> : null}</div>
                    <div className="qc-cell-qty"><span className="qc-qty">×{lineQty(line.quantity)}</span></div>
                    <div className="qc-price-cell">
                      {cell.kind === "na" ? (
                        <div className="qc-price is-na">
                          <span>Not available</span>
                          <button type="button" onClick={() => props.onNaChange(selected.id, line.id, false)}>Undo</button>
                        </div>
                      ) : (
                        <div className="qc-price">
                          <span>R</span>
                          <PriceInput value={draft?.unitPrice ?? ""} label={`Unit price for ${line.partNumber}`} onChange={(v) => props.onPriceChange(selected.id, line.id, v)} onKeyDown={onPriceKey} />
                          <button type="button" className="qc-na-btn" title="This supplier cannot supply this part" onClick={() => props.onNaChange(selected.id, line.id, true)}>N/A</button>
                        </div>
                      )}
                    </div>
                    <div className="qc-lead-cell">
                      {cell.kind === "na" ? (
                        <span className="qc-vs-muted">—</span>
                      ) : (
                        <input
                          type="text"
                          className="qc-lead"
                          data-qc-lead=""
                          value={draft?.leadTime ?? ""}
                          maxLength={60}
                          placeholder="e.g. In stock"
                          aria-label={`Availability for ${line.partNumber}`}
                          onChange={(e) => props.onLeadTimeChange(selected.id, line.id, e.target.value)}
                          onKeyDown={onLeadKey}
                        />
                      )}
                    </div>
                    <div className="qc-line-total qc-num">{cell.kind === "price" ? formatRand(cell.unit * line.quantity) : "—"}</div>
                    <div className="qc-vs">
                      {cmp.kind === "best" && (
                        <>
                          <span className="qc-vs-tag is-best"><Check size={12} strokeWidth={3} />{cmp.otherIndex === null ? "Only quote" : "Lowest of all"}</span>
                          {cmp.otherIndex !== null && cmp.otherUnit !== null && <span title={`Next lowest: ${suppliers[cmp.otherIndex].name} ${formatRand(cmp.otherUnit)}`}>next: {shortSupplierName(suppliers[cmp.otherIndex].name)} {formatRand(cmp.otherUnit)}</span>}
                        </>
                      )}
                      {cmp.kind === "behind" && (
                        <>
                          <span className="qc-vs-tag is-behind">{cmp.percent === null ? "Higher" : `+${cmp.percent}%`}</span>
                          <span title={`Lowest: ${suppliers[cmp.bestIndex].name} ${formatRand(cmp.bestUnit)}`}>lowest: <strong>{shortSupplierName(suppliers[cmp.bestIndex].name)} {formatRand(cmp.bestUnit)}</strong></span>
                        </>
                      )}
                      {cmp.kind === "na" && <span className="qc-vs-muted">Not offered</span>}
                      {cmp.kind === "none" && <span className="qc-vs-muted">No price yet</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="qc-cols qc-foot">
              <div className="qc-eyebrow">Total · {pricedLines} priced {pricedLines === 1 ? "line" : "lines"}</div>
              <div />
              <div />
              <div />
              <div className="qc-line-total qc-num">{formatRand(selectedStat.total)}</div>
              <div className="qc-foot-note">
                Lowest on {selectedStat.lowestOn} {selectedStat.lowestOn === 1 ? "line" : "lines"}
                {naLines > 0 ? ` · ${naLines} not available` : ""}
                {waiting > 0 ? ` · ${waiting} still blank` : ""}
              </div>
            </div>
          </section>
        </div>

        <footer className="qc-actions">
          {props.error ? (
            <div className="qc-banner is-error" role="alert"><AlertCircle size={16} /><span>{props.error}</span></div>
          ) : (
            <div className="qc-actions-note">Each supplier saves on its own, and Done saves any supplier still marked Unsaved. Importing a file only fills blanks and never overwrites a price or availability you typed. Parts left blank are saved as N/A once you have priced at least one.</div>
          )}
          <button type="button" className="qc-btn" disabled={!props.canCompare || busy} title={props.canCompare ? undefined : "Save at least one supplier's prices first"} onClick={props.onComparePrices}>
            <Columns3 size={15} /> Compare prices
          </button>
          <button type="button" className="qc-btn" onClick={props.onCancel} disabled={props.savingAll}>Cancel</button>
          <button type="button" className="qc-btn is-primary" style={{ padding: "0 26px" }} onClick={props.onDone} disabled={busy}>
            {props.savingAll && <Loader2 className="spin" size={14} />} Done
          </button>
        </footer>
      </div>
    </div>
  );
}
