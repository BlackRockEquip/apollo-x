import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantModulePage, requireTenantPageAccess } from "@/lib/auth/page-guard";
import { ComplianceWorkspace } from "@/components/tech-training/ComplianceWorkspace";

export const dynamic = "force-dynamic";

export default async function Page() {
  const ctx = await requireRequestContext();
  requireTenantModulePage(ctx, "TECH_TRAINING");
  requireTenantPageAccess(ctx, "TRAINING_REPORTS_VIEW");
  return <ComplianceWorkspace />;
}
