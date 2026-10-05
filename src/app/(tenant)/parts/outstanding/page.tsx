import { requireRequestContext } from "@/lib/auth/session";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { requireNotMechanicPage } from "@/lib/auth/page-guard";
import { PartsTabNav } from "@/components/PartsTabNav";
import { PartsOutstandingWorkspace } from "@/components/PartsOutstandingWorkspace";

// 2026-10-05, user request: "Parts Outstanding" tab — every job that has parts
// outstanding, whether they were chased through an RFQ or just added by hand
// to the job's parts list.
export default async function Page() {
  const ctx = await requireRequestContext();
  requireModule(ctx, "JOBS_WIP", "READ");
  requireTenantPermission(ctx, "JOBS_VIEW");
  requireNotMechanicPage(ctx);
  return <>
    <header className="page-header compact"><div><p className="eyebrow">Jobs</p><h1>Parts</h1><p>Quote requests sent to suppliers, and the parts still outstanding on jobs.</p></div></header>
    <PartsTabNav current="outstanding" />
    <PartsOutstandingWorkspace />
  </>;
}
