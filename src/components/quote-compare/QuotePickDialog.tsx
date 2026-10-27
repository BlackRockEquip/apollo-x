"use client";

// Compare quotes — "decide" screen (design C, 2026-10-27): every quoted
// supplier side by side, one choice per line, with a running summary of what
// the selection costs and how it splits between suppliers. Purely
// presentational; JobWorkspace keeps the staged picks and saves them.

import { useMemo } from "react";
import { AlertCircle, Check, ChevronLeft, Download, Loader2, TriangleAlert, X } from "lucide-react";
import {
  formatRand, isSuspiciouslyLow, joinList, lowestOfRow, percentOver, pickInsights, pickLowestPatch, pickSummary, pickSupplierPatch,
  isInStockLead, priceCount, shortSupplierName, supplierStats, togglePickPatch, type PickPatch, type PickRow, type PriceCell,
} from "./compare-model";

export type PickSupplier = { quoteId: string; name: string };
export type PickLine = { id: string; partNumber: string; description: string; quantity: number; cells: PriceCell[]; pickedQuoteId: string | null };

type Props = {
  suppliers: PickSupplier[];
  lines: PickLine[];
  applying: boolean;
  error: string;
  onStage: (patch: PickPatch) => void;
  onApply: () => void;
  onCancel: () => void;
  onExportCsv: () => void;
  onExportExcel: () => void;
};

const lineQty = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3))));

