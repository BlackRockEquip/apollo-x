import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { updatePartLineQuantity } from "@/lib/jobs/service";

// New — 2026-11-10: changes the quantity of one part line on a job's parts list (the quantity was typed wrong).
// Body: { jobId, lineId, quantity }. A short path of its own, like part-notes: the per-line parts route sits too deep in the
// folder tree to edit through the device bridge, and the quantity rules (never below what is already received, taken from
// stock or on a pick slip) live in updatePartLineQuantity.
export async function PATCH(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const body = await request.json();
    return NextResponse.json(await updatePartLineQuantity(await requireRequestContext(), String(body?.jobId || ""), body));
  } catch (error) {
    return apiError(error);
  }
}
