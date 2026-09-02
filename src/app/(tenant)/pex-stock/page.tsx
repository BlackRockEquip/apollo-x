import Link from "next/link";
import { Search } from "lucide-react";
import { requireRequestContext } from "@/lib/auth/session";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { listPexStockUnits } from "@/lib/pex/service";
import { PexStockWorkspace } from "@/components/PexStockWorkspace";

export const dynamic = "force-dynamic";

export default async function PexStockPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireRequestContext();
  requireModule(ctx, "PEX_STOCK", "READ");
  requireTenantPermission(ctx, "PEX_STOCK_VIEW");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const status = typeof sp.status === "string" ? sp.status : "ALL";
  const data = await listPexStockUnits(ctx, { q, status, page: 1, pageSize: 50 });
  return <div>
    <header className="page-header compact"><div><p className="eyebrow">PEX</p><h1>PEX Stock</h1><p>Serialized completed-repair units available for PEX supply workflows.</p></div></header>
    <section className="master-panel jobs-panel">
      <div className="master-toolbar jobs-toolbar">
        <form id="pex-stock-filter-form" method="GET" action="/pex-stock" className="search-control inventory-search-control"><Search size={15} /><input type="text" name="q" placeholder="Search component, serial, source repair or location" defaultValue={q} /></form>
        <select name="status" defaultValue={status} form="pex-stock-filter-form"><option value="ALL">All</option><option value="AVAILABLE">Available</option><option value="SUPPLIED">Supplied</option><option value="QUARANTINE">Quarantine</option><option value="SCRAPPED">Scrapped</option></select>
        <button type="submit" form="pex-stock-filter-form" className="quiet-button">Apply</button>
        <span>{data.total} unit{data.total === 1 ? "" : "s"}</span>
      </div>
      <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Component</th><th>Source repair</th><th>Location</th><th>Status</th><th>Current supply</th><th></th></tr></thead><tbody>
        {data.items.map((item) => <tr key={item.id}><td><strong>{item.component}</strong><div className="muted small-line">{item.componentPartNumber || "—"} · {item.componentSerial || "No serial"}</div></td><td><Link href={`/jobs/${item.sourceJob.id}`} className="table-action mono">{item.sourceJob.jobNumber || item.sourceJob.draftNumber}</Link></td><td>{item.storageLocation?.code || item.storageLocation?.name || "—"}</td><td><span className="status-pill">{item.status}</span></td><td>{item.currentSupplyJob?.id ? <Link href={`/jobs/${item.currentSupplyJob.id}`} className="table-action mono">{item.currentSupplyJob.jobNumber || item.currentSupplyJob.draftNumber}</Link> : "—"}</td><td className="actions"><Link href={`/jobs/${item.currentReturnJob?.id || item.currentSupplyJob?.id || item.sourceJob.id}`} className="table-action">Open flow</Link></td></tr>)}
        {data.items.length === 0 && <tr><td colSpan={6} className="table-state compact-empty-state">No PEX stock units match the current filters.</td></tr>}
      </tbody></table></div>
      <PexStockWorkspace initial={data} />
    </section>
  </div>;
}