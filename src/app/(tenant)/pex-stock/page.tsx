import { Search } from "lucide-react";
import { requireRequestContext } from "@/lib/auth/session";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { listPexInventory } from "@/lib/pex/service";
import { PexStockWorkspace } from "@/components/PexStockWorkspace";

export const dynamic = "force-dynamic";

// "PEX Stock" is Apollo X's own page/route name and sidebar label — kept
// unchanged — for what shows ModApp's "PEX Inventory" content: units that
// have physically come back from a client and aren't out on a job yet.
// Table columns below match ModApp's /pex-inventory page exactly (Job # /
// Unit / Make / Model / Status / Received / Original supply job), styled
// with Apollo X's own .data-table/.status-pill conventions. The search box
// + status dropdown above the table is an Apollo X convention every other
// list page in this app has that ModApp's own page doesn't (its filtering
// is per-column, client-side only) — added for consistency, not parity.
export default async function PexStockPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireRequestContext();
  requireModule(ctx, "PEX_STOCK", "READ");
  requireTenantPermission(ctx, "PEX_STOCK_VIEW");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const status = typeof sp.status === "string" ? sp.status : "ALL";
  const data = await listPexInventory(ctx, { q, status, page: 1, pageSize: 50 });
  return <div>
    <header className="page-header compact"><div><p className="eyebrow">PEX</p><h1>PEX Stock</h1><p>Units that have physically come back from a client and aren&apos;t out on a job yet — what&apos;s on the shelf right now. For the full supply → return history of every unit, see PEX Tracking.</p></div></header>
    <section className="master-panel jobs-panel">
      <div className="master-toolbar jobs-toolbar">
        <form id="pex-stock-filter-form" method="GET" action="/pex-stock" className="search-control inventory-search-control"><Search size={15} /><input type="text" name="q" placeholder="Search unit, job number or machine make/model" defaultValue={q} /></form>
        <select name="status" defaultValue={status} form="pex-stock-filter-form"><option value="ALL">All</option><option value="READY">Ready to go</option><option value="TO_BE_REPAIRED">To be repaired</option></select>
        <button type="submit" form="pex-stock-filter-form" className="quiet-button">Apply</button>
        <span>{data.totalCount} unit{data.totalCount === 1 ? "" : "s"}</span>
      </div>
      <section className="metric-grid compact">
        <article className="metric-card compact"><span>Total units in inventory</span><strong>{data.totalCount}</strong></article>
        <article className="metric-card compact"><span>To be repaired</span><strong>{data.toBeRepairedCount}</strong></article>
        <article className="metric-card compact"><span>Ready to go</span><strong>{data.readyCount}</strong></article>
      </section>
      <PexStockWorkspace initial={data} />
    </section>
  </div>;
}
