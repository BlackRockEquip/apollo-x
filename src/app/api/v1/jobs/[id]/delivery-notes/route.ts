import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { listJobDeliveryNotes, recordJobDeliveryNote } from "@/lib/jobs/service";

// 2026-10-29, Engineering delivery note register. GET lists the notes issued for the job; POST records a note when it is printed
// and answers with its number (e.g. BRE1122-DN1).
export async function GET(_request: NextRequest, context: { params: Promise<unknown> }) {
  try {
    const { id } = await context.params as { id: string };
    return NextResponse.json({ items: await listJobDeliveryNotes(await requireRequestContext(), id) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<unknown> }) {
  try {
    requireSameOrigin(request);
    const { id } = await context.params as { id: string };
    return NextResponse.json(await recordJobDeliveryNote(await requireRequestContext(), id, await request.json()), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
