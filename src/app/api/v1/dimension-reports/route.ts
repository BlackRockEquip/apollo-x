import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { createJobDimensionReport, listJobDimensionReports } from "@/lib/specifications/service";

// Dimensional Size Reports (Specifications module). GET ?jobId=… lists a job's reports; POST { jobId, …report } adds one.
export async function GET(request: NextRequest) {
  try {
    const jobId = request.nextUrl.searchParams.get("jobId") ?? "";
    return NextResponse.json(await listJobDimensionReports(await requireRequestContext(), jobId));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const { jobId, ...report } = await request.json();
    return NextResponse.json(await createJobDimensionReport(await requireRequestContext(), String(jobId ?? ""), report), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
