import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantPageAccess, requireNotMechanicPage } from "@/lib/auth/page-guard";
import { PartyDetailWorkspace } from "@/components/PartyDetailWorkspace";

// 2026-10-01 — a supplier's own detail page had no page-level guard at all
// (reachable by URL for any authenticated tenant user). Added
// requireTenantPageAccess + requireNotMechanicPage to match the rest of the
// Suppliers section — per "users should not be able view suppliers menu,
// only access name for outwork purposes".
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireRequestContext();
  requireTenantPageAccess(ctx, "SUPPLIERS_VIEW");
  requireNotMechanicPage(ctx);
  return <PartyDetailWorkspace kind="suppliers" id={(await params).id} />;
}
