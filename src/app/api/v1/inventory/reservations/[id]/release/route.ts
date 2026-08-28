import { NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { releaseInput } from "@/lib/inventory/validation";
import { releaseReservation } from "@/lib/inventory/service";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = (await params).id;
    if (!id) throw new Error("NOT_FOUND");
    return NextResponse.json(await releaseReservation(await requireRequestContext(), id, releaseInput.parse(await req.json())));
  } catch (e) { return apiError(e); }
}