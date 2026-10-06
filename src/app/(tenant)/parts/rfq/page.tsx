import { requireRequestContext } from "@/lib/auth/session";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { requireNotMechanicPage } from "@/lib/auth/page-guard";
import { PartsTabNav } from "@/components/PartsTabNav";
import { RfqAllWorkspace } from "@/components/RfqAllWorkspace";

// 2026-10-05, user request: new "Parts" sidebar item under Jobs with the RFQs
// list (moved from the Suppliers tabs) and a Parts Outstanding tab. This route
// used to just redirect to /inventory (Parts Catalog was merged into Stock
// Levels in 2026-09-10); it is now the RFQs tab.
//
// Originally 2026-09-14, the Suppliers screen's RFQ tab: every RFQ sent to a
// supplier, job-linked and job-less alike, in one list with a status and a
// parts-outstanding quantity. Gated the same way as before (Jobs module; not for
// a Mechanic).
export default async function Page() {
  const ctx = await requireRequestContext();
  requireModule(ctx, "JOBS_WIP", "READ");
  requireTenantPermission(ctx, "JOBS_VIEW");
  requireNotMechanicPage(ctx);
  return <>
    <header className="page-header compact"><div><p className="eyebrow">Jobs</p><h1>Parts</h1><p>Quote requests sent to suppliers, and the parts still outstanding on jobs.</p></div></header>
    <PartsTabNav current="rfq" />
    <RfqAllWorkspace />
  </>;
}
