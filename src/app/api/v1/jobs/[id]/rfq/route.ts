import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { requestRfqFromSupplier } from "@/lib/rfq/service";

// Adds a supplier to this job's RFQ / quote comparison list. Body:
// { supplierId, sendEmail? }. Sends a real RFQ email when sendEmail is true
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
