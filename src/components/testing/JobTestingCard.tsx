"use client";

import "./testing.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { NewTestDialog } from "./TestingReportsWorkspace";
import { ResultPill } from "./ResultPill";
import { formatDate, testingApi, type ReportListItem } from "./types";

// The Testing tab on a job: every test done for this job, and a button to start another.
export function JobTestingCard({ jobId, jobLabel, canEdit, canManage }: { jobId: string; jobLabel: string; canEdit: boolean; canManage: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState<ReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try { setItems((await testingApi<{ items: ReportListItem[] }>(`/api/v1/testing-reports?jobId=${encodeURIComponent(jobId)}`)).items); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to load the tests for this job."); }
    finally { setLoading(false); }
  }, [jobId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- async resource load, same pattern as the other workspaces
  useEffect(() => { void load(); }, [load]);

  return (
    <section className="detail-panel" id="job-testing">
      <header>
        <div><h2>Testing</h2><p>Dyno test sheets for job {jobLabel}, checked against the spec.</p></div>
        {canEdit && <button type="button" className="gold-button" onClick={() => setCreating(true)}><Plus size={14} /> Start test</button>}
      </header>
      {error && <div className="inline-error">{error}</div>}
      {loading ? <div className="table-state"><Loader2 className="spin" size={18} /> Loading…</div> : (
        <div className="tr-job-list" style={{ paddingTop: 12 }}>
          {items.map((r) => (
            <Link key={r.id} href={`/testing-reports/${r.id}`} className="tr-job-row">
              <span><strong>{r.label}</strong> <span className="tr-sub">{r.machineModel}{r.serialNumber ? ` · ${r.serialNumber}` : ""} · {formatDate(r.testDate)}{r.testers.length ? ` · ${r.testers.join(", ")}` : ""}{r.retestOfId ? " · Retest" : ""}</span></span>
              <span className="tr-bar"><span className="tr-sub">{r.entered} of {r.total}</span><ResultPill result={r.result} status={r.status} onComments={r.passedOnComments} /></span>
            </Link>
          ))}
          {items.length === 0 && <div className="tr-sub">No tests for this job yet.</div>}
        </div>
      )}
      {creating && <NewTestDialog jobId={jobId} canManage={canManage} onClose={() => setCreating(false)} onCreated={(id) => router.push(`/testing-reports/${id}`)} />}
    </section>
  );
}
