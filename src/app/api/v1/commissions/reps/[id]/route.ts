import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { setCommissionRepSetting } from "@/lib/commissions/service";

// PUT { ratePercent, monthlyTarget } sets a sales rep's commission rate and monthly target (0 = no target).
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const { id } = await params;
    return NextResponse.json(await setCommissionRepSetting(await requireRequestContext(), id, await request.json()));
  } catch (error) {
    return apiError(error);
  }
}
