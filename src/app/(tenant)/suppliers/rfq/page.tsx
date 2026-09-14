import { requireRequestContext } from "@/lib/auth/session";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { SuppliersTabNav } from "@/components/SuppliersTabNav";
import { RfqAllWorkspace } from "@/components/RfqAllWorkspace";

// New — 2026-09-14, Suppliers screen's RFQ tab: every RFQ sent to a
// supplier, job-linked and job-less alike, in one list with a status (sent
// / received / skipped) and a parts-outstanding quantity — at the user's
// request ("RFQ tab lists all rfqs sent to suppliers ... there must also be
// a column that says parts outstanding with a qty, must also have a button
// that can add RFQ that can be linked to a job but not required").
export default async function Page() {
  const ctx = await requireRequestContext();
  requireModule(ctx, "JOBS_WIP", "READ");
  requireTenantPermission(ctx, "JOBS_VIEW");
  return <>
    <header className="page-header compact"><div><p className="eyebrow">CRM</p><h1>RFQs</h1><p>Every quote request sent to a supplier — from a job, or on its own.</p></div></header>
    <SuppliersTabNav current="rfq" />
    <RfqAllWorkspace />
  </>;
}
