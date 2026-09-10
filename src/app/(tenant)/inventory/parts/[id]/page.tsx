import { Eye } from "lucide-react";
import { requireRequestContext } from "@/lib/auth/session";
import { requireModule } from "@/lib/auth/guards";
import { getInventoryDetail, listStockMovements } from "@/lib/inventory/service";
import { movementQuery } from "@/lib/inventory/validation";

export const dynamic = "force-dynamic";

// Phase 3 Part detail — separates Part Master (catalog) from Stock Position (ledger).
export default async function PartDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireRequestContext();
  requireModule(ctx, "INVENTORY", "READ");
  const { id } = await params;

  const detail = await getInventoryDetail(ctx, id);
  const movements = await listStockMovements(ctx, movementQuery.parse({ partId: id }));

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Part Detail</p>
          <h1>{detail.part.partNumber}</h1>
          <p>{detail.part.description}</p>
          <p className="small-line muted">Bin location: {detail.part.binLocationLabel || "Not assigned"}</p>
        </div>
      </div>

      <section className="grid grid-cols-3 gap-4 mb-6">
        <div className="stat-card"><strong>{detail.quantityOnHand}</strong><small>On Hand</small></div>
        <div className="stat-card"><strong>{detail.quantityReserved}</strong><small>Reserved</small></div>
        <div className="stat-card"><strong>{detail.quantityAvailable}</strong><small>Available</small></div>
      </section>

      {(detail.part.defaultSellingPrice ?? detail.part.reorderMinimum) &&
       (ctx.tenantPermissions.has("INVENTORY_VIEW_COST" as never) || ctx.platformPermissions.size > 0) && (
        <section className="stat-card-inline mb-6">
          <strong>Unit Cost: {detail.part.defaultSellingPrice}</strong>
          <small>Cost data is restricted — finance roles only.</small>
        </section>
      )}

      <h2>Location Breakdown</h2>
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr><th>Location</th><th className="numeric">On Hand</th><th className="numeric">Reserved</th><th className="numeric">Available</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {detail.locations.map((loc) => (
              <tr key={loc.locationId}>
                <td>{loc.name} <small className="mono text-zinc-500">({loc.code})</small></td>
                <td className="numeric">{loc.quantityOnHand}</td>
                <td className="numeric">{loc.quantityReserved}</td>
                <td className="numeric">{loc.quantityAvailable}</td>
                <td>
                  <a href={`/inventory/locations/${loc.locationId}`} className="action-link"><Eye size={14} /></a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-6">Recent Movements</h2>
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr><th>Date</th><th>Type</th><th>Qty</th><th>From</th><th>To</th><th>Reference</th><th>Reason</th></tr>
          </thead>
          <tbody>
            {movements.items.map((m) => (
              <tr key={m.id}>
                <td className="mono">{new Date(m.occurredAt).toLocaleString()}</td>
                <td>{m.movementType}</td>
                <td className="numeric">{m.quantity}</td>
                <td>{m.fromLocation?.name || "—"}</td>
                <td>{m.toLocation?.name || "—"}</td>
                <td>{m.referenceNumber || m.referenceType || "—"}</td>
                <td>{m.reason || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
