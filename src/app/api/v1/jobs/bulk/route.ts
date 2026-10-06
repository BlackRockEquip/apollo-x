import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { bulkUpdateJobs } from "@/lib/jobs/bulk";

// New — 2026-10-06: Jobs & WIP bulk update (see lib/jobs/bulk.ts).
export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await bulkUpdateJobs(await requireRequestContext(), await request.json()));
  } catch (error) {
    return apiError(error);
  }
}
