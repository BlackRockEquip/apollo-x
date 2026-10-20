import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { setJobBreakdown } from "@/lib/jobs/service";

// 2026-10-20 - switches the red "Breakdown" pill on a job on or off (body: { active: boolean }).
export async function POST(request: NextRequest, context: { params: Promise<unknown> }) {
  try {
    requireSameOrigin(request);
    const { id } = await context.params as { id: string };
    return NextResponse.json(await setJobBreakdown(await requireRequestContext(), id, await request.json()));
  } catch (error) {
    return apiError(error);
  }
}
