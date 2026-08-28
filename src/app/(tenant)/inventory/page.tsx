import { Boxes, Search, Eye, Plus } from "lucide-react";
import { requireRequestContext } from "@/lib/auth/session";
import { requireModule } from "@/lib/auth/guards";
import { MODULE_LABELS } from "@/lib/constants";
import { listInventoryPositions } from "@/lib/inventory/service";
import { positionQuery } from "@/lib/inventory/validation";
import { STOCK_STATE_LABEL, STOCK_STATE_CLASS, type StockState } from "@/lib/inventory/stock-state";

export const dynamic = "force-dynamic";

// Phase 3 Inventory landing page — compact, dense, Mornay-style layout with Apollo X styling.
export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireRequestContext();
  requireModule(ctx, "INVENTORY", "READ");

  const sp = await searchParams;
  const parsed = positionQuery.parse({
    q: typeof sp.q === "string" ? sp.q : undefined,
    locationId: typeof sp.locationId === "string" ? sp.locationId : undefined,
    manufacturerId: typeof sp.manufacturerId === "string" ? sp.manufacturerId : undefined,
    category: typeof sp.category === "string" ? sp.category : undefined,
    stockState: typeof sp.stockState === "string" ? sp.stockState : undefined,
    active: typeof sp.active === "string" ? sp.active : undefined,
    page: typeof sp.page === "string" ? sp.page : undefined,
    pageSize: typeof sp.pageSize === "string" ? sp.pageSize : undefined,
  });

  const data = await listInventoryPositions(ctx, parsed);
  const { items: rows, total, page, pageSize } = data;
  const hasManage = ["INVENTORY_RECEIVE", "INVENTORY_TRANSFER", "INVENTORY_ISSUE", "INVENTORY_ADJUST"].some((p) => ctx.tenantPermissions.has(p as never));

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">{MODULE_LABELS.INVENTORY}</p>
          <h1>Inventory</h1>
          <p>Stock on hand, location breakdown, reservations, and recent movements.</p>
        </div>
      </div>

      <section className="inventory-tools">
        <div className="search-box">
          <Search size={16} />
          <form id="inventory-filter-form" method="GET" action="/inventory">
            <input type="text" name="q" placeholder="Part number, description, manufacturer…" defaultValue={parsed.q || ""} />
            <button type="submit">Filter</button>
          </form>
        </div>

        <div className="stock-filters">
          {(["ALL", "OUT_OF_STOCK", "LOW_STOCK", "IN_STOCK"] as const).map((s) => (
            <label key={s}>
              <input type="radio" name="stockState" value={s} defaultChecked={parsed.stockState === s} form="inventory-filter-form" />
              {s === "ALL" ? "All" : STOCK_STATE_LABEL[s as Exclude<StockState, "RESERVED" | "PARTIALLY_RESERVED" | "INACTIVE_PART">]}
            </label>
          ))}
        </div>

        {hasManage && (
          <button className="action-btn primary">
            <Plus size={16} /> Receive Stock
          </button>
        )}
      </section>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Part</th>
              <th>Description</th>
              <th>Manufacturer</th>
              <th className="numeric">On Hand</th>
              <th className="numeric">Reserved</th>
              <th className="numeric">Available</th>
              <th>Location(s)</th>
              <th>State</th>
              <th className="actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="mono">{row.partNumber}</td>
                <td>{row.description}</td>
                <td>{row.manufacturerName || "—"}</td>
                <td className="numeric">{row.quantityOnHand}</td>
                <td className="numeric">{row.quantityReserved}</td>
                <td className="numeric">{row.quantityAvailable}</td>
                <td>{row.locationCount} location{row.locationCount === 1 ? "" : "s"}</td>
                <td>
                  <span className={`state-badge ${STOCK_STATE_CLASS[row.stockState as StockState]}`}>{STOCK_STATE_LABEL[row.stockState as StockState]}</span>
                </td>
                <td className="actions">
                  <a href={`/inventory/parts/${row.id}`} className="action-link" title="View part detail">
                    <Eye size={15} />
                  </a>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="empty-state">
                  <Boxes size={32} />
                  <span>No parts match the current filters.</span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pagination-bar">
        Showing {total === 0 ? 0 : (page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} of {total}
      </div>
    </div>
  );
}
