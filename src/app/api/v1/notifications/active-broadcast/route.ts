import { NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { getActiveBroadcast } from "@/lib/notifications/service";

// 2026-10-01 — polled by BroadcastBanner.tsx (AppShell's topbar) so an Org
// Admin broadcast shows as a popup banner on every page, not just the
// notifications list/bell.
export async function GET() {
  try {
    return NextResponse.json(await getActiveBroadcast(await requireRequestContext()));
  } catch (error) {
    return apiError(error);
  }
}
