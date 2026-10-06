"use client";

import Link from "next/link";
import { useState } from "react";
import { X } from "lucide-react";
import { PexStatusPill } from "@/components/StatusPill";
import { PexPreviousJobsTable, type PexPreviousJob } from "@/components/PexPreviousJobs";

type Row = Record<string, unknown> & { id: string };
type PexJobRef = Row & { id: string; jobNumber?: string | null; draftNumber?: string | null; status?: string | null; purchaseOrderNumber?: string | null };
type TrackingRow = Row & {
  status: string;
  unitDescription?: string | null;
  // Date, not just string: `initial` comes straight from the server
  // component's Prisma read (listPexTracking), and a Date crossing the
  // React Server Component boundary into this client component arrives as
  // a real Date instance, not a JSON string — unlike the History drawer's
  // fetch()+.json() payload below (HistoryCycle), which genuinely is a
  // string. dateText() already handles either via `new Date(String(value))`.
  supplyDate?: string | Date | null;
  returnDate?: string | Date | null;
  customer?: Row & { name?: string | null; tradingName?: string | null } | null;
  supplyJob?: PexJobRef | null;
  returnJob?: PexJobRef | null;
};
type HistoryEntry = { id: string; type: string; description: string; userName: string | null; createdAt: string };
type HistoryCycle = { supplyJobNumber: string | null; supplyJobId: string | null; supplyDate: string | null; returnJobNumber: string | null; returnJobId: string | null; returnDate: string | null };
type HistoryPayload = { id: string; status: string; entries: HistoryEntry[]; previousCycles: HistoryCycle[]; previousJobs: PexPreviousJob[] };

function text(value: unknown) { return value == null || value === "" ? "—" : String(value); }
function dateText(value: unknown) { return value ? new Date(String(value)).toLocaleDateString("en-ZA") : "—"; }

// Table columns match ModApp's own /pex ("PEX Units") page exactly (Client
// / Unit / Supply job / Return job / Status / Supply date / Return date /
// PO number), rendered with Apollo X's .data-table styling — replaces the
// old duplicate server table + client "record-list" pair.
export function PexTrackingWorkspace({ initial }: { initial: { items: TrackingRow[]; total: number } }) {
  const [error, setError] = useState("");
  const [historyOpenId, setHistoryOpenId] = useState("");
  const [historyById, setHistoryById] = useState<Record<string, HistoryPayload>>({});
  const [historyLoadingId, setHistoryLoadingId] = useState("");

  // 2026-10-06 — user request: the History button opens its own window (the same
  // "Previous jobs" dialog as the PEX panels on a job page) instead of expanding a
  // row inside the table.
  async function toggleHistory(id: string) {
    setHistoryOpenId(id);
    if (historyById[id]) return;
    setHistoryLoadingId(id); setError("");
    try {
      const r = await fetch(`/api/v1/pex/${id}/history`, { cache: "no-store" });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Couldn't load history.");
      setHistoryById((prev) => ({ ...prev, [id]: b as HistoryPayload }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load history.");
      setHistoryOpenId("");
    } finally {
      setHistoryLoadingId("");
    }
  }

  return <>
    {error && <div className="inline-error">{error}</div>}
    <div className="data-table-wrap"><table className="data-table">
      <thead><tr><th>Client</th><th>Unit</th><th>Supply job</th><th>Return job</th><th>Status</th><th>Supply date</th><th>Return date</th><th>PO number</th><th></th></tr></thead>
      <tbody>
        {initial.items.map((item) => {
          return <tr key={item.id}>
              <td>{text(item.customer?.tradingName || item.customer?.name)}</td>
              <td>{text(item.unitDescription)}</td>
              <td className="mono">{item.supplyJob?.id ? <Link href={`/jobs/${item.supplyJob.id}`} className="table-action">{text(item.supplyJob.jobNumber || item.supplyJob.draftNumber)}</Link> : "—"}</td>
              <td className="mono">{item.returnJob?.id ? <Link href={`/jobs/${item.returnJob.id}`} className="table-action">{text(item.returnJob.jobNumber || item.returnJob.draftNumber)}</Link> : "—"}</td>
              <td><PexStatusPill status={item.status} /></td>
              <td>{dateText(item.supplyDate)}</td>
              <td>{dateText(item.returnDate)}</td>
              <td>{text(item.supplyJob?.purchaseOrderNumber)}</td>
              <td className="actions"><button type="button" className="quiet-button" disabled={historyLoadingId === item.id} onClick={() => void toggleHistory(item.id)}>History</button></td>
            </tr>;
        })}
        {initial.items.length === 0 && <tr><td colSpan={9} className="table-state compact-empty-state">No PEX supply chains match the current filters.</td></tr>}
      </tbody>
    </table></div>
    {historyOpenId && <div className="drawer-backdrop" role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) setHistoryOpenId(""); }}>
      <aside className="form-drawer compact-dialog pex-previous-jobs-dialog">
        <header><div><p className="eyebrow">PEX</p><h2>Previous jobs</h2></div><button type="button" onClick={() => setHistoryOpenId("")} aria-label="Close dialog"><X size={18} /></button></header>
        {historyLoadingId === historyOpenId && <span className="muted small-line">Loading history…</span>}
        {historyById[historyOpenId] && <PexPreviousJobsTable jobs={historyById[historyOpenId].previousJobs} />}
      </aside>
    </div>}
  </>;
}
