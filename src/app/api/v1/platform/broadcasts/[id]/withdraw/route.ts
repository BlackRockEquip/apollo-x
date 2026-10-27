import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { withdrawBroadcast } from "@/lib/platform/broadcasts-service";

type Params = { params: Promise<{ id: string }> };

// 2026-10-27 - stops a broadcast showing (it stays in the history list).
export async function POST(request: NextRequest, { params }: Params) {
  try {
    requireSameOrigin(request);
    await withdrawBroadcast(await requireRequestContext(), (await params).id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
