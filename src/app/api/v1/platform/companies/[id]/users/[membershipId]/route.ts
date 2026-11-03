import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { getPlatformCompanyUserEditor, removePlatformCompanyUser, resetPlatformCompanyUserSessions, updatePlatformCompanyUser } from "@/lib/platform/company-users-service";

type Params = { params: Promise<{ id: string; membershipId: string }> };

export async function GET(_: NextRequest, { params }: Params) {
  try {
    const { id, membershipId } = await params;
    return NextResponse.json(await getPlatformCompanyUserEditor(await requireRequestContext(), id, membershipId), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    requireSameOrigin(request);
    const { id, membershipId } = await params;
    await updatePlatformCompanyUser(await requireRequestContext(), id, membershipId, await request.json());
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

// Signs the person out of this company (their sessions here are ended).
export async function POST(request: NextRequest, { params }: Params) {
  try {
    requireSameOrigin(request);
    const { id, membershipId } = await params;
    return NextResponse.json(await resetPlatformCompanyUserSessions(await requireRequestContext(), id, membershipId));
  } catch (error) {
    return apiError(error);
  }
}

// Removes the person from this company; their name stays on past jobs and history.
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    requireSameOrigin(request);
    const { id, membershipId } = await params;
    return NextResponse.json(await removePlatformCompanyUser(await requireRequestContext(), id, membershipId));
  } catch (error) {
    return apiError(error);
  }
}
