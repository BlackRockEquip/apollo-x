import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { unscrapPexRecord } from "@/lib/pex/service";

// 2026-10-22: undo "Scrap unit" - no body. Same PEX_STOCK_SCRAP permission as scrapping.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const { id } = await params;
    return NextResponse.json(await unscrapPexRecord(await requireRequestContext(), id));
  } catch (error) {
    return apiError(error);
  }
}
