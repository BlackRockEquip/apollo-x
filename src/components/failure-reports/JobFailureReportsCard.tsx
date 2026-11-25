"use client";

import "./failure-reports.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ImageIcon, Loader2, Plus } from "lucide-react";
import { formatDate, frApi, type ReportDetail, type ReportListItem } from "./types";

// The Failure reports tab on a job: the job's failure reports, and a button to start one with the job's details pulled in.
export function JobFailureReportsCard({ jobId, jobLabel, canEdit }: { jobId: string; jobLabel: string; canEdit: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState<ReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try { setItems((await frApi<{ items: ReportListItem[] }>(`/api/v1/failure-reports?jobId=${encodeURIComponent(jobId)}`)).items); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to load the failure reports for this job."); }
    finally { setLoading(false); }
  }, [jobId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- async resource load, same pattern as the other workspaces
  useEffect(() => { void load(); }, [load]);

  async function start() {
    setCreating(true); setError("");
    try { const created = await frApi<ReportDetail>("/api/v1/failure-reports", { method: "POST", body: { jobId } }); router.push(`/failure-reports/${created.id}`); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to start the report."); setCreating(false); }
  }

  return (
    <section className="detail-panel" id="job-failure-reports">
      <header>
        <div><h2>Failure reports</h2><p>Photo failure reports for job {jobLabel}. A new one starts with this job&apos;s details filled in; a made report is also saved in Photos &amp; attachments.</p></div>
        {canEdit && <button type="button" className="gold-button" onClick={() => void start()} disabled={creating}>{creating ? <Loader2 className="spin" size={14} /> : <Plus size={14} />} New failure report</button>}
      </header>
      {error && <div className="inline-error">{error}</div>}
      {loading ? <div className="table-state"><Loader2 className="spin" size={18} /> Loading…</div> : (
        <div style={{ display: "grid", gap: 8, paddingTop: 12 }}>
          {items.map((r) => (
            <Link key={r.id} href={`/failure-reports/${r.id}`} className="fr-pitem" style={{ gridTemplateColumns: "70px minmax(0,1fr) auto", textDecoration: "none", color: "inherit" }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a stored photo, served by our own API */}
              {r.thumb ? <img className="fr-thumb" src={r.thumb} alt="" loading="lazy" /> : <span className="fr-thumb fr-thumb-empty"><ImageIcon size={16} /></span>}
              <span><span className="nm">{[r.make, r.model, r.component].filter(Boolean).join(" ") || "Failure report"}</span><br /><span className="fr-sub">{r.photoCount} photo{r.photoCount === 1 ? "" : "s"} · report date {formatDate(r.reportDate) || "—"}{r.companyName ? ` · ${r.companyName}` : ""}</span></span>
              {r.status === "CREATED" ? <span className="fr-pill fr-pill-made">Created{r.timesCreated > 1 ? ` ×${r.timesCreated}` : ""}</span> : <span className="fr-pill fr-pill-draft">Draft</span>}
            </Link>
          ))}
          {items.length === 0 && <div className="fr-sub">No failure reports for this job yet.</div>}
        </div>
      )}
    </section>
  );
}
