import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { createTestTemplate, listTestTemplates } from "@/lib/testing/service";

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await listTestTemplates(await requireRequestContext(), { includeInactive: request.nextUrl.searchParams.get("all") === "1" }));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await createTestTemplate(await requireRequestContext(), await request.json()), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
