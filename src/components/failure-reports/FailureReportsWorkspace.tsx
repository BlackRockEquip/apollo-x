"use client";

import "./failure-reports.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Copy, ImageIcon, Loader2, Plus, Search, Settings2, Trash2 } from "lucide-react";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { JobPickerDialog } from "./JobPickerDialog";
import { formatDate, frApi, type JobHit, type ReportDetail, type ReportListItem } from "./types";

// Failure Reports: every report the company has made or saved, newest first (the builder's "Previous reports"), with search,
// a thumbnail of the cover photo, Open, Copy and Delete. New report starts linked to a job (details pulled in) or blank.
export function FailureReportsWorkspace({ canEdit }: { canEdit: boolean }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirmDialog();
  const [items, setItems] = useState<ReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (q: string) => {
    try { setItems((await frApi<{ items: ReportListItem[] }>(`/api/v1/failure-reports?q=${encodeURIComponent(q)}`)).items); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to load failure reports."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { void load(query); }, query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [query, load]);

  async function start(job: JobHit | null) {
    setBusy(true); setError("");
    try {
      const created = await frApi<ReportDetail>("/api/v1/failure-reports", { method: "POST", body: { jobId: job?.id ?? null } });
      router.push(`/failure-reports/${created.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to start the report."); setBusy(false); setPicking(false); }
  }

  async function duplicate(item: ReportListItem) {
    setBusy(true);
    try {
      const copy = await frApi<ReportDetail>(`/api/v1/failure-reports/${item.id}/duplicate`, { method: "POST" });
      router.push(`/failure-reports/${copy.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to copy the report."); setBusy(false); }
  }

  async function remove(item: ReportListItem) {
    const ok = await confirm({ title: "Delete report?", message: `Delete the failure report${item.jobLabel ? ` for ${item.jobLabel}` : ""}${item.photoCount ? ` and its ${item.photoCount} photo${item.photoCount === 1 ? "" : "s"}` : ""}? A copy already saved in the job's files stays there.`, tone: "danger", confirmLabel: "Delete" });
    if (!ok) return;
    try { await frApi(`/api/v1/failure-reports/${item.id}`, { method: "DELETE" }); setItems((list) => list.filter((i) => i.id !== item.id)); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to delete the report."); }
  }

  return (
    <div>
      <header className="page-header compact">
        <div><p className="eyebrow">Jobs</p><h1>Failure Reports</h1><p>Photo failure reports with damage marks, made as PowerPoint files. Link a report to a job to pull its details in; everything stays editable.</p></div>
        <div className="fr-bar">
          <Link href="/failure-reports/profiles" className="quiet-button"><Settings2 size={14} /> Company profiles</Link>
          {canEdit && <button type="button" className="gold-button" onClick={() => setPicking(true)} disabled={busy}><Plus size={15} /> New report</button>}
        </div>
      </header>
      {error && <div className="inline-error">{error}</div>}
      <section className="master-panel">
        <div className="master-toolbar">
          <label className="search-control"><Search size={15} /><input aria-label="Search failure reports" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search job, client, component, company, date…" /></label>
          <span className="fr-sub">{items.length} report{items.length === 1 ? "" : "s"}</span>
        </div>
        {loading ? <div className="table-state"><Loader2 className="spin" size={20} /> Loading…</div> : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th style={{ width: 80 }}></th><th>Job</th><th>Client</th><th>Component</th><th>Photos</th><th>Date of report</th><th>Status</th><th>Last saved</th><th style={{ width: 120 }}></th></tr></thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id} className="row-click" tabIndex={0} onClick={() => router.push(`/failure-reports/${r.id}`)} onKeyDown={(e) => { if (e.key === "Enter") router.push(`/failure-reports/${r.id}`); }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- a stored photo, served by our own API */}
                    <td>{r.thumb ? <img className="fr-thumb" src={r.thumb} alt="" loading="lazy" /> : <span className="fr-thumb fr-thumb-empty"><ImageIcon size={16} /></span>}</td>
                    <td><strong>{r.jobLabel || <span className="muted">No job</span>}</strong>{r.companyName && <div className="fr-sub">{r.companyName}</div>}</td>
                    <td>{r.client || <span className="muted">—</span>}</td>
                    <td>{[r.make, r.model].filter(Boolean).join(" ")}{r.component && <div className="fr-sub">{r.component}</div>}</td>
                    <td>{r.photoCount}</td>
                    <td>{formatDate(r.reportDate)}</td>
                    <td>{r.status === "CREATED" ? <span className="fr-pill fr-pill-made">Created{r.timesCreated > 1 ? ` ×${r.timesCreated}` : ""}</span> : <span className="fr-pill fr-pill-draft">Draft</span>}</td>
                    <td>{formatDate(r.updatedAt)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="fr-bar" style={{ gap: 6, justifyContent: "flex-end" }}>
                        {canEdit && <button type="button" className="fr-icon-btn" title="Start a new report as a copy of this one" aria-label="Copy report" disabled={busy} onClick={() => void duplicate(r)}><Copy size={14} /></button>}
                        {canEdit && <button type="button" className="fr-icon-btn danger" title="Delete report" aria-label="Delete report" onClick={() => void remove(r)}><Trash2 size={14} /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td colSpan={9} className="table-state compact-empty-state">{query ? "No reports match." : canEdit ? "No failure reports yet. Start one with New report." : "No failure reports yet."}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {picking && <JobPickerDialog title="New failure report" intro="Pick the job: its job number, client, component, serial, make, model, plant number, date received, job type and strip mechanic are filled in for you. You can change any of them." allowBlank busy={busy} onClose={() => setPicking(false)} onPick={(job) => void start(job)} />}
      {dialog}
    </div>
  );
}
