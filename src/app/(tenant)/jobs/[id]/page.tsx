import { requireRequestContext } from "@/lib/auth/session";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { JobWorkspace } from "@/components/JobWorkspace";

export const dynamic = "force-dynamic";

export default async function JobDetailPage({ params }: { params: Promise<unknown> }) {
  const ctx = await requireRequestContext();
  requireModule(ctx, "JOBS_WIP", "READ");
  requireTenantPermission(ctx, "JOBS_VIEW");
  const { id } = await params as { id: string };
  return <JobWorkspace mode="detail" jobId={id} />;
}