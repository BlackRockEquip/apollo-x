import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { recordAdClick } from "@/lib/ads/service";

type Params = { params: Promise<{ id: string }> };

// Counts the click, then sends the browser to the advertiser's address (only an ad that is live for this company).
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const target = await recordAdClick(await requireRequestContext(), (await params).id);
    if (!target) return new NextResponse(null, { status: 404 });
    return NextResponse.redirect(target, 302);
  } catch (error) {
    return apiError(error);
  }
}
