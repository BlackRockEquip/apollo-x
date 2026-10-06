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
  kind: "SUPPLY" | "RETURN";
  deliveredAt: string | null;
  status: string;
  purchaseOrderNumber: string | null;
};

export function PexPreviousJobsTable({ jobs }: { jobs: PexPreviousJob[] }) {
  if (jobs.length === 0) return <p className="table-state compact-empty-state">No previous jobs — this is the first cycle for this unit.</p>;
  return (
    <div className="data-table-wrap"><table className="data-table">
      <thead><tr><th>Job number</th><th>Supply / Return</th><th>Date delivered</th><th>Status</th><th>PO number</th></tr></thead>
      <tbody>
        {jobs.map((job) => <tr key={`${job.kind}-${job.jobId}`}>
          <td className="mono"><Link href={`/jobs/${job.jobId}`} className="table-action">{job.jobNumber || "—"}</Link></td>
          <td>{job.kind === "RETURN" ? "Return" : "Supply"}</td>
          <td>{job.deliveredAt ? new Date(job.deliveredAt).toLocaleDateString("en-ZA") : "—"}</td>
          <td><StatusPill status={job.status as never} /></td>
          <td>{job.purchaseOrderNumber || "—"}</td>
        </tr>)}
      </tbody>
    </table></div>
  );
}
