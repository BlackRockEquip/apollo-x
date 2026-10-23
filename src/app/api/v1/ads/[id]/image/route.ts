import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { getAdImage } from "@/lib/ads/service";

type Params = { params: Promise<{ id: string }> };

// The ad's picture. The address carries ?v=<imageVersion>, so a replaced picture is fetched fresh and the rest is cached.
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requireRequestContext();
    const image = await getAdImage((await params).id);
    if (!image) return new NextResponse(null, { status: 404 });
    return new NextResponse(new Uint8Array(image.bytes), { headers: { "Content-Type": image.mime, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=86400", "Content-Security-Policy": "default-src 'none'; sandbox" } });
  } catch (error) {
    return apiError(error);
  }
}
