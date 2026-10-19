import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { createJob, listJobs, listJobsForPickSlip } from "@/lib/jobs/service";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRequestContext();
    const params = Object.fromEntries(request.nextUrl.searchParams);
    // forPickSlip=1: the job picker in the pick slip window (see listJobsForPickSlip).
    return NextResponse.json(params.forPickSlip === "1" ? await listJobsForPickSlip(ctx, params) : await listJobs(ctx, params));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const ctx = await requireRequestContext();
    return NextResponse.json(await createJob(ctx, await request.json()), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
