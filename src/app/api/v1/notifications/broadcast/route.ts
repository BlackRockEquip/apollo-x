import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { sendCompanyBroadcast } from "@/lib/notifications/service";

// 2026-10-01 — user request: "Allow a Org Admin to send out a message to
// all users/individual users (Notification banner that popsup)." Gating
// (USERS_MANAGE) lives in sendCompanyBroadcast itself.
export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await sendCompanyBroadcast(await requireRequestContext(), await request.json()));
  } catch (error) {
    return apiError(error);
  }
}
