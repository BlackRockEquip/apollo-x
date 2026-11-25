import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantModulePage } from "@/lib/auth/page-guard";
import { requireTenantPermission } from "@/lib/auth/guards";
import { ProfilesWorkspace } from "@/components/failure-reports/ProfilesWorkspace";

export const dynamic = "force-dynamic";

// 2026-11-25: Failure Reports > Company profiles (logo, colours and details a report is printed with).
export default async function FailureReportProfilesPage() {
  const ctx = await requireRequestContext();
  requireTenantModulePage(ctx, "FAILURE_REPORTS");
  requireTenantPermission(ctx, "JOBS_VIEW");
  const canEdit = ctx.tenantPermissions.has("JOBS_EDIT") && ctx.moduleAccess.get("FAILURE_REPORTS") === "FULL";
  return <ProfilesWorkspace canEdit={canEdit} />;
}
