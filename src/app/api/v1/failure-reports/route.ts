import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { createFailureReport, listFailureReports } from "@/lib/failure-reports/service";

// Failure Reports. GET lists reports (?jobId=… for one job's reports, ?q=… to search); POST { jobId? } starts a new report.
export async function GET(request: NextRequest) {
  try {
    const jobId = request.nextUrl.searchParams.get("jobId") ?? undefined;
    const q = request.nextUrl.searchParams.get("q") ?? undefined;
    return NextResponse.json(await listFailureReports(await requireRequestContext(), { jobId, q }));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await createFailureReport(await requireRequestContext(), await request.json().catch(() => ({}))), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
