import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { closePexReturnWithoutCore } from "@/lib/pex/service";
import { requireSameOrigin } from "@/lib/security/request";

export async function POST(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await closePexReturnWithoutCore(await requireRequestContext(), (await params).jobId, await request.json()));
  } catch (error) {
    return apiError(error);
  }
}