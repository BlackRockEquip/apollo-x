import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { addPlatformCompanyUser, listPlatformCompanyUsers } from "@/lib/platform/company-users-service";

// Platform > Companies > company > Users (2026-11-03): the company's users and the editor data (roles, module tiles) in one call.
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json(await listPlatformCompanyUsers(await requireRequestContext(), (await params).id), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const created = await addPlatformCompanyUser(await requireRequestContext(), (await params).id, await request.json());
    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
