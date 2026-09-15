import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { updateJobAttachmentNotes, deleteJobAttachment } from "@/lib/jobs/service";

// 2026-09-15 — user request: "once a note is added [to an attachment],
// allow a user to edit it as well." Same shallow-route-extension pattern
// used elsewhere (e.g. jobs/[id]/notes/route.ts's own PATCH) — the file
// itself is immutable, only its note text changes.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  try {
    requireSameOrigin(request);
    const { id, attachmentId } = await params;
    return NextResponse.json(await updateJobAttachmentNotes(await requireRequestContext(), id, attachmentId, await request.json()));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  try {
    requireSameOrigin(request);
    const { id, attachmentId } = await params;
    return NextResponse.json(await deleteJobAttachment(await requireRequestContext(), id, attachmentId));
  } catch (error) {
    return apiError(error);
  }
}
