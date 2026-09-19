import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { listNotifications } from "@/lib/notifications/service";

// 2026-09-19 — backs the /notifications page ("once clicked will have its
// own page that a user can view all notifications"). ?unreadOnly=true
// narrows to just unread, for the bell's own dropdown/preview if one is
// added later; the page itself lists everything.
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRequestContext();
    const sp = request.nextUrl.searchParams;
    const unreadOnly = sp.get("unreadOnly") === "true";
    const take = sp.get("take") ? Number(sp.get("take")) : undefined;
    return NextResponse.json(await listNotifications(ctx, { unreadOnly, take }));
  } catch (error) {
    return apiError(error);
  }
}
