import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { removeJobKitLine, updateJobKitLine } from "@/lib/job-kits/service";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; lineId: string }> }) {
  try {
    requireSameOrigin(request);
    const p = await params;
    return NextResponse.json(await updateJobKitLine(await requireRequestContext(), p.id, p.lineId, await request.json()));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; lineId: string }> }) {
  try {
    requireSameOrigin(request);
    const p = await params;
    return NextResponse.json(await removeJobKitLine(await requireRequestContext(), p.id, p.lineId));
  } catch (error) {
    return apiError(error);
  }
}