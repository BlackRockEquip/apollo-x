import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { getCompanySettings, updateCompanyLogo } from "@/lib/master-data/company-settings-service";

export async function GET() {
  try {
    const data = await getCompanySettings(await requireRequestContext());
    const settings = data.settings as Record<string, unknown> | null;
    if (!settings?.logoData || !settings.logoMimeType) return new NextResponse(null, { status: 404 });
    return new NextResponse(Buffer.from(settings.logoData as Uint8Array), { headers: { "content-type": String(settings.logoMimeType), "cache-control": "private, max-age=60" } });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await updateCompanyLogo(await requireRequestContext(), await request.json()));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await updateCompanyLogo(await requireRequestContext(), null));
  } catch (error) {
    return apiError(error);
  }
}