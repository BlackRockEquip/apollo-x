import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { unmarkPartLineReceived } from "@/lib/jobs/service";

// Resets a part line's receiving back to whatever it was before any of it
// was received — see unmarkPartLineReceived. No body needed.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; requirementId: string }> }) {
  try {
    requireSameOrigin(request);
    const { id, requirementId: lineId } = await params;
    return NextResponse.json(await unmarkPartLineReceived(await requireRequestContext(), id, lineId));
  } catch (error) {
    return apiError(error);
  }
}
