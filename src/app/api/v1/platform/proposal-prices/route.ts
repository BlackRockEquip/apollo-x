import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { getPriceList, resetPriceList, updatePriceList } from "@/lib/proposals/service";

// 2026-10-21 — Platform Settings > Proposal price list. GET reads, PUT saves the whole list, DELETE puts the built-in sample prices back.
export async function GET() {
  try {
    return NextResponse.json(await getPriceList(await requireRequestContext()));
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await updatePriceList(await requireRequestContext(), await request.json()));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await resetPriceList(await requireRequestContext()));
  } catch (error) {
    return apiError(error);
  }
}
