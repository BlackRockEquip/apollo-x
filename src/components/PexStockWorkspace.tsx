"use client";

import Link from "next/link";
import { useState } from "react";
import { X } from "lucide-react";
import { PexPreviousJobsTable, type PexPreviousJob } from "@/components/PexPreviousJobs";

type Row = Record<string, unknown> & { id: string };
type PexJobRef = Row & { id: string; jobNumber?: string | null; draftNumber?: string | null; status?: string | null; machineMake?: string | null; machineModel?: string | null };
type InventoryRow = Row & {
  unitDescription?: string | null;
  // Date, not just string: `initial` comes straight from the server
  // component's Prisma read (listPexInventory), and a Date crossing the
  // React Server Component boundary into this client component arrives as
  // a real Date instance, not a JSON string — unlike the History drawer's
  // fetch()+.json() payload below (HistoryCycle), which genuinely is a
  // string. dateText() already handles either via `new Date(String(value))`.
  returnDate?: string | Date | null;
  supplyJob?: PexJobRef | null;
  returnJob?: PexJobRef | null;
};
type HistoryEntry = { id: string; type: string; description: string; userName: string | null; createdAt: string };
type HistoryCycle = { supplyJobNumber: string | null; supplyJobId: string | null; supplyDate: string | null; returnJobNumber: string | null; returnJobId: string | null; returnDate: string | null };
type HistoryPayload = { id: string; status: string; entries: HistoryEntry[]; previousCycles: HistoryCycle[]; previousJobs: PexPreviousJob[]; chainJobs: PexPreviousJob[] };

function text(value: unknown) { return value == null || value === "" ? "—" : String(value); }
function dateText(value: unknown) { return value ? new Date(String(value)).toLocaleDateString("en-ZA") : "—"; }

// Table columns match ModApp's own /pex-inventory page exactly (Job # /
// Unit / Make / Model / Status / Received / Original supply job), rendered
// with Apollo X's .data-table styling. This is now the ONLY table on the
// page — the old duplicate server-rendered <table> + client "record-list"
// pair (leftover from the PexStockUnit/PexSupplyLink model) has been
// dropped in favour of one interactive table, since History/Scrap need
// client-side state either way.
export function PexStockWorkspace({ initial }: { initial: { items: InventoryRow[]; total: number } }) {
  const [items] = useState(initial.items);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState("");
  const [historyOpenId, setHistoryOpenId] = useState("");
  const [historyById, setHistoryById] = useState<Record<string, HistoryPayload>>({});
  const [historyLoadingId, setHistoryLoadingId] = useState("");

  async function scrap(id: string) {
    const reason = window.prompt("Scrap reason", "")?.trim();
    if (!reason || reason.length < 2) return;
    setSavingId(id); setError("");
    try {
      const r = await fetch(`/api/v1/pex/${id}/scrap`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Action failed.");
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setSavingId("");
    }
  }

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
      <thead><tr><th>Job #</th><th>Unit</th><th>Make</th><th>Model</th><th>Status</th><th>Received</th><th>Original supply job</th><th></th></tr></thead>
      <tbody>
        {items.map((item) => {
          const ready = item.returnJob?.status === "COMPLETE";
          return <tr key={item.id}>
              <td className="mono">{item.returnJob?.id ? <Link href={`/jobs/${item.returnJob.id}`} className="table-action">{text(item.returnJob.jobNumber || item.returnJob.draftNumber)}</Link> : "—"}</td>
              <td>{text(item.unitDescription)}</td>
              <td>{text(item.returnJob?.machineMake)}</td>
              <td>{text(item.returnJob?.machineModel)}</td>
              <td><span className={`status-pill tone-${ready ? "green" : "amber"}`}>{ready ? "Ready to go" : "To be repaired"}</span></td>
              <td>{dateText(item.returnDate)}</td>
              <td>{item.supplyJob?.id ? <Link href={`/jobs/${item.supplyJob.id}`} className="table-action mono">{text(item.supplyJob.jobNumber || item.supplyJob.draftNumber)}</Link> : <span className="muted small-line">Allocated directly</span>}</td>
              <td className="actions">
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button type="button" className="quiet-button" disabled={historyLoadingId === item.id} onClick={() => void toggleHistory(item.id)}>History</button>
                  <button type="button" className="table-action danger" disabled={savingId === item.id} onClick={() => void scrap(item.id)}>Scrap</button>
                </div>
              </td>
            </tr>;
        })}
        {items.length === 0 && <tr><td colSpan={8} className="table-state compact-empty-state">No PEX units in inventory match the current filters.</td></tr>}
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
