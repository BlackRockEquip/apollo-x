import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { recordAdView } from "@/lib/ads/service";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    requireSameOrigin(request);
    await recordAdView(await requireRequestContext(), (await params).id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
