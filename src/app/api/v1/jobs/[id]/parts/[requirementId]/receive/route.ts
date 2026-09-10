import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { markPartLineReceived } from "@/lib/jobs/service";

// Body: { receivedQty: number } — accumulates on top of whatever has
// already been received on this line (see markPartLineReceived).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; requirementId: string }> }) {
  try {
    requireSameOrigin(request);
    const { id, requirementId: lineId } = await params;
    return NextResponse.json(await markPartLineReceived(await requireRequestContext(), id, lineId, await request.json()));
  } catch (error) {
    return apiError(error);
  }
}
