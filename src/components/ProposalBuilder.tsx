"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowLeft, Copy, Printer, Save } from "lucide-react";
import {
  PROPOSAL_STATUS_LABEL,
  calcProposal,
  formatMoney,
  type ProposalData,
  type ProposalModule,
  type ProposalProduct,
  type ProposalStatusValue,
} from "@/lib/proposals/model";
import { PROPOSAL_CSS, renderProposalHtml, renderProposalPrintPage } from "@/lib/proposals/render";
import { NumInput } from "@/components/NumInput";

// 2026-10-21 — Platform > Proposals > builder. Left: the form (client, products and modules with editable prices,
// platform/users/services, letter and terms). Right: the live proposal, drawn by the same renderer the print window
// uses (lib/proposals/render.ts), so what you see is what prints. Prices on the form belong to THIS proposal only; the
// standing price list is edited under Platform Settings.

const STYLES = `
.pbx-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px}
.pbx-top h2{margin:0;font-size:1.15rem}
.pbx-top .grow{flex:1}
.pbx-grid{display:grid;grid-template-columns:minmax(0,460px) minmax(0,1fr);gap:18px;align-items:start}
.pbx-form{display:grid;gap:14px;min-width:0}
.pbx-panel{background:#fff;border:1px solid #e3e7ee;border-radius:10px;padding:14px 16px;min-width:0}
.pbx-panel h3{margin:0 0 10px;font-size:.95rem;display:flex;align-items:center;gap:8px}
.pbx-panel h3 .n{width:22px;height:22px;border-radius:50%;background:#07111f;color:#d6a83b;display:inline-grid;place-items:center;font-size:.75rem}
.pbx-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}
.pbx-row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px}
.pbx-form label.f{display:grid;gap:4px;font-size:.8rem;font-weight:600;color:#3f4b60;min-width:0}
.pbx-form input[type=text],.pbx-form input[type=email],.pbx-form input[type=date],.pbx-form input[type=number],.pbx-form textarea{width:100%;min-width:0;font:inherit;font-size:.9rem;padding:.45rem .6rem;border:1px solid #c6cdd8;border-radius:8px;background:#fff;color:#172033}
.pbx-prod{border:1px solid #e3e7ee;border-radius:10px;margin-bottom:10px;overflow:hidden}
.pbx-prod.on{border-color:#155fca;box-shadow:0 0 0 1px #155fca}
.pbx-prod-h{display:flex;align-items:center;gap:10px;padding:9px 12px;background:#f3f5f9;cursor:pointer;font-weight:700;font-size:.9rem}
.pbx-prod.on .pbx-prod-h{background:#e6f0fd}
.pbx-prod-h small{color:#6b7689;font-weight:500}
.pbx-prod-b{padding:8px 12px 10px}
.pbx-line{display:grid;grid-template-columns:auto minmax(0,1fr) 104px;gap:8px;align-items:center;padding:5px 0;border-top:1px solid #eef1f5;font-size:.85rem}
.pbx-line .d{display:block;color:#6b7689;font-size:.74rem}
.pbx-line.plain{grid-template-columns:minmax(0,1fr) 120px}
.pbx-hint{font-size:.76rem;color:#6b7689;margin:6px 0 0}
.pbx-sum{background:#07111f;color:#fff;border-radius:10px;padding:14px 16px}
.pbx-sum h3{margin:0 0 8px;font-size:.95rem;color:#fff}
.pbx-sum .l{display:flex;justify-content:space-between;gap:10px;padding:3px 0;font-size:.88rem;border-top:1px solid rgba(255,255,255,.1)}
.pbx-sum .l b{color:#d6a83b}
.pbx-sum .l.big{font-size:1rem}
.pbx-preview{position:sticky;top:12px;min-width:0}
.pbx-sheet{background:#fff;border:1px solid #e3e7ee;border-radius:6px;box-shadow:0 10px 40px rgba(7,17,31,.12);padding:36px 40px;max-height:calc(100vh - 110px);overflow:auto}
.pbx-pill{display:inline-block;border-radius:999px;padding:2px 10px;font-size:.78rem;font-weight:700;background:#eef1f5;color:#3f4b60}
.pbx-pill.SENT{background:#e6f0fd;color:#155fca}.pbx-pill.ACCEPTED{background:#e3f4ec;color:#1f8a5b}.pbx-pill.DECLINED{background:#fbe9e7;color:#b3261e}
@media (max-width:1100px){.pbx-grid{grid-template-columns:minmax(0,1fr)}.pbx-preview{position:static}.pbx-sheet{max-height:none}}
@media (max-width:640px){.pbx-row,.pbx-row3{grid-template-columns:1fr}.pbx-sheet{padding:20px 16px}}
`;

