import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { getTenantUserEditorData, resetTenantUserSessions, updateTenantUser } from "@/lib/users/service";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json(await getTenantUserEditorData(await requireRequestContext(), (await params).id));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await updateTenantUser(await requireRequestContext(), (await params).id, await request.json()));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await resetTenantUserSessions(await requireRequestContext(), (await params).id));
  } catch (error) {
    return apiError(error);
  }
}