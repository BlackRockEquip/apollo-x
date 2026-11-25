import { notFound } from "next/navigation";
import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantModulePage } from "@/lib/auth/page-guard";
import { requireTenantPermission } from "@/lib/auth/guards";
import { getFailureReport } from "@/lib/failure-reports/service";
import { FailureReportEditor } from "@/components/failure-reports/FailureReportEditor";
import type { ReportDetail } from "@/components/failure-reports/types";

export const dynamic = "force-dynamic";

export default async function FailureReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireRequestContext();
  requireTenantModulePage(ctx, "FAILURE_REPORTS");
  requireTenantPermission(ctx, "JOBS_VIEW");
  let report;
  try { report = await getFailureReport(ctx, id); } catch (e) { if (e instanceof Error && e.message === "NOT_FOUND") notFound(); throw e; }
  const canEdit = ctx.tenantPermissions.has("JOBS_EDIT") && ctx.moduleAccess.get("FAILURE_REPORTS") === "FULL";
  const canOpenJob = (ctx.moduleAccess.get("JOBS_WIP") ?? "DENIED") !== "DENIED" && ctx.tenantRole !== "WIP_VIEWER";
  return <FailureReportEditor initial={report as unknown as ReportDetail} canEdit={canEdit} canOpenJob={canOpenJob} />;
}
