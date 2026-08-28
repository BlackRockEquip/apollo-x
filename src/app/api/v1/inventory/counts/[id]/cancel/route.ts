import { NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { countNoteInput } from "@/lib/inventory/validation";
import { countCancel } from "@/lib/inventory/service";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json(await countCancel(await requireRequestContext(), (await params).id, countNoteInput.parse(await req.json())));
  } catch (e) { return apiError(e); }
}