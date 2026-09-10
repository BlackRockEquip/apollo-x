import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { saveRfqQuoteLines } from "@/lib/rfq/service";

// Body: { lines: [{ partLineId, unitPrice, available, notes }] } — commits
// this supplier's prices for the comparison table.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; rfqId: string }> }) {
  try {
    requireSameOrigin(request);
    const { id, rfqId } = await params;
    return NextResponse.json(await saveRfqQuoteLines(await requireRequestContext(), id, rfqId, await request.json()));
  } catch (error) {
    return apiError(error);
  }
}
