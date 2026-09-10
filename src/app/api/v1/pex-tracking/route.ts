import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { listPexTracking } from "@/lib/pex/service";

// "PEX Tracking" is Apollo X's own page/route name for what shows ModApp's
// "PEX Units" content — see pex/validation.ts's pexTrackingListQuery
// comment. Repointed (2026-09-09) from the old listPexSupplyLinks to
// listPexTracking as part of the full PexRecord replacement.
export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await listPexTracking(await requireRequestContext(), Object.fromEntries(request.nextUrl.searchParams)));
  } catch (error) {
    return apiError(error);
  }
}
