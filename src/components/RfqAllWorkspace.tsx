"use client";
/* eslint-disable react-hooks/set-state-in-effect -- async loaders synchronize this view with REST resources */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Loader2, Plus, Search, X } from "lucide-react";

type Option = { id: string; name?: string; jobNumber?: string | null; draftNumber?: string | null };
type RfqRow = {
  id: string; kind: "job" | "general"; jobId: string | null; jobNumber: string | null;
  supplierId: string; supplierName: string; status: string; receivingStatus: string; partsOutstandingQty: number;
  partsOutstandingSince: string | null; date: string; notes: string | null; hasAttachment?: boolean;
};

function text(v: unknown) { return v == null || v === "" ? "—" : String(v); }
function fmtDate(v: string) { return v ? new Date(v).toLocaleDateString("en-ZA") : "—"; }
function jobRef(job: { jobNumber?: string | null; draftNumber?: string | null }) { return job.jobNumber || job.draftNumber || "—"; }

// 2026-09-28, user request: "RFQ status says received even though parts
// are still outstanding, should have 3 statuses: Received, Partially
// Received, Outstanding." row.receivingStatus is computed server-side
// (see jobRfqReceivingStatus in rfq/service.ts) from actual quote-line
// coverage rather than the raw JobRfqRequest.status, which used to flip
// to QUOTED — shown here as "Received" — the moment a quote was recorded,
// before any price was saved. Only used for job-kind rows: a general RFQ's
// status is a manual pick with no per-part data behind it, so it keeps its
// own SENT/RECEIVED/SKIPPED dropdown below rather than a derived pill.
function receivingStatusInfo(receivingStatus: string): { label: string; tone: string } {
  if (receivingStatus === "RECEIVED") return { label: "Received", tone: "tone-green" };
  if (receivingStatus === "PARTIALLY_RECEIVED") return { label: "Partially received", tone: "tone-amber" };
  return { label: "Outstanding", tone: "tone-orange" };
}

// 2026-09-28, user request: "Suppliers-RFQs - ... Remove notes column
// (change to Days Outstanding)." Went through two same-day corrections
// before landing here — worth reading in order since each one narrows
// what "outstanding" actually means:
//
// 1. First version measured days since the RFQ was sent, stopping once
//    the job RFQ's raw status hit QUOTED. Bug reported as "days
//    outstanding not calculating": a job RFQ's SKIPPED status is the
//    normal outcome for a phone-quoted supplier (see attemptRfqSend in
//    rfq/service.ts), not a resolved state, so most rows were wrongly
//    frozen at "—" from the start. Fixed to stop only on QUOTED.
// 2. Then the user clarified ("days outstanding should refer to the
//    amount the days are outstanding"): QUOTED itself doesn't mean
//    resolved either — it just means a quote was recorded, not that
//    every part on it got priced (see receivingStatusInfo above). Fixed
//    to key off row.receivingStatus instead, so a "Partially received"
//    row kept counting.
// 3. Finally the user clarified again ("days parts are outstanding"):
//    this isn't about the RFQ's own lifecycle at all — it's how long the
//    job's actual outstanding PARTS have been waiting, the same
//    real-world thing the "Parts outstanding" qty column already
//    measures, just aged instead of counted. So this now reads
//    row.partsOutstandingSince — the oldest still-outstanding JobPartLine
//    on the job (ordered date, or added-to-job date if never ordered;
//    see outstandingPartsByJob in rfq/service.ts) — completely
//    independent of this particular supplier's RFQ/quote status. A
//    general (job-less) RFQ has no part-line dates to draw on, so it
//    falls back to its own created date for as long as it's genuinely
//    outstanding (see listAllRfqRequests).
function daysOutstanding(row: RfqRow) {
  if (!row.partsOutstandingSince || row.partsOutstandingQty <= 0) return "—";
  const days = Math.max(0, Math.floor((Date.now() - new Date(row.partsOutstandingSince).getTime()) / 86400000));
  return `${days} day${days === 1 ? "" : "s"}`;
}

