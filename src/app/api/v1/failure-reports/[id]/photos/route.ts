import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { addFailureReportPhoto, reorderFailureReportPhotos } from "@/lib/failure-reports/service";

// POST { fileName, contentBase64, width, height }: adds a photo (already downsized in the browser). PUT { order: [ids] }: new order.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const { id } = await params;
    return NextResponse.json(await addFailureReportPhoto(await requireRequestContext(), id, await request.json()), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const { id } = await params;
    return NextResponse.json(await reorderFailureReportPhotos(await requireRequestContext(), id, await request.json()));
  } catch (error) {
    return apiError(error);
  }
}
