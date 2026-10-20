"use client";

import { useEffect, useState } from "react";
import { Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import type { PriceList, PriceModule, PriceProduct } from "@/lib/proposals/model";
import { NumInput } from "@/components/NumInput";

// 2026-10-21 — Platform Settings > Proposal price list. The standing prices and wording every new proposal starts from
// (Platform > Proposals). Changing it never alters proposals that already exist - each proposal keeps its own copy.
const STYLES = `
.ppl{display:grid;gap:14px}
.ppl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}
.ppl label.f{display:grid;gap:4px;font-size:.8rem;font-weight:600;color:#3f4b60;min-width:0}
.ppl input[type=text],.ppl input[type=number],.ppl textarea{width:100%;min-width:0;font:inherit;font-size:.9rem;padding:.4rem .55rem;border:1px solid #c6cdd8;border-radius:8px;background:#fff;color:#172033}
.ppl-prod{border:1px solid #e3e7ee;border-radius:10px;padding:12px;display:grid;gap:10px}
.ppl-mod{display:grid;grid-template-columns:minmax(120px,1.2fr) minmax(160px,2fr) 100px auto auto;gap:8px;align-items:center;border-top:1px solid #eef1f5;padding-top:8px}
.ppl-mod label.tick{display:flex;gap:6px;align-items:center;font-size:.78rem;white-space:nowrap}
@media (max-width:760px){.ppl-mod{grid-template-columns:1fr 1fr}}
`;

const uid = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function ProposalPriceListEditor({ canEdit }: { canEdit: boolean }) {
  const [list, setList] = useState<PriceList | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/platform/proposal-prices", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error?.message || "Unable to load the price list.");
        if (!cancelled) setList(body as PriceList);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load the price list."); });
    return () => { cancelled = true; };
  }, []);

  if (!list) return <section className="detail-panel"><header><div><h2>Proposal price list</h2></div></header>{error ? <div className="inline-error">{error}</div> : <div className="table-state">Loading the price list…</div>}</section>;

  const put = (patch: Partial<PriceList>) => { setList((current) => (current ? { ...current, ...patch } : current)); setNotice(""); };
  const setProduct = (pi: number, patch: Partial<PriceProduct>) => put({ products: list.products.map((p, i) => (i === pi ? { ...p, ...patch } : p)) });
  const setModule = (pi: number, mi: number, patch: Partial<PriceModule>) => setProduct(pi, { modules: list.products[pi].modules.map((m, j) => (j === mi ? { ...m, ...patch } : m)) });

  async function save() {
    if (!list) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/v1/platform/proposal-prices", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(list) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error?.message || "Unable to save the price list.");
      setList(body as PriceList);
      setNotice("Price list saved. New proposals start from these prices.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save the price list."); }
    finally { setSaving(false); }
  }

  async function reset() {
    if (!window.confirm("Put the built-in sample prices and wording back? Your current price list will be replaced. Existing proposals are not affected.")) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/v1/platform/proposal-prices", { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error?.message || "Unable to reset the price list.");
      setList(body as PriceList);
      setNotice("Sample prices restored.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to reset the price list."); }
    finally { setSaving(false); }
  }

  return (
    <section className="detail-panel">
      <style>{STYLES}</style>
      <header>
        <div><h2>Proposal price list</h2><p>The prices, set-up fees, letter and terms every new proposal starts from (Platform &gt; Proposals). Each proposal can still change its own prices; editing this list does not touch proposals already made.</p></div>
      </header>
      {error ? <div className="inline-error">{error}</div> : null}
      {notice ? <div className="inline-success">{notice}</div> : null}
      <fieldset disabled={!canEdit || saving} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <div className="ppl">
          <div className="ppl-grid">
            <label className="f"><span>Platform fee per month (R)</span><NumInput value={list.platformFee} step={5} onChange={(n) => put({ platformFee: n })} /></label>
            <label className="f"><span>Users included in platform fee</span><NumInput value={list.usersIncluded} onChange={(n) => put({ usersIncluded: Math.round(n) })} /></label>
            <label className="f"><span>Price per extra user per month (R)</span><NumInput value={list.userPrice} step={5} onChange={(n) => put({ userPrice: n })} /></label>
            <label className="f"><span>Data import, once-off (R)</span><NumInput value={list.importPrice} step={50} onChange={(n) => put({ importPrice: n })} /></label>
            <label className="f"><span>Training session, half-day (R)</span><NumInput value={list.trainingPrice} step={50} onChange={(n) => put({ trainingPrice: n })} /></label>
            <label className="f"><span>VAT rate (%)</span><NumInput value={list.vatPercent} onChange={(n) => put({ vatPercent: Math.min(100, n) })} /></label>
            <label className="f"><span>Quote valid for (days)</span><NumInput value={list.validDays} min={1} onChange={(n) => put({ validDays: Math.max(1, Math.round(n)) })} /></label>
            <label className="f"><span>Prepared by</span><input type="text" value={list.preparedBy} onChange={(e) => put({ preparedBy: e.target.value })} /></label>
            <label className="f"><span>Prepared by email</span><input type="text" value={list.preparedByEmail} onChange={(e) => put({ preparedByEmail: e.target.value })} /></label>
          </div>

          <label className="f"><span>Included with every plan (one per line)</span><textarea rows={5} value={list.included.join("\n")} onChange={(e) => put({ included: e.target.value.split("\n").map((l) => l.trim()).filter(Boolean) })} /></label>
          <label className="f"><span>Introduction letter ({"{client}"} and {"{contact}"} are filled in)</span><textarea rows={7} value={list.letter} onChange={(e) => put({ letter: e.target.value })} /></label>
          <label className="f"><span>Terms &amp; conditions</span><textarea rows={9} value={list.terms} onChange={(e) => put({ terms: e.target.value })} /></label>

          <h3 style={{ margin: "6px 0 0" }}>Products and modules</h3>
          {list.products.map((p, pi) => (
            <div key={p.id} className="ppl-prod">
              <div className="ppl-grid">
                <label className="f"><span>Product name</span><input type="text" value={p.name} onChange={(e) => setProduct(pi, { name: e.target.value })} /></label>
                <label className="f"><span>Short name</span><input type="text" value={p.short} onChange={(e) => setProduct(pi, { short: e.target.value })} /></label>
                <label className="f"><span>Once-off set-up fee (R)</span><NumInput value={p.setup} step={100} onChange={(n) => setProduct(pi, { setup: n })} /></label>
              </div>
              <label className="f"><span>Description</span><input type="text" value={p.blurb} onChange={(e) => setProduct(pi, { blurb: e.target.value })} /></label>
              {p.modules.map((m, mi) => (
                <div key={m.id} className="ppl-mod">
                  <input type="text" value={m.name} aria-label="Module name" onChange={(e) => setModule(pi, mi, { name: e.target.value })} />
                  <input type="text" value={m.description} aria-label="What it does" onChange={(e) => setModule(pi, mi, { description: e.target.value })} />
                  <NumInput value={m.price} step={10} title="Price per month (R)" onChange={(n) => setModule(pi, mi, { price: n })} />
                  <label className="tick"><input type="checkbox" checked={m.defaultOn} onChange={(e) => setModule(pi, mi, { defaultOn: e.target.checked })} /> Ticked by default</label>
                  <button type="button" className="table-action" onClick={() => setProduct(pi, { modules: p.modules.filter((_, j) => j !== mi) })}><Trash2 size={13} /> Remove</button>
                </div>
              ))}
              <div className="header-actions">
                <button type="button" className="quiet-button" onClick={() => setProduct(pi, { modules: [...p.modules, { id: uid("m"), name: "New module", description: "", price: 0, defaultOn: false }] })}><Plus size={14} /> Add module</button>
                <button type="button" className="quiet-button" onClick={() => { if (window.confirm(`Remove the product "${p.name}" from the price list?`)) put({ products: list.products.filter((_, i) => i !== pi) }); }}><Trash2 size={14} /> Remove product</button>
              </div>
            </div>
          ))}
          <div className="header-actions">
            <button type="button" className="quiet-button" onClick={() => put({ products: [...list.products, { id: uid("p"), name: "New product", short: "New", blurb: "", setup: 0, modules: [] }] })}><Plus size={14} /> Add product</button>
          </div>
        </div>
      </fieldset>
      {canEdit ? (
        <div className="header-actions" style={{ marginTop: 12 }}>
          <button type="button" className="gold-button" disabled={saving} onClick={() => void save()}><Save size={14} /> {saving ? "Saving…" : "Save price list"}</button>
          <button type="button" className="quiet-button" disabled={saving} onClick={() => void reset()}><RotateCcw size={14} /> Restore sample prices</button>
        </div>
      ) : <p className="muted small-line">You can view the price list but not change it.</p>}
    </section>
  );
}
