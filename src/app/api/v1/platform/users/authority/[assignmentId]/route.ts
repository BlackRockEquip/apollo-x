import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { updatePlatformAuthority } from "@/lib/platform/admin-service";

// 2026-09-22 — replaces the old updatePlatformAuthorityAction server
// action, same reasoning as authority/route.ts's own comment.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ assignmentId: string }> }) {
  try {
    requireSameOrigin(request);
    const ctx = await requireRequestContext();
    const body = await request.json();
    const assignmentId = (await params).assignmentId;
    return NextResponse.json(await updatePlatformAuthority(ctx, { assignmentId, role: body.role, active: Boolean(body.active) }));
  } catch (error) {
    return apiError(error);
  }
}
