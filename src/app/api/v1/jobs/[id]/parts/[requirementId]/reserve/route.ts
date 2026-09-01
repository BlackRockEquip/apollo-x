import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { reserveJobRequirementStock } from "@/lib/jobs/service";

export async function POST(request: NextRequest, context: { params: Promise<unknown> }) {
  try {
    requireSameOrigin(request);
    const p = await context.params as { id: string; requirementId: string };
    return NextResponse.json(await reserveJobRequirementStock(await requireRequestContext(), p.id, p.requirementId, await request.json()), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}