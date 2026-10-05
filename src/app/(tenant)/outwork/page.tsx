import { requireRequestContext } from "@/lib/auth/session";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { requireNotMechanicPage } from "@/lib/auth/page-guard";
import { OutworkAllWorkspace } from "@/components/OutworkAllWorkspace";

// 2026-10-05, user request: Outwork moved out of the Suppliers tab bar to its
// own sidebar item under Jobs. Same page, same gating as before (Jobs module;
// not for a Mechanic — it used to live under /suppliers, which a Mechanic can't
// open; /suppliers/outwork now redirects here).
//
// Originally 2026-09-14, the Suppliers screen's Outwork tab: every outwork item
// sent out across every job, in one list ("Outwork tab lists all outwork
// requests sent from jobs, must also have a button to create an outwork that
// links to a job"). Read view over the same job-scoped OutworkItem data as each
// job's own Outwork section.
export default async function Page() {
  const ctx = await requireRequestContext();
  requireModule(ctx, "JOBS_WIP", "READ");
  requireTenantPermission(ctx, "JOBS_VIEW");
  requireNotMechanicPage(ctx);
  return <>
    <header className="page-header compact"><div><p className="eyebrow">Jobs</p><h1>Outwork</h1><p>Every item sent out for outwork (machining, sandblasting, etc.) across every job.</p></div></header>
    <OutworkAllWorkspace />
  </>;
}
