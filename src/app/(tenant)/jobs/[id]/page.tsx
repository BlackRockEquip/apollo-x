import { redirect } from "next/navigation";
import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantModulePage } from "@/lib/auth/page-guard";
import { requireTenantPermission } from "@/lib/auth/guards";
import { JobWorkspace } from "@/components/JobWorkspace";

export const dynamic = "force-dynamic";

export default async function JobDetailPage({ params }: { params: Promise<unknown> }) {
  const ctx = await requireRequestContext();
  requireTenantModulePage(ctx, "JOBS_WIP");
  requireTenantPermission(ctx, "JOBS_VIEW");
  // 2026-10-20: the WIP View user type sees the Jobs & WIP table only; opening a job sends them back to it.
  if (ctx.tenantRole === "WIP_VIEWER") redirect("/jobs");
  const { id } = await params as { id: string };
  return <JobWorkspace mode="detail" jobId={id} />;
}