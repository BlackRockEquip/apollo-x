import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { getPlatformSmtpSettings, updatePlatformSmtpSettings } from "@/lib/platform/settings-service";

export async function GET() {
  try {
    return NextResponse.json(await getPlatformSmtpSettings(await requireRequestContext()));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await updatePlatformSmtpSettings(await requireRequestContext(), await request.json()));
  } catch (error) {
    return apiError(error);
  }
}
