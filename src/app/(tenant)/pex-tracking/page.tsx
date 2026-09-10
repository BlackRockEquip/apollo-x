import { Search } from "lucide-react";
import { requireRequestContext } from "@/lib/auth/session";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { listPexTracking } from "@/lib/pex/service";
import { PexTrackingWorkspace } from "@/components/PexTrackingWorkspace";

export const dynamic = "force-dynamic";

// "PEX Tracking" is Apollo X's own page/route name and sidebar label — kept
// unchanged — for what shows ModApp's "PEX Units" content: every PEX record
// with a supply leg, the full supply → return cycle. Table columns below
// match ModApp's /pex page exactly (Client / Unit / Supply job / Return job
// / Status / Supply date / Return date / PO number), styled with Apollo X's
// own .data-table/.status-pill conventions. The search box + status
// dropdown above the table is an Apollo X convention every other list page
// in this app has that ModApp's own page doesn't — added for consistency,
// not parity.
export default async function PexTrackingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireRequestContext();
  requireModule(ctx, "PEX_TRACKING", "READ");
  requireTenantPermission(ctx, "PEX_TRACKING_VIEW");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const status = typeof sp.status === "string" ? sp.status : "ALL";
  const data = await listPexTracking(ctx, { q, status, page: 1, pageSize: 50 });
  return <div>
    <header className="page-header compact"><div><p className="eyebrow">PEX</p><h1>PEX Tracking</h1><p>Every PEX unit supplied and returned, linked pair by pair for full history and auditing. Looking for what&apos;s currently on the shelf? See PEX Stock instead.</p></div></header>
    <section className="master-panel jobs-panel">
      <div className="master-toolbar jobs-toolbar">
        <form id="pex-tracking-filter-form" method="GET" action="/pex-tracking" className="search-control inventory-search-control"><Search size={15} /><input type="text" name="q" placeholder="Search unit, customer, supply or return job" defaultValue={q} /></form>
        <select name="status" defaultValue={status} form="pex-tracking-filter-form"><option value="ALL">All</option><option value="TO_BE_DELIVERED">To be delivered</option><option value="AWAIT_CORE">Awaiting core</option><option value="OUTSTANDING">Outstanding</option><option value="RECEIVED">Received</option><option value="IN_REPAIR">In repair</option><option value="COMPLETED">Completed</option><option value="SCRAPPED">Scrapped</option></select>
        <button type="submit" form="pex-tracking-filter-form" className="quiet-button">Apply</button>
        <span>{data.total} chain{data.total === 1 ? "" : "s"}</span>
      </div>
      <section className="metric-grid compact">
        <article className="metric-card compact"><span>To be delivered</span><strong>{data.counts.toBeDelivered}</strong></article>
        <article className="metric-card compact"><span>Awaiting core</span><strong>{data.counts.awaitCore}</strong></article>
        <article className="metric-card compact"><span>Outstanding at client</span><strong>{data.counts.outstanding}</strong></article>
        <article className="metric-card compact"><span>Received, awaiting inspection</span><strong>{data.counts.received}</strong></article>
        <article className="metric-card compact"><span>In repair</span><strong>{data.counts.inRepair}</strong></article>
      </section>
      <PexTrackingWorkspace initial={data} />
    </section>
  </div>;
}
