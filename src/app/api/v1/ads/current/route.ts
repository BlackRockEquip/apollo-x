import { NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { getSidebarAds } from "@/lib/ads/service";

// 2026-10-23 — the sidebar block asks which ads are live for this company right now. hidden = show nothing (support session, or
// a platform admin switched ads off for this company); ads = [] with hidden false = show Flo X's own card.
export async function GET() {
  try {
    const result = await getSidebarAds(await requireRequestContext());
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
