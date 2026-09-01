import { Package, AlertTriangle, Boxes } from "lucide-react";
import { requireRequestContext } from "@/lib/auth/session";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

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
      <div className="page-header compact"><div><p className="eyebrow">Overview</p><h1>Dashboard</h1><p>Track stock availability and the latest inventory activity.</p></div></div>

      {inventory && (
        <section className="metric-grid compact" aria-label="Inventory summary">
          <article className="metric-card compact"><Package /><span>Stocked Parts</span><strong>{inventory.totalStocked}</strong></article>
          <article className="metric-card compact"><AlertTriangle /><span>Low Stock</span><strong>{inventory.lowStock}</strong></article>
          <article className="metric-card compact"><Boxes /><span>Out of Stock</span><strong>{inventory.outOfStock}</strong></article>
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

    </div>
  );
}

