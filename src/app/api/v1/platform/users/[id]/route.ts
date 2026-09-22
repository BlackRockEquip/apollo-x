import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { updatePlatformUserProfile } from "@/lib/platform/admin-service";

// 2026-09-22, user request: "Platform Users menu -- make users editable
// which allows you to change user role, email etc." Role changes go
// through /api/v1/platform/users/authority/[assignmentId] (a separate
// PlatformRoleAssignment); this is the underlying UserIdentity's own
// name/email/active flag.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const ctx = await requireRequestContext();
    const body = await request.json();
    return NextResponse.json(await updatePlatformUserProfile(ctx, (await params).id, body));
  } catch (error) {
    return apiError(error);
  }
}
