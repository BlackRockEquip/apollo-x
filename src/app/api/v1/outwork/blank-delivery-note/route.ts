import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { renderBlankDeliveryNote } from "@/lib/outwork/blank-delivery-note";

// 2026-10-22, user request: Outwork page > "Blank Delivery Note". Renders the PDF and hands it back; nothing is saved.
export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const ctx = await requireRequestContext();
    return NextResponse.json(await renderBlankDeliveryNote(ctx, await request.json()));
  } catch (error) { return apiError(error); }
}
