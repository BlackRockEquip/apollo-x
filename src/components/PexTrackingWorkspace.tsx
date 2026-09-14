"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { PexStatusPill } from "@/components/StatusPill";

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
type HistoryPayload = { id: string; status: string; entries: HistoryEntry[]; previousCycles: HistoryCycle[] };

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

  async function toggleHistory(id: string) {
    if (historyOpenId === id) { setHistoryOpenId(""); return; }
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
          const history = historyById[item.id];
          return <Fragment key={item.id}>
            <tr>
              <td>{text(item.customer?.tradingName || item.customer?.name)}</td>
              <td>{text(item.unitDescription)}</td>
              <td className="mono">{item.supplyJob?.id ? <Link href={`/jobs/${item.supplyJob.id}`} className="table-action">{text(item.supplyJob.jobNumber || item.supplyJob.draftNumber)}</Link> : "—"}</td>
              <td className="mono">{item.returnJob?.id ? <Link href={`/jobs/${item.returnJob.id}`} className="table-action">{text(item.returnJob.jobNumber || item.returnJob.draftNumber)}</Link> : "—"}</td>
              <td><PexStatusPill status={item.status} /></td>
              <td>{dateText(item.supplyDate)}</td>
              <td>{dateText(item.returnDate)}</td>
              <td>{text(item.supplyJob?.purchaseOrderNumber)}</td>
              <td className="actions"><button type="button" className="quiet-button" disabled={historyLoadingId === item.id} onClick={() => void toggleHistory(item.id)}>{historyOpenId === item.id ? "Hide history" : "History"}</button></td>
            </tr>
            {historyOpenId === item.id && <tr><td colSpan={9}>
              {historyLoadingId === item.id && <span className="muted small-line">Loading history…</span>}
              {history && <div className="stack-grid" style={{ gap: 8 }}>
                {history.previousCycles.length > 0 && <div className="muted small-line">Previous cycles: {history.previousCycles.map((c) => `${text(c.supplyJobNumber)} → ${text(c.returnJobNumber)}`).join(", ")}</div>}
                {history.entries.map((entry) => <div key={entry.id} className="muted small-line">{new Date(entry.createdAt).toLocaleString("en-ZA")} · {entry.description}{entry.userName ? ` · ${entry.userName}` : ""}</div>)}
                {history.entries.length === 0 && <span className="muted small-line">No history recorded yet.</span>}
              </div>}
            </td></tr>}
          </Fragment>;
        })}
        {initial.items.length === 0 && <tr><td colSpan={9} className="table-state compact-empty-state">No PEX supply chains match the current filters.</td></tr>}
      </tbody>
    </table></div>
  </>;
}
