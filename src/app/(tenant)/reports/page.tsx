import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantPageAccess } from "@/lib/auth/page-guard";
import { ReportsWorkspace } from "@/components/ReportsWorkspace";

export const dynamic = "force-dynamic";

// 2026-10-02 — new "Reports" sidebar section (user request). Same thin
// server-wrapper shape as every other guarded page (dashboard/page.tsx,
// etc.) — requireTenantPageAccess redirects before anything renders for a
// role without REPORTS_VIEW (e.g. Mechanic), rather than showing an empty
// or erroring page.
export default async function Page() {
  const ctx = await requireRequestContext();
  requireTenantPageAccess(ctx, "REPORTS_VIEW");
  return <ReportsWorkspace />;
}
