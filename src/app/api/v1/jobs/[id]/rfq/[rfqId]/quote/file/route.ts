import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { getRfqQuoteFile } from "@/lib/rfq/service";

// Returns { fileName, mimeType, contentBase64 } so the client can build a
// data: URL to view or download the uploaded quote file.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string; rfqId: string }> }) {
  try {
    const { id, rfqId } = await params;
    return NextResponse.json(await getRfqQuoteFile(await requireRequestContext(), id, rfqId));
  } catch (error) {
    return apiError(error);
  }
}
