import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantModulePage, requireTenantPageAccess } from "@/lib/auth/page-guard";
import { EmployeesWorkspace } from "@/components/tech-training/EmployeesWorkspace";

export const dynamic = "force-dynamic";

export default async function Page() {
  const ctx = await requireRequestContext();
  requireTenantModulePage(ctx, "TECH_TRAINING");
  requireTenantPageAccess(ctx, "TRAINING_EMPLOYEES_MANAGE");
  return <EmployeesWorkspace canEdit={ctx.moduleAccess.get("TECH_TRAINING") === "FULL"} canAssign={ctx.moduleAccess.get("TECH_TRAINING") === "FULL"} />;
}
