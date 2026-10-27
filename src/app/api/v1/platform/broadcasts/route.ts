import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { createBroadcast, listBroadcasts } from "@/lib/platform/broadcasts-service";

// 2026-10-27 - Platform > Broadcasts: GET lists past/current/scheduled broadcasts (and the companies a new one can be aimed at),
// POST sends or schedules one.
export async function GET() {
  try {
    return NextResponse.json(await listBroadcasts(await requireRequestContext()));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await createBroadcast(await requireRequestContext(), await request.json()), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
