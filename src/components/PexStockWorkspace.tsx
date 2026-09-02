"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Row = Record<string, unknown> & { id: string };
type StockRow = Row & {
  component?: string | null;
  componentType?: string | null;
  componentPartNumber?: string | null;
  componentSerial?: string | null;
  status?: string | null;
  sourceJob?: Row & { id: string; jobNumber?: string | null; draftNumber?: string | null };
  currentSupplyJob?: Row & { id: string; jobNumber?: string | null; draftNumber?: string | null } | null;
  currentReturnJob?: Row & { id: string; jobNumber?: string | null; draftNumber?: string | null } | null;
  storageLocation?: Row & { code?: string | null; name?: string | null } | null;
};

function text(value: unknown) { return value == null || value === "" ? "—" : String(value); }

export function PexStockWorkspace({ initial }: { initial: { items: StockRow[]; total: number } }) {
  const [items] = useState(initial.items);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState("");
  const total = useMemo(() => items.length, [items]);

  async function act(id: string, path: string, label: string) {
    const reason = window.prompt(`${label} reason`, "")?.trim();
    if (!reason) return;
    setSavingId(id); setError("");
    try {
      const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Action failed.");
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setSavingId("");
    }
  }

  return <>
    {error && <div className="inline-error">{error}</div>}
    <section className="detail-panel">
      <header><div><h2>Operational PEX stock</h2><p>{total} visible unit{total === 1 ? "" : "s"} in the current filtered view.</p></div></header>
      <div className="record-list pex-record-list">
        {items.map((item) => <article key={item.id}>
          <div className="record-icon">PX</div>
          <div>
            <strong>{text(item.component)}</strong>
            <span>{text(item.componentPartNumber)} · {text(item.componentSerial)} · {text(item.storageLocation?.code || item.storageLocation?.name)}</span>
          </div>
          <span className="status-pill">{text(item.status)}</span>
          <div className="stack-grid pex-link-stack">
            <Link href={`/jobs/${item.sourceJob?.id}`} className="table-action">Source {text(item.sourceJob?.jobNumber || item.sourceJob?.draftNumber)}</Link>
            {item.currentSupplyJob?.id ? <Link href={`/jobs/${item.currentSupplyJob.id}`} className="table-action">Supply {text(item.currentSupplyJob.jobNumber || item.currentSupplyJob.draftNumber)}</Link> : <span className="muted small-line">No linked supply</span>}
            {item.currentReturnJob?.id ? <Link href={`/jobs/${item.currentReturnJob.id}`} className="table-action">Return {text(item.currentReturnJob.jobNumber || item.currentReturnJob.draftNumber)}</Link> : null}
          </div>
          <div className="stack-row">
            {item.status === "AVAILABLE" && <button className="quiet-button" disabled={savingId === item.id} onClick={() => void act(item.id, `/api/v1/pex-stock/${item.id}/quarantine`, "Quarantine")}>Quarantine</button>}
            {item.status === "QUARANTINE" && <button className="quiet-button" disabled={savingId === item.id} onClick={() => void act(item.id, `/api/v1/pex-stock/${item.id}/release`, "Release")}>Release</button>}
            {item.status !== "SCRAPPED" && <button className="table-action danger" disabled={savingId === item.id} onClick={() => void act(item.id, `/api/v1/pex-stock/${item.id}/scrap`, "Scrap")}>Scrap</button>}
          </div>
        </article>)}
        {items.length === 0 && <div className="table-state">No PEX stock units match the current filters.</div>}
      </div>
    </section>
  </>;
}