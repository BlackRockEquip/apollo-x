import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { emailJobsWipTable } from "@/lib/jobs/wip-email";

// 2026-10-20 - emails the Jobs & WIP table as it is on screen, as a PDF (body: { to, title, filters, note, headers, rows }).
export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await emailJobsWipTable(await requireRequestContext(), await request.json()));
  } catch (error) {
    return apiError(error);
  }
}
