import { notFound } from "next/navigation";
import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantModulePage } from "@/lib/auth/page-guard";
import { requireTenantPermission } from "@/lib/auth/guards";
import { getTestReport } from "@/lib/testing/service";
import { TestReportSheet } from "@/components/testing/TestReportSheet";
import type { ReportDetail } from "@/components/testing/types";

export const dynamic = "force-dynamic";

export default async function TestReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireRequestContext();
  requireTenantModulePage(ctx, "TESTING_REPORTS");
  requireTenantPermission(ctx, "TESTING_VIEW");
  let report;
  try { report = await getTestReport(ctx, id); } catch (e) { if (e instanceof Error && e.message === "NOT_FOUND") notFound(); throw e; }
  const canEdit = ctx.tenantPermissions.has("TESTING_EDIT") && ctx.moduleAccess.get("TESTING_REPORTS") === "FULL";
  return (
    <TestReportSheet
      initial={report as unknown as ReportDetail}
      canEdit={canEdit}
      canManage={canEdit && ctx.tenantPermissions.has("TESTING_MANAGE")}
      showCustomer={ctx.tenantPermissions.has("CUSTOMERS_VIEW")}
      canOpenJob={ctx.tenantPermissions.has("JOBS_VIEW") && (ctx.moduleAccess.get("JOBS_WIP") ?? "DENIED") !== "DENIED"}
    />
  );
}
