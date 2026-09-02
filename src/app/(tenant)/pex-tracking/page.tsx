import Link from "next/link";
import { Search } from "lucide-react";
import { requireRequestContext } from "@/lib/auth/session";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { listPexSupplyLinks } from "@/lib/pex/service";
import { PexTrackingWorkspace } from "@/components/PexTrackingWorkspace";

export const dynamic = "force-dynamic";

export default async function PexTrackingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireRequestContext();
  requireModule(ctx, "PEX_TRACKING", "READ");
  requireTenantPermission(ctx, "PEX_TRACKING_VIEW");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const status = typeof sp.status === "string" ? sp.status : "ALL";
  const data = await listPexSupplyLinks(ctx, { q, status, page: 1, pageSize: 50 });
  return <div>
    <header className="page-header compact"><div><p className="eyebrow">PEX</p><h1>PEX Tracking</h1><p>Outstanding returns, supplied units and expected-versus-actual core history.</p></div></header>
    <section className="master-panel jobs-panel">
      <div className="master-toolbar jobs-toolbar">
        <form id="pex-tracking-filter-form" method="GET" action="/pex-tracking" className="search-control inventory-search-control"><Search size={15} /><input type="text" name="q" placeholder="Search PEX supply, return, component or core details" defaultValue={q} /></form>
        <select name="status" defaultValue={status} form="pex-tracking-filter-form"><option value="ALL">All</option><option value="OUTSTANDING">Outstanding</option><option value="EXPECTED">Expected</option><option value="RECEIVED">Received</option><option value="CLOSED_WITHOUT_RETURN">Closed without return</option></select>
        <button type="submit" form="pex-tracking-filter-form" className="quiet-button">Apply</button>
        <span>{data.total} chain{data.total === 1 ? "" : "s"}</span>
      </div>
      <div className="data-table-wrap"><table className="data-table"><thead><tr><th>PEX supply</th><th>Customer</th><th>Supplied unit</th><th>PEX return</th><th>Expected core</th><th>Actual core</th><th>Status</th></tr></thead><tbody>
        {data.items.map((item) => <tr key={item.id}><td><Link href={`/jobs/${item.supplyJob.id}`} className="table-action mono">{item.supplyJob.jobNumber || item.supplyJob.draftNumber}</Link></td><td>{item.supplyJob.customer?.tradingName || item.supplyJob.customer?.name || "—"}</td><td><div>{item.pexStockUnit.component}</div><div className="muted small-line">{item.pexStockUnit.componentSerial || item.pexStockUnit.componentPartNumber || "—"}</div></td><td><Link href={`/jobs/${item.returnJob.id}`} className="table-action mono">{item.returnJob.jobNumber || item.returnJob.draftNumber}</Link></td><td><div>{item.expectedCoreDescription || "—"}</div><div className="muted small-line">{item.expectedCorePartNumber || "—"} · {item.expectedCoreSerial || "—"}</div></td><td><div>{item.returnedCoreDescription || "—"}</div><div className="muted small-line">{item.returnedCorePartNumber || "—"} · {item.returnedCoreSerial || "—"}</div></td><td><span className="status-pill">{item.returnStatus}</span></td></tr>)}
        {data.items.length === 0 && <tr><td colSpan={7} className="table-state compact-empty-state">No PEX supply chains match the current filters.</td></tr>}
      </tbody></table></div>
      <PexTrackingWorkspace initial={data} />
    </section>
  </div>;
}