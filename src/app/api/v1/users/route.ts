import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { createTenantUser, getTenantUserEditorData, listTenantUsers } from "@/lib/users/service";

export async function GET() {
  try {
    const ctx = await requireRequestContext();
    return NextResponse.json({ users: await listTenantUsers(ctx), editor: await getTenantUserEditorData(ctx) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await createTenantUser(await requireRequestContext(), await request.json()), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}