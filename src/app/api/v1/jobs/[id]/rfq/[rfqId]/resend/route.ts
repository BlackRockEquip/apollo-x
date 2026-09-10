import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { resendRfqRequest } from "@/lib/rfq/service";

// Retries (or sends for the first time) the RFQ email for a request that
// came back FAILED or was added as SKIPPED — added 2026-09-09 alongside
// real email sending. Refuses on an already-QUOTED request.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; rfqId: string }> }) {
  try {
    requireSameOrigin(request);
    const { id, rfqId } = await params;
    return NextResponse.json(await resendRfqRequest(await requireRequestContext(), id, rfqId));
  } catch (error) {
    return apiError(error);
  }
}