export function QuotePickDialog(props: Props) {
  const { suppliers, lines } = props;
  const supplierIds = useMemo(() => suppliers.map((s) => s.quoteId), [suppliers]);
  const rows: PickRow[] = useMemo(() => lines.map((l) => ({ id: l.id, qty: l.quantity, cells: l.cells })), [lines]);
  const picks: Record<string, string | null> = useMemo(() => Object.fromEntries(lines.map((l) => [l.id, l.pickedQuoteId])), [lines]);
  const pickIndexes = useMemo(() => lines.map((l) => { const i = l.pickedQuoteId ? supplierIds.indexOf(l.pickedQuoteId) : -1; return i === -1 ? null : i; }), [lines, supplierIds]);
  const stats = useMemo(() => supplierStats(rows, suppliers.length), [rows, suppliers.length]);
  const summary = useMemo(() => pickSummary(rows, pickIndexes), [rows, pickIndexes]);
  const insights = useMemo(() => pickInsights(rows), [rows]);

  const maxAmount = summary.allocation.reduce((m, a) => Math.max(m, a.amount), 0);
  const unchosen = lines.length - summary.pickedLines;
  const partList = (idx: number[]) => joinList(idx.map((i) => lines[i].partNumber || "—"));

  return (
    <div className="qc-backdrop" role="dialog" aria-modal="true" aria-label="Compare prices">
      <div className="qc-dialog">
        <header className="qc-head">
          <button type="button" className="qc-back" onClick={props.onCancel} disabled={props.applying}><ChevronLeft size={14} /> Prices</button>
          <div className="qc-head-title">
            <h2>Compare prices</h2>
            <p>Pick the supplier to use on each line. Click a price to choose it, click it again to clear. Nothing is saved until you press Set preferred suppliers.</p>
          </div>
          <button type="button" className="qc-icon-btn" onClick={props.onCancel} aria-label="Close dialog" disabled={props.applying}><X size={18} /></button>
        </header>

        <div className="qc-body">
          <section className="qc-matrix" aria-label="Price comparison">
            <div className="qc-scroll">
              <div className="qc-mgrid qc-mhead" style={{ ["--qc-n" as string]: suppliers.length }}>
                <div className="qc-eyebrow">Part</div>
                {suppliers.map((s, si) => {
                  const pickedAll = stats[si].priced > 0 && lines.every((l) => l.cells[si]?.kind !== "price" || l.pickedQuoteId === s.quoteId);
                  return (
                    <div key={s.quoteId}>
                      <div className="qc-sup-name" title={s.name}>{shortSupplierName(s.name)}</div>
                      <div className="qc-sup-meta">
                        <strong>{formatRand(stats[si].total)}</strong>
                        <span>{stats[si].priced} of {lines.length} priced</span>
                      </div>
                      <button type="button" className="qc-pick-all" aria-pressed={pickedAll} disabled={stats[si].priced === 0} title={`Choose every price ${s.name} gave`} onClick={() => props.onStage(pickSupplierPatch(rows, si, supplierIds, picks))}>
                        {pickedAll ? "Clear all" : "Choose all"}
                      </button>
                    </div>
                  );
                })}
              </div>

              {lines.map((line) => {
                const low = lowestOfRow(line.cells);
                const contested = priceCount(line.cells) > 1;
                return (
                  <div key={line.id} className="qc-mgrid qc-mrow" style={{ ["--qc-n" as string]: suppliers.length }}>
                    <div>
                      <span className="qc-qty">×{lineQty(line.quantity)}</span>
                      <span className="qc-part"><strong>{line.partNumber || "—"}</strong>{line.description ? <span title={line.description}>{line.description}</span> : null}</span>
                    </div>
                    {suppliers.map((s, si) => {
                      const cell = line.cells[si];
                      if (!cell || cell.kind === "none") return <div key={s.quoteId}><span className="qc-state is-none">No quote</span></div>;
                      if (cell.kind === "na") return <div key={s.quoteId}><span className="qc-state is-na">N/A</span></div>;
                      const on = line.pickedQuoteId === s.quoteId;
                      const isLowest = contested && !!low && low.indexes.includes(si);
                      const flagged = isLowest && isSuspiciouslyLow(line.cells, si);
                      const over = low && !isLowest && contested ? percentOver(cell.unit, low.min) : null;
                      return (
                        <div key={s.quoteId}>
                          <button type="button" className={`qc-pick${on ? " is-on" : ""}`} aria-pressed={on} title={`${s.name}: ${formatRand(cell.unit)} × ${lineQty(line.quantity)} = ${formatRand(cell.unit * line.quantity)}${cell.lead ? ` · ${cell.lead}` : ""}`} onClick={() => props.onStage(togglePickPatch(line.pickedQuoteId, line.id, s.quoteId))}>
                            <span className="qc-radio" aria-hidden="true" />
                            <span className="qc-pick-body">
                              <span className="qc-pick-price">{formatRand(cell.unit)}</span>
                              {flagged ? (
                                <span className="qc-pick-sub is-check"><TriangleAlert size={11} strokeWidth={2.4} />Check</span>
                              ) : isLowest ? (
                                <span className="qc-pick-sub is-low"><Check size={11} strokeWidth={3} />Lowest</span>
                              ) : over !== null ? (
                                <span className="qc-pick-sub">+{over}%</span>
                              ) : null}
                              {cell.lead ? <span className={`qc-pick-lead${isInStockLead(cell.lead) ? " is-stock" : ""}`} title={`Availability: ${cell.lead}`}>{cell.lead}</span> : null}
                            </span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            <div className="qc-legend">
              <span><i className="qc-key" />Chosen for this line</span>
              <span className="is-low"><Check size={12} strokeWidth={3} />Lowest price on the line</span>
              <span className="is-check"><TriangleAlert size={12} strokeWidth={2.4} />Far below the other prices: worth confirming</span>
              <span>Percentages show how much more than the lowest. The line under a price is the supplier&apos;s availability, when given.</span>
            </div>
          </section>

          <aside className="qc-summary" aria-label="Your selection">
            <div className="qc-sum-block">
              <div className="qc-eyebrow">Your selection</div>
              <div className="qc-sum-total qc-num">{formatRand(summary.total)}</div>
              <div className="qc-sum-text">
                {summary.pickedLines === 0 ? (
                  <>No lines chosen yet. Click a price in the table, or use “Choose lowest on every line”.</>
                ) : (
                  <>
                    {summary.pickedLines} of {lines.length} {lines.length === 1 ? "line" : "lines"} from {summary.allocation.length} {summary.allocation.length === 1 ? "supplier" : "suppliers"}.
                    {summary.saving !== null && summary.baseline && summary.saving > 0 && (
                      <> That is <span className="is-good">{formatRand(summary.saving)}{summary.savingPercent !== null ? ` (${summary.savingPercent}%)` : ""} less</span> than buying everything from {shortSupplierName(suppliers[summary.baseline.index].name)}, the cheapest supplier that priced every line.</>
                    )}
                    {summary.saving !== null && summary.baseline && summary.saving <= 0 && (
                      <> That is no cheaper than buying everything from {shortSupplierName(suppliers[summary.baseline.index].name)}.</>
                    )}
                    {unchosen > 0 && <> {unchosen} still to choose.</>}
                  </>
                )}
              </div>
            </div>

            {summary.allocation.length > 0 && (
              <div className="qc-alloc">
                <div className="qc-eyebrow">Split by supplier</div>
                {summary.allocation.map((a) => (
                  <div key={a.index} className="qc-alloc-item">
                    <div className="qc-alloc-top"><span>{shortSupplierName(suppliers[a.index].name)}</span><span>{formatRand(a.amount)}</span></div>
                    <div className="qc-bar"><div style={{ width: `${maxAmount > 0 ? Math.round((a.amount / maxAmount) * 100) : 0}%` }} /></div>
                    <small>{a.lines} {a.lines === 1 ? "line" : "lines"}</small>
                  </div>
                ))}
              </div>
            )}

            <div className="qc-alloc">
              <div className="qc-eyebrow">Worth a second look</div>
              {insights.singleQuote.length > 0 && (
                <div className="qc-card"><strong>{insights.singleQuote.length} {insights.singleQuote.length === 1 ? "part has" : "parts have"} a single quote.</strong> Only one supplier priced {partList(insights.singleQuote)}.</div>
              )}
              {insights.lowToConfirm.length > 0 && (
                <div className="qc-card"><strong>{insights.lowToConfirm.length} very low {insights.lowToConfirm.length === 1 ? "price" : "prices"} to confirm.</strong> The lowest price on {partList(insights.lowToConfirm)} is far below the other quotes. Check the quote file before you choose it.</div>
              )}
              {insights.singleQuote.length === 0 && insights.lowToConfirm.length === 0 && (
                <div className="qc-card">Nothing unusual: every priced part has more than one quote and no price looks out of line.</div>
              )}
            </div>

            {props.error && <div className="qc-banner is-error" role="alert"><AlertCircle size={16} /><span>{props.error}</span></div>}

            <div className="qc-sum-actions">
              <button type="button" className="qc-btn" disabled={props.applying} onClick={() => props.onStage(pickLowestPatch(rows, supplierIds))}>Choose lowest on every line</button>
              <button type="button" className="qc-btn is-primary is-wide" disabled={props.applying} onClick={props.onApply}>
                {props.applying && <Loader2 className="spin" size={14} />} Set preferred suppliers
              </button>
              <small>Saves your choices and fills in each part&apos;s “ordered from” supplier.</small>
              <div className="qc-split">
                <button type="button" className="qc-btn" onClick={props.onExportCsv}><Download size={14} /> CSV</button>
                <button type="button" className="qc-btn" onClick={props.onExportExcel}><Download size={14} /> Excel</button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
