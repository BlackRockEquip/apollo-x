import { Package, Eye } from "lucide-react";
import { requireRequestContext } from "@/lib/auth/session";
import { requireModule } from "@/lib/auth/guards";
import { getLocationDetail, listStockMovements } from "@/lib/inventory/service";
import { movementQuery } from "@/lib/inventory/validation";

export const dynamic = "force-dynamic";

// Phase 3 Storage Location detail — shows all parts stored at this location.
export default async function LocationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireRequestContext();
  requireModule(ctx, "INVENTORY", "READ");
  const { id } = await params;

  const detail = await getLocationDetail(ctx, id);
  const movements = await listStockMovements(ctx, movementQuery.parse({ locationId: id, page: "1", pageSize: "25" }));

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Location Detail</p>
          <h1>{detail.code} — {detail.name}</h1>
          <p>{detail.type}</p>
        </div>
      </div>

      <h2>Parts at This Location</h2>
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr><th>Part Number</th><th>Description</th><th className="numeric">On Hand</th><th className="numeric">Reserved</th><th className="numeric">Available</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {detail.parts.map((p) => (
              <tr key={p.partId}>
                <td className="mono">{p.partNumber}</td>
                <td>{p.description}</td>
                <td className="numeric">{p.quantityOnHand}</td>
                <td className="numeric">{p.quantityReserved}</td>
                <td className="numeric">{p.quantityAvailable}</td>
                <td>
                  <a href={`/inventory/parts/${p.partId}`} className="action-link" title="View part"><Eye size={14} /></a>
                </td>
              </tr>
            ))}
            {detail.parts.length === 0 && (
              <tr>
                <td colSpan={6} className="empty-state">
                  <Package size={24} />
                  <span>No parts stocked at this location.</span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mt-6">Recent Movements</h2>
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr><th>Date</th><th>Part</th><th>Type</th><th>Qty</th><th>From</th><th>To</th><th>Reference</th></tr>
          </thead>
          <tbody>
            {movements.items.map((m) => (
              <tr key={m.id}>
                <td className="mono">{new Date(m.occurredAt).toISOString()}</td>
                <td>{m.partNumber}</td>
                <td>{m.movementType}</td>
                <td className="numeric">{m.quantity}</td>
                <td>{m.fromLocation?.name || "—"}</td>
                <td>{m.toLocation?.name || "—"}</td>
                <td>{m.referenceNumber || m.referenceType || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
