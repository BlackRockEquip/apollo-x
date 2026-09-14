import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { createGeneralRfq } from "@/lib/rfq/service";

// New — 2026-09-14, Suppliers RFQ tab's "Add RFQ" button used with no job
// selected. Body: { supplierId, partsDescription, quantityOutstanding?,
// status?, notes? } — see GeneralRfqRequest in schema.prisma.
export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await createGeneralRfq(await requireRequestContext(), await request.json()), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
