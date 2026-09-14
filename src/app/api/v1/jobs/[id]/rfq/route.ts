import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { requestRfqFromSupplier, getRfqRequestAttachment } from "@/lib/rfq/service";

// Adds a supplier to this job's RFQ / quote comparison list. Body:
// { supplierId, sendEmail?, attachmentFileName?, attachmentMimeType?,
// attachmentContentBase64? }. Sends a real RFQ email when sendEmail is true
// (default) and the company has SMTP configured under Settings — otherwise
// the supplier is added with no send attempt. See rfq/service.ts's module
// comment.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const { id } = await params;
    return NextResponse.json(await requestRfqFromSupplier(await requireRequestContext(), id, await request.json()), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

// GET ?rfqId=<id> — hands back the outbound attachment stored on that RFQ
// (the file attached when it was sent) as base64, so the client can build a
// data: URL to view/download it — same JSON convention as the quote-file
// route. Added 2026-09-14, kept on this existing shallow route (as a GET)
// rather than a new nested endpoint under [id]/rfq/[rfqId]/... — simpler
// than adding another dynamic route segment for one lookup.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const rfqRequestId = request.nextUrl.searchParams.get("rfqId");
    if (!rfqRequestId) throw new Error("RFQ_ID_REQUIRED");
    const { id } = await params;
    return NextResponse.json(await getRfqRequestAttachment(await requireRequestContext(), id, rfqRequestId));
  } catch (error) {
    return apiError(error);
  }
}
