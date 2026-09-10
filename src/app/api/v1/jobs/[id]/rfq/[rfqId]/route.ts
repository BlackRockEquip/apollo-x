import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { removeRfqRequest } from "@/lib/rfq/service";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; rfqId: string }> }) {
  try {
    requireSameOrigin(request);
    const { id, rfqId } = await params;
    return NextResponse.json(await removeRfqRequest(await requireRequestContext(), id, rfqId));
  } catch (error) {
    return apiError(error);
  }
}
