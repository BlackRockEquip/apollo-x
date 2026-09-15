"use client";
/* eslint-disable react-hooks/set-state-in-effect -- async loaders synchronize this view with REST resources */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Loader2, Plus, Search, X } from "lucide-react";

type Option = { id: string; name?: string; jobNumber?: string | null; draftNumber?: string | null };
type OutworkRow = {
  id: string; description: string; quantity: number; status: string;
  dateSentOut: string | null; dateReceived: string | null; notes: string | null;
  supplier: { id: string; name: string }; job: { id: string; jobNumber: string | null; draftNumber: string | null };
};

function text(v: unknown) { return v == null || v === "" ? "—" : String(v); }
function jobRef(job: { jobNumber: string | null; draftNumber: string | null }) { return job.jobNumber || job.draftNumber || "—"; }
function fmtDate(v: string | null) { return v ? new Date(v).toLocaleDateString("en-ZA") : "—"; }

// 2026-09-15, user request: "On outwork tab by Suppliers, add column for
// days outstanding." Same calculation as JobWorkspace.tsx's own
// outworkDaysOutstanding — counted from the date it went out to the date
// it came back, or to today while still out; nothing to count from if it
// was never marked sent out.
function daysOutstanding(item: { dateSentOut: string | null; dateReceived: string | null }): string {
  if (!item.dateSentOut) return "—";
  const start = new Date(item.dateSentOut);
  if (Number.isNaN(start.getTime())) return "—";
  const end = item.dateReceived ? new Date(item.dateReceived) : new Date();
  const days = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000));
  return String(days);
}

