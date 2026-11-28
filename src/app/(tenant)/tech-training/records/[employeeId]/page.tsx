import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantModulePage, requireTenantPageAccess } from "@/lib/auth/page-guard";
import { EmployeeRecord } from "@/components/tech-training/RecordsWorkspace";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params;
  const ctx = await requireRequestContext();
  requireTenantModulePage(ctx, "TECH_TRAINING");
  requireTenantPageAccess(ctx, "TRAINING_REPORTS_VIEW");
  return <EmployeeRecord employeeId={employeeId} canRevoke={ctx.tenantPermissions.has("TRAINING_EMPLOYEES_MANAGE")} canManage={ctx.tenantPermissions.has("TRAINING_EMPLOYEES_MANAGE") && ctx.moduleAccess.get("TECH_TRAINING") === "FULL"} />;
}
