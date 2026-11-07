import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantModulePage } from "@/lib/auth/page-guard";
import { requireTenantPermission } from "@/lib/auth/guards";
import { TestingReportsWorkspace } from "@/components/testing/TestingReportsWorkspace";

export const dynamic = "force-dynamic";

export default async function TestingReportsPage() {
  const ctx = await requireRequestContext();
  requireTenantModulePage(ctx, "TESTING_REPORTS");
  requireTenantPermission(ctx, "TESTING_VIEW");
  const canEdit = ctx.tenantPermissions.has("TESTING_EDIT") && ctx.moduleAccess.get("TESTING_REPORTS") === "FULL";
  return <TestingReportsWorkspace canEdit={canEdit} canManage={ctx.tenantPermissions.has("TESTING_MANAGE")} showCustomer={ctx.tenantPermissions.has("CUSTOMERS_VIEW")} />;
}
