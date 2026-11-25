import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { setCommissionFuel } from "@/lib/commissions/service";

// PUT { salesRepresentativeId, month: "YYYY-MM", amount } - the rep's own fuel used that month (cost tracking only). amount null clears it.
export async function PUT(request: NextRequest) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await setCommissionFuel(await requireRequestContext(), await request.json()));
  } catch (error) {
    return apiError(error);
  }
}
