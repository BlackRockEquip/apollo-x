import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { getTestTemplate, setTestTemplateActive, updateTestTemplate } from "@/lib/testing/service";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json(await getTestTemplate(await requireRequestContext(), id));
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const { id } = await params;
    return NextResponse.json(await updateTestTemplate(await requireRequestContext(), id, await request.json()));
  } catch (error) {
    return apiError(error);
  }
}

// PATCH { active: boolean } switches a template off (or back on). Templates are never deleted: old reports keep their link to them.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const { id } = await params;
    const body = await request.json();
    return NextResponse.json(await setTestTemplateActive(await requireRequestContext(), id, body?.active !== false));
  } catch (error) {
    return apiError(error);
  }
}
