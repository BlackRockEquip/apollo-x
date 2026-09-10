import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { unmarkOutworkItemReceived } from "@/lib/jobs/service";

// Undoes "Received" on a single outwork item, back to SENT_OUT. No body.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    requireSameOrigin(request);
    const { id, itemId } = await params;
    return NextResponse.json(await unmarkOutworkItemReceived(await requireRequestContext(), id, itemId));
  } catch (error) {
    return apiError(error);
  }
}