// New — 2026-09-14, Suppliers screen's Outwork tab (see that route's
// comment). A read list across every job's OutworkItem rows, plus a
// "Create outwork" popup that picks a job first (typeahead, same pattern
// as JobWorkspace's supplier typeaheads) and then reuses the exact same
// POST /api/v1/jobs/[id]/outwork call that job's own Outwork section uses
// — so a batch created here shows up identically on that job afterwards.
export function OutworkAllWorkspace() {
  const [rows, setRows] = useState<OutworkRow[] | null>(null);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  const [jobQuery, setJobQuery] = useState("");
  const [jobOptions, setJobOptions] = useState<Option[]>([]);
  const [jobId, setJobId] = useState("");
  const [supplierQuery, setSupplierQuery] = useState("");
  const [supplierOptions, setSupplierOptions] = useState<Option[]>([]);
  const [supplierId, setSupplierId] = useState("");
  // 2026-09-15 — same double-click-to-select glitch fixed on
  // JobWorkspace.tsx's supplier pickers: selecting an option changes the
  // query to the full supplier name, which re-arms this debounced search
  // and re-fetches (usually re-matching that same supplier), reopening the
  // dropdown right after the first click closed it — so the pick had
  // already registered, but it looked like it hadn't until a second click
  // closed the reopened list for good. Gate the search on an explicit
  // "picker is open" flag that selecting an option turns off directly.
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);
  const [dateSentOut, setDateSentOut] = useState("");
  const [lines, setLines] = useState<Array<{ id: string; description: string; quantity: string }>>([{ id: "row-1", description: "", quantity: "1" }]);

  async function load() {
    try {
      const r = await fetch("/api/v1/outwork", { cache: "no-store" });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message);
      setRows(b.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load outwork.");
    }
  }
  useEffect(() => { void load(); }, []);

  useEffect(() => {
    const q = jobQuery.trim();
    if (q.length < 2) { setJobOptions([]); return; }
    const timer = setTimeout(async () => {
      const r = await fetch(`/api/v1/jobs?q=${encodeURIComponent(q)}&pageSize=20`, { cache: "no-store" });
      const b = await r.json();
      setJobOptions((b.items || []).map((j: { id: string; jobNumber: string | null; draftNumber: string | null }) => ({ id: j.id, jobNumber: j.jobNumber, draftNumber: j.draftNumber })));
    }, 200);
    return () => clearTimeout(timer);
  }, [jobQuery]);

  useEffect(() => {
    if (!supplierPickerOpen) { setSupplierOptions([]); return; }
    const q = supplierQuery.trim();
    if (q.length < 2) { setSupplierOptions([]); return; }
    const timer = setTimeout(async () => {
      const r = await fetch(`/api/v1/master-data/suppliers?q=${encodeURIComponent(q)}&status=active&pageSize=20`, { cache: "no-store" });
      const b = await r.json();
      setSupplierOptions(b.items || []);
    }, 200);
    return () => clearTimeout(timer);
  }, [supplierQuery, supplierPickerOpen]);

  function addLine() { setLines((rows) => [...rows, { id: `row-${rows.length + 1}-${Date.now()}`, description: "", quantity: "1" }]); }
  function removeLine(id: string) { setLines((rows) => (rows.length > 1 ? rows.filter((r) => r.id !== id) : rows)); }
  function updateLine(id: string, field: "description" | "quantity", value: string) { setLines((rows) => rows.map((r) => (r.id === id ? { ...r, [field]: value } : r))); }

  function resetForm() {
    setJobId(""); setJobQuery(""); setSupplierId(""); setSupplierQuery(""); setSupplierOptions([]); setSupplierPickerOpen(false); setDateSentOut("");
    setLines([{ id: "row-1", description: "", quantity: "1" }]);
  }

  async function submit() {
    if (!jobId || !supplierId) { setError("Pick a job and a supplier first."); return; }
    const clean = lines.filter((l) => l.description.trim()).map((l) => ({ description: l.description.trim(), quantity: Number(l.quantity) || 1 }));
    if (clean.length === 0) { setError("Add at least one item with a description."); return; }
    setSaving(true); setError("");
    try {
      const r = await fetch(`/api/v1/jobs/${jobId}/outwork`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ supplierId, dateSentOut: dateSentOut || null, lines: clean }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to record outwork.");
      resetForm(); setShowAdd(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to record outwork.");
    } finally {
      setSaving(false);
    }
  }

  if (!rows) return <div className="table-state">{error || <><Loader2 className="spin" size={18} />Loading outwork…</>}</div>;

  return <section className="master-panel">
    <div className="master-toolbar">
      <span>{rows.length} item{rows.length === 1 ? "" : "s"}</span>
      <button className="gold-button" onClick={() => setShowAdd(true)}><Plus size={15} /> Create outwork</button>
    </div>
    {error && <div className="inline-error">{error}</div>}
    <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Job</th><th>Supplier</th><th>Description</th><th>Qty</th><th>Status</th><th>Sent</th><th>Received</th><th>Days outstanding</th><th></th></tr></thead><tbody>
      {rows.length === 0 ? <tr><td colSpan={9} className="table-state">No outwork recorded yet.</td></tr> : rows.map((row) => (
        <tr key={row.id}>
          <td><Link href={`/jobs/${row.job.id}`}>{jobRef(row.job)}</Link></td>
          <td>{text(row.supplier.name)}</td>
          <td>{text(row.description)}</td>
          <td>{row.quantity}</td>
          <td><span className={`status-pill ${row.status === "RECEIVED" ? "" : "neutral"}`}>{row.status === "RECEIVED" ? "Received" : "Sent out"}</span></td>
          <td>{fmtDate(row.dateSentOut)}</td>
          <td>{fmtDate(row.dateReceived)}</td>
          <td>{daysOutstanding(row)}</td>
          <td className="actions"><Link className="table-action" href={`/jobs/${row.job.id}`}>View job</Link></td>
        </tr>
      ))}
    </tbody></table></div>

    {showAdd && <div className="drawer-backdrop"><aside className="form-drawer" role="dialog" aria-modal="true">
      <header><div><p className="eyebrow">Outwork</p><h2>Create outwork</h2></div><button onClick={() => setShowAdd(false)}><X size={18} /></button></header>
      <div className="drawer-fields">
        <label className="party-selector"><span>Job</span><div><Search size={15} /><input value={jobQuery} onChange={(e) => { setJobQuery(e.target.value); setJobId(""); }} placeholder="Search job number…" /></div>
          {jobOptions.length > 0 && <div className="selector-results">{jobOptions.map((o) => (
            <button key={o.id} type="button" onClick={() => { setJobId(o.id); setJobQuery(jobRef({ jobNumber: o.jobNumber ?? null, draftNumber: o.draftNumber ?? null })); setJobOptions([]); }}><strong>{jobRef({ jobNumber: o.jobNumber ?? null, draftNumber: o.draftNumber ?? null })}</strong></button>
          ))}</div>}
        </label>
        <label className="party-selector"><span>Supplier</span><div><Search size={15} /><input value={supplierQuery} onChange={(e) => { setSupplierQuery(e.target.value); setSupplierId(""); setSupplierPickerOpen(true); }} onFocus={() => setSupplierPickerOpen(true)} placeholder="Search active supplier" /></div>
          {supplierPickerOpen && supplierOptions.length > 0 && <div className="selector-results">{supplierOptions.map((o) => (
            <button key={o.id} type="button" onClick={() => { setSupplierId(o.id); setSupplierQuery(o.name || ""); setSupplierOptions([]); setSupplierPickerOpen(false); }}><strong>{o.name}</strong></button>
          ))}</div>}
        </label>
        <label><span>Date sent out</span><input type="date" value={dateSentOut} onChange={(e) => setDateSentOut(e.target.value)} /></label>
        {lines.map((line, i) => (
          <label key={line.id} className="wide"><span>{i === 0 ? "Items" : ""}</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input style={{ flex: 3 }} placeholder="Description" value={line.description} onChange={(e) => updateLine(line.id, "description", e.target.value)} />
              <input style={{ flex: 1 }} type="number" min={1} placeholder="Qty" value={line.quantity} onChange={(e) => updateLine(line.id, "quantity", e.target.value)} />
              {lines.length > 1 && <button type="button" className="quiet-button" onClick={() => removeLine(line.id)}><X size={14} /></button>}
            </div>
          </label>
        ))}
        <label><span>&nbsp;</span><button type="button" className="quiet-button" onClick={addLine}><Plus size={14} /> Add another item</button></label>
      </div>
      <footer><button type="button" className="quiet-button" onClick={() => setShowAdd(false)}>Cancel</button><button className="gold-button" disabled={saving} onClick={() => void submit()}>{saving && <Loader2 className="spin" size={14} />} Send out</button></footer>
    </aside></div>}
  </section>;
}
