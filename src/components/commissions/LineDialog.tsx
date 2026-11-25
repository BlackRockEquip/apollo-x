"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { lineInvoiced, lineMonth, lineProfit, money } from "@/lib/commissions/calc";
import { commissionsApi, formatMoney, monthLabel, parseMoney, type JobHit, type LineView, type RepView } from "./types";

type InvoiceDraft = { invoiceNumber: string; invoicedOn: string; amount: string; clientPaidOn: string };
type CostDraft = { description: string; amount: string };

const blankInvoice = (): InvoiceDraft => ({ invoiceNumber: "", invoicedOn: "", amount: "", clientPaidOn: "" });
const blankCost = (): CostDraft => ({ description: "", amount: "" });
const moneyText = (value: number) => (value ? String(value) : "");

// Add or change one invoiced job for a sales rep (2026-11-25). Costs are separate lines (instead of =15990+110000+... in the
// spreadsheet); every invoice needs the date it was invoiced, because that decides which month's target the profit counts towards.
export function LineDialog({ reps, line, defaultRepId, onClose, onSaved }: { reps: RepView[]; line: LineView | null; defaultRepId: string; onClose: () => void; onSaved: () => void }) {
  const usableReps = reps.filter((rep) => rep.setting && (rep.active || rep.id === line?.salesRepresentativeId));
  const [repId, setRepId] = useState(line?.salesRepresentativeId ?? (usableReps.some((r) => r.id === defaultRepId) ? defaultRepId : usableReps[0]?.id ?? ""));
  const [jobId, setJobId] = useState<string | null>(line?.jobId ?? null);
  const [jobReference, setJobReference] = useState(line?.jobReference ?? "");
  const [hits, setHits] = useState<JobHit[]>([]);
  const [description, setDescription] = useState(line?.description ?? "");
  const [invoices, setInvoices] = useState<InvoiceDraft[]>(line ? line.invoices.map((inv) => ({ invoiceNumber: inv.invoiceNumber, invoicedOn: inv.invoicedOn, amount: moneyText(inv.amountExVat), clientPaidOn: inv.clientPaidOn ?? "" })) : [blankInvoice()]);
  const [costs, setCosts] = useState<CostDraft[]>(line && line.costs.length > 0 ? line.costs.map((c) => ({ description: c.description, amount: moneyText(c.amount) })) : [blankCost()]);
  const [fuelCharge, setFuelCharge] = useState(line ? moneyText(line.fuelCharge) : "");
  const [otherExpenses, setOtherExpenses] = useState(line ? moneyText(line.otherExpenses) : "");
  const [otherNote, setOtherNote] = useState(line?.otherExpensesNote ?? "");
  const [ratePercent, setRatePercent] = useState(line?.rateOverride !== null && line?.rateOverride !== undefined ? String(Math.round(line.rateOverride * 10000) / 100) : "");
  const [noCommission, setNoCommission] = useState(line?.noCommission ?? false);
  const [notes, setNotes] = useState(line?.notes ?? "");
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const rep = reps.find((r) => r.id === repId) ?? null;
  const hasTarget = Boolean(rep?.setting && rep.setting.monthlyTarget > 0);

  useEffect(() => {
    if (jobId || jobReference.trim().length < 2) return;
    const timer = setTimeout(async () => {
      try { setHits((await commissionsApi<{ items: JobHit[] }>(`/api/v1/commissions/jobs?q=${encodeURIComponent(jobReference.trim())}`)).items); } catch { setHits([]); }
    }, 250);
    return () => clearTimeout(timer);
  }, [jobReference, jobId]);
  const shownHits = jobId || jobReference.trim().length < 2 ? [] : hits;

  function pickJob(hit: JobHit) {
    setJobId(hit.id);
    setJobReference(hit.jobNumber);
    if (!description.trim()) setDescription(hit.description || hit.machine);
    if (hit.salesRepresentativeId && usableReps.some((r) => r.id === hit.salesRepresentativeId)) setRepId(hit.salesRepresentativeId);
    setHits([]);
  }

  const calcLine = useMemo(() => ({
    id: "draft",
    invoices: invoices.map((inv) => ({ amount: parseMoney(inv.amount), invoicedOn: inv.invoicedOn, clientPaidOn: inv.clientPaidOn || null })),
    costs: money(costs.reduce((sum, c) => sum + parseMoney(c.amount), 0)),
    fuelCharge: parseMoney(fuelCharge),
    otherExpenses: parseMoney(otherExpenses),
    rateOverride: ratePercent.trim() ? Number(ratePercent) / 100 : null,
    noCommission,
  }), [invoices, costs, fuelCharge, otherExpenses, ratePercent, noCommission]);
  const profit = lineProfit(calcLine);
  const month = lineMonth(invoices.filter((inv) => inv.invoicedOn));
  const rate = calcLine.rateOverride ?? rep?.setting?.rate ?? 0;
  const lineCommission = noCommission ? 0 : money(Math.max(0, profit) * rate);

  const problems: string[] = [];
  if (!repId) problems.push("Pick the sales rep.");
  if (!jobReference.trim()) problems.push("Enter the job number.");
  if (invoices.length === 0) problems.push("Add at least one invoice.");
  if (invoices.some((inv) => !inv.invoiceNumber.trim())) problems.push("Every invoice needs its invoice number.");
  if (invoices.some((inv) => !inv.invoicedOn)) problems.push("Every invoice needs the date it was invoiced.");
  if (ratePercent.trim() && !(Number(ratePercent) >= 0 && Number(ratePercent) <= 100)) problems.push("The rate must be between 0 and 100%.");

  async function save() {
    setTried(true);
    if (problems.length > 0) return;
    setSaving(true); setError("");
    const body = {
      salesRepresentativeId: repId,
      jobId,
      jobReference: jobReference.trim(),
      description,
      fuelCharge: parseMoney(fuelCharge),
      otherExpenses: parseMoney(otherExpenses),
      otherExpensesNote: otherNote,
      rateOverridePercent: !hasTarget && ratePercent.trim() ? Number(ratePercent) : null,
      noCommission: !hasTarget && noCommission,
      notes,
      invoices: invoices.map((inv) => ({ invoiceNumber: inv.invoiceNumber.trim(), invoicedOn: inv.invoicedOn, amountExVat: parseMoney(inv.amount), clientPaidOn: inv.clientPaidOn || null })),
      costs: costs.filter((c) => c.description.trim() || parseMoney(c.amount) !== 0).map((c) => ({ description: c.description, amount: parseMoney(c.amount) })),
    };
    try {
      await commissionsApi(line ? `/api/v1/commissions/lines/${line.id}` : "/api/v1/commissions/lines", { method: line ? "PUT" : "POST", body });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
      setSaving(false);
    }
  }

  const setInvoice = (index: number, patch: Partial<InvoiceDraft>) => setInvoices((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const setCost = (index: number, patch: Partial<CostDraft>) => setCosts((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <div className="drawer-backdrop" role="dialog" aria-modal="true" aria-label={line ? "Edit invoiced job" : "Add invoiced job"}>
      <div className="form-drawer compact-dialog" style={{ maxWidth: 860, width: "min(860px, 96vw)" }}>
        <div className="cm-dialog">
          <div className="cm-row"><h2>{line ? `Edit ${line.jobReference}` : "Add invoiced job"}</h2><button type="button" className="cm-icon" aria-label="Close" onClick={onClose}><X size={15} /></button></div>
          {error && <div className="inline-error" style={{ borderRadius: 7 }}>{error}</div>}
          {usableReps.length === 0 && <div className="cm-banner">No sales rep has a commission rate yet. Set one on the Rep settings tab first.</div>}

          <div className="cm-grid3">
            <label className="cm-field"><span>Sales rep *</span>
              <select value={repId} onChange={(e) => setRepId(e.target.value)}>{usableReps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
            </label>
            <div className="cm-field">
              <label htmlFor="cm-job">Job number *</label>
              <input id="cm-job" value={jobReference} onChange={(e) => { setJobReference(e.target.value); setJobId(null); }} placeholder="e.g. BRE1178 - type to find the job" autoComplete="off" />
              {jobId && <span className="cm-sub">Linked to the job in Apollo X</span>}
              {shownHits.length > 0 && <div className="cm-hits">{shownHits.map((h) => <button type="button" key={h.id} className="cm-hit" onClick={() => pickJob(h)}><span><strong>{h.jobNumber}</strong> <small>{[h.description || h.machine, h.customerName].filter(Boolean).join(" · ")}</small></span></button>)}</div>}
            </div>
            <label className="cm-field"><span>Description</span><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. D9T Cylinder" /></label>
          </div>

          <section>
            <h3>Invoices</h3>
            <table className="cm-lines-edit">
              <thead><tr><th style={{ width: "20%" }}>Invoice no. *</th><th style={{ width: "22%" }}>Date invoiced *</th><th style={{ width: "22%" }}>Amount ex VAT</th><th style={{ width: "22%" }}>Client final paid</th><th /></tr></thead>
              <tbody>
                {invoices.map((inv, i) => (
                  <tr key={i}>
                    <td><input aria-label="Invoice number" className={tried && !inv.invoiceNumber.trim() ? "missing" : ""} value={inv.invoiceNumber} onChange={(e) => setInvoice(i, { invoiceNumber: e.target.value })} /></td>
                    <td><input aria-label="Date invoiced" type="date" className={tried && !inv.invoicedOn ? "missing" : ""} value={inv.invoicedOn} onChange={(e) => setInvoice(i, { invoicedOn: e.target.value })} /></td>
                    <td><input aria-label="Amount ex VAT" className="right" inputMode="decimal" placeholder="0.00" value={inv.amount} onChange={(e) => setInvoice(i, { amount: e.target.value })} /></td>
                    <td><input aria-label="Client final paid" type="date" value={inv.clientPaidOn} onChange={(e) => setInvoice(i, { clientPaidOn: e.target.value })} /></td>
                    <td>{invoices.length > 1 && <button type="button" className="cm-icon danger" aria-label="Remove invoice" onClick={() => setInvoices((rows) => rows.filter((_, j) => j !== i))}><Trash2 size={13} /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="cm-row" style={{ justifyContent: "space-between" }}>
              <button type="button" className="cm-link" onClick={() => setInvoices((rows) => [...rows, blankInvoice()])}><Plus size={13} /> Add invoice</button>
              <span className="cm-sub">Total invoiced {formatMoney(lineInvoiced(calcLine))}. Leave the paid date blank until the client pays.</span>
            </div>
          </section>

          <section>
            <h3>Costs</h3>
            <table className="cm-lines-edit">
              <thead><tr><th>Supplier / reference</th><th style={{ width: "26%" }}>Amount ex VAT</th><th /></tr></thead>
              <tbody>
                {costs.map((cost, i) => (
                  <tr key={i}>
                    <td><input aria-label="Cost description" value={cost.description} onChange={(e) => setCost(i, { description: e.target.value })} placeholder="e.g. supplier name and invoice no." /></td>
                    <td><input aria-label="Cost amount" className="right" inputMode="decimal" placeholder="0.00" value={cost.amount} onChange={(e) => setCost(i, { amount: e.target.value })} /></td>
                    <td>{costs.length > 1 && <button type="button" className="cm-icon danger" aria-label="Remove cost" onClick={() => setCosts((rows) => rows.filter((_, j) => j !== i))}><Trash2 size={13} /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="cm-row" style={{ justifyContent: "space-between" }}>
              <button type="button" className="cm-link" onClick={() => setCosts((rows) => [...rows, blankCost()])}><Plus size={13} /> Add cost</button>
              <span className="cm-sub">Total costs {formatMoney(calcLine.costs)}</span>
            </div>
          </section>

          <div className="cm-grid3">
            <label className="cm-field"><span>Fuel charge (other than self)</span><div className="cm-money"><span>R</span><input inputMode="decimal" placeholder="0.00" value={fuelCharge} onChange={(e) => setFuelCharge(e.target.value)} /></div></label>
            <label className="cm-field"><span>Other expenses</span><div className="cm-money"><span>R</span><input inputMode="decimal" placeholder="0.00" value={otherExpenses} onChange={(e) => setOtherExpenses(e.target.value)} /></div></label>
            <label className="cm-field"><span>What the other expenses are</span><input value={otherNote} onChange={(e) => setOtherNote(e.target.value)} placeholder="e.g. third-party commission, credit" /></label>
          </div>
          <div className="cm-sub" style={{ marginTop: -8 }}>The monthly target is not typed in here: the tracker takes it off by itself, in invoice-date order, so it can never come off twice in a month.</div>

          {!hasTarget && rep?.setting && (
            <div className="cm-grid3">
              <label className="cm-field"><span>Rate for this job (leave blank for {Math.round(rep.setting.rate * 10000) / 100}%)</span><input inputMode="decimal" value={ratePercent} onChange={(e) => setRatePercent(e.target.value)} placeholder={`${Math.round(rep.setting.rate * 10000) / 100}`} /></label>
              <label className="cm-check" style={{ alignSelf: "end", minHeight: 36 }}><input type="checkbox" checked={noCommission} onChange={(e) => setNoCommission(e.target.checked)} /> No commission on this job</label>
            </div>
          )}

          <label className="cm-field"><span>Notes</span><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>

          <div className="cm-preview" aria-live="polite">
            <div><span>Invoiced ex VAT</span><span>{formatMoney(lineInvoiced(calcLine))}</span></div>
            <div><span>− Costs</span><span>{formatMoney(calcLine.costs)}</span></div>
            <div><span>− Fuel charge and other expenses</span><span>{formatMoney(calcLine.fuelCharge + calcLine.otherExpenses)}</span></div>
            <div className="strong"><span>Profit</span><span>{formatMoney(profit)}</span></div>
            {hasTarget
              ? <div><span>Counts towards</span><span>{month ? `${rep!.name}'s ${monthLabel(month, true)} target` : "the month of the first invoice date"}</span></div>
              : <div><span>Commission on this job ({noCommission ? "none" : `${Math.round(rate * 10000) / 100}%`})</span><span>{formatMoney(lineCommission)}</span></div>}
          </div>

          {tried && problems.length > 0 && <div className="inline-error" style={{ borderRadius: 7 }}>{problems.join(" ")}</div>}
          <div className="cm-foot">
            <button type="button" className="quiet-button" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="button" className="gold-button" onClick={() => void save()} disabled={saving || usableReps.length === 0}>{saving ? "Saving…" : line ? "Save changes" : "Add job"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
