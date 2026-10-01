import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { dismissNotification } from "@/lib/notifications/service";

// 2026-10-01 — user request: "once notifications is there, allow a user to
// remove the notification which would move it to a History tab."
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const { id } = await params;
    return NextResponse.json(await dismissNotification(await requireRequestContext(), id));
  } catch (error) {
    return apiError(error);
  }
}
