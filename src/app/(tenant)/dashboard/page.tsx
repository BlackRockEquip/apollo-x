import { Boxes, BriefcaseBusiness, FileCheck2, Repeat2 } from "lucide-react";
import { requireRequestContext } from "@/lib/auth/session";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const context = await requireRequestContext();
  requireModule(context, "DASHBOARD", "READ");
  requireTenantPermission(context, "DASHBOARD_VIEW");
  return (
    <div>
      <div className="page-header"><div><p className="eyebrow">Operational overview</p><h1>Dashboard</h1><p>Phase 1 foundation is active. Operational metrics arrive with their authoritative modules.</p></div></div>
      <section className="metric-grid" aria-label="Foundation status">
        <article className="metric-card"><BriefcaseBusiness /><span>Jobs & WIP</span><strong>Foundation ready</strong><small>Phase 4</small></article>
        <article className="metric-card"><Boxes /><span>Inventory</span><strong>Ledger planned</strong><small>Phase 3</small></article>
        <article className="metric-card"><Repeat2 /><span>PEX</span><strong>Lifecycle planned</strong><small>Phase 8</small></article>
        <article className="metric-card"><FileCheck2 /><span>Commercial</span><strong>Snapshot-safe</strong><small>Phases 5–9</small></article>
      </section>
      <section className="foundation-panel">
        <div><h2>Secure tenant foundation</h2><p>This dashboard is rendered only after the server validates the active identity, session version, membership or support context, tenant status, module entitlement and permission.</p></div>
        <span className="status-pill">Active</span>
      </section>
    </div>
  );
}
