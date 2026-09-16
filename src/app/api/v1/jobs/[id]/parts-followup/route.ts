import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { sendPartsFollowup } from "@/lib/jobs/parts-followup";

// Sends a chase email to every supplier with outstanding ordered parts on
// this job — added 2026-09-09, mirrors ModApp's "Parts follow-up" feature.
// 2026-09-16 — an optional `supplierId` in the JSON body narrows this to a
// single supplier, so the per-supplier breakdown in JobWorkspace.tsx can
// offer a "Follow up" button next to just that supplier instead of only a
// single "send to everyone" action (see sendPartsFollowup's onlySupplierId
// param). A request with no body, or an empty/absent supplierId, keeps the
// original send-to-everyone behavior.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const { id } = await params;
    let supplierId: string | undefined;
    try {
      const body = await request.json();
      if (body && typeof body.supplierId === "string" && body.supplierId.trim()) supplierId = body.supplierId.trim();
    } catch {
      // No JSON body (or empty body) — fine, falls back to "send to everyone".
    }
    return NextResponse.json(await sendPartsFollowup(await requireRequestContext(), id, supplierId));
  } catch (error) {
    return apiError(error);
  }
}
