import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { getPexRecordHistory } from "@/lib/pex/service";

// Fetch-on-click PEX cycle history (status, previousCycles walked back via
// previousJobNumber, and the filtered JobActivity timeline) — mirrors
// ModApp's getPexUnitHistory/PexUnitHistoryButton, id-addressed by
// PexRecord.id rather than the old PexStockUnit.id.
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json(await getPexRecordHistory(await requireRequestContext(), (await params).id));
  } catch (error) {
    return apiError(error);
  }
}
