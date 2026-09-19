import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { markAllNotificationsRead } from "@/lib/notifications/service";

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await markAllNotificationsRead(await requireRequestContext()));
  } catch (error) {
    return apiError(error);
  }
}
