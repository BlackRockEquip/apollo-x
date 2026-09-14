import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { deleteGeneralRfq, updateGeneralRfq, getGeneralRfqAttachment } from "@/lib/rfq/service";

// New — 2026-09-14, editing/removing a job-less general RFQ from the
// Suppliers RFQ tab (status changes, notes, etc.).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await updateGeneralRfq(await requireRequestContext(), (await params).id, await request.json()));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await deleteGeneralRfq(await requireRequestContext(), (await params).id));
  } catch (error) {
    return apiError(error);
  }
}

// GET — hands back this general RFQ's outbound attachment (if any) as
// base64, same convention as the job-linked route's equivalent. Added
// 2026-09-14.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json(await getGeneralRfqAttachment(await requireRequestContext(), (await params).id));
  } catch (error) {
    return apiError(error);
  }
}
