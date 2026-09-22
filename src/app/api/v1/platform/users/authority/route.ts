import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { grantPlatformAuthority } from "@/lib/platform/admin-service";

// 2026-09-22 — replaces the old createPlatformAuthorityAction server
// action (app/platform/actions.ts) for the same reason the rest of the
// Platform Users table was rebuilt as a client component: a server action
// that throws has no way to show its error inline (e.g. the new
// ORG_MEMBER_CANNOT_BE_PLATFORM_ADMIN safeguard) short of a full error
// page. This route + PlatformUsersWorkspace.tsx's fetch/setError pattern
// gives it the same inline-error handling every other admin screen has.
export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const ctx = await requireRequestContext();
    const body = await request.json();
    return NextResponse.json(await grantPlatformAuthority(ctx, { email: String(body.email ?? ""), role: body.role }), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
