import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { createAd, listAds } from "@/lib/ads/service";

// 2026-10-23 — Platform > Advertising: GET lists the ads (and the companies they can be aimed at), POST creates one.
export async function GET() {
  try {
    return NextResponse.json(await listAds(await requireRequestContext()));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await createAd(await requireRequestContext(), await request.json()), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
