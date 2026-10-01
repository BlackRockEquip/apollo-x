import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantPageAccess, requireNotMechanicPage } from "@/lib/auth/page-guard";
import { SuppliersTabNav } from "@/components/SuppliersTabNav";
import { MasterDataRoute } from "@/components/MasterDataRoute";
import { masterConfigs } from "@/lib/master-data/ui-config";

const config = masterConfigs["suppliers"];

// 2026-09-14 — the Suppliers list now sits behind a Suppliers/Outwork/RFQ
// tab bar (see SuppliersTabNav) at the user's request; this page renders
// its own heading above the tab bar the same way the Settings destinations
// do (see e.g. tax-codes/page.tsx), with MasterDataRoute's hideHeader
// stopping the master-data workspace from rendering its own internal one.
//
// 2026-10-01 — page-level guards added per "users should not be able view
// suppliers menu, only access name for outwork purposes": a Mechanic keeps
// SUPPLIERS_VIEW (their Outwork supplier-name search depends on it — see
// requireNotMechanicPage's comment in page-guard.ts), so that permission
// alone can't gate this page. requireNotMechanicPage blocks it for them
// regardless.
export default async function Page() {
  const ctx = await requireRequestContext();
  requireTenantPageAccess(ctx, "SUPPLIERS_VIEW");
  requireNotMechanicPage(ctx);
  return <>
    <header className="page-header compact"><div><p className="eyebrow">{config.eyebrow}</p><h1>{config.title}</h1><p>{config.description}</p></div></header>
    <SuppliersTabNav current="suppliers" />
    <MasterDataRoute kind="suppliers" hideHeader />
  </>;
}
