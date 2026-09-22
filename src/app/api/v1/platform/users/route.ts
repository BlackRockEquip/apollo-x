import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { listPlatformUsers } from "@/lib/platform/admin-service";

// 2026-09-22, user request: "Platform Users menu -- make users displayed in
// table form... make users editable." Backs the new client-rendered table
// in PlatformUsersWorkspace.tsx (mirrors the Modules page's own fetch
// pattern) — the page used to call listPlatformUsers directly from a server
// component with no way to show inline errors on edit; this GET plus the
// PATCH/POST routes alongside it give the table proper fetch+setError
// handling like every other admin workspace in this app.
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRequestContext();
    const q = request.nextUrl.searchParams.get("q") ?? "";
    return NextResponse.json(await listPlatformUsers(ctx, { q }));
  } catch (error) {
    return apiError(error);
  }
}
