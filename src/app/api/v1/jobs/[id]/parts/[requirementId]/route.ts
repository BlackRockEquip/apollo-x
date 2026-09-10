import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { removePartLine, updatePartLineDescription, updatePartLineOrder } from "@/lib/jobs/service";

// Route folder kept as "[requirementId]" (the old JobPartRequirement id
// param) rather than renamed to "[lineId]" — Next.js requires every dynamic
// segment at this path position to share one name, and this session has no
// way to rename/delete the sibling route files still using that name (see
// reserve/route.ts, ../allocations/[allocationId]/*). The value carried in
// this param is now a JobPartLine id.
//
// PATCH accepts either { description } (one-shot fill-in, see
// updatePartLineDescription) or { orderNumber, orderedFromSupplierId }
// (order details) — whichever the caller sends.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; requirementId: string }> }) {
  try {
    requireSameOrigin(request);
    const { id, requirementId: lineId } = await params;
    const ctx = await requireRequestContext();
    const body = (await request.json()) as Record<string, unknown>;
    const result = body.description !== undefined
      ? await updatePartLineDescription(ctx, id, lineId, body)
      : await updatePartLineOrder(ctx, id, lineId, body);
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; requirementId: string }> }) {
  try {
    requireSameOrigin(request);
    const { id, requirementId: lineId } = await params;
    return NextResponse.json(await removePartLine(await requireRequestContext(), id, lineId));
  } catch (error) {
    return apiError(error);
  }
}