export function ProposalBuilder({
  initial, proposalId, status, demoRequestId, demoLabel, canEdit,
}: {
  initial: ProposalData;
  proposalId?: string;
  status?: ProposalStatusValue;
  demoRequestId?: string | null;
  demoLabel?: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState<ProposalData>(initial);
  const [currentStatus, setCurrentStatus] = useState<ProposalStatusValue | undefined>(status);
  const [dirty, setDirty] = useState(!proposalId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const calc = useMemo(() => calcProposal(data), [data]);
  const html = useMemo(() => renderProposalHtml(data), [data]);

  function change(fn: (draft: ProposalData) => ProposalData) {
    setData((current) => fn(current));
    setDirty(true);
    setNotice("");
  }
  const setClient = (key: keyof ProposalData["client"], value: string) => change((d) => ({ ...d, client: { ...d.client, [key]: value } }));
  const setQuote = <K extends keyof ProposalData["quote"]>(key: K, value: ProposalData["quote"][K]) => change((d) => ({ ...d, quote: { ...d.quote, [key]: value } }));
  const setService = <K extends keyof ProposalData["services"]>(key: K, value: ProposalData["services"][K]) => change((d) => ({ ...d, services: { ...d.services, [key]: value } }));
  const setProduct = (index: number, patch: Partial<ProposalProduct>) => change((d) => ({ ...d, products: d.products.map((p, i) => (i === index ? { ...p, ...patch } : p)) }));
  const setModule = (pi: number, mi: number, patch: Partial<ProposalModule>) => change((d) => ({ ...d, products: d.products.map((p, i) => (i === pi ? { ...p, modules: p.modules.map((m, j) => (j === mi ? { ...m, ...patch } : m)) } : p)) }));

  async function save() {
    setError("");
    setNotice("");
    if (!data.client.company.trim()) { setError("Enter the client's company name before saving."); return; }
    setBusy(true);
    try {
      const response = await fetch(proposalId ? `/api/v1/platform/proposals/${proposalId}` : "/api/v1/platform/proposals", {
        method: proposalId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(proposalId ? data : { data, demoRequestId: demoRequestId ?? null }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error?.message || "Could not save this proposal.");
      setDirty(false);
      if (!proposalId) { router.replace(`/platform/proposals/${body.id}`); return; }
      setData(body.data);
      setNotice("Saved.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this proposal.");
    } finally {
      setBusy(false);
    }
  }

  async function moveTo(next: ProposalStatusValue) {
    if (!proposalId) return;
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/platform/proposals/${proposalId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error?.message || "Could not change the status.");
      setCurrentStatus(next);
      setNotice(`Marked as ${PROPOSAL_STATUS_LABEL[next].toLowerCase()}.`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change the status.");
    } finally {
      setBusy(false);
    }
  }

  function print() {
    const win = window.open("", "_blank");
    if (!win) { setError("The print window was blocked - allow pop-ups for this site and try again."); return; }
    win.document.write(renderProposalPrintPage(data));
    win.document.close();
  }

  async function copySummary() {
    const lines = [
      `Proposal ${data.quote.number} for ${data.client.company || "(client)"}`,
      ...calc.picks.map((p) => `- ${p.name} (${p.modules.length} modules)`),
      `Once-off incl. VAT: ${formatMoney(calc.onceTotals.total)}`,
      `Monthly incl. VAT: ${formatMoney(calc.monthlyTotals.total)}`,
    ];
    try { await navigator.clipboard.writeText(lines.join("\n")); setNotice("Summary copied."); } catch { setError("Copy is not available in this browser."); }
  }

  const s = data.services;
  const readOnly = !canEdit;

  return (
    <div>
      <style>{STYLES}</style>
      <style>{PROPOSAL_CSS}</style>
      <div className="pbx-top">
        <Link href="/platform/proposals" className="quiet-button"><ArrowLeft size={14} /> Proposals</Link>
        <h2>{proposalId ? data.quote.number : "New proposal"}</h2>
        {currentStatus ? <span className={`pbx-pill ${currentStatus}`}>{PROPOSAL_STATUS_LABEL[currentStatus]}</span> : <span className="pbx-pill">Not saved yet</span>}
        {demoLabel ? <span className="muted small-line">From demo request: {demoLabel}</span> : null}
        <span className="grow" />
        {dirty && canEdit ? <span className="muted small-line">Unsaved changes</span> : null}
        <button type="button" className="quiet-button" onClick={() => void copySummary()}><Copy size={14} /> Copy summary</button>
        <button type="button" className="quiet-button" onClick={print}><Printer size={14} /> Print / Save as PDF</button>
        {canEdit ? <button type="button" className="gold-button" disabled={busy} onClick={() => void save()}><Save size={14} /> {proposalId ? "Save changes" : "Save proposal"}</button> : null}
      </div>
      {error ? <div className="inline-error">{error}</div> : null}
      {notice ? <div className="inline-success">{notice}</div> : null}
      {proposalId && canEdit ? (
        <div className="pbx-top" aria-label="Status">
          <span className="muted small-line">Status:</span>
          {currentStatus !== "SENT" && <button type="button" className="quiet-button" disabled={busy} onClick={() => void moveTo("SENT")}>Mark as sent</button>}
          {currentStatus !== "ACCEPTED" && <button type="button" className="quiet-button" disabled={busy} onClick={() => void moveTo("ACCEPTED")}>Mark as accepted</button>}
          {currentStatus !== "DECLINED" && <button type="button" className="quiet-button" disabled={busy} onClick={() => void moveTo("DECLINED")}>Mark as declined</button>}
          {currentStatus !== "DRAFT" && <button type="button" className="quiet-button" disabled={busy} onClick={() => void moveTo("DRAFT")}>Back to draft</button>}
        </div>
      ) : null}

      <div className="pbx-grid">
        <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <div className="pbx-form">
            <div className="pbx-panel">
              <h3><span className="n">1</span> Client &amp; quote details</h3>
              <div className="pbx-row">
                <label className="f"><span>Client company</span><input type="text" value={data.client.company} onChange={(e) => setClient("company", e.target.value)} /></label>
                <label className="f"><span>Contact person</span><input type="text" value={data.client.contact} onChange={(e) => setClient("contact", e.target.value)} /></label>
              </div>
              <div className="pbx-row">
                <label className="f"><span>Email</span><input type="email" value={data.client.email} onChange={(e) => setClient("email", e.target.value)} /></label>
                <label className="f"><span>Phone</span><input type="text" value={data.client.phone} onChange={(e) => setClient("phone", e.target.value)} /></label>
              </div>
              <div className="pbx-row" style={{ gridTemplateColumns: "1fr" }}>
                <label className="f"><span>Address</span><input type="text" value={data.client.address} onChange={(e) => setClient("address", e.target.value)} /></label>
              </div>
              <div className="pbx-row3">
                <label className="f"><span>Quote no.</span><input type="text" value={data.quote.number} onChange={(e) => setQuote("number", e.target.value)} /></label>
                <label className="f"><span>Date</span><input type="date" value={data.quote.date} onChange={(e) => setQuote("date", e.target.value)} /></label>
                <label className="f"><span>Valid (days)</span><NumInput value={data.quote.validDays} min={1} onChange={(n) => setQuote("validDays", Math.max(1, Math.round(n)))} /></label>
              </div>
              <div className="pbx-row">
                <label className="f"><span>Prepared by</span><input type="text" value={data.quote.preparedBy} onChange={(e) => setQuote("preparedBy", e.target.value)} /></label>
                <label className="f"><span>Prepared by email</span><input type="text" value={data.quote.preparedByEmail} onChange={(e) => setQuote("preparedByEmail", e.target.value)} /></label>
              </div>
            </div>

            <div className="pbx-panel">
              <h3><span className="n">2</span> Products &amp; modules</h3>
              {data.products.map((p, pi) => (
                <div key={p.id} className={p.included ? "pbx-prod on" : "pbx-prod"}>
                  <label className="pbx-prod-h">
                    <input type="checkbox" checked={p.included} onChange={(e) => setProduct(pi, { included: e.target.checked })} />
                    <span>{p.name}</span>
                  </label>
                  {p.included ? (
                    <div className="pbx-prod-b">
                      <div className="pbx-line plain"><span>Once-off set-up fee (R)</span><NumInput value={p.setup} step={100} onChange={(n) => setProduct(pi, { setup: n })} /></div>
                      {p.modules.map((m, mi) => (
                        <div key={m.id} className="pbx-line">
                          <input type="checkbox" checked={m.included} onChange={(e) => setModule(pi, mi, { included: e.target.checked })} aria-label={`Include ${m.name}`} />
                          <div><b>{m.name}</b><span className="d">{m.description}</span></div>
                          <NumInput value={m.price} step={10} title="Price per month" onChange={(n) => setModule(pi, mi, { price: n })} />
                        </div>
                      ))}
                      <p className="pbx-hint">Module prices are per month, excl. VAT.</p>
                    </div>
                  ) : null}
                </div>
              ))}
              {data.products.length === 0 ? <p className="pbx-hint">There are no products in the price list yet. Add them under Platform Settings.</p> : null}
            </div>

            <div className="pbx-panel">
              <h3><span className="n">3</span> Platform, users &amp; services</h3>
              <div className="pbx-line plain"><label><input type="checkbox" checked={s.platformFeeOn} onChange={(e) => setService("platformFeeOn", e.target.checked)} /> Platform fee, per month (hosting, backups, support)</label><NumInput value={s.platformFee} step={5} onChange={(n) => setService("platformFee", n)} /></div>
              <div className="pbx-line plain"><span>Users needed</span><NumInput value={s.users} min={1} onChange={(n) => setService("users", Math.max(1, Math.round(n)))} /></div>
              <div className="pbx-line plain"><span>Users included in platform fee</span><NumInput value={s.usersIncluded} onChange={(n) => setService("usersIncluded", Math.round(n))} /></div>
              <div className="pbx-line plain"><span>Price per extra user, per month</span><NumInput value={s.userPrice} step={5} onChange={(n) => setService("userPrice", n)} /></div>
              <div className="pbx-line plain"><label><input type="checkbox" checked={s.importOn} onChange={(e) => setService("importOn", e.target.checked)} /> Data import (customers, suppliers, parts), once-off</label><NumInput value={s.importPrice} step={50} onChange={(n) => setService("importPrice", n)} /></div>
              <div className="pbx-line plain"><label><input type="checkbox" checked={s.trainingOn} onChange={(e) => setService("trainingOn", e.target.checked)} /> Training sessions (half-day) - quantity</label><NumInput value={s.trainingQty} onChange={(n) => setService("trainingQty", Math.round(n))} /></div>
              <div className="pbx-line plain"><span>Price per training session</span><NumInput value={s.trainingPrice} step={50} onChange={(n) => setService("trainingPrice", n)} /></div>
              <div className="pbx-line plain"><span>Discount on once-off fees (%)</span><NumInput value={s.discountOnceOff} onChange={(n) => setService("discountOnceOff", Math.min(100, n))} /></div>
              <div className="pbx-line plain"><span>Discount on monthly fees (%)</span><NumInput value={s.discountMonthly} onChange={(n) => setService("discountMonthly", Math.min(100, n))} /></div>
              <div className="pbx-line plain"><span>VAT rate (%)</span><NumInput value={s.vatPercent} onChange={(n) => setService("vatPercent", Math.min(100, n))} /></div>
            </div>

            <div className="pbx-panel">
              <h3><span className="n">4</span> Letter &amp; terms</h3>
              <label className="f" style={{ marginBottom: 10 }}><span>Introduction letter ({"{client}"} and {"{contact}"} are filled in)</span><textarea rows={7} value={data.letter} onChange={(e) => change((d) => ({ ...d, letter: e.target.value }))} /></label>
              <label className="f" style={{ marginBottom: 10 }}><span>Included with every plan (one per line)</span><textarea rows={6} value={data.included.join("\n")} onChange={(e) => change((d) => ({ ...d, included: e.target.value.split("\n").map((l) => l.trim()).filter(Boolean) }))} /></label>
              <label className="f"><span>Terms &amp; conditions</span><textarea rows={9} value={data.terms} onChange={(e) => change((d) => ({ ...d, terms: e.target.value }))} /></label>
            </div>

            <div className="pbx-sum" aria-live="polite">
              <h3>Quote summary</h3>
              <div className="l"><span>Products</span><b>{calc.picks.length}</b></div>
              <div className="l"><span>Modules</span><b>{calc.picks.reduce((n, p) => n + p.modules.length, 0)}</b></div>
              <div className="l"><span>Once-off (excl. VAT)</span><b>{formatMoney(calc.onceTotals.net)}</b></div>
              <div className="l"><span>Monthly (excl. VAT)</span><b>{formatMoney(calc.monthlyTotals.net)}</b></div>
              <div className="l"><span>Once-off (incl. VAT)</span><b>{formatMoney(calc.onceTotals.total)}</b></div>
              <div className="l"><span>Monthly (incl. VAT)</span><b>{formatMoney(calc.monthlyTotals.total)}</b></div>
            </div>
          </div>
        </fieldset>

        <section className="pbx-preview" aria-label="Proposal preview">
          <p className="pbx-hint" style={{ marginTop: 0, marginBottom: 8 }}>Live preview - this is what the client receives.</p>
          {/* The html comes from renderProposalHtml, which escapes every typed value. */}
          <div className="pbx-sheet" dangerouslySetInnerHTML={{ __html: html }} />
        </section>
      </div>
    </div>
  );
}
