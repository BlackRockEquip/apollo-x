import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { removePartAlternateNumber } from "@/lib/master-data/service";

// New — 2026-09-29, see the sibling route.ts's own comment. Removes one
// alternate number from a part.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; altId: string }> }) {
  try {
    requireSameOrigin(request);
    const ctx = await requireRequestContext();
    const { id, altId } = await params;
    return NextResponse.json(await removePartAlternateNumber(ctx, id, altId));
  } catch (error) {
    return apiError(error);
  }
}
