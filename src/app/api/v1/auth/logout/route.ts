import { NextRequest, NextResponse } from "next/server";
import { clearSession } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    await clearSession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
