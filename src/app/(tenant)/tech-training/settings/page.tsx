import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantModulePage, requireTenantPageAccess } from "@/lib/auth/page-guard";
import { SettingsWorkspace } from "@/components/tech-training/SettingsWorkspace";

export const dynamic = "force-dynamic";

export default async function Page() {
  const ctx = await requireRequestContext();
  requireTenantModulePage(ctx, "TECH_TRAINING");
  requireTenantPageAccess(ctx, "TRAINING_APPROVE");
  return <SettingsWorkspace canManagePositions={ctx.tenantPermissions.has("TRAINING_EMPLOYEES_MANAGE") && ctx.moduleAccess.get("TECH_TRAINING") === "FULL"} />;
}
