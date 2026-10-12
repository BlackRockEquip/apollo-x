import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { updatePartLineNotes } from "@/lib/jobs/service";

// New — 2026-10-12: saves the note on one part line of a job's parts list.
// Body: { jobId, lineId, notes }. (A short path of its own — the per-line
// parts route sits too deep in the folder tree to edit through the device
// bridge — and it keeps notes apart from the order-number PATCH, which
// resets the supplier when it isn't sent.)
export async function PATCH(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const body = await request.json();
    return NextResponse.json(await updatePartLineNotes(await requireRequestContext(), String(body?.jobId || ""), body));
  } catch (error) {
    return apiError(error);
  }
}
