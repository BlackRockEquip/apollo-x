import { NextRequest, NextResponse } from "next/server";
import { clearSession } from "@/lib/auth/session";
import { requireSameOrigin } from "@/lib/security/request";

export async function POST(request: NextRequest) {
  requireSameOrigin(request);
  await clearSession();
  return NextResponse.json({ ok: true });
}
