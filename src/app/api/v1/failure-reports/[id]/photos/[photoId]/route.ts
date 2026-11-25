import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { deleteFailureReportPhoto, getFailureReportPhotoImage, updateFailureReportPhoto } from "@/lib/failure-reports/service";

type Params = { params: Promise<{ id: string; photoId: string }> };

// GET: the photo itself (same-site image, so the browser can draw it on a canvas and put it in the .pptx).
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id, photoId } = await params;
    const image = await getFailureReportPhotoImage(await requireRequestContext(), id, photoId);
    // A plain ArrayBuffer copy: NextResponse's body type does not take a Buffer (see toArrayBuffer in company-settings-service.ts).
    const body = new ArrayBuffer(image.data.byteLength);
    new Uint8Array(body).set(image.data);
    return new NextResponse(body, { headers: { "Content-Type": image.mimeType, "Cache-Control": "private, max-age=31536000, immutable" } });
  } catch (error) {
    return apiError(error);
  }
}

// PUT { caption?, marks?, image? }: description, damage marks, or the photo rotated in the mark editor.
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    requireSameOrigin(request);
    const { id, photoId } = await params;
    return NextResponse.json(await updateFailureReportPhoto(await requireRequestContext(), id, photoId, await request.json()));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    requireSameOrigin(request);
    const { id, photoId } = await params;
    return NextResponse.json(await deleteFailureReportPhoto(await requireRequestContext(), id, photoId));
  } catch (error) {
    return apiError(error);
  }
}
