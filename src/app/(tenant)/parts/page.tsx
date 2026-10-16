import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantPermission } from "@/lib/auth/guards";
import { requireNotMechanicPage, requireTenantModulePage } from "@/lib/auth/page-guard";
import { PartsTabNav } from "@/components/PartsTabNav";
import { PartsOutstandingWorkspace } from "@/components/PartsOutstandingWorkspace";

// 2026-10-06, user request: tabs swapped — this is now the default Parts tab (RFQs moved to /parts/rfq).
// 2026-10-05, user request: "Parts Outstanding" tab — every job that has parts
// outstanding, whether they were chased through an RFQ or just added by hand
// to the job's parts list.
export default async function Page() {
  const ctx = await requireRequestContext();
  requireTenantModulePage(ctx, "JOBS_WIP");
  requireTenantModulePage(ctx, "JOB_PARTS");
  requireTenantPermission(ctx, "JOBS_VIEW");
  requireNotMechanicPage(ctx);
  return <>
    <header className="page-header compact"><div><p className="eyebrow">Jobs</p><h1>Parts</h1><p>Quote requests sent to suppliers, and the parts still outstanding on jobs.</p></div></header>
    <PartsTabNav current="outstanding" showRfq={(ctx.moduleAccess.get("PROCUREMENT") ?? "DENIED") !== "DENIED"} />
    <PartsOutstandingWorkspace />
  </>;
}
