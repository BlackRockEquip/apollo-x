import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { changeJobStatus } from "@/lib/jobs/service";

export async function POST(request: NextRequest, context: { params: Promise<unknown> }) {
  try {
    requireSameOrigin(request);
    const { id } = await context.params as { id: string };
    return NextResponse.json(await changeJobStatus(await requireRequestContext(), id, await request.json()));
  } catch (error) {
    return apiError(error);
  }
}