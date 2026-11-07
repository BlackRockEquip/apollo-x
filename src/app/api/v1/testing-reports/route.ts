import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { createTestReport, listTestReports } from "@/lib/testing/service";

// Testing Reports. GET lists reports (?jobId=… for one job's tests, ?q=… to search); POST { templateId, jobId?, … } starts a new test.
export async function GET(request: NextRequest) {
  try {
    const jobId = request.nextUrl.searchParams.get("jobId") ?? undefined;
    const q = request.nextUrl.searchParams.get("q") ?? undefined;
    return NextResponse.json(await listTestReports(await requireRequestContext(), { jobId, q }));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await createTestReport(await requireRequestContext(), await request.json()), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
