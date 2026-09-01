import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { createDraftJob, listJobs } from "@/lib/jobs/service";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRequestContext();
    return NextResponse.json(await listJobs(ctx, Object.fromEntries(request.nextUrl.searchParams)));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const ctx = await requireRequestContext();
    return NextResponse.json(await createDraftJob(ctx, await request.json()), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}