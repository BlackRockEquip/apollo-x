import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { sendPartsFollowup } from "@/lib/jobs/parts-followup";

// Sends a chase email to every supplier with outstanding ordered parts on
// this job — added 2026-09-09, mirrors ModApp's "Parts follow-up" feature
// (scoped to one bulk action — see parts-followup.ts's module comment).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const { id } = await params;
    return NextResponse.json(await sendPartsFollowup(await requireRequestContext(), id));
  } catch (error) {
    return apiError(error);
  }
}
