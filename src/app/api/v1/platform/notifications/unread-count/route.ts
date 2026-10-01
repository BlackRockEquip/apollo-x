import { NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { getPlatformUnreadCount } from "@/lib/platform/notifications";

// 2026-10-01 — polled by PlatformNotificationBell.tsx (PlatformShell's
// topbar), same lightweight-badge pattern as the tenant bell.
export async function GET() {
  try {
    return NextResponse.json({ count: await getPlatformUnreadCount(await requireRequestContext()) });
  } catch (error) {
    return apiError(error);
  }
}
