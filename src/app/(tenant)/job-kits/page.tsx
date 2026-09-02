import { requireRequestContext } from "@/lib/auth/session";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { JobKitsWorkspace } from "@/components/JobKitsWorkspace";

export const dynamic = "force-dynamic";

export default async function JobKitsPage() {
  const ctx = await requireRequestContext();
  requireModule(ctx, "JOB_KITS", "READ");
  requireTenantPermission(ctx, "JOB_KITS_VIEW");
  return <JobKitsWorkspace />;
}