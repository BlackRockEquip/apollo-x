import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { addJobNote, updateJobNote } from "@/lib/jobs/service";

export async function POST(request: NextRequest, context: { params: Promise<unknown> }) {
  try {
    requireSameOrigin(request);
    const { id } = await context.params as { id: string };
    return NextResponse.json(await addJobNote(await requireRequestContext(), id, await request.json()), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

// 2026-09-14 — user request: "Notes need to be editable once created."
// Extends this existing shallow route with a PATCH rather than adding a
// new nested jobs/[id]/notes/[noteId]/route.ts — same call this app has
// made elsewhere (e.g. RFQ attachment downloads) for a one-off edit action
// that doesn't need its own resource path; the note being edited is
// identified by noteId in the body (see jobNoteUpdateInput).
export async function PATCH(request: NextRequest, context: { params: Promise<unknown> }) {
  try {
    requireSameOrigin(request);
    const { id } = await context.params as { id: string };
    return NextResponse.json(await updateJobNote(await requireRequestContext(), id, await request.json()));
  } catch (error) {
    return apiError(error);
  }
}