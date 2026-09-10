import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { updatePexRecordNotes } from "@/lib/pex/service";

// Body: { notes }. Mirrors ModApp's updatePexNotes — simple free-text notes
// field save on the PexRecord.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const { id } = await params;
    return NextResponse.json(await updatePexRecordNotes(await requireRequestContext(), id, await request.json()));
  } catch (error) {
    return apiError(error);
  }
}
