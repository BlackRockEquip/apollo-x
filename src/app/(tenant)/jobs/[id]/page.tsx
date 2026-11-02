import { redirect } from "next/navigation";
import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantModulePage } from "@/lib/auth/page-guard";
import { requireTenantPermission } from "@/lib/auth/guards";
import { JobWorkspace } from "@/components/JobWorkspace";
import { canonicalJobPath, resolveJobRouteKey } from "@/lib/jobs/route-key";

export const dynamic = "force-dynamic";

// 2026-11-02, user request: the job's address is its job number (/jobs/BRE1182), not the long id. The address part may be the job
// number or - for an old bookmark, an email link or a job without a number - the id; an id address moves to the number address.
export default async function JobDetailPage({ params, searchParams }: { params: Promise<unknown>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireRequestContext();
  requireTenantModulePage(ctx, "JOBS_WIP");
  requireTenantPermission(ctx, "JOBS_VIEW");
  // 2026-10-20: the WIP View user type sees the Jobs & WIP table only; opening a job sends them back to it.
  if (ctx.tenantRole === "WIP_VIEWER") redirect("/jobs");
  const { id: key } = await params as { id: string };
  const match = await resolveJobRouteKey(ctx.companyId!, key);
  if (match) {
    const canonical = canonicalJobPath(match, key, await searchParams);
    if (canonical) redirect(canonical);
  }
  return <JobWorkspace mode="detail" jobId={match?.id ?? key} />;
}
