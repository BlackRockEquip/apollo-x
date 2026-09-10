import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { deleteOutworkItem, editOutworkItem } from "@/lib/jobs/service";

// PATCH body: { supplierId, description, quantity, dateSentOut? } — corrects
// a single outwork line after the fact (see editOutworkItem).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    requireSameOrigin(request);
    const { id, itemId } = await params;
    return NextResponse.json(await editOutworkItem(await requireRequestContext(), id, itemId, await request.json()));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    requireSameOrigin(request);
    const { id, itemId } = await params;
    return NextResponse.json(await deleteOutworkItem(await requireRequestContext(), id, itemId));
  } catch (error) {
    return apiError(error);
  }
}
