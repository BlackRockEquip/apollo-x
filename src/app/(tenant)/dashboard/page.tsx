import { Boxes, BriefcaseBusiness, FileCheck2, Repeat2, Package, AlertTriangle } from "lucide-react";
import { requireRequestContext } from "@/lib/auth/session";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Phase 3 dashboard inventory widgets — permission-gated summaries.
async function inventorySummary(companyId: string | null) {
  if (!companyId) return null;
  const [totalStocked, lowStock, outOfStock, movements] = await Promise.all([
    prisma.part.count({ where: { companyId, stockBalances: { some: { quantityOnHand: { gt: 0 } } } } }),
    prisma.part.count({ where: { companyId, stockBalances: { some: { quantityOnHand: { lte: prisma.stockBalance.fields.lowStockThreshold } } } } }),
    prisma.part.count({ where: { companyId, OR: [{ stockBalances: { none: {} } }, { stockBalances: { every: { quantityOnHand: 0 } } }] } }),
    prisma.stockMovement.findMany({ where: { companyId }, orderBy: { occurredAt: "desc" }, take: 5, select: { id: true, movementType: true, quantity: true, occurredAt: true, part: { select: { partNumber: true } } } }),
  ]);
  return { totalStocked, lowStock, outOfStock, movements };
}

export default async function DashboardPage() {
  const context = await requireRequestContext();
  requireModule(context, "DASHBOARD", "READ");
  requireTenantPermission(context, "DASHBOARD_VIEW");
  const inventory = context.moduleAccess.get("INVENTORY") !== "DENIED" ? await inventorySummary(context.companyId) : null;

  return (
    <div>
      <div className="page-header"><div><p className="eyebrow">Operational overview</p><h1>Dashboard</h1><p>Phase 1 foundation is active. Operational metrics arrive with their authoritative modules.</p></div></div>
      <section className="metric-grid" aria-label="Foundation status">
        <article className="metric-card"><BriefcaseBusiness /><span>Jobs & WIP</span><strong>Foundation ready</strong><small>Phase 4</small></article>
        <article className="metric-card"><Boxes /><span>Inventory</span><strong>Ledger live</strong><small>Phase 3</small></article>
        <article className="metric-card"><Repeat2 /><span>PEX</span><strong>Lifecycle planned</strong><small>Phase 8</small></article>
        <article className="metric-card"><FileCheck2 /><span>Commercial</span><strong>Snapshot-safe</strong><small>Phases 5–9</small></article>
      </section>

      {inventory && (
        <section className="metric-grid" aria-label="Inventory summary">
          <article className="metric-card"><Package /><span>Stocked Parts</span><strong>{inventory.totalStocked}</strong></article>
          <article className="metric-card"><AlertTriangle /><span>Low Stock</span><strong>{inventory.lowStock}</strong></article>
          <article className="metric-card"><Package /><span>Out of Stock</span><strong>{inventory.outOfStock}</strong></article>
        </section>
      )}

      {inventory && inventory.movements.length > 0 && (
        <section className="mt-6">
          <h2>Recent Movements</h2>
          <div className="table-container">
            <table className="data-table">
              <thead><tr><th>Date</th><th>Part</th><th>Type</th><th>Qty</th></tr></thead>
              <tbody>
                {inventory.movements.map((m) => (
                  <tr key={m.id}>
                    <td className="mono">{new Date(m.occurredAt).toLocaleString()}</td>
                    <td className="mono">{m.part.partNumber}</td>
                    <td>{m.movementType}</td>
                                        <td className="numeric">{m.quantity.toString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="foundation-panel">
        <div><h2>Secure tenant foundation</h2><p>This dashboard is rendered only after the server validates the active identity, session version, membership or support context, tenant status, module entitlement and permission.</p></div>
        <span className="status-pill">Active</span>
      </section>
    </div>
  );
}

