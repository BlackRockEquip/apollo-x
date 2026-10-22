"use client";

import Link from "next/link";
import { useState } from "react";
import { X } from "lucide-react";
import { ScrollRestore } from "@/components/ScrollRestore";
import { PexPreviousJobsTable, type PexPreviousJob } from "@/components/PexPreviousJobs";
import { useConfirmDialog } from "@/components/ConfirmDialog";

// 2026-10-22, user request: "Scrapped jobs should be able to be viewed on pex stock under a tab called scrapped jobs".
// The PEX Stock page's second tab - units that were scrapped (written off as beyond repair) and so no longer show in the stock
// list. Read-only: when it was scrapped, by whom and why come from the scrap entry on the job (listPexScrapped).
type JobRef = { id: string; jobNumber?: string | null; draftNumber?: string | null; machineMake?: string | null; machineModel?: string | null } | null;
type ScrappedRow = {
  id: string;
  unitDescription?: string | null;
  scrappedAt: string | Date;
  scrappedBy: string | null;
  reason: string | null;
  supplyJob?: JobRef;
  returnJob?: JobRef;
};
type HistoryPayload = { chainJobs: PexPreviousJob[] };

function text(value: unknown) { return value == null || value === "" ? "—" : String(value); }
function dateText(value: unknown) { return value ? new Date(String(value)).toLocaleDateString("en-ZA") : "—"; }

export function PexScrappedWorkspace({ initial, canUnscrap }: { initial: { items: ScrappedRow[]; total: number }; canUnscrap: boolean }) {
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [historyOpenId, setHistoryOpenId] = useState("");
  const [historyById, setHistoryById] = useState<Record<string, HistoryPayload>>({});
  const [historyLoadingId, setHistoryLoadingId] = useState("");

  // 2026-10-22, user request: "add unscrapping button" - puts the unit back into PEX Stock / PEX Tracking.
  async function unscrap(id: string) {
    if (!(await confirm({ message: "Un-scrap this unit and put it back into PEX?", tone: "warning", confirmLabel: "Un-scrap" }))) return;
    setSavingId(id); setError("");
    try {
      const r = await fetch(`/api/v1/pex/${id}/unscrap`, { method: "POST" });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Couldn't un-scrap this unit.");
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't un-scrap this unit.");
    } finally {
      setSavingId("");
    }
  }

  async function openHistory(id: string) {
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
    {confirmDialog}
    <ScrollRestore selector="[data-scroll='pex-scrapped']" storageKey="pex-scrapped" />
    <div className="data-table-wrap" data-scroll="pex-scrapped"><table id="pex-scrapped-table" className="data-table">
      <thead><tr><th>Job #</th><th>Unit</th><th>Make</th><th>Model</th><th>Scrapped on</th><th>Scrapped by</th><th>Reason</th><th>Original supply job</th><th></th></tr></thead>
      <tbody>
        {initial.items.map((item) => {
          // A unit scrapped from PEX Stock has a return job; fall back to the supply job so the row always links somewhere.
          const job = item.returnJob ?? item.supplyJob ?? null;
          return <tr key={item.id}>
            <td className="mono">{job?.id ? <Link href={`/jobs/${job.id}`} className="table-action">{text(job.jobNumber || job.draftNumber)}</Link> : "—"}</td>
            <td>{text(item.unitDescription)}</td>
            <td>{text(item.returnJob?.machineMake)}</td>
            <td>{text(item.returnJob?.machineModel)}</td>
            <td>{dateText(item.scrappedAt)}</td>
            <td>{text(item.scrappedBy)}</td>
            <td>{text(item.reason)}</td>
            <td>{item.supplyJob?.id ? <Link href={`/jobs/${item.supplyJob.id}`} className="table-action mono">{text(item.supplyJob.jobNumber || item.supplyJob.draftNumber)}</Link> : <span className="muted small-line">Allocated directly</span>}</td>
            <td className="actions">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button type="button" className="quiet-button" disabled={historyLoadingId === item.id} onClick={() => void openHistory(item.id)}>History</button>
                {canUnscrap && <button type="button" className="table-action" disabled={savingId === item.id} onClick={() => void unscrap(item.id)}>Un-scrap</button>}
              </div>
            </td>
          </tr>;
        })}
        {initial.items.length === 0 && <tr><td colSpan={9} className="table-state compact-empty-state">No scrapped jobs match the current search.</td></tr>}
      </tbody>
    </table></div>
    {historyOpenId && <div className="drawer-backdrop" role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) setHistoryOpenId(""); }}>
      <aside className="form-drawer compact-dialog pex-previous-jobs-dialog">
        <header><div><p className="eyebrow">PEX</p><h2>PEX job history</h2></div><button type="button" onClick={() => setHistoryOpenId("")} aria-label="Close dialog"><X size={18} /></button></header>
        {historyLoadingId === historyOpenId && <span className="muted small-line">Loading history…</span>}
        {historyById[historyOpenId] && <PexPreviousJobsTable jobs={historyById[historyOpenId].chainJobs} />}
      </aside>
    </div>}
  </>;
}
