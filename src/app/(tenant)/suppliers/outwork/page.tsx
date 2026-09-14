import { requireRequestContext } from "@/lib/auth/session";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { SuppliersTabNav } from "@/components/SuppliersTabNav";
import { OutworkAllWorkspace } from "@/components/OutworkAllWorkspace";

// New — 2026-09-14, Suppliers screen's Outwork tab: every outwork item sent
// out across every job, in one list (at the user's request: "Outwork tab
// lists all outwork requests sent from jobs, must also have a button to
// create an outwork that links to a job"). Read view over the same
// job-scoped OutworkItem data as each job's own Outwork section — gated the
// same way (Jobs module), not the Suppliers module.
export default async function Page() {
  const ctx = await requireRequestContext();
  requireModule(ctx, "JOBS_WIP", "READ");
  requireTenantPermission(ctx, "JOBS_VIEW");
  return <>
    <header className="page-header compact"><div><p className="eyebrow">CRM</p><h1>Outwork</h1><p>Every item sent out for outwork (machining, sandblasting, etc.) across every job.</p></div></header>
    <SuppliersTabNav current="outwork" />
    <OutworkAllWorkspace />
  </>;
}
