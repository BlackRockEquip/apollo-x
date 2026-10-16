import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { getDimensionReportOriginal, removeDimensionReportOriginal, setDimensionReportOriginal } from "@/lib/specifications/service";

// The original handwritten sheet of a dimensional report: GET returns the file (base64), POST uploads or replaces it, DELETE removes it.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ reportId: string }> }) {
  try {
    const { reportId } = await params;
    return NextResponse.json(await getDimensionReportOriginal(await requireRequestContext(), reportId));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ reportId: string }> }) {
  try {
    requireSameOrigin(request);
    const { reportId } = await params;
    return NextResponse.json(await setDimensionReportOriginal(await requireRequestContext(), reportId, await request.json()), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ reportId: string }> }) {
  try {
    requireSameOrigin(request);
    const { reportId } = await params;
    return NextResponse.json(await removeDimensionReportOriginal(await requireRequestContext(), reportId));
  } catch (error) {
    return apiError(error);
  }
}
