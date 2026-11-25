import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { jobDetailsForReport, linkFailureReportJob } from "@/lib/failure-reports/service";

// GET: what the linked job says now and which report fields differ. PUT { jobId | null, overwriteEdited? }: link / unlink /
// refresh from the job (untouched fields take the job's values; fields the user changed are kept unless overwriteEdited).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json(await jobDetailsForReport(await requireRequestContext(), id));
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const { id } = await params;
    return NextResponse.json(await linkFailureReportJob(await requireRequestContext(), id, await request.json()));
  } catch (error) {
    return apiError(error);
  }
}
