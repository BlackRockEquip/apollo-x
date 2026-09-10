import { requireRequestContext } from "@/lib/auth/session";
import { requireModule } from "@/lib/auth/guards";
import { StockLevelsWorkspace } from "@/components/StockLevelsWorkspace";

export const dynamic = "force-dynamic";

// 2026-09-10 — thin async server wrapper, same split used for
// settings/dashboard, users and support: this only needs to gate module
// access and compute the one server-only permission flag
// (hasManage/Receive Stock) the client workspace can't check itself; the
// listing, filters, pagination and the new create/edit/delete drawer all
// live in StockLevelsWorkspace.tsx so a part can be managed without a full
// page round-trip. Parts Catalog used to be its own page (/parts) — it's
// now folded into this one (see StockLevelsWorkspace.tsx header comment).
export default async function InventoryPage() {
  const ctx = await requireRequestContext();
  requireModule(ctx, "INVENTORY", "READ");
  const hasManage = ["INVENTORY_RECEIVE", "INVENTORY_TRANSFER", "INVENTORY_ISSUE", "INVENTORY_ADJUST"].some((p) => ctx.tenantPermissions.has(p as never));
  return <StockLevelsWorkspace hasManage={hasManage} />;
}
