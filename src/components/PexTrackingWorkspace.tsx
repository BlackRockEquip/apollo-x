"use client";

import Link from "next/link";

type Row = Record<string, unknown> & { id: string };
type LinkRow = Row & {
  returnStatus?: string | null;
  expectedCoreDescription?: string | null;
  expectedCorePartNumber?: string | null;
  expectedCoreSerial?: string | null;
  returnedCoreDescription?: string | null;
  returnedCorePartNumber?: string | null;
  returnedCoreSerial?: string | null;
  returnedReceivedAt?: string | Date | null;
  closedWithoutReturnReason?: string | null;
  supplyJob: Row & { id: string; jobNumber?: string | null; draftNumber?: string | null; customer?: { name?: string | null; tradingName?: string | null } | null };
  returnJob: Row & { id: string; jobNumber?: string | null; draftNumber?: string | null };
  pexStockUnit: Row & { component?: string | null; componentSerial?: string | null; componentPartNumber?: string | null; sourceJob?: Record<string, unknown> & { jobNumber?: string | null; draftNumber?: string | null } };
};

function text(value: unknown) { return value == null || value === "" ? "—" : String(value); }

export function PexTrackingWorkspace({ initial }: { initial: { items: LinkRow[]; total: number } }) {
  return <section className="detail-panel">
    <header><div><h2>PEX exchange tracking</h2><p>{initial.total} visible exchange chain{initial.total === 1 ? "" : "s"} in the current filtered view.</p></div></header>
    <div className="record-list pex-record-list">
      {initial.items.map((item) => <article key={item.id}>
        <div className="record-icon">RT</div>
        <div>
          <strong>{text(item.supplyJob.jobNumber || item.supplyJob.draftNumber)} → {text(item.returnJob.jobNumber || item.returnJob.draftNumber)}</strong>
          <span className="muted small-line">Customer: {text(item.supplyJob.customer?.tradingName || item.supplyJob.customer?.name)}</span>
          <span>{text(item.pexStockUnit.component)} · {text(item.pexStockUnit.componentPartNumber)} · {text(item.pexStockUnit.componentSerial)}</span>
        </div>
        <div className="stack-grid pex-link-stack">
          <span className="muted small-line">Expected: {text(item.expectedCoreDescription)} · {text(item.expectedCorePartNumber)} · {text(item.expectedCoreSerial)}</span>
          <span className="muted small-line">Actual: {text(item.returnedCoreDescription)} · {text(item.returnedCorePartNumber)} · {text(item.returnedCoreSerial)}</span>
          <span className="muted small-line">Received: {text(item.returnedReceivedAt ? new Date(String(item.returnedReceivedAt)).toLocaleString("en-ZA") : "—")}</span>
          {item.closedWithoutReturnReason ? <span className="muted small-line">Closed w/o return: {text(item.closedWithoutReturnReason)}</span> : null}
        </div>
        <span className="status-pill">{text(item.returnStatus)}</span>
        <div className="stack-grid pex-link-stack">
          <Link href={`/jobs/${item.supplyJob.id}`} className="table-action">Open supply</Link>
          <Link href={`/jobs/${item.returnJob.id}`} className="table-action">Open return</Link>
        </div>
      </article>)}
      {initial.items.length === 0 && <div className="table-state">No PEX supply chains match the current filters.</div>}
    </div>
  </section>;
}