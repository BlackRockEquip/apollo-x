import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { recordRfqQuote } from "@/lib/rfq/service";

// Records a supplier's quotation. Body: { fileName?, mimeType?,
// contentBase64?, notes? } — the file fields travel together or not at
// all (a phone-quoted price can be recorded with notes only).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; rfqId: string }> }) {
  try {
    requireSameOrigin(request);
    const { id, rfqId } = await params;
    return NextResponse.json(await recordRfqQuote(await requireRequestContext(), id, rfqId, await request.json()), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
