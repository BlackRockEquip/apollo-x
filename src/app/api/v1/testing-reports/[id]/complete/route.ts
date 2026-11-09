import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { completeTestReport } from "@/lib/testing/service";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const { id } = await params;
    // Optional body: { passOnComments: true } passes an out-of-spec test on the strength of its comments.
    const body = (await request.json().catch(() => null)) as { passOnComments?: unknown } | null;
    return NextResponse.json(await completeTestReport(await requireRequestContext(), id, { passOnComments: body?.passOnComments === true }), { status: 200 });
  } catch (error) {
    return apiError(error);
  }
}
