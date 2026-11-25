import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantModulePage } from "@/lib/auth/page-guard";
import { requireTenantPermission } from "@/lib/auth/guards";
import { FailureReportsWorkspace } from "@/components/failure-reports/FailureReportsWorkspace";

export const dynamic = "force-dynamic";

// 2026-11-25: Failure Reports - every report made or saved (the builder's "Previous reports").
export default async function FailureReportsPage() {
  const ctx = await requireRequestContext();
  requireTenantModulePage(ctx, "FAILURE_REPORTS");
  requireTenantPermission(ctx, "JOBS_VIEW");
  const canEdit = ctx.tenantPermissions.has("JOBS_EDIT") && ctx.moduleAccess.get("FAILURE_REPORTS") === "FULL";
  return <FailureReportsWorkspace canEdit={canEdit} />;
}
