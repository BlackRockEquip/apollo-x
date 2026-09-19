import { NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { getUnreadCount } from "@/lib/notifications/service";

// 2026-09-19 — polled by AppShell's bell icon (see AppShell.tsx) so the
// badge on every page stays current without pulling the notification rows
// themselves down on every load.
export async function GET() {
  try {
    return NextResponse.json({ count: await getUnreadCount(await requireRequestContext()) });
  } catch (error) {
    return apiError(error);
  }
}
