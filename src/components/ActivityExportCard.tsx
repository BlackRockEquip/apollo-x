"use client";

import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";

// 2026-10-26, user request: "on company admin, settings, import/export - add export activity
// history that allows the user to select all or specific jobs related". Contents are the user's
// choice (Job activity, System audit log, or both); jobs are picked by search-and-tick; the date
// range limits the activity exported (and, in the picker, lists only jobs active in that range).

type JobOption = { id: string; jobNumber: string; customer: string; status: string; activityCount: number };
type ApiErrorBody = { error?: { message?: string } };

async function readError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
  return body?.error?.message || fallback;
}

export function ActivityExportCard() {
  const [includeJobActivity, setIncludeJobActivity] = useState(true);
  const [includeAuditLog, setIncludeAuditLog] = useState(false);
  const [scope, setScope] = useState<"all" | "specific">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<JobOption[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [searching, setSearching] = useState(false);
  // Ticked jobs stay ticked across searches, so keep their labels here rather than in the result list.
  const [picked, setPicked] = useState<Map<string, JobOption>>(new Map());
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const searchSeq = useRef(0);

  useEffect(() => {
    if (scope !== "specific") return;
    const seq = ++searchSeq.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("q", query.trim());
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        const response = await fetch(`/api/v1/activity-export/jobs?${params.toString()}`, { cache: "no-store" });
        if (!response.ok) throw new Error(await readError(response, "Unable to search jobs."));
        const body = (await response.json()) as { jobs: JobOption[]; truncated: boolean };
        if (seq !== searchSeq.current) return;
        setResults(body.jobs);
        setTruncated(body.truncated);
        setError("");
      } catch (e) {
        if (seq === searchSeq.current) setError(e instanceof Error ? e.message : "Unable to search jobs.");
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [scope, query, from, to]);

  function toggle(job: JobOption) {
    setPicked((current) => {
      const next = new Map(current);
      if (next.has(job.id)) next.delete(job.id);
      else next.set(job.id, job);
      return next;
    });
  }

  function tickAllShown() {
    setPicked((current) => {
      const next = new Map(current);
      for (const job of results) next.set(job.id, job);
      return next;
    });
  }

  const noContent = !includeJobActivity && !includeAuditLog;
  const noJobs = scope === "specific" && picked.size === 0;
  const dateOrderBad = Boolean(from && to && from > to);

  async function handleExport() {
    setError("");
    setExporting(true);
    try {
      const response = await fetch("/api/v1/activity-export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          includeJobActivity,
          includeAuditLog,
          jobIds: scope === "specific" ? [...picked.keys()] : undefined,
          from: from || undefined,
          to: to || undefined,
        }),
      });
      if (!response.ok) throw new Error(await readError(response, "Unable to export."));
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = match?.[1] || "activity-history.xlsx";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to export.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="detail-panel">
      <header>
        <div>
          <h2>Activity history</h2>
          <p>
            Download what happened on your jobs as an Excel workbook, for every job or only the ones you pick. Job activity is each job&apos;s own
            history (created, status changes, parts, notes and so on); the system audit log is the company-wide record of who changed what.
          </p>
        </div>
      </header>
      <div style={{ padding: 14, display: "grid", gap: 14 }}>
        <div>
          <strong style={{ fontSize: 12 }}>Include</strong>
          <div className="stack-row" style={{ marginTop: 6, gap: 16 }}>
            <label className="stack-row" style={{ gap: 6 }}>
              <input type="checkbox" checked={includeJobActivity} onChange={(e) => setIncludeJobActivity(e.target.checked)} /> Job activity
            </label>
            <label className="stack-row" style={{ gap: 6 }}>
              <input type="checkbox" checked={includeAuditLog} onChange={(e) => setIncludeAuditLog(e.target.checked)} /> System audit log
            </label>
          </div>
        </div>

        <div>
          <strong style={{ fontSize: 12 }}>Jobs</strong>
          <div className="stack-row" style={{ marginTop: 6, gap: 16 }}>
            <label className="stack-row" style={{ gap: 6 }}>
              <input type="radio" name="activity-scope" checked={scope === "all"} onChange={() => setScope("all")} /> All jobs
            </label>
            <label className="stack-row" style={{ gap: 6 }}>
              <input type="radio" name="activity-scope" checked={scope === "specific"} onChange={() => setScope("specific")} /> Specific jobs
            </label>
          </div>
        </div>

        <div>
          <strong style={{ fontSize: 12 }}>Date range (optional)</strong>
          <div className="stack-row" style={{ marginTop: 6, gap: 8 }}>
            <label className="stack-row" style={{ gap: 6 }}>
              From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} />
            </label>
            <label className="stack-row" style={{ gap: 6 }}>
              To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} />
            </label>
            {(from || to) && (
              <button type="button" className="quiet-button" onClick={() => { setFrom(""); setTo(""); }}>Clear dates</button>
            )}
          </div>
          <p className="muted small-line" style={{ margin: "6px 0 0" }}>
            Only activity on these dates is exported{scope === "specific" ? ", and only jobs with activity in this range are listed below" : ""}.
          </p>
          {dateOrderBad && <div className="inline-error" style={{ marginTop: 6 }}>The &quot;from&quot; date must be on or before the &quot;to&quot; date.</div>}
        </div>

        {scope === "specific" && (
          <div>
            <div className="stack-row" style={{ gap: 8 }}>
              <input
                type="search"
                placeholder="Search by job number or customer"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ maxWidth: 320 }}
                aria-label="Search jobs"
              />
              <button type="button" className="quiet-button" disabled={!results.length} onClick={tickAllShown}>Tick all shown</button>
              <button type="button" className="quiet-button" disabled={!picked.size} onClick={() => setPicked(new Map())}>Clear ticks</button>
              <span className="muted small-line">{picked.size} job{picked.size === 1 ? "" : "s"} selected</span>
            </div>
            <div className="data-table-wrap" style={{ marginTop: 8, maxHeight: 280, overflow: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }} />
                    <th>Job</th>
                    <th>Customer</th>
                    <th>Status</th>
                    <th className="numeric">Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((job) => (
                    <tr key={job.id} onClick={() => toggle(job)} style={{ cursor: "pointer" }}>
                      <td><input type="checkbox" checked={picked.has(job.id)} onChange={() => toggle(job)} onClick={(e) => e.stopPropagation()} aria-label={`Select ${job.jobNumber}`} /></td>
                      <td>{job.jobNumber}</td>
                      <td>{job.customer}</td>
                      <td>{job.status}</td>
                      <td className="numeric">{job.activityCount}</td>
                    </tr>
                  ))}
                  {!results.length && (
                    <tr><td colSpan={5} className="muted">{searching ? "Searching…" : "No jobs match."}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {truncated && <p className="muted small-line" style={{ margin: "6px 0 0" }}>Showing the first 100 matches. Narrow the search to see others; ticked jobs stay selected.</p>}
          </div>
        )}

        <div className="stack-row" style={{ gap: 10 }}>
          <button type="button" className="gold-button" disabled={exporting || noContent || noJobs || dateOrderBad} onClick={() => void handleExport()}>
            <Download size={14} /> {exporting ? "Exporting…" : "Export activity history"}
          </button>
          {noContent && <span className="muted small-line">Choose Job activity, System audit log, or both.</span>}
          {!noContent && noJobs && <span className="muted small-line">Tick at least one job, or switch to All jobs.</span>}
          {error && <span style={{ fontSize: 11, color: "var(--danger)" }}>{error}</span>}
        </div>
      </div>
    </section>
  );
}
