import { NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { countNoteInput } from "@/lib/inventory/validation";
import { countCancel } from "@/lib/inventory/service";

// 2026-10-02 — new Stock Take tab (user request). countCancel already
// existed in inventory/service.ts but had no route. Same shape as
// [id]/route.ts's complete route (an optional notes body) — cancel only
// works on an OPEN count, since a COMPLETED one has already posted real
// stock movements that cancelling wouldn't undo.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json(await countCancel(await requireRequestContext(), (await params).id, countNoteInput.parse(await req.json())));
  } catch (e) { return apiError(e); }
}
