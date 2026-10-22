"use client";

import { useEffect, useState } from "react";
import { Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import type { PriceList, PriceModule, PriceProduct } from "@/lib/proposals/model";
import { NumInput } from "@/components/NumInput";

// 2026-10-21 — the proposal price list: the standing prices and wording every new proposal starts from (Platform > Proposals).
// Changing it never alters proposals that already exist - each proposal keeps its own copy.
// 2026-10-22, user request: moved off Platform Settings to its own "Setup" page under Proposals, "properly laid out". The page is now
// four clearly labelled sections - Pricing, Wording, Products and modules - with the Save / Restore buttons at the top and the
// bottom, an "unsaved changes" marker, and the modules in a table with column headings instead of a row of unlabelled boxes.
const STYLES = `
.ppl{display:grid;gap:16px}
.ppl-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;border:1px solid var(--ink-150);border-radius:9px;background:#fff;padding:10px 14px}
.ppl-bar .state{font-size:12px;color:var(--ink-500)}
.ppl-bar .state.dirty{color:var(--gold-600);font-weight:700}
.ppl-bar .actions{display:flex;gap:8px;flex-wrap:wrap}
.ppl-body{padding:14px 16px 16px;display:grid;gap:16px}
.ppl-groups{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:14px}
.ppl-group{border:1px solid var(--ink-150);border-radius:9px;padding:12px 13px;display:grid;gap:10px;align-content:start;background:#fbfcfd}
.ppl-group h3{margin:0;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-500)}
.ppl label.f{display:grid;gap:4px;font-size:12px;font-weight:700;color:var(--ink-700);min-width:0}
.ppl label.f small{font-weight:400;color:var(--ink-500);font-size:11px}
.ppl input[type=text],.ppl input[type=number],.ppl textarea{width:100%;min-width:0;box-sizing:border-box;font:inherit;font-size:13px;font-weight:400;padding:7px 9px;border:1px solid var(--ink-300);border-radius:7px;background:#fff;color:var(--ink-900)}
.ppl input:focus,.ppl textarea:focus{outline:none;border-color:var(--gold-500);box-shadow:0 0 0 3px #fbf2d7}
.ppl textarea{resize:vertical;line-height:1.45}
.ppl .unit{position:relative;display:block}
.ppl .unit>i{position:absolute;left:9px;top:50%;transform:translateY(-50%);font-style:normal;font-size:12px;color:var(--ink-500);pointer-events:none}
.ppl .unit.pre input{padding-left:24px}
.ppl .unit.post input{padding-right:48px}
.ppl .unit.post>i{left:auto;right:10px}
.ppl-wording{display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:14px}
.ppl-wording .wide{grid-column:1/-1}
.ppl-prod{border:1px solid var(--ink-150);border-radius:9px;overflow:hidden;background:#fff}
.ppl-prod>header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;background:#f6f8fa;border-bottom:1px solid var(--ink-150)}
.ppl-prod>header strong{font-size:13px}
.ppl-prod>header span{font-size:11px;color:var(--ink-500);margin-left:8px;font-weight:400}
.ppl-prod .fields{display:grid;grid-template-columns:minmax(220px,2fr) minmax(120px,1fr) minmax(140px,1fr);gap:12px;padding:12px 14px 4px}
.ppl-prod .fields .wide{grid-column:1/-1}
.ppl-prod .mods{padding:8px 14px 12px}
.ppl-mods{width:100%;border-collapse:collapse;table-layout:fixed;font-size:13px}
.ppl-mods th{text-align:left;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-500);padding:6px 6px;border-bottom:1px solid var(--ink-150);font-weight:700}
.ppl-mods td{padding:6px;vertical-align:middle;border-bottom:1px solid var(--ink-100)}
.ppl-mods .c{text-align:center}
.ppl-mods input[type=checkbox]{width:auto}
.ppl-empty{padding:10px 6px;color:var(--ink-500);font-size:12px}
.ppl-prodactions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
@media (max-width:820px){.ppl-prod .fields{grid-template-columns:1fr}.ppl-wording{grid-template-columns:1fr}.ppl-mods{table-layout:auto;min-width:640px}.ppl-prod .mods{overflow-x:auto}}
`;

const uid = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function ProposalPriceListEditor({ canEdit }: { canEdit: boolean }) {
  const [list, setList] = useState<PriceList | null>(null);
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/platform/proposal-prices", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error?.message || "Unable to load the price list.");
        if (!cancelled) { setList(body as PriceList); setSaved(JSON.stringify(body)); }
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load the price list."); });
    return () => { cancelled = true; };
  }, []);

  if (!list) return <section className="detail-panel"><header><div><h2>Proposal setup</h2></div></header>{error ? <div className="inline-error">{error}</div> : <div className="table-state">Loading the price list…</div>}</section>;

  const dirty = JSON.stringify(list) !== saved;
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
      setList(body as PriceList); setSaved(JSON.stringify(body));
      setNotice("Saved. New proposals start from these prices and wording.");
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
      setList(body as PriceList); setSaved(JSON.stringify(body));
      setNotice("Sample prices restored.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to reset the price list."); }
    finally { setSaving(false); }
  }

  const actions = canEdit ? (
    <div className="actions">
      <button type="button" className="quiet-button" disabled={saving} onClick={() => void reset()}><RotateCcw size={14} /> Restore sample prices</button>
      <button type="button" className="gold-button" disabled={saving || !dirty} onClick={() => void save()}><Save size={14} /> {saving ? "Saving…" : "Save changes"}</button>
    </div>
  ) : null;

  return (
    <div className="ppl">
      <style>{STYLES}</style>
      <div className="ppl-bar">
        <span className={dirty ? "state dirty" : "state"}>{canEdit ? (dirty ? "You have unsaved changes." : "All changes saved.") : "You can view the price list but not change it."}</span>
        {actions}
      </div>
      {error ? <div className="inline-error">{error}</div> : null}
      {notice ? <div className="inline-success">{notice}</div> : null}

      <fieldset disabled={!canEdit || saving} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: "grid", gap: 16 }}>
        <section className="detail-panel">
          <header><div><h2>Pricing</h2><p>The fees and quote details a new proposal starts with. Every proposal can still change its own prices.</p></div></header>
          <div className="ppl-body">
            <div className="ppl-groups">
              <div className="ppl-group">
                <h3>Monthly fees</h3>
                <label className="f"><span>Platform fee per month</span><span className="unit pre"><i>R</i><NumInput value={list.platformFee} step={5} onChange={(n) => put({ platformFee: n })} /></span></label>
                <label className="f"><span>Users included in the platform fee</span><NumInput value={list.usersIncluded} onChange={(n) => put({ usersIncluded: Math.round(n) })} /></label>
                <label className="f"><span>Each extra user, per month</span><span className="unit pre"><i>R</i><NumInput value={list.userPrice} step={5} onChange={(n) => put({ userPrice: n })} /></span></label>
              </div>
              <div className="ppl-group">
                <h3>Once-off fees</h3>
                <label className="f"><span>Data import</span><span className="unit pre"><i>R</i><NumInput value={list.importPrice} step={50} onChange={(n) => put({ importPrice: n })} /></span></label>
                <label className="f"><span>Training session (half-day)</span><span className="unit pre"><i>R</i><NumInput value={list.trainingPrice} step={50} onChange={(n) => put({ trainingPrice: n })} /></span></label>
              </div>
              <div className="ppl-group">
                <h3>Quote</h3>
                <label className="f"><span>VAT rate</span><span className="unit post"><i>%</i><NumInput value={list.vatPercent} onChange={(n) => put({ vatPercent: Math.min(100, n) })} /></span></label>
                <label className="f"><span>Quote valid for</span><span className="unit post"><i>days</i><NumInput value={list.validDays} min={1} onChange={(n) => put({ validDays: Math.max(1, Math.round(n)) })} /></span></label>
              </div>
              <div className="ppl-group">
                <h3>Prepared by</h3>
                <label className="f"><span>Name</span><input type="text" value={list.preparedBy} onChange={(e) => put({ preparedBy: e.target.value })} /></label>
                <label className="f"><span>Email</span><input type="text" value={list.preparedByEmail} onChange={(e) => put({ preparedByEmail: e.target.value })} /></label>
              </div>
            </div>
          </div>
        </section>

        <section className="detail-panel">
          <header><div><h2>Wording</h2><p>The text on every new proposal.</p></div></header>
          <div className="ppl-body">
            <div className="ppl-wording">
              <label className="f wide"><span>Included with every plan <small>one item per line</small></span><textarea rows={5} value={list.included.join("\n")} onChange={(e) => put({ included: e.target.value.split("\n").map((l) => l.trim()).filter(Boolean) })} /></label>
              <label className="f"><span>Introduction letter <small>{"{client}"} and {"{contact}"} are filled in for each proposal</small></span><textarea rows={12} value={list.letter} onChange={(e) => put({ letter: e.target.value })} /></label>
              <label className="f"><span>Terms &amp; conditions</span><textarea rows={12} value={list.terms} onChange={(e) => put({ terms: e.target.value })} /></label>
            </div>
          </div>
        </section>

        <section className="detail-panel">
          <header><div><h2>Products and modules</h2><p>What can be quoted. Ticked modules start switched on in a new proposal; the first product starts included.</p></div></header>
          <div className="ppl-body">
            {list.products.length === 0 ? <div className="ppl-empty">No products yet. Add one below.</div> : null}
            {list.products.map((p, pi) => (
              <div key={p.id} className="ppl-prod">
                <header>
                  <div><strong>{p.name || "Untitled product"}</strong><span>{p.modules.length} module{p.modules.length === 1 ? "" : "s"}</span></div>
                  <button type="button" className="table-action danger" onClick={() => { if (window.confirm(`Remove the product "${p.name}" from the price list?`)) put({ products: list.products.filter((_, i) => i !== pi) }); }}><Trash2 size={13} /> Remove product</button>
                </header>
                <div className="fields">
                  <label className="f"><span>Product name</span><input type="text" value={p.name} onChange={(e) => setProduct(pi, { name: e.target.value })} /></label>
                  <label className="f"><span>Short name</span><input type="text" value={p.short} onChange={(e) => setProduct(pi, { short: e.target.value })} /></label>
                  <label className="f"><span>Once-off set-up fee</span><span className="unit pre"><i>R</i><NumInput value={p.setup} step={100} onChange={(n) => setProduct(pi, { setup: n })} /></span></label>
                  <label className="f wide"><span>Description</span><input type="text" value={p.blurb} onChange={(e) => setProduct(pi, { blurb: e.target.value })} /></label>
                </div>
                <div className="mods">
                  <table className="ppl-mods">
                    <colgroup><col style={{ width: "22%" }} /><col /><col style={{ width: 130 }} /><col style={{ width: 90 }} /><col style={{ width: 100 }} /></colgroup>
                    <thead><tr><th>Module</th><th>What it does</th><th>Price per month</th><th className="c">On by default</th><th /></tr></thead>
                    <tbody>
                      {p.modules.map((m, mi) => (
                        <tr key={m.id}>
                          <td><input type="text" value={m.name} aria-label="Module name" onChange={(e) => setModule(pi, mi, { name: e.target.value })} /></td>
                          <td><input type="text" value={m.description} aria-label="What it does" onChange={(e) => setModule(pi, mi, { description: e.target.value })} /></td>
                          <td><span className="unit pre"><i>R</i><NumInput value={m.price} step={10} title="Price per month" onChange={(n) => setModule(pi, mi, { price: n })} /></span></td>
                          <td className="c"><input type="checkbox" checked={m.defaultOn} aria-label={`${m.name} on by default`} onChange={(e) => setModule(pi, mi, { defaultOn: e.target.checked })} /></td>
                          <td><button type="button" className="table-action" onClick={() => setProduct(pi, { modules: p.modules.filter((_, j) => j !== mi) })}><Trash2 size={13} /> Remove</button></td>
                        </tr>
                      ))}
                      {p.modules.length === 0 ? <tr><td colSpan={5} className="ppl-empty">No modules yet.</td></tr> : null}
                    </tbody>
                  </table>
                  <div className="ppl-prodactions">
                    <button type="button" className="quiet-button" onClick={() => setProduct(pi, { modules: [...p.modules, { id: uid("m"), name: "New module", description: "", price: 0, defaultOn: false }] })}><Plus size={14} /> Add module</button>
                  </div>
                </div>
              </div>
            ))}
            <div><button type="button" className="quiet-button" onClick={() => put({ products: [...list.products, { id: uid("p"), name: "New product", short: "New", blurb: "", setup: 0, modules: [] }] })}><Plus size={14} /> Add product</button></div>
          </div>
        </section>
      </fieldset>

      {canEdit ? <div className="ppl-bar"><span className={dirty ? "state dirty" : "state"}>{dirty ? "You have unsaved changes." : "All changes saved."}</span>{actions}</div> : null}
    </div>
  );
}
