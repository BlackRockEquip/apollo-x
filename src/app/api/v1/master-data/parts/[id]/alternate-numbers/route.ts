import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { addPartAlternateNumber } from "@/lib/master-data/service";

// New — 2026-09-29, user request: "how can we add additional part
// numbers for parts that have superseded numbers and also have group
// numbers... two different numbers but have multiple entries?" Adds one
// alternate (SUPERSEDED or GROUP) number to an existing part — see
// addPartAlternateNumber in master-data/service.ts. A static "parts"
// segment sitting alongside the generic [kind] dynamic route one level up
// (src/app/api/v1/master-data/[kind]/route.ts) — Next.js already does
// this for master-data/numbering, which coexists with [kind] the same
// way; static segments take priority over the dynamic one.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const ctx = await requireRequestContext();
    const { id } = await params;
    return NextResponse.json(await addPartAlternateNumber(ctx, id, await request.json()), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
