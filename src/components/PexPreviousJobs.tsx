"use client";

import Link from "next/link";
import { StatusPill } from "@/components/StatusPill";

// 2026-10-06 — user request: PEX "history" everywhere (job page PEX Supply and
// PEX Return panels, PEX Tracking, PEX Stock) shows only the unit's PREVIOUS
// JOBS: job number, supply/return, date delivered, status and PO number,
// newest first. Fed by getPexRecordHistory's `previousJobs` (pex/service.ts).
export type PexPreviousJob = {
  jobId: string;
  jobNumber: string | null;
  kind: "SUPPLY" | "RETURN" | "JOB";
  deliveredAt: string | null;
  status: string;
  purchaseOrderNumber: string | null;
  /** Part of the record's own supply/return cycle (as opposed to an earlier or later one). */
  current?: boolean;
};

// 2026-10-08 — now lists the unit's WHOLE chain (earlier and later jobs), newest
// first, the same from whichever job History is opened. `currentJobId` highlights
// the job the user is on; without it the record's own cycle is highlighted.
export function PexPreviousJobsTable({ jobs, currentJobId }: { jobs: PexPreviousJob[]; currentJobId?: string }) {
  if (jobs.length === 0) return <p className="table-state compact-empty-state">No jobs linked to this unit yet.</p>;
  return (
    <div className="data-table-wrap"><table className="data-table">
      <thead><tr><th>Job number</th><th>Supply / Return</th><th>Date delivered</th><th>Status</th><th>PO number</th></tr></thead>
      <tbody>
        {jobs.map((job) => <tr key={`${job.kind}-${job.jobId}`} className={(currentJobId ? job.jobId === currentJobId : job.current) ? "pex-history-current" : undefined}>
          <td className="mono"><Link href={`/jobs/${job.jobId}`} className="table-action">{job.jobNumber || "—"}</Link></td>
          <td>{job.kind === "RETURN" ? "Return" : job.kind === "SUPPLY" ? "Supply" : "Job"}</td>
          <td>{job.deliveredAt ? new Date(job.deliveredAt).toLocaleDateString("en-ZA") : "—"}</td>
          <td><StatusPill status={job.status as never} /></td>
          <td>{job.purchaseOrderNumber || "—"}</td>
        </tr>)}
      </tbody>
    </table></div>
  );
}
