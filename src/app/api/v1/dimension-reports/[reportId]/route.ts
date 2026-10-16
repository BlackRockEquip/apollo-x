import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { deleteJobDimensionReport, updateJobDimensionReport } from "@/lib/specifications/service";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ reportId: string }> }) {
  try {
    requireSameOrigin(request);
    const { reportId } = await params;
    return NextResponse.json(await updateJobDimensionReport(await requireRequestContext(), reportId, await request.json()));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ reportId: string }> }) {
  try {
    requireSameOrigin(request);
    const { reportId } = await params;
    return NextResponse.json(await deleteJobDimensionReport(await requireRequestContext(), reportId));
  } catch (error) {
    return apiError(error);
  }
}
