"use client";

import Link from "next/link";
import { useState } from "react";
import { X } from "lucide-react";
import { ScrollRestore } from "@/components/ScrollRestore";
import { PexPreviousJobsTable, type PexPreviousJob } from "@/components/PexPreviousJobs";
import { PEX_STOCK_DEFAULT_COLUMNS, pexModelText, pexStockColumnLabel, type PexStockColumnId } from "@/lib/pex/stock-columns";

type Row = Record<string, unknown> & { id: string };
type PexJobRef = Row & {
  id: string; jobNumber?: string | null; draftNumber?: string | null; status?: string | null; machineMake?: string | null; machineModel?: string | null;
  // 2026-10-28: the Model column shows machine model / component model, and the optional columns.
  componentModel?: string | null; machineSerial?: string | null; component?: string | null; componentType?: string | null; componentSerial?: string | null; componentPartNumber?: string | null; description?: string | null;
};
type InventoryRow = Row & {
  unitDescription?: string | null;
  // Date, not just string: `initial` comes straight from the server
  // component's Prisma read (listPexInventory), and a Date crossing the
  // React Server Component boundary into this client component arrives as
  // a real Date instance, not a JSON string — unlike the History drawer's
  // fetch()+.json() payload below (HistoryCycle), which genuinely is a
  // string. dateText() already handles either via `new Date(String(value))`.
  returnDate?: string | Date | null;
  supplyDate?: string | Date | null;
  notes?: string | null;
  supplyJob?: PexJobRef | null;
  returnJob?: PexJobRef | null;
};
type HistoryEntry = { id: string; type: string; description: string; userName: string | null; createdAt: string };
type HistoryCycle = { supplyJobNumber: string | null; supplyJobId: string | null; supplyDate: string | null; returnJobNumber: string | null; returnJobId: string | null; returnDate: string | null };
type HistoryPayload = { id: string; status: string; entries: HistoryEntry[]; previousCycles: HistoryCycle[]; previousJobs: PexPreviousJob[]; chainJobs: PexPreviousJob[] };

function text(value: unknown) { return value == null || value === "" ? "—" : String(value); }
function dateText(value: unknown) { return value ? new Date(String(value)).toLocaleDateString("en-ZA") : "—"; }

// Table columns started as ModApp's own /pex-inventory page (Job # / Unit /
// Make / Model / Status / Received / Original supply job); 2026-10-28: Job #,
// Unit, Make, Model and Status are fixed and the rest are each user's own
// choice (stock-columns.ts), Model shows machine model / component model, and the
// list arrives newest job first (stock-order.ts). Rendered
// with Apollo X's .data-table styling. This is now the ONLY table on the
// page — the old duplicate server-rendered <table> + client "record-list"
// pair (leftover from the PexStockUnit/PexSupplyLink model) has been
// dropped in favour of one interactive table, since History/Scrap need
// client-side state either way.
export function PexStockWorkspace({ initial, columns = PEX_STOCK_DEFAULT_COLUMNS }: { initial: { items: InventoryRow[]; total: number }; columns?: PexStockColumnId[] }) {
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

  function renderCell(id: PexStockColumnId, item: InventoryRow) {
    const job = item.returnJob;
    const ready = job?.status === "COMPLETE";
    switch (id) {
      case "jobNumber":
        return <td key={id} className="mono">{job?.id ? <Link href={`/jobs/${job.id}`} className="table-action">{text(job.jobNumber || job.draftNumber)}</Link> : "—"}</td>;
      case "unit":
        return <td key={id}>{text(item.unitDescription)}</td>;
      case "make":
        return <td key={id}>{text(job?.machineMake)}</td>;
      case "model":
        return <td key={id}>{text(pexModelText(job?.machineModel, job?.componentModel))}</td>;
      case "status":
        return <td key={id}><span className={`status-pill tone-${ready ? "green" : "amber"}`}>{ready ? "Ready to go" : "To be repaired"}</span></td>;
      case "received":
        return <td key={id}>{dateText(item.returnDate)}</td>;
      case "supplyJob":
        return <td key={id}>{item.supplyJob?.id ? <Link href={`/jobs/${item.supplyJob.id}`} className="table-action mono">{text(item.supplyJob.jobNumber || item.supplyJob.draftNumber)}</Link> : <span className="muted small-line">Allocated directly</span>}</td>;
      case "machineSerial":
        return <td key={id}>{text(job?.machineSerial)}</td>;
      case "component":
        return <td key={id}>{text(job?.component)}</td>;
      case "componentType":
        return <td key={id}>{text(job?.componentType)}</td>;
      case "componentSerial":
        return <td key={id}>{text(job?.componentSerial)}</td>;
      case "partNumber":
        return <td key={id}>{text(job?.componentPartNumber)}</td>;
      case "jobDescription":
        return <td key={id}>{text(job?.description)}</td>;
      case "supplyDate":
        return <td key={id}>{dateText(item.supplyDate)}</td>;
      case "notes":
        return <td key={id}>{text(item.notes)}</td>;
    }
  }

  return <>
    {error && <div className="inline-error">{error}</div>}
    {/* 2026-10-09, user request: "When clicking back, let it remember where you were" — table scroll position (filters/page are already in the URL). */}
    <ScrollRestore selector="[data-scroll='pex-stock']" storageKey="pex-stock" />
    <div className="data-table-wrap" data-scroll="pex-stock"><table id="pex-stock-table" className="data-table">
      <thead><tr>{columns.map((id) => <th key={id}>{pexStockColumnLabel(id)}</th>)}<th></th></tr></thead>
      <tbody>
        {items.map((item) => {
          // 2026-10-22, user request: search as you type - the page's search box filters these rows in the browser (LiveSearchInput + TableColumnFilters) using data-search; same fields the server search covers.
          return <tr key={item.id} data-search={[item.unitDescription, item.returnJob?.jobNumber, item.returnJob?.draftNumber, item.returnJob?.machineMake, item.returnJob?.machineModel, item.returnJob?.componentModel, item.supplyJob?.jobNumber, item.supplyJob?.draftNumber].filter(Boolean).join(" ").toLowerCase()}>
              {columns.map((id) => renderCell(id, item))}
              <td className="actions">
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button type="button" className="quiet-button" disabled={historyLoadingId === item.id} onClick={() => void toggleHistory(item.id)}>History</button>
                  <button type="button" className="table-action danger" disabled={savingId === item.id} onClick={() => void scrap(item.id)}>Scrap</button>
                </div>
              </td>
            </tr>;
        })}
        {items.length === 0 && <tr><td colSpan={columns.length + 1} className="table-state compact-empty-state">No PEX units in inventory match the current filters.</td></tr>}
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
