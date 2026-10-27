import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { searchBroadcastUsers } from "@/lib/platform/broadcasts-service";

// 2026-10-27 - finds people to aim a broadcast at: ?q=name, email or company, or ?role=COMPANY_ADMIN for everyone holding a company role.
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRequestContext();
    const params = request.nextUrl.searchParams;
    return NextResponse.json({ users: await searchBroadcastUsers(ctx, { q: params.get("q") ?? "", role: params.get("role") ?? "" }) });
  } catch (error) {
    return apiError(error);
  }
}
