import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { setPreferredQuoteLine } from "@/lib/rfq/service";

// Body: { partLineId, rfqQuoteId } — toggles "buy this part from this
// supplier" in the comparison table.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const { id } = await params;
    return NextResponse.json(await setPreferredQuoteLine(await requireRequestContext(), id, await request.json()));
  } catch (error) {
    return apiError(error);
  }
}
