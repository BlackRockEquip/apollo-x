import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { deleteAd, updateAd } from "@/lib/ads/service";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await updateAd(await requireRequestContext(), (await params).id, await request.json()));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    requireSameOrigin(request);
    await deleteAd(await requireRequestContext(), (await params).id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
