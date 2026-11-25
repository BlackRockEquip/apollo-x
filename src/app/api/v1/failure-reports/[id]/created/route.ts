import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { recordFailureReportCreated } from "@/lib/failure-reports/service";

// POST { fileName, contentBase64? }: Create Report was used. A report linked to a job keeps a copy of the .pptx in the job's files.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const { id } = await params;
    return NextResponse.json(await recordFailureReportCreated(await requireRequestContext(), id, await request.json()));
  } catch (error) {
    return apiError(error);
  }
}
