import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { markOutworkItemsReceived } from "@/lib/jobs/service";

// Bulk-marks one or more outwork items received in one call. Body:
// { itemIds: string[], receivedDate? } — a supplier may return part of a
// batch before the rest, so only the given ids are touched.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const { id } = await params;
    return NextResponse.json(await markOutworkItemsReceived(await requireRequestContext(), id, await request.json()));
  } catch (error) {
    return apiError(error);
  }
}
