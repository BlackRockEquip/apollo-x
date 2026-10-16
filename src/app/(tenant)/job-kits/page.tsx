import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantModulePage } from "@/lib/auth/page-guard";
import { requireTenantPermission } from "@/lib/auth/guards";
import { JobKitsWorkspace } from "@/components/JobKitsWorkspace";

export const dynamic = "force-dynamic";

export default async function JobKitsPage() {
  const ctx = await requireRequestContext();
  requireTenantModulePage(ctx, "JOB_KITS");
  requireTenantPermission(ctx, "JOB_KITS_VIEW");
  return <JobKitsWorkspace />;
}