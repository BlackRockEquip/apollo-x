import { requireRequestContext } from "@/lib/auth/session";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { JobWorkspace } from "@/components/JobWorkspace";

export const dynamic = "force-dynamic";

export default async function NewJobPage() {
  const ctx = await requireRequestContext();
  requireModule(ctx, "JOBS_WIP", "WRITE");
  requireTenantPermission(ctx, "JOBS_CREATE");
  return <JobWorkspace mode="create" />;
}