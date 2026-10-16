import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantModulePage } from "@/lib/auth/page-guard";
import { requireTenantPermission } from "@/lib/auth/guards";
import { JobWorkspace } from "@/components/JobWorkspace";

export const dynamic = "force-dynamic";

export default async function NewJobPage() {
  const ctx = await requireRequestContext();
  requireTenantModulePage(ctx, "JOBS_WIP", "WRITE");
  requireTenantPermission(ctx, "JOBS_CREATE");
  return <JobWorkspace mode="create" />;
}