import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { scrapPexRecord } from "@/lib/pex/service";

// Body: { reason }. Mirrors ModApp's scrapPexUnit — requires a reason,
// blocked if the unit was already redeployed (consumedByJobId set).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const { id } = await params;
    return NextResponse.json(await scrapPexRecord(await requireRequestContext(), id, await request.json()));
  } catch (error) {
    return apiError(error);
  }
}
