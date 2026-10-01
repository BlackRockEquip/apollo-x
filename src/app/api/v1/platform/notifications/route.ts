import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { listPlatformNotifications } from "@/lib/platform/notifications";

// 2026-10-01 — backs /platform/notifications, the Platform Admin side's
// equivalent of /notifications. See lib/platform/notifications.ts.
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRequestContext();
    const sp = request.nextUrl.searchParams;
    const unreadOnly = sp.get("unreadOnly") === "true";
    const take = sp.get("take") ? Number(sp.get("take")) : undefined;
    return NextResponse.json(await listPlatformNotifications(ctx, { unreadOnly, take }));
  } catch (error) {
    return apiError(error);
  }
}