// New — 2026-09-14, Suppliers screen's RFQ tab (see that route's comment).
// Lists every RFQ, job-linked and job-less, from GET /api/v1/rfqs. "Add
// RFQ" optionally picks a job: with one picked this reuses the exact same
// POST /api/v1/jobs/[id]/rfq call the job's own RFQ panel uses (parts are
// auto-snapshotted from that job, same as there); with no job picked it
// posts to /api/v1/rfqs/general instead, the new job-less model, where
// parts/qty/status are entered by hand since there's no job parts list.
export function RfqAllWorkspace() {
  const [rows, setRows] = useState<RfqRow[] | null>(null);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  const [supplierQuery, setSupplierQuery] = useState("");
  const [supplierOptions, setSupplierOptions] = useState<Option[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [jobQuery, setJobQuery] = useState("");
  const [jobOptions, setJobOptions] = useState<Option[]>([]);
  const [jobId, setJobId] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [partsDescription, setPartsDescription] = useState("");
  const [quantityOutstanding, setQuantityOutstanding] = useState("");
  const [status, setStatus] = useState("SENT");
  const [notes, setNotes] = useState("");
  // Outbound attachment (a drawing, spec sheet or photo sent with the RFQ)
  // — added 2026-09-14, shared by both the job-linked and job-less paths
  // below since only one is used per submit.
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        const comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(reader.error || new Error("Unable to read file."));
      reader.readAsDataURL(file);
    });
  }

  async function load() {
    try {
      const r = await fetch("/api/v1/rfqs", { cache: "no-store" });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message);
      setRows(b.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load RFQs.");
    }
  }
  useEffect(() => { void load(); }, []);

  useEffect(() => {
    const q = supplierQuery.trim();
    if (q.length < 2) { setSupplierOptions([]); return; }
    const timer = setTimeout(async () => {
      const r = await fetch(`/api/v1/master-data/suppliers?q=${encodeURIComponent(q)}&status=active&pageSize=20`, { cache: "no-store" });
      const b = await r.json();
      setSupplierOptions(b.items || []);
    }, 200);
    return () => clearTimeout(timer);
  }, [supplierQuery]);

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

  function resetForm() {
    setSupplierId(""); setSupplierQuery(""); setJobId(""); setJobQuery(""); setSendEmail(true);
    setPartsDescription(""); setQuantityOutstanding(""); setStatus("SENT"); setNotes(""); setAttachmentFile(null);
  }

  async function submit() {
    if (!supplierId) { setError("Pick a supplier first."); return; }
    if (!jobId && partsDescription.trim().length < 2) { setError("Describe the parts being quoted (or pick a job instead)."); return; }
    setSaving(true); setError("");
    try {
      const attachment = attachmentFile
        ? { attachmentFileName: attachmentFile.name, attachmentMimeType: attachmentFile.type || "application/octet-stream", attachmentContentBase64: await fileToBase64(attachmentFile) }
        : {};
      const r = jobId
        ? await fetch(`/api/v1/jobs/${jobId}/rfq`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ supplierId, sendEmail, ...attachment }) })
        : await fetch("/api/v1/rfqs/general", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ supplierId, partsDescription: partsDescription.trim(), quantityOutstanding: quantityOutstanding ? Number(quantityOutstanding) : null, status, notes: notes || null, ...attachment }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to add RFQ.");
      resetForm(); setShowAdd(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to add RFQ.");
    } finally {
      setSaving(false);
    }
  }

  async function updateGeneralStatus(id: string, next: string) {
    try {
      const r = await fetch(`/api/v1/rfqs/general/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: next }) });
      if (!r.ok) { const b = await r.json(); throw new Error(b.error?.message); }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update status.");
    }
  }

  async function removeGeneral(id: string) {
    if (!window.confirm("Remove this RFQ?")) return;
    try {
      const r = await fetch(`/api/v1/rfqs/general/${id}`, { method: "DELETE" });
      if (!r.ok) { const b = await r.json(); throw new Error(b.error?.message); }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to remove RFQ.");
    }
  }

  if (!rows) return <div className="table-state">{error || <><Loader2 className="spin" size={18} />Loading RFQs…</>}</div>;

  return <section className="master-panel">
    <div className="master-toolbar">
      <span>{rows.length} RFQ{rows.length === 1 ? "" : "s"}</span>
      <button className="gold-button" onClick={() => setShowAdd(true)}><Plus size={15} /> Add RFQ</button>
    </div>
    {error && <div className="inline-error">{error}</div>}
    {/* 2026-09-28, user request: "Suppliers-RFQs - Remove attachment column
        (Not needed), Remove notes column (change to Days Outstanding)."
        Attachment upload on Add RFQ (below) is unchanged — this only drops
        the column that let you view one from the list, plus swaps Notes
        for a computed Days Outstanding (see that function's own comment). */}
    <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Job</th><th>Supplier</th><th>Status</th><th>Parts outstanding</th><th>Date</th><th>Days Outstanding</th><th></th></tr></thead><tbody>
      {rows.length === 0 ? <tr><td colSpan={7} className="table-state">No RFQs yet.</td></tr> : rows.map((row) => {
        const info = receivingStatusInfo(row.receivingStatus);
        return <tr key={`${row.kind}-${row.id}`}>
          <td>{row.jobId ? <Link href={`/jobs/${row.jobId}`}>{text(row.jobNumber)}</Link> : <span className="muted">General</span>}</td>
          <td>{text(row.supplierName)}</td>
          <td>{row.kind === "general" ? (
            <select value={row.status} onChange={(e) => void updateGeneralStatus(row.id, e.target.value)}>
              <option value="SENT">Sent</option><option value="RECEIVED">Received</option><option value="SKIPPED">Skipped</option>
            </select>
          ) : <span className={`status-pill ${info.tone}`}>{info.label}</span>}</td>
          <td>{row.partsOutstandingQty}</td>
          <td>{fmtDate(row.date)}</td>
          <td className="muted small-line">{daysOutstanding(row)}</td>
          <td className="actions">{row.jobId
            ? <Link className="table-action" href={`/jobs/${row.jobId}`}>View job</Link>
            : <button type="button" className="table-action danger" onClick={() => void removeGeneral(row.id)}>Remove</button>}
          </td>
        </tr>;
      })}
    </tbody></table></div>

    {showAdd && <div className="drawer-backdrop"><aside className="form-drawer" role="dialog" aria-modal="true">
      <header><div><p className="eyebrow">RFQ</p><h2>Add RFQ</h2></div><button onClick={() => setShowAdd(false)}><X size={18} /></button></header>
      <div className="drawer-fields">
        <label className="party-selector"><span>Supplier</span><div><Search size={15} /><input value={supplierQuery} onChange={(e) => { setSupplierQuery(e.target.value); setSupplierId(""); }} placeholder="Search active supplier" /></div>
          {supplierOptions.length > 0 && <div className="selector-results">{supplierOptions.map((o) => (
            <button key={o.id} type="button" onClick={() => { setSupplierId(o.id); setSupplierQuery(o.name || ""); setSupplierOptions([]); }}><strong>{o.name}</strong></button>
          ))}</div>}
        </label>
        <label className="party-selector"><span>Job (optional)</span><div><Search size={15} /><input value={jobQuery} onChange={(e) => { setJobQuery(e.target.value); setJobId(""); }} placeholder="Leave blank for a general RFQ" /></div>
          {jobOptions.length > 0 && <div className="selector-results">{jobOptions.map((o) => (
            <button key={o.id} type="button" onClick={() => { setJobId(o.id); setJobQuery(jobRef(o)); setJobOptions([]); }}><strong>{jobRef(o)}</strong></button>
          ))}</div>}
        </label>
        {jobId ? (
          <label className="inline-check"><input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} /><span>Send RFQ email now (parts list is taken from the job)</span></label>
        ) : <>
          <label className="wide"><span>Parts / work being quoted</span><textarea rows={3} value={partsDescription} onChange={(e) => setPartsDescription(e.target.value)} placeholder="Describe what you're asking this supplier to quote on" /></label>
          <label><span>Parts outstanding (qty)</span><input type="number" min={0} value={quantityOutstanding} onChange={(e) => setQuantityOutstanding(e.target.value)} /></label>
          <label><span>Status</span><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="SENT">Sent</option><option value="RECEIVED">Received</option><option value="SKIPPED">Skipped</option></select></label>
          <label className="wide"><span>Notes</span><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        </>}
        <label className="wide"><span>Attachment (optional)</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input type="file" onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)} />
            {attachmentFile && <button type="button" className="quiet-button" onClick={() => setAttachmentFile(null)}><X size={13} /> {attachmentFile.name}</button>}
          </div>
          <p className="muted small-line">Sent with the RFQ (a drawing, spec sheet or photo).</p>
        </label>
      </div>
      <footer><button type="button" className="quiet-button" onClick={() => setShowAdd(false)}>Cancel</button><button className="gold-button" disabled={saving} onClick={() => void submit()}>{saving && <Loader2 className="spin" size={14} />} Save</button></footer>
    </aside></div>}
  </section>;
}
