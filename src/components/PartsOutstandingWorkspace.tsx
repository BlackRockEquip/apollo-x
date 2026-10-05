"use client";
/* eslint-disable react-hooks/set-state-in-effect -- async loaders synchronize this view with REST resources */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FocusEvent } from "react";
import { Loader2, Plus, Search, X } from "lucide-react";

type Row = {
  key: string; jobId: string; jobNumber: string; supplierId: string | null; supplierName: string; ordered: boolean;
  partLines: number; quantityOutstanding: number; outstandingSince: string | null;
};

// Same measure as the RFQ table's Days Outstanding column: whole days since the
// oldest still-outstanding part line on this job + supplier was ordered (or
// added to the job, if never ordered).
function daysOutstanding(row: Row) {
  if (!row.outstandingSince) return "—";
  const days = Math.max(0, Math.floor((Date.now() - new Date(row.outstandingSince).getTime()) / 86400000));
  return `${days} day${days === 1 ? "" : "s"}`;
}

// New — 2026-10-05, user request: Parts > Parts Outstanding tab — every job with
// parts not yet marked received, whether chased through an RFQ or added by
// hand. Table follows the RFQs table: Job #, Supplier, Parts Outstanding, Days
// Outstanding, with the same per-column filters. "Add Part to job" (same day,
// user request) sits above the table: pick a job, enter a part number and
// quantity, and it is added to that job's parts list exactly like adding it on
// the job itself (POST /api/v1/jobs/[id]/parts).
export function PartsOutstandingWorkspace() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ job: "", supplier: "" });

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/v1/parts-outstanding", { cache: "no-store" });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to load outstanding parts.");
      setRows(b.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load outstanding parts.");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Add Part to job
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState("");
  const [jobQuery, setJobQuery] = useState("");
  const [jobOptions, setJobOptions] = useState<{ id: string; label: string }[]>([]);
  const [jobId, setJobId] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [description, setDescription] = useState("");

  useEffect(() => {
    const q = jobQuery.trim();
    if (!showAdd || jobId || q.length < 2) { setJobOptions([]); return; }
    const timer = setTimeout(async () => {
      const r = await fetch(`/api/v1/jobs?q=${encodeURIComponent(q)}&pageSize=20`, { cache: "no-store" });
      const b = await r.json();
      setJobOptions((b.items || []).map((j: { id: string; jobNumber: string | null; draftNumber: string | null }) => ({ id: j.id, label: j.jobNumber || j.draftNumber || "—" })));
    }, 200);
    return () => clearTimeout(timer);
  }, [jobQuery, jobId, showAdd]);

  function closeDropdownUnlessWithin(close: () => void) {
    return (e: FocusEvent<HTMLElement>) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      close();
    };
  }

  function openAdd() {
    setJobQuery(""); setJobOptions([]); setJobId(""); setPartNumber(""); setQuantity("1"); setDescription(""); setAddError("");
    setShowAdd(true);
  }

  async function submitAdd() {
    const qty = Number(quantity);
    if (!jobId) { setAddError("Pick a job from the list."); return; }
    if (!partNumber.trim()) { setAddError("Enter a part number."); return; }
    if (!Number.isFinite(qty) || qty <= 0) { setAddError("Enter a quantity greater than 0."); return; }
    setSaving(true); setAddError("");
    try {
      // One tab-separated row ("part number, quantity, description"), the format
      // the job's own parts box uses; tabs/newlines are stripped from the typed
      // values so they can't split the row.
      const clean = (v: string) => v.replace(/[\t\r\n]+/g, " ").trim();
      const bulkLines = [clean(partNumber), String(qty), clean(description)].join("\t");
      const r = await fetch(`/api/v1/jobs/${jobId}/parts`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bulkLines }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to add the part.");
      if (b.addedFromPaste === 0) throw new Error("The part wasn't added — check the part number and quantity.");
      setShowAdd(false);
      await load();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Unable to add the part.");
    } finally {
      setSaving(false);
    }
  }

  const filteredRows = useMemo(() => (rows ?? []).filter((row) => {
    if (filters.job && !row.jobNumber.toLowerCase().includes(filters.job.toLowerCase())) return false;
    if (filters.supplier && !row.supplierName.toLowerCase().includes(filters.supplier.toLowerCase())) return false;
    return true;
  }), [rows, filters]);
  const filtersActive = Boolean(filters.job || filters.supplier);

  if (!rows) return <div className="table-state">{error || <><Loader2 className="spin" size={18} />Loading outstanding parts…</>}</div>;

  return <section className="master-panel">
    <div className="master-toolbar">
      <span>{filtersActive ? `${filteredRows.length} of ${rows.length} row${rows.length === 1 ? "" : "s"}` : `${rows.length} row${rows.length === 1 ? "" : "s"}`}</span>
      <button className="gold-button" onClick={openAdd}><Plus size={15} /> Add Part to job</button>
    </div>
    {error ? <div className="inline-error">{error}</div> : null}
    <div className="data-table-wrap"><table className="data-table"><thead>
      <tr><th>Job #</th><th>Supplier</th><th>Parts Outstanding</th><th>Days Outstanding</th><th></th></tr>
      <tr className="filter-row">
        <th><input value={filters.job} onChange={(e) => setFilters((f) => ({ ...f, job: e.target.value }))} placeholder="Filter job…" aria-label="Filter by job" /></th>
        <th><input value={filters.supplier} onChange={(e) => setFilters((f) => ({ ...f, supplier: e.target.value }))} placeholder="Filter supplier…" aria-label="Filter by supplier" /></th>
        <th></th><th></th>
        <th>{filtersActive && <button type="button" className="quiet-button" onClick={() => setFilters({ job: "", supplier: "" })} title="Clear filters"><X size={13} /></button>}</th>
      </tr>
    </thead><tbody>
      {rows.length === 0 ? <tr><td colSpan={5} className="table-state">No parts outstanding on any job.</td></tr> : filteredRows.length === 0 ? <tr><td colSpan={5} className="table-state compact-empty-state">No jobs match these filters.</td></tr> : filteredRows.map((row) => (
        <tr key={row.key}>
          <td><Link href={`/jobs/${row.jobId}`}><strong>{row.jobNumber}</strong></Link></td>
          <td>{row.ordered ? row.supplierName : <span className="muted">{row.supplierName}</span>}</td>
          <td>{row.quantityOutstanding}</td>
          <td>{daysOutstanding(row)}</td>
          <td><Link className="table-action" href={`/jobs/${row.jobId}`}>View job</Link></td>
        </tr>
      ))}
    </tbody></table></div>

    {showAdd && <div className="drawer-backdrop"><aside className="form-drawer" role="dialog" aria-modal="true">
      <header><div><p className="eyebrow">Parts</p><h2>Add Part to job</h2></div><button onClick={() => setShowAdd(false)}><X size={18} /></button></header>
      <div className="drawer-fields">
        <label className="party-selector wide" onBlur={closeDropdownUnlessWithin(() => setJobOptions([]))}><span>Job</span><div><Search size={15} /><input value={jobQuery} onChange={(e) => { setJobQuery(e.target.value); setJobId(""); }} placeholder="Search by job number" autoFocus /></div>
          {jobOptions.length > 0 && <div className="selector-results">{jobOptions.map((o) => (
            <button key={o.id} type="button" onClick={() => { setJobId(o.id); setJobQuery(o.label); setJobOptions([]); }}><strong>{o.label}</strong></button>
          ))}</div>}
        </label>
        <label><span>Part number</span><input value={partNumber} onChange={(e) => setPartNumber(e.target.value)} placeholder="e.g. 4D3107" /></label>
        <label><span>Quantity</span><input type="number" min={0} step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></label>
        <label className="wide"><span>Description (optional)</span><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Filled in from the catalog when the part exists" /></label>
        {addError ? <div className="inline-error wide">{addError}</div> : null}
      </div>
      <footer><button type="button" className="quiet-button" onClick={() => setShowAdd(false)}>Cancel</button><button className="gold-button" disabled={saving} onClick={() => void submitAdd()}>{saving && <Loader2 className="spin" size={14} />} Add part</button></footer>
    </aside></div>}
  </section>;
}
