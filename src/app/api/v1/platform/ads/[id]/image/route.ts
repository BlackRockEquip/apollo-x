import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError, StockError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { removeAdImage, setAdImage } from "@/lib/ads/service";

type Params = { params: Promise<{ id: string }> };

// POST (multipart, field "file") replaces the ad's picture; DELETE removes it.
export async function POST(request: NextRequest, { params }: Params) {
  try {
    requireSameOrigin(request);
    const ctx = await requireRequestContext();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new StockError("AD_IMAGE_EMPTY", "Choose an image file.");
    return NextResponse.json(await setAdImage(ctx, (await params).id, new Uint8Array(await file.arrayBuffer())));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    requireSameOrigin(request);
    await removeAdImage(await requireRequestContext(), (await params).id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
