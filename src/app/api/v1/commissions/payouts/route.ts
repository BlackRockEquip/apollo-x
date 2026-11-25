import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { addCommissionPayout } from "@/lib/commissions/service";

// POST { salesRepresentativeId, month: "YYYY-MM", amount, paidOn: "YYYY-MM-DD", note? } records commission paid for a month.
export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await addCommissionPayout(await requireRequestContext(), await request.json()), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
